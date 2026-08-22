/**
 * Public URLs for the customer-facing pages.
 *
 * The gate QR has to encode an address a stranger's phone browser can open, so
 * it can never be a relative path or a dev-server host. On web we can read the
 * real origin; everywhere else EXPO_PUBLIC_WEB_URL must be set, and callers are
 * told plainly when it is not rather than silently generating a QR that leads
 * nowhere.
 */
import { Platform } from 'react-native';
import { env } from '../config/env';

export function publicBaseUrl(): string | null {
  if (env.publicWebUrl) return env.publicWebUrl.replace(/\/+$/, '');
  if (Platform.OS === 'web' && typeof globalThis.location !== 'undefined') {
    return globalThis.location.origin;
  }
  return null;
}

/** The address a customer lands on after scanning the gate QR. */
export function checkoutUrl(merchantId: string): string | null {
  const base = publicBaseUrl();
  return base ? `${base}/pay/${merchantId}` : null;
}

/** The customer's own pass page - also what the gatekeeper scans at exit. */
export function passUrl(ticketCode: string): string | null {
  const base = publicBaseUrl();
  return base ? `${base}/ticket/${ticketCode}` : null;
}
