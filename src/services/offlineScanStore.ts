/**
 * On-device state for scanning without a usable connection.
 *
 * Venues are exactly the places where data is worst: basements, mela grounds,
 * gates ringed by parked cars. The scanner has to keep working there, but
 * "keep working" must not mean "let everything through".
 *
 * Three pieces of state make that possible, and every one of them is keyed on
 * the merchant it belongs to:
 *
 *   pass cache  - the paid, not-yet-scanned passes for this merchant, refreshed
 *                 whenever the app is online. A code that is not in it while
 *                 offline is rejected rather than waved through.
 *   used set    - codes cleared on this device, PERSISTED. This is the fix for
 *                 the defect that mattered most: the previous offline validator
 *                 mutated an in-memory object and wrote to a list nothing ever
 *                 read back, so every scanned pass became reusable again after
 *                 a page refresh.
 *   queue       - the same clearances, waiting to be replayed against the
 *                 server. This is the only record that a person went through
 *                 the gate, so it outlives a sign-out.
 *
 * Scoping all three by merchant is what lets the queue survive. A gate device
 * is shared, and the previous code wiped every key on sign-out to stop one
 * account's passes leaking into the next session - which also threw away scans
 * that had never reached the server. Now nothing leaks because nothing is read
 * outside its own tenant, so nothing has to be destroyed.
 *
 * The residual risk is narrow and worth stating: two gatekeepers, both offline,
 * scanning the same pass on different devices will both clear it. Neither can
 * see the other's used set. The server rejects the second one at sync time and
 * it surfaces as a conflict, so the owner learns about it - which is a far
 * smaller hole than the pass being reusable forever on one device.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_CACHE = '@noparchi/offline-pass-cache/v1';
const KEY_USED = '@noparchi/offline-used/v2';
const KEY_QUEUE = '@noparchi/offline-queue/v2';

/** v1 held one flat, tenant-less map and list. Read once, then retired. */
const KEY_USED_V1 = '@noparchi/offline-used/v1';
const KEY_QUEUE_V1 = '@noparchi/offline-queue/v1';

/** A used entry older than this is dropped: the pass it names is long gone. */
const USED_RETENTION_DAYS = 7;

export interface CachedPass {
  ticketCode: string;
  amount: number;
  typeLabel: string;
  vehicleNumber: string | null;
  /** null for pass types that never expire. */
  expiresAt: string | null;
}

export interface QueuedScan {
  ticketCode: string;
  exitGate: string;
  notes: string | null;
  scannedAt: string;
}

/** A queued scan knows which business it belongs to; a bare one never did. */
export interface OwnedScan extends QueuedScan {
  merchantId: string;
}

export interface SyncConflict {
  ticketCode: string;
  message: string;
}

/** merchantId -> ticketCode -> the clearance. */
type UsedIndex = Record<string, Record<string, QueuedScan>>;

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    // Corrupt or unreadable storage must not brick the scanner.
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    // A failed write here means a scan could be replayed after a restart, so it
    // is worth surfacing in logs even though we cannot recover.
    console.warn('[noparchi] offline store write failed', key, err);
  }
}

class OfflineScanStore {
  /** Replace the cached pass list. Called after every successful online fetch. */
  async cachePasses(merchantId: string, passes: CachedPass[]): Promise<void> {
    await writeJson(KEY_CACHE, { merchantId, passes, cachedAt: new Date().toISOString() });
  }

  async getCachedPass(merchantId: string, ticketCode: string): Promise<CachedPass | null> {
    const cache = await readJson<{ merchantId?: string; passes?: CachedPass[] }>(KEY_CACHE, {});
    // Guard the tenant explicitly: a device that signed into a different
    // business must never validate against the previous one's cache.
    if (cache.merchantId !== merchantId) return null;
    const code = ticketCode.toUpperCase();
    return (cache.passes ?? []).find((p) => p.ticketCode.toUpperCase() === code) ?? null;
  }

