import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { env, isSupabaseConfigured } from '../config/env';

export { isSupabaseConfigured };

/**
 * The Supabase client, or null when the project is not configured.
 *
 * Deliberately nullable. The previous version pointed a missing configuration
 * at a fake demo host and then caught every resulting network error into mock
 * data, so a completely unconfigured app looked like a working one. Callers
 * must now handle "no backend" explicitly - see requireSupabase().
 *
 * detectSessionInUrl is enabled on web because password-reset and email
 * confirmation links come back as URL fragments the client has to consume.
 */
export const supabase: SupabaseClient | null =
  isSupabaseConfigured && env.supabaseUrl && env.supabaseAnonKey
    ? createClient(env.supabaseUrl, env.supabaseAnonKey, {
        auth: {
          storage: Platform.OS === 'web' ? undefined : AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: Platform.OS === 'web',
        },
      })
    : null;

/** Thrown rather than silently degrading, so misconfiguration is visible. */
export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super(
      'Supabase is not configured. Copy .env.example to .env and set ' +
        'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart the dev server.'
    );
    this.name = 'SupabaseNotConfiguredError';
  }
}

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new SupabaseNotConfiguredError();
  return supabase;
}
