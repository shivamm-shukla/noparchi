/**
 * Create a Razorpay order for a pending pass.
 *
 * The amount is read from the database via gateway_order_context and never
 * taken from the request. If the browser could name the amount, a customer
 * could pay one rupee for a hundred-rupee pass and the webhook would happily
 * settle it.
 *
 * Setup:
 *   supabase secrets set RAZORPAY_KEY_ID=rzp_test_...
 *   supabase secrets set RAZORPAY_KEY_SECRET=...
 *   supabase functions deploy razorpay-order --no-verify-jwt
 *
 * --no-verify-jwt because the customer paying has no account; the pass code is
 * the only thing they hold, and it is a random 8-character token.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

const KEY_ID = Deno.env.get('RAZORPAY_KEY_ID');
const KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ message: 'Method not allowed.' }, 405);

  if (!KEY_ID || !KEY_SECRET) {
    return json(
      {
        success: false,
        message:
          'Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET, ' +
          'or switch the business back to UPI in Settings.',
      },
      400
    );
  }

  try {
    const { ticketCode } = await req.json();
    if (!ticketCode) return json({ success: false, message: 'No pass code given.' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: context, error } = await admin.rpc('gateway_order_context', {
      p_ticket_code: ticketCode,
    });
    if (error) throw error;
    if (!context?.success) {
      return json({ success: false, message: context?.message ?? 'Pass not found.' }, 404);
    }

    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${KEY_ID}:${KEY_SECRET}`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // Razorpay works in the smallest currency unit - paise, not rupees.
        amount: Math.round(Number(context.amount) * 100),
        currency: context.currency ?? 'INR',
        // The pass code travels with the order so the webhook can settle the
        // right row without trusting anything the browser sends back.
        receipt: context.ticketCode,
        notes: { ticketCode: context.ticketCode, business: context.businessName },
      }),
    });

    const order = await response.json();
    if (!response.ok) {
      console.error('Razorpay order failed:', order);
      return json({ success: false, message: order?.error?.description ?? 'Order failed.' }, 502);
    }

    return json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: KEY_ID,
      // Razorpay's hosted page needs no SDK in the client, which keeps the
      // checkout working identically on web and in the native app.
      checkoutUrl: `https://api.razorpay.com/v1/checkout/embedded?order_id=${order.id}&key_id=${KEY_ID}`,
    });
  } catch (err) {
    console.error('razorpay-order failed:', err);
    return json({ success: false, message: 'Could not start the payment.' }, 500);
  }
});
