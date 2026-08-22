/**
 * Passes and revenue.
 *
 * Reads rely on row level security for tenant scoping. The transactions SELECT
 * policy also requires can_view_ledger, so a gatekeeper without it receives an
 * empty result from the database rather than a hidden screen - which is what
 * makes that permission real rather than decorative.
 */
import { requireSupabase, supabase } from '../lib/supabase';
import { isPreview } from '../config/env';
import { previewTransactions, previewExpiring, previewStats } from './previewData';
import { toTransaction } from './mappers';
import type { TransactionRow } from '../types/db';
import type { DashboardStats, DateRangeKey, ExpiringPass, Transaction } from '../types';

/** Local-time day boundaries: a venue's "today" is its own midnight, not UTC. */
export function rangeBounds(range: DateRangeKey): { from: Date; to: Date } {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (range) {
    case 'today':
      return { from: startOfToday, to: new Date(startOfToday.getTime() + 86400000) };
    case 'yesterday':
      return { from: new Date(startOfToday.getTime() - 86400000), to: startOfToday };
    case 'week':
      return { from: new Date(startOfToday.getTime() - 6 * 86400000), to: now };
    case 'month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
    case 'all':
    default:
      return { from: new Date(0), to: now };
  }
}

class TransactionService {
  async list(params: {
    merchantId: string;
    range: DateRangeKey;
    limit?: number;
  }): Promise<Transaction[]> {
    if (isPreview) return previewTransactions;
    const client = requireSupabase();
    const { from, to } = rangeBounds(params.range);

    const { data, error } = await client
      .from('transactions')
      // The embed is normalised in toTransaction: PostgREST may return a to-one
      // relation as an object or a single-element array, and an empty array is
      // truthy - which previously made every unscanned pass read as used.
      .select('*, validation:ticket_validations(*), extensions:pass_extensions(*)')
      .eq('merchant_id', params.merchantId)
      .gte('created_at', from.toISOString())
      .lt('created_at', to.toISOString())
      .order('created_at', { ascending: false })
      .limit(params.limit ?? 200);

    if (error) throw error;
    return (data as TransactionRow[]).map(toTransaction);
  }

  /**
   * Aggregated in Postgres rather than by pulling every row and reducing in
   * JavaScript. The old version fetched today's and yesterday's transactions in
   * full on every dashboard render.
   */
  async stats(range: DateRangeKey = 'today'): Promise<DashboardStats> {
    if (isPreview) return previewStats;
    const client = requireSupabase();
    const { from, to } = rangeBounds(range);

    const { data, error } = await client.rpc('dashboard_stats', {
      p_from: from.toISOString(),
      p_to: to.toISOString(),
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.message ?? 'Could not load dashboard figures.');

    return {
      canViewRevenue: Boolean(data.canViewRevenue),
      revenue: data.revenue === null ? null : Number(data.revenue),
      previousRevenue: data.previousRevenue === null ? null : Number(data.previousRevenue),
      growthPercent: data.growthPercent === null ? null : Number(data.growthPercent),
      passesIssued: data.passesIssued === null ? null : Number(data.passesIssued),
      pendingPayments: data.pendingPayments === null ? null : Number(data.pendingPayments),
      extensionRevenue: data.extensionRevenue === null ? null : Number(data.extensionRevenue),
      overstayRevenue: data.overstayRevenue === null ? null : Number(data.overstayRevenue),
      scans: Number(data.scans ?? 0),
      myScans: Number(data.myScans ?? 0),
      openPasses: Number(data.openPasses ?? 0),
      expiringSoon: Number(data.expiringSoon ?? 0),
      from: data.from,
      to: data.to,
    };
  }

  /**
   * Passes about to run out, so staff can nudge customers before the overstay
   * charge starts - and so a venue without automated WhatsApp still has a way
   * to act on expiry rather than only discovering it at the gate.
   */
  async expiringSoon(withinMinutes = 60): Promise<ExpiringPass[]> {
    if (isPreview) return previewExpiring;
    const client = requireSupabase();
    const { data, error } = await client.rpc('passes_expiring_soon', {
      p_within_minutes: withinMinutes,
    });
    if (error) throw error;
    if (!data?.success) return [];

    return ((data.passes ?? []) as Array<Record<string, unknown>>).map((p) => ({
      ticketCode: String(p.ticketCode),
      typeLabel: String(p.typeLabel),
      vehicleNumber: (p.vehicleNumber as string | null) ?? null,
      customerPhone: (p.customerPhone as string | null) ?? null,
      expiresAt: String(p.expiresAt),
      reminderSentAt: (p.reminderSentAt as string | null) ?? null,
      isExpired: Boolean(p.isExpired),
      overstayDue: Number(p.overstayDue ?? 0),
    }));
  }

  /** Confirm that the customer's extension payment landed. */
  async confirmExtension(ticketCode: string, paymentRef?: string): Promise<string> {
    if (isPreview) return new Date(Date.now() + 180 * 60000).toISOString();
    const client = requireSupabase();
    const { data, error } = await client.rpc('confirm_extension', {
      p_ticket_code: ticketCode,
      p_payment_ref: paymentRef ?? null,
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.message ?? 'Could not confirm the extension.');
    return String(data.extendsTo);
  }

  /**
   * Issue a pass from the merchant app - the walk-up cash or in-person UPI case.
   *
   * markPaid records that a named staff member saw the money arrive, against
   * their id. That is a real verification by an accountable person, which is
   * categorically different from a customer asserting it about themselves.
   */
  async issuePass(params: {
    ticketTypeCode: string;
    vehicleNumber?: string;
    customerPhone?: string;
    markPaid?: boolean;
    paymentRef?: string;
  }): Promise<Transaction> {
    if (isPreview) return previewTransactions[0];
    const client = requireSupabase();
    const { data, error } = await client.rpc('issue_pass', {
      p_ticket_type_code: params.ticketTypeCode,
      p_vehicle_number: params.vehicleNumber ?? null,
      p_customer_phone: params.customerPhone ?? null,
      p_mark_paid: params.markPaid ?? true,
      p_payment_ref: params.paymentRef ?? null,
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.message ?? 'Could not issue the pass.');
    return toTransaction(data.ticket as TransactionRow);
  }

  /** Confirm that a customer's UPI payment actually landed. */
  async confirmPayment(ticketCode: string, paymentRef?: string): Promise<Transaction> {
    if (isPreview) return previewTransactions[0];
    const client = requireSupabase();
    const { data, error } = await client.rpc('confirm_payment', {
      p_ticket_code: ticketCode,
      p_payment_ref: paymentRef ?? null,
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.message ?? 'Could not confirm the payment.');
    return toTransaction(data.ticket as TransactionRow);
  }

  /**
   * Live gate activity.
   *
   * The filter uses merchant_id, a plain lowercase column. The previous version
   * filtered on a quoted camelCase name and the tables were never added to the
   * publication either, so no event could ever have arrived.
   */
  subscribe(merchantId: string, onChange: () => void): () => void {
    if (isPreview || !supabase) return () => {};

    const channel = supabase
      .channel(`gate-activity:${merchantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: `merchant_id=eq.${merchantId}` },
        onChange
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ticket_validations', filter: `merchant_id=eq.${merchantId}` },
        onChange
      )
      .subscribe();

    return () => {
      supabase?.removeChannel(channel);
    };
  }
}

export const transactionService = new TransactionService();
