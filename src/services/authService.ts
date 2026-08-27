/**
 * Authentication.
 *
 * Owners sign in with email and password through Supabase Auth. Staff sign in
 * with a phone number and a PIN, which is exchanged for a real Supabase session
 * by the staff-auth Edge Function - see supabase/functions/staff-auth.
 *
 * Why staff get a real session rather than a client-side "current user" flag:
 * every row level security policy and every RPC resolves the tenant and the
 * permission set from auth.uid(). Without a JWT there is nothing for the
 * database to key off, and permissions would collapse back into UI decoration
 * that anyone can bypass - which is precisely what the previous build did, right
 * down to a "Switch to Owner (Root Admin)" button on the access-denied screen.
 */
import { requireSupabase, supabase } from '../lib/supabase';
import { toStaffMember, toMerchant } from './mappers';
import { DEFAULT_TICKET_TYPES } from '../config/pricing';
import { env } from '../config/env';
import type { MerchantRow, MerchantUserRow } from '../types/db';
import type { Merchant, StaffMember } from '../types';

/**
 * Supabase could not send the confirmation email.
 *
 * It reports this as a bare HTTP 500 whose message - "Error sending
 * confirmation email" - is accurate and useless to the person reading it. A
 * merchant sees a server error, assumes the app is broken and tries again, and
 * every retry fails the same way, because nothing on their side is wrong: the
 * project either has no working SMTP configured or is still on Supabase's
 * built-in sender, which is rate limited to a couple of messages an hour and
 * only delivers to addresses belonging to the project's own organisation.
 *
 * Raised as its own type so the screen can explain that without matching on
 * wording Supabase is free to change.
 */
export class EmailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailDeliveryError';
  }
}

/** Recognises the SMTP failure above among ordinary sign-up rejections. */
function asSignUpError(error: { message: string; status?: number }): Error {
  if (/sending (the )?(confirmation|signup) email/i.test(error.message)) {
    return new EmailDeliveryError(error.message);
  }
  return new Error(error.message);
}

export interface SignedInContext {
  user: StaffMember;
  merchant: Merchant;
}

export interface StaffAccountChoice {
  userId: string;
  name: string;
  businessName: string;
}

class AuthService {
  // ---------------------------------------------------------------------------
  // Owner
  // ---------------------------------------------------------------------------

