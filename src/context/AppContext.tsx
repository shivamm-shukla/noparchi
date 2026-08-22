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
import type { DashboardStats, DateRangeKey, StaffMember, Transaction } from '../types';
import type { TicketType } from '../config/pricing';

interface AppContextValue {
  transactions: Transaction[];
  stats: DashboardStats | null;
  ticketTypes: TicketType[];
  staff: StaffMember[];
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

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [range, setRange] = useState<DateRangeKey>('today');
  const [isLoading, setIsLoading] = useState(true);
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
      if (status !== 'signed-in' || !merchantId) return;

      const token = ++loadToken.current;
      if (opts?.silent) setIsRefreshing(true);
      else setIsLoading(true);

      try {
        setError(null);

        // Ticket types and staff are cheap and rarely change, but they are what
        // the Settings and checkout screens are built from, so they load with
        // everything else rather than per-screen.
        const [statsResult, typesResult, staffResult] = await Promise.all([
          transactionService.stats(range),
          merchantService.listTicketTypes(merchantId, true),
          merchantService.listStaff(merchantId),
        ]);

        // A gatekeeper without can_view_ledger gets no rows from the database
        // by design. Asking anyway would just log a permission error every
        // refresh, so skip the call entirely.
        const txResult = canViewLedger
          ? await transactionService.list({ merchantId, range })
          : [];

        if (token !== loadToken.current) return;

        setStats(statsResult);
        setTicketTypes(typesResult);
        setStaff(staffResult);
        setTransactions(txResult);
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
    if (status !== 'signed-in' || !merchantId) return;
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
    if (status !== 'signed-in' || !merchantId) return;
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
