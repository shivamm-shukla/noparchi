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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireSupabase, supabase } from '../lib/supabase';
import { toStaffMember, toMerchant } from './mappers';
import { DEFAULT_TICKET_TYPES } from '../config/pricing';
import { env, isPreview } from '../config/env';
import { ownerPermissions } from '../config/permissions';
import { previewMerchant, previewOwner } from './previewData';
import type { MerchantRow, MerchantUserRow } from '../types/db';
import type { Merchant, StaffMember, OperatingMode } from '../types';

/**
 * Supabase could not send the confirmation email.
 */
export class EmailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailDeliveryError';
  }
}

/**
 * Supabase backend server is unreachable or failed to fetch (DNS / network failure).
 */
export class SupabaseUnreachableError extends Error {
  constructor(message: string) {
    super(
      `Supabase cloud server connect nahi ho pa raha (${message}). Supabase project URL inactive ya paused ho sakta hai.`
    );
    this.name = 'SupabaseUnreachableError';
  }
}

/** Recognises network connectivity / DNS resolution failures. */
export function isNetworkError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('network request failed') ||
    msg.includes('network error') ||
    msg.includes('load failed') ||
    msg.includes('err_name_not_resolved') ||
    msg.includes('enotfound') ||
    msg.includes('connect failed')
  );
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

const DEMO_STORAGE_KEY = 'noparchi_demo_session';

class AuthService {
  // ---------------------------------------------------------------------------
  // Demo / Offline Mode Handlers
  // ---------------------------------------------------------------------------

  async createDemoBusiness(params: {
    businessName: string;
    ownerName: string;
    phone?: string;
    location?: string;
    upiId?: string;
    operatingMode?: OperatingMode;
  }): Promise<{ user: StaffMember; merchant: Merchant }> {
    const merchantId = 'demo-m-' + Date.now();
    const demoMerchant: Merchant = {
      id: merchantId,
      businessName: params.businessName.trim() || 'My Business',
      location: params.location?.trim() || 'Main Campus',
      operatingMode: params.operatingMode || 'PARKING',
      upiId: params.upiId?.trim() || 'merchant@upi',
      currency: 'INR',
      paymentProvider: 'upi_intent',
      messagingProvider: 'wa_deeplink',
      branding: {},
      exitGates: ['Main Gate', 'Gate 2'],
      createdAt: new Date().toISOString(),
    };

    const demoOwner: StaffMember = {
      id: 'demo-owner-' + Date.now(),
      merchantId,
      authUserId: 'demo-auth-' + Date.now(),
      isOwner: true,
      name: params.ownerName.trim() || 'Owner',
      phone: params.phone?.trim() || '9876543210',
      permissions: ownerPermissions(),
      isActive: true,
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    Object.assign(previewMerchant, demoMerchant);
    Object.assign(previewOwner, demoOwner);

    await AsyncStorage.setItem(
      DEMO_STORAGE_KEY,
      JSON.stringify({ user: demoOwner, merchant: demoMerchant })
    );

    return { user: demoOwner, merchant: demoMerchant };
  }

  async signInDemo(): Promise<{ user: StaffMember; merchant: Merchant }> {
    await AsyncStorage.setItem(
      DEMO_STORAGE_KEY,
      JSON.stringify({ user: previewOwner, merchant: previewMerchant })
    );
    return { user: previewOwner, merchant: previewMerchant };
  }

  async getStoredDemoSession(): Promise<{ user: StaffMember; merchant: Merchant } | null> {
    try {
      const raw = await AsyncStorage.getItem(DEMO_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

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
    if (isPreview) {
      await this.createDemoBusiness(params);
      return;
    }

    try {
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

      if (!data.session) return;

      await this.provisionMerchant(params);
    } catch (err) {
      if (isNetworkError(err)) {
        throw new SupabaseUnreachableError(
          err instanceof Error ? err.message : 'Network request failed'
        );
      }
      throw err;
    }
  }

  async signInOwner(email: string, password: string): Promise<void> {
    if (isPreview) {
      await this.signInDemo();
      return;
    }

    try {
      const client = requireSupabase();
      const { error } = await client.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw error;
    } catch (err) {
      if (isNetworkError(err)) {
        throw new SupabaseUnreachableError(
          err instanceof Error ? err.message : 'Network request failed'
        );
      }
      throw err;
    }
  }

  async signInWithGoogle(): Promise<void> {
    if (isPreview) {
      await this.signInDemo();
      return;
    }

    try {
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
    } catch (err) {
      if (isNetworkError(err)) {
        throw new SupabaseUnreachableError(
          err instanceof Error ? err.message : 'Network request failed'
        );
      }
      throw err;
    }
  }

  /**
   * Create the tenant for the currently signed-in auth user.
   */
  async provisionMerchant(params: {
    businessName: string;
    ownerName: string;
    phone: string;
    location?: string;
    upiId?: string;
  }): Promise<string> {
    if (isPreview) {
      const demo = await this.createDemoBusiness(params);
      return demo.merchant.id;
    }

    try {
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
    } catch (err) {
      if (isNetworkError(err)) {
        throw new SupabaseUnreachableError(
          err instanceof Error ? err.message : 'Network request failed'
        );
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Staff
  // ---------------------------------------------------------------------------

  async signInStaff(params: {
    phone: string;
    pin: string;
    userId?: string;
  }): Promise<{ needsChoice?: StaffAccountChoice[] }> {
    if (isPreview) {
      await this.signInDemo();
      return {};
    }

    try {
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
    } catch (err) {
      if (isNetworkError(err)) {
        throw new SupabaseUnreachableError(
          err instanceof Error ? err.message : 'Network request failed'
        );
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Session
  // ---------------------------------------------------------------------------

  async signOut(): Promise<void> {
    await AsyncStorage.removeItem(DEMO_STORAGE_KEY).catch(() => {});
    if (!supabase) return;
    await supabase.auth.signOut().catch(() => {});
  }

  async loadContext(): Promise<SignedInContext | null> {
    const demo = await this.getStoredDemoSession();
    if (demo) {
      Object.assign(previewMerchant, demo.merchant);
      Object.assign(previewOwner, demo.user);
      return demo;
    }

    if (isPreview) {
      return {
        user: previewOwner,
        merchant: previewMerchant,
      };
    }

    if (!supabase) return null;

    try {
      const client = requireSupabase();

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
    } catch (err) {
      if (isNetworkError(err)) {
        return null;
      }
      throw err;
    }
  }

  async hasSession(): Promise<boolean> {
    const demo = await this.getStoredDemoSession();
    if (demo) return true;
    if (isPreview) return true;
    if (!supabase) return false;
    try {
      const { data } = await supabase.auth.getSession();
      return Boolean(data.session);
    } catch {
      return false;
    }
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
