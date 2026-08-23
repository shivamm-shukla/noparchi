/**
 * Ticket verification - the anti-fraud core of the product.
 *
 * Online, a scan is exactly one call to the validate_ticket RPC, which runs
 * entirely inside one database transaction: it locks the pass row, checks that
 * it is paid and unused, and records the scan. The previous implementation
 * spread that across three separate network round-trips with no transaction,
 * and relied on a unique constraint to catch the race it created.
 *
 * The caller's identity is NOT sent. It comes from the JWT inside the database.
 * The old Edge Function took scannedByUserId from the request body, so any
 * client could claim to be whoever it liked.
 */
import { requireSupabase, supabase } from '../lib/supabase';
import { isPreview } from '../config/env';
import { previewTransactions } from './previewData';
import { offlineScanStore, type SyncConflict } from './offlineScanStore';
import type { ScanResult, ScanStatus, Transaction } from '../types';
import type { TransactionRow, TicketValidationRow } from '../types/db';
import { toTransaction, toValidation } from './mappers';

/**
 * A QR may encode either a bare code or the JSON payload the pass page embeds.
 * Both are accepted; the server normalises again, so this is only to keep the
 * offline path working on the same inputs.
 */
export function extractTicketCode(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as { ticketCode?: string };
      if (parsed.ticketCode) return parsed.ticketCode.trim().toUpperCase();
    } catch {
      // Not our JSON. Treat the whole string as a code.
    }
  }
  // A pass URL also scans cleanly: .../ticket/NP-XXXX-YYYY
  const urlMatch = trimmed.match(/\/ticket\/([A-Za-z0-9-]+)/);
  if (urlMatch) return urlMatch[1].toUpperCase();

  return trimmed.toUpperCase();
}

/** Distinguishes "the server said no" from "the server was unreachable". */
function isNetworkFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('timeout') ||
    message.includes('failed to send')
  );
}

class ScanService {
  /**
   * Guards against the camera firing the same frame repeatedly.
   *
   * Note what this is NOT: it is not a concurrency control. It cannot see
   * another gatekeeper's device. Double-scan safety is the UNIQUE constraint on
   * ticket_validations.transaction_id and the row lock inside validate_ticket -
   * nothing on this side of the network. The previous code called an identical
   * boolean a "Concurrency Lock", which is how it ended up being trusted for
   * something it could never do.
   */
  private inFlight = false;

  async verify(params: {
    raw: string;
    merchantId: string;
    exitGate?: string;
    notes?: string;
  }): Promise<ScanResult> {
    const ticketCode = extractTicketCode(params.raw);
    const exitGate = params.exitGate?.trim() || 'Main Exit';

    if (!ticketCode) {
      return { success: false, status: 'INVALID', message: 'Nothing readable in that QR code.' };
    }
    if (this.inFlight) {
      return { success: false, status: 'INVALID', message: 'Still processing the last scan.' };
    }

    this.inFlight = true;
    try {
      if (isPreview) return previewScan(ticketCode);
      const client = requireSupabase();
      const { data, error } = await client.rpc('validate_ticket', {
        p_ticket_code: ticketCode,
        p_exit_gate: exitGate,
        p_notes: params.notes ?? null,
      });

      if (error) {
        if (isNetworkFailure(error)) {
          return this.verifyOffline({ ticketCode, merchantId: params.merchantId, exitGate, notes: params.notes });
        }
        throw error;
      }

      return this.fromRpc(data);
    } catch (err) {
      if (isNetworkFailure(err)) {
        return this.verifyOffline({
          ticketCode,
          merchantId: params.merchantId,
          exitGate,
          notes: params.notes,
        });
      }
      return {
        success: false,
        status: 'INVALID',
        message: err instanceof Error ? err.message : 'Could not verify this pass.',
      };
    } finally {
      this.inFlight = false;
    }
  }

  private fromRpc(data: unknown): ScanResult {
    const payload = (data ?? {}) as {
      success?: boolean;
      status?: ScanStatus;
      message?: string;
      ticket?: TransactionRow;
      validation?: TicketValidationRow;
      scannedAt?: string;
      overstayDue?: number;
      expiresAt?: string;
    };

    return {
      success: Boolean(payload.success),
      status: payload.status ?? 'INVALID',
      message: payload.message ?? 'Could not verify this pass.',
      ticket: payload.ticket ? toTransaction(payload.ticket) : null,
      validation: payload.validation ? toValidation(payload.validation) : null,
      scannedAt: payload.scannedAt ?? null,
      overstayDue: payload.overstayDue === undefined ? undefined : Number(payload.overstayDue),
      expiresAt: payload.expiresAt ?? null,
    };
  }

