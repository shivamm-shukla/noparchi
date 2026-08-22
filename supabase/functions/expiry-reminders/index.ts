/**
 * Nudge customers whose pass is about to run out.
 *
 * Runs on a schedule, claims the passes due for a reminder, and sends each one a
 * WhatsApp message with a link straight to their pass page - where the
 * countdown and the Extend button are waiting. That link is the whole point:
 * the customer decides in two taps instead of walking back to a counter or
 * discovering an overstay charge at the gate.
 *
 * The honest limitation: this needs the WhatsApp Cloud API. The free share-link
 * provider cannot send anything unattended - it opens WhatsApp for a human to
 * press send - so with no token configured this function does nothing, and the
 * fallback is the "Running out soon" list on the dashboard, which staff work
 * through by hand.
 *
 * Setup:
 *   supabase secrets set CRON_SECRET="$(openssl rand -hex 32)"
 *   supabase secrets set PUBLIC_WEB_URL=https://your-app-domain
 *   supabase functions deploy expiry-reminders --no-verify-jwt
 *
 * --no-verify-jwt because the caller is a scheduler, not a signed-in user; the
 * shared secret below is what authenticates it.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { json } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CRON_SECRET = Deno.env.get('CRON_SECRET');
const PUBLIC_WEB_URL = (Deno.env.get('PUBLIC_WEB_URL') ?? '').replace(/\/+$/, '');

const TOKEN = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
const PHONE_NUMBER_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
const TEMPLATE = Deno.env.get('WHATSAPP_REMINDER_TEMPLATE') ?? 'noparchi_expiry_reminder';
const LANG = Deno.env.get('WHATSAPP_TEMPLATE_LANG') ?? 'en';
const API_VERSION = 'v21.0';

/** How far ahead to warn. Matches the 30 minutes documented to merchants. */
const LEAD_MINUTES = Number(Deno.env.get('EXPIRY_LEAD_MINUTES') ?? '30');

interface DuePass {
  ticketCode: string;
  customerPhone: string;
  typeLabel: string;
  vehicleNumber: string | null;
  expiresAt: string;
  businessName: string;
  location: string;
  currency: string;
  extensionAmount: number | null;
  extensionMinutes: number | null;
}

function minutesUntil(iso: string): number {
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60000));
}

async function sendReminder(pass: DuePass): Promise<boolean> {
  const to = pass.customerPhone.replace(/\D/g, '');
  if (!to) return false;

  const extensionText =
    pass.extensionAmount !== null && pass.extensionMinutes !== null
      ? `${pass.currency === 'INR' ? '₹' : ''}${pass.extensionAmount} for ${Math.round(
          pass.extensionMinutes / 60
        )} more hours`
      : 'extend from your pass page';

  // Body parameter order must match the approved template exactly.
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: TEMPLATE,
      language: { code: LANG },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: pass.businessName },
            { type: 'text', text: pass.vehicleNumber || pass.typeLabel },
            { type: 'text', text: String(minutesUntil(pass.expiresAt)) },
            { type: 'text', text: extensionText },
          ],
        },
        {
          // A URL button on the template, suffixed with the pass code. Tapping
          // it lands the customer on their countdown with Extend right there.
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: pass.ticketCode }],
        },
      ],
    },
  };

  const response = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    console.error('Reminder rejected for', pass.ticketCode, await response.text());
    return false;
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ message: 'Method not allowed.' }, 405);

  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return json({ message: 'Not authorised.' }, 401);
  }

  if (!TOKEN || !PHONE_NUMBER_ID) {
    // Not an error: a merchant on the free share-link provider has no way to
    // send unattended, and the dashboard list covers them. Reported plainly so
    // a silent no-op is never mistaken for reminders going out.
    return json({
      success: true,
      skipped: true,
      reason: 'WhatsApp Cloud API is not configured; reminders are handled manually.',
    });
  }
  if (!PUBLIC_WEB_URL) {
    return json({ success: false, message: 'PUBLIC_WEB_URL is not set.' }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    // Claims the rows and stamps reminder_sent_at in one statement, so two
    // overlapping runs cannot message the same customer twice.
    const { data, error } = await admin.rpc('due_expiry_reminders', {
      p_lead_minutes: LEAD_MINUTES,
      p_limit: 100,
    });
    if (error) throw error;

    const passes = (data?.passes ?? []) as DuePass[];
    let sent = 0;
    const failed: string[] = [];

    for (const pass of passes) {
      const ok = await sendReminder(pass).catch(() => false);
      if (ok) {
        sent++;
      } else {
        failed.push(pass.ticketCode);
        // Put it back in the queue so the next sweep retries rather than the
        // customer silently never hearing from us.
        await admin.rpc('reset_expiry_reminder', { p_ticket_code: pass.ticketCode });
      }
    }

    return json({ success: true, claimed: passes.length, sent, failed });
  } catch (err) {
    console.error('expiry-reminders failed:', err);
    return json({ success: false, message: 'Reminder sweep failed.' }, 500);
  }
});
