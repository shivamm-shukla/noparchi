/**
 * Deriving a staff member's Supabase Auth credentials from their PIN.
 *
 * The PIN itself is never persisted - not as plaintext, not as a hash on our
 * own tables. It is combined with a server-only secret to derive the password
 * of a synthetic auth account, so the database contains nothing an attacker
 * could turn back into a PIN, and the whole of Supabase Auth's own password
 * hashing and session handling applies for free.
 *
 * Consequence worth knowing: rotating STAFF_PIN_SECRET invalidates every staff
 * login at once and every PIN has to be reset. Treat it as permanent.
 */

const encoder = new TextEncoder();

/**
 * RFC 2606 reserves .invalid precisely so it can never resolve. These addresses
 * exist only to satisfy Supabase Auth's requirement of an email identifier; no
 * mail is ever sent to them.
 */
export function staffEmail(merchantUserId: string): string {
  return `staff-${merchantUserId}@noparchi.invalid`;
}

export async function derivePassword(
  merchantUserId: string,
  pin: string
): Promise<string> {
  const secret = Deno.env.get('STAFF_PIN_SECRET');
  if (!secret) {
    throw new Error(
      'STAFF_PIN_SECRET is not set. Run: supabase secrets set STAFF_PIN_SECRET=<long random string>'
    );
  }

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${merchantUserId}:${pin}`)
  );

  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** 4 to 8 digits. Short enough to type at a gate, long enough with lockout. */
export function isValidPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}