  /**
   * Take the overstay and open the gate, for a pass that came back EXPIRED.
   *
   * A separate, deliberate second action rather than something validate_ticket
   * does on its own: money is changing hands, and the gatekeeper has to be the
   * one who says it did. The server recomputes what is owed and refuses
   * anything short of it, so the amount sent from here can round up but never
   * down.
   */
  async clearExpired(params: {
    ticketCode: string;
    collectedAmount: number;
    exitGate?: string;
    notes?: string;
  }): Promise<ScanResult> {
    if (isPreview) {
      return {
        success: true,
        status: 'VERIFIED',
        message: 'Overstay recorded. Exit cleared.',
        scannedAt: new Date().toISOString(),
      };
    }
    const client = requireSupabase();
    const { data, error } = await client.rpc('clear_expired_pass', {
      p_ticket_code: params.ticketCode,
      p_collected_amount: params.collectedAmount,
      p_exit_gate: params.exitGate ?? 'Main Exit',
      p_notes: params.notes ?? null,
    });
    if (error) throw error;
    return this.fromRpc(data);
  }

  /**
   * The no-connection path.
   *
   * Only passes already known to be paid and unscanned can clear here, and the
   * clearance is written to disk before the gatekeeper is told "verified" - so
   * a restart, a crash or a killed browser tab cannot resurrect a used pass.
   */
  private async verifyOffline(params: {
    ticketCode: string;
    merchantId: string;
    exitGate: string;
    notes?: string;
  }): Promise<ScanResult> {
    const { ticketCode, merchantId, exitGate } = params;

    const alreadyUsed = await offlineScanStore.isUsedLocally(merchantId, ticketCode);
    if (alreadyUsed) {
      const at = new Date(alreadyUsed.scannedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      return {
        success: false,
        status: 'ALREADY_USED',
        message: `Already used at ${at} on this device (offline).`,
        queuedOffline: true,
      };
    }

    const cached = await offlineScanStore.getCachedPass(merchantId, ticketCode);

    // An expired pass owes money, and the overstay can only be computed by the
    // server. Clearing it offline would either let someone out for free or make
    // the gatekeeper guess - so this one case waits for a connection.
    if (cached?.expiresAt && new Date(cached.expiresAt).getTime() < Date.now()) {
      return {
        success: false,
        status: 'EXPIRED',
        message:
          'This pass has expired and the overstay charge needs a connection to work out. ' +
          'Reconnect, or collect at the counter.',
        expiresAt: cached.expiresAt,
        queuedOffline: true,
      };
    }

    if (!cached) {
      const age = await offlineScanStore.cacheAgeMinutes(merchantId);
      return {
        success: false,
        status: 'INVALID',
        message:
          age === null
            ? 'No connection and no offline pass list yet. Connect once to enable offline scanning.'
            : `No connection. This pass is not in the offline list (last updated ${age} min ago).`,
        queuedOffline: true,
      };
    }

    const scan = {
      merchantId,
      ticketCode,
      exitGate,
      notes: params.notes ?? null,
      scannedAt: new Date().toISOString(),
    };
    // Persist BEFORE reporting success. If this throws, the gatekeeper sees a
    // failure rather than a clearance we cannot remember.
    await offlineScanStore.markUsedLocally(scan);

    return {
      success: true,
      status: 'VERIFIED',
      message: `Pass verified offline. ${cached.typeLabel}. Will sync when back online.`,
      queuedOffline: true,
      scannedAt: scan.scannedAt,
    };
  }

  /**
   * Refresh the offline pass list. Cheap enough to call on every dashboard load.
   *
   * Capped: a device only needs the passes plausibly still inside the venue, and
   * an unbounded list would be slow to fetch on the connection that made
   * offline mode necessary in the first place.
   */
  async refreshOfflineCache(merchantId: string, limit = 500): Promise<void> {
    if (isPreview || !supabase) return;
    const { data, error } = await supabase
      .from('transactions')
      .select(
        'ticket_code, amount, ticket_type_label, vehicle_number, expires_at, validation:ticket_validations(id)'
      )
      .eq('merchant_id', merchantId)
      .eq('status', 'paid')
      .order('created_at', { ascending: false })
      .limit(limit);

    // A staff member without can_view_ledger cannot select transactions at all.
    // That is intended, and it simply means no offline cache for them - not an
    // error worth showing.
    if (error || !data) return;

    const passes = (data as Array<Record<string, unknown>>)
      .filter((row) => {
        const v = row.validation;
        return Array.isArray(v) ? v.length === 0 : v == null;
      })
      .map((row) => ({
        ticketCode: String(row.ticket_code),
        amount: Number(row.amount),
        typeLabel: String(row.ticket_type_label ?? 'Pass'),
        vehicleNumber: (row.vehicle_number as string | null) ?? null,
        expiresAt: (row.expires_at as string | null) ?? null,
      }));

    await offlineScanStore.cachePasses(merchantId, passes);
  }

  /**
   * Replay queued offline scans.
   *
   * The server is authoritative. A queued scan the server rejects - because
   * another device cleared the same pass while both were offline - is reported
   * as a conflict rather than silently dropped, because that is a person who
   * got through the gate twice and the owner should know.
   */
  async syncQueued(merchantId: string): Promise<{ synced: number; conflicts: SyncConflict[] }> {
    if (isPreview || !supabase) return { synced: 0, conflicts: [] };

    // Scoped to the signed-in merchant. validate_ticket resolves the tenant
    // from the JWT and will not find another business's code, so replaying a
    // queue indiscriminately would burn one tenant's unsynced scans as bogus
    // conflicts on someone else's dashboard.
    const queue = await offlineScanStore.pendingScans(merchantId);
    if (queue.length === 0) return { synced: 0, conflicts: [] };

    let synced = 0;
    const conflicts: SyncConflict[] = [];

    for (const scan of queue) {
      try {
        const { data, error } = await supabase.rpc('validate_ticket', {
          p_ticket_code: scan.ticketCode,
          p_exit_gate: scan.exitGate,
          p_notes: scan.notes ?? `Scanned offline at ${scan.scannedAt}`,
        });
        if (error) {
          // Still offline. Leave it queued and stop - the rest will fail too.
          if (isNetworkFailure(error)) break;
          throw error;
        }

        const result = data as { success?: boolean; status?: string; message?: string };
        if (result?.success) {
          synced++;
        } else if (result?.status === 'ALREADY_USED') {
          conflicts.push({ ticketCode: scan.ticketCode, message: result.message ?? 'Already used' });
        } else {
          conflicts.push({
            ticketCode: scan.ticketCode,
            message: result?.message ?? 'Rejected by server',
          });
        }
        await offlineScanStore.removeFromQueue(merchantId, scan.ticketCode);
      } catch (err) {
        if (isNetworkFailure(err)) break;
        conflicts.push({
          ticketCode: scan.ticketCode,
          message: err instanceof Error ? err.message : 'Sync failed',
        });
        await offlineScanStore.removeFromQueue(merchantId, scan.ticketCode);
      }
    }

    return { synced, conflicts };
  }
}

/**
 * Preview outcomes, chosen so every modal state can be reached by scanning one
 * of the sample codes shown on the ledger - a valid pass, a used one, an expired
 * one, an unpaid one, and anything else as invalid.
 */
function previewScan(ticketCode: string): ScanResult {
  const match = previewTransactions.find((t) => t.ticketCode === ticketCode);

  if (!match) {
    return {
      success: false,
      status: 'INVALID',
      message: 'Invalid pass. This QR is not recognised at this location.',
    };
  }
  if (match.status === 'pending') {
    return {
      success: false,
      status: 'UNPAID',
      message: 'Payment not confirmed for this pass. Do not allow exit.',
      ticket: match,
    };
  }
  if (match.validation) {
    return {
      success: false,
      status: 'ALREADY_USED',
      message: `Already used at 4:12 PM by ${match.validation.scannedByName} (Main Exit).`,
      ticket: match,
      validation: match.validation,
    };
  }
  if (match.expiresAt && new Date(match.expiresAt).getTime() < Date.now()) {
    return {
      success: false,
      status: 'EXPIRED',
      message: 'Pass expired. Collect 30 overstay before exit.',
      ticket: match,
      overstayDue: 30,
      expiresAt: match.expiresAt,
    };
  }
  return {
    success: true,
    status: 'VERIFIED',
    message: 'Pass verified. Exit cleared.',
    ticket: match,
    scannedAt: new Date().toISOString(),
  };
}

export const scanService = new ScanService();
export type { SyncConflict };
export type { Transaction };