  async signUpOwner(params: {
    email: string;
    password: string;
    businessName: string;
    ownerName: string;
    phone: string;
    location?: string;
    upiId?: string;
  }): Promise<void> {
    const client = requireSupabase();

    const redirectUrl = env.publicWebUrl
      ? `${env.publicWebUrl}/app`
      : typeof window !== 'undefined'
        ? `${window.location.origin}/app`
        : undefined;

    const { data, error } = await client.auth.signUp({
      email: params.email.trim().toLowerCase(),
      password: params.password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          business_name: params.businessName.trim(),
          owner_name: params.ownerName.trim(),
          phone: params.phone.trim(),
          location: params.location?.trim() ?? '',
          upi_id: params.upiId?.trim() ?? '',
        },
      },
    });
    if (error) throw asSignUpError(error);

    // When email confirmation is switched on in the Supabase dashboard, signUp
    // returns no session and provisioning has to wait until the owner confirms
    // and signs in. provision_merchant is idempotent, so ensureProvisioned()
    // picks it up on that first real sign-in instead.
    if (!data.session) return;

    await this.provisionMerchant(params);
  }

  async signInOwner(email: string, password: string): Promise<void> {
    const client = requireSupabase();
    const { error } = await client.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw error;
  }

  async signInWithGoogle(): Promise<void> {
    const client = requireSupabase();
    const redirectUrl = env.publicWebUrl
      ? `${env.publicWebUrl}/app`
      : typeof window !== 'undefined'
        ? `${window.location.origin}/app`
        : undefined;

    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
      },
    });
    if (error) throw error;
  }

  /**
   * Create the tenant for the currently signed-in auth user.
   *
   * The starter ticket types are passed in from src/config/pricing.ts rather
   * than hardcoded in SQL, so that list has exactly one definition.
   */
  async provisionMerchant(params: {
    businessName: string;
    ownerName: string;
    phone: string;
    location?: string;
    upiId?: string;
  }): Promise<string> {
    const client = requireSupabase();
    const { data, error } = await client.rpc('provision_merchant', {
      p_business_name: params.businessName.trim(),
      p_owner_name: params.ownerName.trim(),
      p_phone: params.phone.trim(),
      p_location: params.location?.trim() ?? '',
      p_upi_id: params.upiId?.trim() ?? '',
      p_ticket_types: DEFAULT_TICKET_TYPES,
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.message ?? 'Could not create the business.');
    return data.merchantId as string;
  }

  // ---------------------------------------------------------------------------
  // Staff
  // ---------------------------------------------------------------------------

  /**
   * Exchange a phone number and PIN for a session.
   *
   * The PIN is never stored anywhere: the Edge Function derives the synthetic
   * auth password from it with a server-side secret, so a database dump reveals
   * no PINs. If the phone matches staff at more than one business, the function
   * returns the choices instead of guessing.
   */
  async signInStaff(params: {
    phone: string;
    pin: string;
    userId?: string;
  }): Promise<{ needsChoice?: StaffAccountChoice[] }> {
    const client = requireSupabase();

    const { data, error } = await client.functions.invoke('staff-auth', {
      body: { phone: params.phone.trim(), pin: params.pin.trim(), userId: params.userId },
    });
    if (error) throw new Error(await readFunctionError(error, 'Could not sign in.'));

    if (data?.choices) return { needsChoice: data.choices as StaffAccountChoice[] };
    if (!data?.session) throw new Error(data?.message ?? 'Incorrect phone number or PIN.');

    const { error: setErr } = await client.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
    if (setErr) throw setErr;
    return {};
  }

  // ---------------------------------------------------------------------------
  // Session
  // ---------------------------------------------------------------------------

  async signOut(): Promise<void> {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  /**
   * Load the signed-in staff row and their merchant.
   *
   * Returns null when there is a valid auth session but no merchant_users row
   * yet - the window between signUp and provisioning - so callers can route to
   * the "finish setting up your business" step rather than treating it as an
   * error.
   */
  async loadContext(): Promise<SignedInContext | null> {
    const client = requireSupabase();

    // RLS restricts this select to the caller's own tenant, but a tenant holds
    // a row per staff member, so the caller's own row has to be selected by
    // auth_user_id in the query itself. Fetching one arbitrary row and picking
    // through it afterwards returned whichever row Postgres happened to hand
    // back - usually the owner's - so every gatekeeper resolved to no row at
    // all and was routed to "finish setting up your business".
    const { data: auth } = await client.auth.getUser();
    const authId = auth.user?.id ?? null;
    if (!authId) return null;

    const { data: mine, error: userError } = await client
      .from('merchant_users')
      .select('*')
      .eq('auth_user_id', authId)
      .maybeSingle();
    if (userError) throw userError;
    if (!mine) return null;

    const { data: merchantRow, error: merchantError } = await client
      .from('merchants')
      .select('*')
      .eq('id', mine.merchant_id)
      .single();
    if (merchantError) throw merchantError;

    return {
      user: toStaffMember(mine as MerchantUserRow),
      merchant: toMerchant(merchantRow as MerchantRow),
    };
  }

  async hasSession(): Promise<boolean> {
    if (!supabase) return false;
    const { data } = await supabase.auth.getSession();
    return Boolean(data.session);
  }
}

/** Edge Function errors carry their JSON body on the response, not the message. */
async function readFunctionError(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json();
      if (body?.message) return body.message as string;
    } catch {
      // Non-JSON error body: fall through to the generic message.
    }
  }
  return error instanceof Error ? error.message : fallback;
}

export const authService = new AuthService();
