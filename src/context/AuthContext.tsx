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
  createDemoBusiness: (params: {
    businessName: string;
    ownerName: string;
    phone?: string;
    location?: string;
    upiId?: string;
    operatingMode?: import('../types').OperatingMode;
  }) => Promise<void>;
  signInDemo: () => Promise<void>;
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
    // 1. Check for stored demo session first (works in both preview and offline/unreachable mode)
    const demo = await authService.getStoredDemoSession();
    if (demo) {
      setUser(demo.user);
      setMerchant(demo.merchant);
      setStatus('signed-in');
      return;
    }

    // 2. Preview signs in as the sample owner and never talks to a server.
    if (isPreview) {
      setUser(previewOwner);
      setMerchant(previewMerchant);
      setStatus('signed-in');
      return;
    }

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

  const createDemoBusiness = useCallback(
    async (params: {
      businessName: string;
      ownerName: string;
      phone?: string;
      location?: string;
      upiId?: string;
      operatingMode?: import('../types').OperatingMode;
    }) => {
      const demo = await authService.createDemoBusiness(params);
      setUser(demo.user);
      setMerchant(demo.merchant);
      setStatus('signed-in');
    },
    []
  );

  const signInDemo = useCallback(async () => {
    const demo = await authService.signInDemo();
    setUser(demo.user);
    setMerchant(demo.merchant);
    setStatus('signed-in');
  }, []);

  const signOut = useCallback(async () => {
    // Flush anything scanned offline while the session still exists.
    if (merchant) {
      await scanService.syncQueued(merchant.id).catch(() => {});
    }

    await authService.signOut();
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
      createDemoBusiness,
      signInDemo,
    }),
    [status, user, merchant, error, can, load, signOut, createDemoBusiness, signInDemo]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
