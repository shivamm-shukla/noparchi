/**
 * Who is signed in.
 *
 * Kept separate from AppContext deliberately. The old single context held the
 * "current user" as ordinary state with a switchUser() that took a user id and
 * no credential - so RoleGate could render a "Switch to Owner (Root Admin)"
 * button on its own access-denied screen and a gatekeeper could grant
 * themselves the ledger in one tap. Identity here comes from a Supabase session
 * and nothing in the app can change it except signing in as someone else.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { authService } from '../services/authService';
import { offlineScanStore } from '../services/offlineScanStore';
import { scanService } from '../services/scanService';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { missingConfig, isPreview } from '../config/env';
import { hasPermission, type PermissionKey } from '../config/permissions';
import type { Merchant, StaffMember } from '../types';
import { previewMerchant, previewOwner } from '../services/previewData';

type AuthStatus =
  | 'loading'
  /** No Supabase project configured - the app cannot do anything useful. */
  | 'unconfigured'
  | 'signed-out'
  /** Signed in, but no merchant yet: signup was interrupted before provisioning. */
  | 'needs-business'
  | 'signed-in';

interface AuthContextValue {
  status: AuthStatus;
  user: StaffMember | null;
  merchant: Merchant | null;
  error: string | null;
  missingEnvKeys: string[];
  can: (key: PermissionKey) => boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<AuthStatus>(
    isPreview ? 'signed-in' : isSupabaseConfigured ? 'loading' : 'unconfigured'
  );
  const [user, setUser] = useState<StaffMember | null>(isPreview ? previewOwner : null);
  const [merchant, setMerchant] = useState<Merchant | null>(
    isPreview ? previewMerchant : null
  );
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Preview signs in as the sample owner and never talks to a server.
    if (isPreview) return;
    if (!isSupabaseConfigured) {
      setStatus('unconfigured');
      return;
    }
    try {
      setError(null);
      if (!(await authService.hasSession())) {
        setUser(null);
        setMerchant(null);
        setStatus('signed-out');
        return;
      }

      const context = await authService.loadContext();
      if (!context) {
        setUser(null);
        setMerchant(null);
        setStatus('needs-business');
        return;
      }

      setUser(context.user);
      setMerchant(context.merchant);
      setStatus('signed-in');
    } catch (err) {
      // Surfaced rather than swallowed. Silent degradation to mock data is what
      // made the previous build impossible to debug.
      setError(err instanceof Error ? err.message : 'Could not load your account.');
      setStatus('signed-out');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // React to sign-in and sign-out happening anywhere, including the token
  // refresh that follows a staff PIN exchange.
  useEffect(() => {
    if (isPreview || !supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        load();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  const signOut = useCallback(async () => {
    if (isPreview) return;

    // Flush anything scanned offline while the session still exists.
    // validate_ticket resolves the gatekeeper from the JWT, so a queued scan
    // replayed after sign-out has no identity to record against.
    if (merchant) {
      await scanService.syncQueued(merchant.id).catch(() => {});
    }

    await authService.signOut();

    // Only the cached pass list goes. It is the one piece of state that would
    // let the next account to sign in validate against this one's passes.
    //
    // The queue stays. It is keyed by merchant, so nobody else can read it, and
    // whatever is left in it is a person who was let out of the venue on a scan
    // the server has never seen. The previous code wiped all three keys here,
    // which meant signing out on a device that had been offline destroyed the
    // only record those exits had.
    await offlineScanStore.clearCachedPasses();

    setUser(null);
    setMerchant(null);
    setStatus('signed-out');
  }, [merchant]);

  const can = useCallback(
    (key: PermissionKey) => hasPermission(user?.permissions, key, user?.isOwner ?? false),
    [user]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      merchant,
      error,
      missingEnvKeys: missingConfig(),
      can,
      refresh: load,
      signOut,
    }),
    [status, user, merchant, error, can, load, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
