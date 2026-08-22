/**
 * Razorpay Standard Checkout.
 *
 * The reason to add this despite the ~2% fee: it is the only option here that
 * can prove a payment happened. A webhook confirms the order server-side and
 * promotes the pass to paid automatically, which removes the gatekeeper
 * confirmation step and the theft window it leaves open.
 *
 * Status: the client half is wired and the flow is complete up to redirect.
 * Going live needs a Razorpay account, EXPO_PUBLIC_RAZORPAY_KEY_ID, and the
 * razorpay-webhook Edge Function holding RAZORPAY_KEY_SECRET and
 * RAZORPAY_WEBHOOK_SECRET. Test mode works without KYC, so this can be
 * exercised end to end before any business paperwork exists.
 */
import { env } from '../../config/env';
import { supabase } from '../../lib/supabase';
import type { PaymentProvider, PaymentRequest, PaymentResult } from './types';

class RazorpayProvider implements PaymentProvider {
  readonly id = 'razorpay' as const;
  readonly selfVerifying = true;

  isConfigured(): boolean {
    return Boolean(env.razorpayKeyId && supabase);
  }

  async begin(request: PaymentRequest): Promise<PaymentResult> {
    if (!this.isConfigured() || !supabase) {
      return {
        outcome: 'failed',
        provider: this.id,
        error:
          'Razorpay is selected but not configured. Set EXPO_PUBLIC_RAZORPAY_KEY_ID and deploy the razorpay-webhook function.',
      };
    }

    try {
      // The order is created server-side: amount must come from the database,
      // never from the browser, or a customer could pay one rupee for any pass.
      const { data, error } = await supabase.functions.invoke('razorpay-order', {
        body: { ticketCode: request.ticketCode },
      });
      if (error) throw error;
      if (!data?.success) {
        return { outcome: 'failed', provider: this.id, error: data?.message ?? 'Could not start payment.' };
      }

      return {
        outcome: 'initiated',
        provider: this.id,
        paymentRef: data.orderId,
        payUrl: data.checkoutUrl,
      };
    } catch (err) {
      return {
        outcome: 'failed',
        provider: this.id,
        error: err instanceof Error ? err.message : 'Could not start payment.',
      };
    }
  }
}

export const razorpayProvider = new RazorpayProvider();
