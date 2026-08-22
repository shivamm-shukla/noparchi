/**
 * Resolves a merchant's configured payment provider.
 *
 * To add a gateway: implement PaymentProvider, add its id to
 * src/config/providers.ts, and register it here.
 */
import { DEFAULT_PAYMENT_PROVIDER, type PaymentProviderId } from '../../config/providers';
import { upiIntentProvider } from './upiIntentProvider';
import { razorpayProvider } from './razorpayProvider';
import type { PaymentProvider } from './types';

const registry: Record<PaymentProviderId, PaymentProvider> = {
  upi_intent: upiIntentProvider,
  razorpay: razorpayProvider,
};

export function paymentProvider(id?: string | null): PaymentProvider {
  const key = (id ?? DEFAULT_PAYMENT_PROVIDER) as PaymentProviderId;
  const chosen = registry[key];
  // An unknown or unconfigured provider must not strand the customer at a dead
  // checkout; UPI always works and costs nothing.
  if (!chosen || !chosen.isConfigured()) return registry.upi_intent;
  return chosen;
}

export { buildUpiUri } from './upiIntentProvider';
export * from './types';
