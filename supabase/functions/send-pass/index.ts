/**
 * Deliver a pass over the WhatsApp Cloud API.
 *
 * Runs server-side because Meta's access token is a bearer credential for your
 * business's WhatsApp number, and anything in the client bundle is readable by
 * every visitor. The previous implementation read this token from process.env
 * inside a React component; it was always undefined there, which is the only
 * reason the token was never actually published.
 *
 * Setup:
 *   supabase secrets set WHATSAPP_ACCESS_TOKEN=...
 *   supabase secrets set WHATSAPP_PHONE_NUMBER_ID=...
 *   supabase secrets set WHATSAPP_TEMPLATE_NAME=noparchi_pass   # approved name
 *   supabase functions deploy send-pass
 *
 * The template must be approved by Meta first. Outside a 24-hour window opened
 * by the customer messaging you - which never happens in this flow - free-form
 * text cannot be sent at all, so an unapproved template means nothing arrives.
 */
import { corsHeaders, json } from '../_shared/cors.ts';

interface SendPassRequest {
  recipientPhone: string;
  businessName: string;
  location: string;
  ticketCode: string;
  typeLabel: string;
  amount: number;
  currency: string;
  vehicleNumber?: string | null;
  passUrl: string;
}

const TOKEN = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
const PHONE_NUMBER_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
const TEMPLATE = Deno.env.get('WHATSAPP_TEMPLATE_NAME') ?? 'noparchi_pass';
const LANG = Deno.env.get('WHATSAPP_TEMPLATE_LANG') ?? 'en';
const API_VERSION = 'v21.0';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ message: 'Method not allowed.' }, 405);

  if (!TOKEN || !PHONE_NUMBER_ID) {
    // Explicit rather than a silent no-op: the caller shows this to the owner,
    // who is otherwise left believing passes are being delivered.
    return json(
      {
        success: false,
        message:
          'WhatsApp Cloud API is not configured. Set WHATSAPP_ACCESS_TOKEN and ' +
          'WHATSAPP_PHONE_NUMBER_ID, or switch delivery to the WhatsApp share link in Settings.',
      },
      400
    );
  }

  try {
    const body: SendPassRequest = await req.json();
    const to = (body.recipientPhone ?? '').replace(/\D/g, '');
    if (!to) return json({ success: false, message: 'No phone number given.' }, 400);

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
              { type: 'text', text: body.businessName },
              { type: 'text', text: body.typeLabel },
              { type: 'text', text: `${body.currency === 'INR' ? '₹' : ''}${body.amount}` },
              { type: 'text', text: body.ticketCode },
              { type: 'text', text: body.vehicleNumber || '-' },
            ],
          },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            // The approved template's button carries the base URL; only the
            // variable suffix is supplied here.
            parameters: [{ type: 'text', text: body.ticketCode }],
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

    const data = await response.json();
    if (!response.ok) {
      console.error('WhatsApp send failed:', data);
      return json(
        { success: false, message: data?.error?.message ?? 'WhatsApp rejected the message.' },
        502
      );
    }

    return json({ success: true, messageId: data?.messages?.[0]?.id ?? null });
  } catch (err) {
    console.error('send-pass failed:', err);
    return json({ success: false, message: 'Could not send the pass right now.' }, 500);
  }
});
