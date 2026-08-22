/**
 * Which payment and messaging implementation the app uses.
 *
 * Both sit behind an interface (see src/services/payment and
 * src/services/messaging) so that swapping a free-tier provider for a paid one
 * later means writing one new adapter - never touching Scanner, Dashboard or
 * any business logic.
 *
 * To switch provider: change the default here, or set the matching merchant
 * setting in the database (per-merchant selection wins over these defaults).
 */

export type PaymentProviderId =
  /** Raw UPI deep link. Zero cost, zero KYC. Payment is confirmed by a
   *  gatekeeper in the merchant app - never self-declared by the customer. */
  | 'upi_intent'
  /** Razorpay Standard Checkout. Free to integrate, ~2% per transaction,
   *  webhook-verified so a pass can be issued automatically. */
  | 'razorpay';

export type MessagingProviderId =
  /** wa.me deep link that opens the customer's own WhatsApp with the pass
   *  details prefilled. Free, no template approval, no automated send. */
  | 'wa_deeplink'
  /** Meta WhatsApp Cloud API. Free service-conversation tier, cheap utility
   *  templates, but requires an approved template and a dedicated number. */
  | 'meta_cloud';

export const PAYMENT_PROVIDERS: Record<PaymentProviderId, { label: string; note: string }> = {
  upi_intent: {
    label: 'UPI Deep Link',
    note: 'Free. Money reaches your bank directly. A gatekeeper must confirm receipt before the pass is issued.',
  },
  razorpay: {
    label: 'Razorpay Checkout',
    note: 'Auto-verified by webhook, so passes issue instantly. ~2% per transaction, no monthly fee.',
  },
};

export const MESSAGING_PROVIDERS: Record<MessagingProviderId, { label: string; note: string }> = {
  wa_deeplink: {
    label: 'WhatsApp Share Link',
    note: 'Free. Opens the customer WhatsApp with their pass prefilled. No automated delivery.',
  },
  meta_cloud: {
    label: 'WhatsApp Cloud API',
    note: 'Automated delivery. Needs a Meta Business account and an approved message template.',
  },
};

/** Defaults for a merchant that has not chosen explicitly. Both cost nothing. */
export const DEFAULT_PAYMENT_PROVIDER: PaymentProviderId = 'upi_intent';
export const DEFAULT_MESSAGING_PROVIDER: MessagingProviderId = 'wa_deeplink';