  /** How stale the cache is, or null if it holds nothing for this merchant. */
  async cacheAgeMinutes(merchantId: string): Promise<number | null> {
    const cache = await readJson<{ merchantId?: string; cachedAt?: string }>(KEY_CACHE, {});
    if (cache.merchantId !== merchantId || !cache.cachedAt) return null;
    return Math.floor((Date.now() - new Date(cache.cachedAt).getTime()) / 60000);
  }

  async isUsedLocally(merchantId: string, ticketCode: string): Promise<QueuedScan | null> {
    const used = await readJson<UsedIndex>(KEY_USED, {});
    return used[merchantId]?.[ticketCode.toUpperCase()] ?? null;
  }

  /** Records the clearance and queues it for sync, in that order. */
  async markUsedLocally(scan: OwnedScan): Promise<void> {
    const code = scan.ticketCode.toUpperCase();

    const used = await readJson<UsedIndex>(KEY_USED, {});
    const forMerchant = used[scan.merchantId] ?? {};
    forMerchant[code] = {
      ticketCode: scan.ticketCode,
      exitGate: scan.exitGate,
      notes: scan.notes,
      scannedAt: scan.scannedAt,
    };
    used[scan.merchantId] = forMerchant;
    await writeJson(KEY_USED, prune(used));

    const queue = await this.readQueue(scan.merchantId);
    const already = queue.some(
      (q) => q.merchantId === scan.merchantId && q.ticketCode.toUpperCase() === code
    );
    if (!already) {
      queue.push(scan);
      await writeJson(KEY_QUEUE, queue);
    }
  }

  /** Only this merchant's scans: another tenant's would be rejected as unknown. */
  async pendingScans(merchantId: string): Promise<OwnedScan[]> {
    const queue = await this.readQueue(merchantId);
    return queue.filter((q) => q.merchantId === merchantId);
  }

  async removeFromQueue(merchantId: string, ticketCode: string): Promise<void> {
    const code = ticketCode.toUpperCase();
    const queue = await this.readQueue(merchantId);
    await writeJson(
      KEY_QUEUE,
      queue.filter(
        (q) => !(q.merchantId === merchantId && q.ticketCode.toUpperCase() === code)
      )
    );
  }

  /**
   * Drop the cached pass list on sign-out.
   *
   * The used set and the queue deliberately stay. Both are keyed by merchant so
   * neither is readable by the next account to sign in, and the queue is the
   * only evidence that somebody was let out of the venue - deleting it to tidy
   * up loses revenue the server has never heard about.
   */
  async clearCachedPasses(): Promise<void> {
    await AsyncStorage.removeItem(KEY_CACHE).catch(() => {});
  }

  /**
   * The queue, adopting anything left behind by the tenant-less v1 layout.
   *
   * A device that was offline across the upgrade would otherwise have its
   * unsynced scans stranded under a key nothing reads. They can only have
   * belonged to whoever is signed in, so they are attributed to them and v1 is
   * retired.
   */
  private async readQueue(merchantId: string): Promise<OwnedScan[]> {
    const queue = await readJson<OwnedScan[]>(KEY_QUEUE, []);
    const legacy = await readJson<QueuedScan[]>(KEY_QUEUE_V1, []);
    if (legacy.length === 0) return queue;

    const adopted = [...queue, ...legacy.map((scan) => ({ ...scan, merchantId }))];
    await writeJson(KEY_QUEUE, adopted);
    // The v1 used-set goes with it: v2 rebuilds itself as scans are replayed,
    // and a tenant-less map of codes is not something to keep on the device.
    await AsyncStorage.multiRemove([KEY_QUEUE_V1, KEY_USED_V1]).catch(() => {});
    return adopted;
  }
}

/** Forget clearances old enough that the pass cannot still be in the venue. */
function prune(used: UsedIndex): UsedIndex {
  const cutoff = Date.now() - USED_RETENTION_DAYS * 86_400_000;
  const kept: UsedIndex = {};

  for (const [merchantId, scans] of Object.entries(used)) {
    const recent = Object.entries(scans).filter(
      ([, scan]) => new Date(scan.scannedAt).getTime() >= cutoff
    );
    if (recent.length > 0) kept[merchantId] = Object.fromEntries(recent);
  }
  return kept;
}

export const offlineScanStore = new OfflineScanStore();
