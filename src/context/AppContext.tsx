/**
 * Tenant data: passes, figures, ticket types, staff.
 *
 * Sits on top of AuthContext and holds no identity of its own. Every call it
 * makes is already scoped by row level security, so nothing here has to
 * remember to filter by merchant - and nothing here can forget to.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import { merchantService } from '../services/merchantService';
import { transactionService } from '../services/transactionService';
import { scanService, type SyncConflict } from '../services/scanService';
import type {
  DashboardStats,
  DateRangeKey,
  ExpiringPass,
  StaffMember,
  Transaction,
} from '../types';
import type { TicketType } from '../config/pricing';
import { isPreview } from '../config/env';
import {
  previewExpiring,
  previewStaff,
  previewStats,
  previewTicketTypes,
  previewTransactions,
} from '../services/previewData';

interface AppContextValue {
  transactions: Transaction[];
  stats: DashboardStats | null;
  ticketTypes: TicketType[];
  staff: StaffMember[];
  /** Paid, unused passes running out within the hour, soonest first. */
  expiringPasses: ExpiringPass[];
  range: DateRangeKey;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  /** Offline scans the server rejected on sync - shown once, then dismissed. */
  syncConflicts: SyncConflict[];
  setRange: (range: DateRangeKey) => void;
  refresh: (opts?: { silent?: boolean }) => Promise<void>;
  dismissConflicts: () => void;
  /** Applies a local change immediately, before the server round-trip. */
  applyOptimistic: (updater: (current: Transaction[]) => Transaction[]) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { status, merchant, user } = useAuth();

  const [transactions, setTransactions] = useState<Transaction[]>(
    isPreview ? previewTransactions : []
  );
  const [stats, setStats] = useState<DashboardStats | null>(isPreview ? previewStats : null);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>(
    isPreview ? previewTicketTypes : []
  );
  const [staff, setStaff] = useState<StaffMember[]>(isPreview ? previewStaff : []);
  const [expiringPasses, setExpiringPasses] = useState<ExpiringPass[]>(
    isPreview ? previewExpiring : []
  );
  const [range, setRange] = useState<DateRangeKey>('today');
  const [isLoading, setIsLoading] = useState(!isPreview);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncConflicts, setSyncConflicts] = useState<SyncConflict[]>([]);

  const merchantId = merchant?.id ?? null;
  const canViewLedger = user?.permissions.can_view_ledger ?? false;

  /**
   * Realtime and pull-to-refresh can both fire while a load is already running.
   * Without this the later response can overwrite the newer one.
   */
  const loadToken = useRef(0);

  const refresh = useCallback(
    async (opts?: { silent?: boolean }) => {
      // Preview data is fixed; refreshing it would only make the spinner blink.
      if (isPreview) return;
      if (status !== 'signed-in' || !merchantId) return;

      const token = ++loadToken.current;
      if (opts?.silent) setIsRefreshing(true);
      else setIsLoading(true);

      try {
        setError(null);

        // Ticket types and staff are cheap and rarely change, but they are what
        // the Settings and checkout screens are built from, so they load with
        // everything else rather than per-screen.
        // Always today, never `range`. The dashboard is the only screen that
        // reads these figures and every one of its labels says so - "Revenue
        // today", "vs yesterday", "paid, not yet exited". `range` belongs to
        // the ledger's date filter, so passing it here meant an owner who
        // looked at last month in the ledger came back to a dashboard quietly
        // showing last month's revenue under a label that said today.
        const [statsResult, typesResult, staffResult] = await Promise.all([
          transactionService.stats('today'),
          merchantService.listTicketTypes(merchantId, true),
          merchantService.listStaff(merchantId),
        ]);

        // A gatekeeper without can_view_ledger gets no rows from the database
        // by design. Asking anyway would just log a permission error every
        // refresh, so skip the call entirely.
        // Both of these carry customer data, so the server returns nothing for
        // staff without can_view_ledger. Asking anyway would log a permission
        // error on every refresh, so skip the calls entirely.
        const [txResult, expiringResult] = canViewLedger
          ? await Promise.all([
              transactionService.list({ merchantId, range }),
              transactionService.expiringSoon(60),
            ])
          : [[] as Transaction[], [] as ExpiringPass[]];

        if (token !== loadToken.current) return;

        setStats(statsResult);
        setTicketTypes(typesResult);
        setStaff(staffResult);
        setTransactions(txResult);
        setExpiringPasses(expiringResult);
      } catch (err) {
        if (token !== loadToken.current) return;
        setError(err instanceof Error ? err.message : 'Could not load your data.');
      } finally {
        if (token === loadToken.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [status, merchantId, range, canViewLedger]
  );

  useEffect(() => {
    if (status === 'signed-in') refresh();
    else if (status !== 'loading') setIsLoading(false);
  }, [status, refresh]);

  // Flush anything scanned while offline, then top the offline cache back up.
  // Runs on sign-in and whenever the merchant changes, which is when a device
  // that was out of signal typically comes back.
  useEffect(() => {
    if (isPreview || status !== 'signed-in' || !merchantId) return;
    let cancelled = false;

    (async () => {
      const { synced, conflicts } = await scanService.syncQueued();
      if (cancelled) return;
      if (conflicts.length > 0) setSyncConflicts(conflicts);
      if (synced > 0) refresh({ silent: true });
      await scanService.refreshOfflineCache(merchantId);
    })();

    return () => {
      cancelled = true;
    };
  }, [status, merchantId, refresh]);

  // Live gate activity. Refreshes silently so the screen does not flash a
  // spinner every time a pass is sold at the gate.
  useEffect(() => {
    if (isPreview || status !== 'signed-in' || !merchantId) return;
    return transactionService.subscribe(merchantId, () => {
      refresh({ silent: true });
    });
  }, [status, merchantId, refresh]);

  const applyOptimistic = useCallback(
    (updater: (current: Transaction[]) => Transaction[]) => {
      setTransactions((current) => updater(current));
    },
    []
  );

  const value = useMemo<AppContextValue>(
    () => ({
      transactions,
      stats,
      ticketTypes,
      staff,
      expiringPasses,
      range,
      isLoading,
      isRefreshing,
      error,
      syncConflicts,
      setRange,
      refresh,
      dismissConflicts: () => setSyncConflicts([]),
      applyOptimistic,
    }),
    [
      transactions,
      stats,
      ticketTypes,
      staff,
      expiringPasses,
      range,
      isLoading,
      isRefreshing,
      error,
      syncConflicts,
      refresh,
      applyOptimistic,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
