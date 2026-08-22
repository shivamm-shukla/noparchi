/**
 * The payment seam.
 *
 * Checkout screens talk to this interface, never to a gateway SDK, so moving
 * from UPI deep links to Razorpay - or adding Cashfree alongside - is one new
 * adapter and one config value. The previous checkout built a raw upi:// string
 * inline inside the screen component and issued a valid pass on a button
 * labelled "I Have Paid".
 */
import type { PaymentProviderId } from '../../config/providers';

export interface PaymentRequest {
  merchantId: string;
  merchantName: string;
  /** The merchant's UPI VPA. Used by UPI-based providers. */
  upiId: string;
  ticketCode: string;
  amount: number;
  currency: string;
  note: string;
}

export type PaymentOutcome =
  /** The gateway confirmed payment. The pass may be issued automatically. */
  | 'confirmed'
  /**
   * The customer was sent to a payment app. Whether money moved is unknown to
   * us: nothing may treat this as proof of payment. The pass stays pending
   * until a staff member confirms receipt.
   */
  | 'initiated'
  | 'cancelled'
  | 'failed';

export interface PaymentResult {
  outcome: PaymentOutcome;
  provider: PaymentProviderId;
  paymentRef?: string;
  /** Renderable payment target - a upi:// URI or a hosted checkout URL. */
  payUrl?: string;
  error?: string;
}

export interface PaymentProvider {
  readonly id: PaymentProviderId;
  isConfigured(): boolean;
  /**
   * True when this provider can prove payment on its own, via a webhook.
   *
   * The checkout UI reads this to decide whether to show "waiting for payment"
   * or "show this to the gatekeeper to confirm" - so a provider that cannot
   * verify can never accidentally present itself as if it could.
   */
  readonly selfVerifying: boolean;
  begin(request: PaymentRequest): Promise<PaymentResult>;
}
