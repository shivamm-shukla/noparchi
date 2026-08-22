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
import type { MerchantRow, MerchantUserRow } from '../types/db';
import type { Merchant, StaffMember } from '../types';

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

    const { data, error } = await client.auth.signUp({
      email: params.email.trim().toLowerCase(),
      password: params.password,
    });
    if (error) throw error;

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

    const { data: userRows, error: userError } = await client
      .from('merchant_users')
      .select('*')
      .limit(1);
    if (userError) throw userError;
    if (!userRows || userRows.length === 0) return null;

    // RLS restricts this select to the caller's own tenant, but the tenant can
    // hold several staff rows, so pick this session's own row explicitly.
    const { data: auth } = await client.auth.getUser();
    const authId = auth.user?.id ?? null;
    const mine =
      (userRows as MerchantUserRow[]).find((r) => r.auth_user_id === authId) ?? null;
    if (!mine) return null;

    const { data: merchantRow, error: merchantError } = await client
      .from('merchants')
      .select('*')
      .eq('id', mine.merchant_id)
      .single();
    if (merchantError) throw merchantError;

    return {
      user: toStaffMember(mine),
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
