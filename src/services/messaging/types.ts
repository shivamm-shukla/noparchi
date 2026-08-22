/**
 * The messaging seam.
 *
 * Delivering a pass to a customer sits behind this interface so that moving
 * from the free WhatsApp share link to the Cloud API - or to SMS, or to
 * whatever is cheapest next year - means writing one adapter and changing one
 * config value. No screen imports a vendor SDK.
 *
 * The previous build called a function that inlined Meta's Cloud API payload
 * shape directly from a modal component, and read the access token from
 * process.env on the client, where it was always undefined - fortunate, since a
 * working version would have shipped the token to every browser.
 */
import type { MessagingProviderId } from '../../config/providers';

export interface PassMessage {
  recipientPhone: string;
  businessName: string;
  location: string;
  ticketCode: string;
  typeLabel: string;
  amount: number;
  currency: string;
  vehicleNumber?: string | null;
  issuedAt: string;
  /** Public URL of the pass page. The QR the gatekeeper scans lives there. */
  passUrl: string;
}

export type DeliveryOutcome =
  /** Handed to the provider; it accepted responsibility for delivery. */
  | 'sent'
  /** Opened the customer's own WhatsApp with the message prefilled. */
  | 'handed_off'
  | 'failed';

export interface DeliveryResult {
  outcome: DeliveryOutcome;
  provider: MessagingProviderId;
  messageId?: string;
  /** Present for handed_off, so the caller can render a fallback link. */
  url?: string;
  error?: string;
}

export interface MessagingProvider {
  readonly id: MessagingProviderId;
  /** False when required configuration is absent, so the UI can explain why. */
  isConfigured(): boolean;
  sendPass(message: PassMessage): Promise<DeliveryResult>;
}

/** Digits only, with India's country code assumed for bare 10-digit numbers. */
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  return digits;
}

export function passMessageText(m: PassMessage): string {
  const lines = [
    `*${m.businessName}* - Digital Pass`,
    m.location ? `${m.location}` : null,
    '',
    `Pass code: *${m.ticketCode}*`,
    `Type: ${m.typeLabel}`,
    m.vehicleNumber ? `Vehicle: ${m.vehicleNumber}` : null,
    `Paid: ${m.currency === 'INR' ? '₹' : ''}${m.amount}`,
    '',
    'Show this at the exit gate:',
    m.passUrl,
    '',
    'No paper. No queue. - NoParchi',
  ];
  return lines.filter((l) => l !== null).join('\n');
}
