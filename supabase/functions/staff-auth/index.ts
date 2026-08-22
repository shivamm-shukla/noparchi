/**
 * Exchange a gatekeeper's phone number and PIN for a real Supabase session.
 *
 * Staff need a genuine JWT rather than a client-side "current user" flag,
 * because every RLS policy and every RPC resolves the tenant and the permission
 * set from auth.uid(). Without one, permissions are UI decoration - which is
 * what the previous build shipped, complete with a button on the access-denied
 * screen that switched the caller to the owner account.
 *
 * Deploy:  supabase functions deploy staff-auth --no-verify-jwt
 * (--no-verify-jwt is required: this endpoint's whole job is to run before a
 * session exists.)
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { derivePassword, isValidPin, staffEmail } from '../_shared/staff-credentials.ts';

interface StaffAuthRequest {
  phone?: string;
  pin?: string;
  /** Set on the second call when the phone matched staff at several businesses. */
  userId?: string;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

/**
 * One message for "no such phone" and "wrong PIN" alike. Distinguishing them
 * would let anyone enumerate which phone numbers work at which venue.
 */
const GENERIC_FAILURE = 'Incorrect phone number or PIN.';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ message: 'Method not allowed.' }, 405);

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const body: StaffAuthRequest = await req.json();
    const phone = (body.phone ?? '').trim();
    const pin = (body.pin ?? '').trim();

    if (!phone || !isValidPin(pin)) return json({ message: GENERIC_FAILURE }, 401);

    // Service role deliberately bypasses RLS here: there is no session yet, so
    // there is no tenant to scope to. The lookup is narrowed to exactly one
    // phone number and returns nothing that is not needed to pick an account.
    const { data: candidates, error: lookupError } = await admin
      .from('merchant_users')
      .select('id, name, merchant_id, is_active, auth_user_id, pin_locked_until, merchants(business_name)')
      .eq('phone', phone)
      .eq('is_active', true);

    if (lookupError) throw lookupError;

    const usable = (candidates ?? []).filter((c) => c.auth_user_id);
    if (usable.length === 0) return json({ message: GENERIC_FAILURE }, 401);

    let account = usable[0];
    if (usable.length > 1) {
      if (!body.userId) {
        // Same number employed at more than one venue. Ask rather than guess.
        return json({
          choices: usable.map((c) => ({
            userId: c.id,
            name: c.name,
            businessName:
              (c.merchants as { business_name?: string } | null)?.business_name ?? 'Business',
          })),
        });
      }
      const chosen = usable.find((c) => c.id === body.userId);
      if (!chosen) return json({ message: GENERIC_FAILURE }, 401);
      account = chosen;
    }

    if (account.pin_locked_until && new Date(account.pin_locked_until) > new Date()) {
      const minutes = Math.max(
        1,
        Math.ceil((new Date(account.pin_locked_until).getTime() - Date.now()) / 60000)
      );
      return json(
        { message: `Too many incorrect attempts. Try again in ${minutes} minute(s).` },
        429
      );
    }

    // The PIN is verified by Supabase Auth itself: the derived password only
    // matches if the PIN was right. Nothing here compares secrets by hand.
    const password = await derivePassword(account.id, pin);
    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
    });

    const { data: signIn, error: signInError } = await authClient.auth.signInWithPassword({
      email: staffEmail(account.id),
      password,
    });

    if (signInError || !signIn.session) {
      await admin.rpc('register_pin_failure', { p_user_id: account.id });
      return json({ message: GENERIC_FAILURE }, 401);
    }

    await admin.rpc('clear_pin_failures', { p_user_id: account.id });

    return json({
      session: {
        access_token: signIn.session.access_token,
        refresh_token: signIn.session.refresh_token,
      },
    });
  } catch (err) {
    // Log the detail server-side; return nothing that describes our internals.
    console.error('staff-auth failed:', err);
    return json({ message: 'Sign in is temporarily unavailable. Please try again.' }, 500);
  }
});
