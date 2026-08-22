/**
 * On-device state for scanning without a usable connection.
 *
 * Venues are exactly the places where data is worst: basements, mela grounds,
 * gates ringed by parked cars. The scanner has to keep working there, but
 * "keep working" must not mean "let everything through".
 *
 * Two pieces of state make that possible:
 *
 *   pass cache  - the paid, not-yet-scanned passes for this merchant, refreshed
 *                 whenever the app is online. A code that is not in it while
 *                 offline is rejected rather than waved through.
 *   used set    - codes cleared on this device, PERSISTED. This is the fix for
 *                 the defect that mattered most: the previous offline validator
 *                 mutated an in-memory object and wrote to a list nothing ever
 *                 read back, so every scanned pass became reusable again after
 *                 a page refresh.
 *
 * The residual risk is narrow and worth stating: two gatekeepers, both offline,
 * scanning the same pass on different devices will both clear it. Neither can
 * see the other's used set. The server rejects the second one at sync time and
 * it surfaces as a conflict, so the owner learns about it - which is a far
 * smaller hole than the pass being reusable forever on one device.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_CACHE = '@noparchi/offline-pass-cache/v1';
const KEY_USED = '@noparchi/offline-used/v1';
const KEY_QUEUE = '@noparchi/offline-queue/v1';

export interface CachedPass {
  ticketCode: string;
  amount: number;
  typeLabel: string;
  vehicleNumber: string | null;
}

export interface QueuedScan {
  ticketCode: string;
  exitGate: string;
  notes: string | null;
  scannedAt: string;
}

export interface SyncConflict {
  ticketCode: string;
  message: string;
}

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

  async cacheAgeMinutes(): Promise<number | null> {
    const cache = await readJson<{ cachedAt?: string }>(KEY_CACHE, {});
    if (!cache.cachedAt) return null;
    return Math.floor((Date.now() - new Date(cache.cachedAt).getTime()) / 60000);
  }

  async isUsedLocally(ticketCode: string): Promise<QueuedScan | null> {
    const used = await readJson<Record<string, QueuedScan>>(KEY_USED, {});
    return used[ticketCode.toUpperCase()] ?? null;
  }

  /** Records the clearance and queues it for sync, in that order. */
  async markUsedLocally(scan: QueuedScan): Promise<void> {
    const code = scan.ticketCode.toUpperCase();
    const used = await readJson<Record<string, QueuedScan>>(KEY_USED, {});
    used[code] = scan;
    await writeJson(KEY_USED, used);

    const queue = await readJson<QueuedScan[]>(KEY_QUEUE, []);
    if (!queue.some((q) => q.ticketCode.toUpperCase() === code)) {
      queue.push(scan);
      await writeJson(KEY_QUEUE, queue);
    }
  }

  async pendingScans(): Promise<QueuedScan[]> {
    return readJson<QueuedScan[]>(KEY_QUEUE, []);
  }

  async removeFromQueue(ticketCode: string): Promise<void> {
    const code = ticketCode.toUpperCase();
    const queue = await readJson<QueuedScan[]>(KEY_QUEUE, []);
    await writeJson(
      KEY_QUEUE,
      queue.filter((q) => q.ticketCode.toUpperCase() !== code)
    );
  }

  /** Called on sign-out so a shared gate device does not leak between accounts. */
  async clearAll(): Promise<void> {
    await AsyncStorage.multiRemove([KEY_CACHE, KEY_USED, KEY_QUEUE]).catch(() => {});
  }
}

export const offlineScanStore = new OfflineScanStore();
