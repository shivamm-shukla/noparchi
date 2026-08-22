/**
 * Direct UPI, at zero cost.
 *
 * Money moves from the customer's UPI app straight into the merchant's bank
 * account. No gateway, no fee, no KYC, no monthly charge - which is what makes
 * it the right default while pre-revenue.
 *
 * Its one limitation defines how the rest of the flow must behave: there is no
 * callback. Nothing tells us the payment succeeded. So selfVerifying is false,
 * begin() returns 'initiated' and never 'confirmed', and the pass it belongs to
 * stays pending until a named staff member calls confirm_payment having seen
 * the money arrive. A customer asserting their own payment is not evidence.
 */
import { Linking, Platform } from 'react-native';
import type { PaymentProvider, PaymentRequest, PaymentResult } from './types';

export function buildUpiUri(request: PaymentRequest): string {
  const params = new URLSearchParams({
    pa: request.upiId,
    pn: request.merchantName,
    am: request.amount.toFixed(2),
    cu: request.currency || 'INR',
    tn: request.note,
    // Transaction reference: lets the merchant tie a bank credit back to a pass.
    tr: request.ticketCode.replace(/-/g, ''),
  });
  return `upi://pay?${params.toString()}`;
}

class UpiIntentProvider implements PaymentProvider {
  readonly id = 'upi_intent' as const;
  readonly selfVerifying = false;

  isConfigured(): boolean {
    return true;
  }

  async begin(request: PaymentRequest): Promise<PaymentResult> {
    if (!request.upiId) {
      return {
        outcome: 'failed',
        provider: this.id,
        error: 'This business has not set a UPI ID yet.',
      };
    }

    const payUrl = buildUpiUri(request);

    // On web the upi:// scheme only resolves on a phone that has a UPI app, so
    // the caller renders payUrl as a QR as well. Opening it here is best-effort.
    if (Platform.OS !== 'web') {
      try {
        if (await Linking.canOpenURL(payUrl)) await Linking.openURL(payUrl);
      } catch {
        // No UPI app installed. The QR fallback still works.
      }
    }

    return { outcome: 'initiated', provider: this.id, payUrl };
  }
}

export const upiIntentProvider = new UpiIntentProvider();
