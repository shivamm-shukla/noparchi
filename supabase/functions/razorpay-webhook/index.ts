/**
 * Razorpay payment webhook.
 *
 * This is the piece that makes a pass valid without a human vouching for it,
 * and therefore the piece that must not be fooled. The signature is verified
 * before anything is read as meaningful, using a constant-time comparison so
 * the check cannot be probed a byte at a time.
 *
 * Setup:
 *   supabase secrets set RAZORPAY_WEBHOOK_SECRET=...
 *   supabase functions deploy razorpay-webhook --no-verify-jwt
 *   Then add the function URL in the Razorpay dashboard for the
 *   payment.captured event.
 *
 * --no-verify-jwt because Razorpay's servers have no Supabase session; the
 * signature is the authentication.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { json } from '../_shared/cors.ts';

const WEBHOOK_SECRET = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const encoder = new TextEncoder();

async function isSignatureValid(rawBody: string, signature: string): Promise<boolean> {
  if (!WEBHOOK_SECRET || !signature) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  const expected = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant time: a length-then-shortcircuit compare leaks how much of a
  // forged signature was correct, which is enough to derive the rest.
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ message: 'Method not allowed.' }, 405);

  if (!WEBHOOK_SECRET) {
    console.error('RAZORPAY_WEBHOOK_SECRET is not set; refusing to settle anything.');
    return json({ message: 'Webhook not configured.' }, 500);
  }

  // Read the body as text first: the signature covers the exact bytes sent, so
  // re-serialising parsed JSON would produce a different string and never match.
  const rawBody = await req.text();
  const signature = req.headers.get('x-razorpay-signature') ?? '';

  if (!(await isSignatureValid(rawBody, signature))) {
    console.warn('Rejected a webhook with an invalid signature.');
    return json({ message: 'Invalid signature.' }, 401);
  }

  try {
    const event = JSON.parse(rawBody);
    if (event?.event !== 'payment.captured') {
      // Acknowledge anything else so Razorpay stops retrying it.
      return json({ received: true, ignored: event?.event ?? 'unknown' });
    }

    const payment = event.payload?.payment?.entity ?? {};
    // The pass code was attached at order creation, server-side.
    const ticketCode: string | undefined = payment.notes?.ticketCode;
    if (!ticketCode) {
      console.error('payment.captured carried no ticketCode note:', payment.id);
      return json({ received: true, ignored: 'no ticketCode' });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data, error } = await admin.rpc('settle_payment_by_gateway', {
      p_ticket_code: ticketCode,
      p_payment_ref: payment.id,
      p_provider: 'razorpay',
    });
    if (error) throw error;

    if (!data?.success) {
      console.error('Settlement refused for', ticketCode, data?.message);
      // Still a 200: the payment is real, and making Razorpay retry forever
      // will not change the answer. The mismatch belongs in the logs.
      return json({ received: true, settled: false, reason: data?.message });
    }

    return json({ received: true, settled: true, alreadySettled: data.alreadySettled });
  } catch (err) {
    console.error('razorpay-webhook failed:', err);
    // A 500 asks Razorpay to retry, which is what we want for a transient fault.
    return json({ message: 'Could not process the webhook.' }, 500);
  }
});
