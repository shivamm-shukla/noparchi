/**
 * Typed, validated access to environment configuration.
 *
 * Why this is not just `process.env.X` at each call site: the previous
 * implementation defaulted a missing Supabase URL to a fake demo host and then
 * caught every resulting network error, silently serving mock data. The app
 * looked like it worked while never touching a database. Nothing here invents a
 * fallback - missing config is reported, loudly and once.
 *
 * Only EXPO_PUBLIC_* variables exist in the client bundle. Anything secret
 * (service role key, WhatsApp token, payment secret) must live in Supabase Edge
 * Function secrets and never appear in this file.
 */

function readPublic(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('your-') || trimmed.startsWith('your_')) return null;
  return trimmed;
}

const supabaseUrl = readPublic('EXPO_PUBLIC_SUPABASE_URL');
const supabaseAnonKey = readPublic('EXPO_PUBLIC_SUPABASE_ANON_KEY');

/**
 * Renders every screen from sample data, with no backend at all.
 *
 * Opt-in only, via EXPO_PUBLIC_PREVIEW=1 - never a fallback from a failed
 * request. That distinction matters: the inherited code silently served mock
 * data whenever a call errored, so an unconfigured app looked like a working
 * one. Preview mode announces itself on screen the whole time it is on.
 */
export const isPreview = process.env.EXPO_PUBLIC_PREVIEW === '1';

export const env = {
  supabaseUrl,
  supabaseAnonKey,
  /** Public base URL used to build customer-facing QR links (/pay/:merchantId). */
  publicWebUrl: readPublic('EXPO_PUBLIC_WEB_URL'),
  razorpayKeyId: readPublic('EXPO_PUBLIC_RAZORPAY_KEY_ID'),
} as const;

/** True only when a real Supabase project is reachable-by-configuration. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * The list of things that are missing, for a single startup warning banner.
 * Surfacing this in the UI is intentional: a silently degraded app is the bug
 * this replaces.
 */
export function missingConfig(): string[] {
  const missing: string[] = [];
  if (!supabaseUrl) missing.push('EXPO_PUBLIC_SUPABASE_URL');
  if (!supabaseAnonKey) missing.push('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  return missing;
}
