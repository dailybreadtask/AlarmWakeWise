/**
 * Keeps the active watches in memory, so the check that runs every few minutes never asks the database.
 * The database is asked only when a person registers, changes or cancels a watch, when a push changes what we told them,
 * and once in a while to catch up. Between those it is idle, so a serverless database can suspend and cost nothing.
 * One server process owns the cache; with more than one, give each its own slice of devices or share a cache.
 */
import type { ActiveWatch, PushEnvironment, WatchInput, WatchStore } from './watchStore';

/** How long the cache is trusted before it is read again, in case the database was changed some other way. */
export const REFRESH_AFTER_MS = 6 * 3600_000;

export class CachedWatchStore implements WatchStore {
  private watches = new Map<string, ActiveWatch>();
  private loadedAt = 0;

  constructor(
    private readonly inner: WatchStore,
    private readonly clock: () => number = Date.now,
  ) {}

  private async load(): Promise<void> {
    const rows = await this.inner.activeWatches();
    this.watches = new Map(rows.map((w) => [w.id, w]));
    this.loadedAt = this.clock();
  }

  async activeWatches(): Promise<ActiveWatch[]> {
    if (this.loadedAt === 0 || this.clock() - this.loadedAt >= REFRESH_AFTER_MS) await this.load();
    return [...this.watches.values()];
  }

  async activeWatch(id: string): Promise<ActiveWatch | null> {
    return (await this.activeWatches()).find((w) => w.id === id) ?? null;
  }

  upsertDevice(token: string, environment: PushEnvironment): Promise<string> {
    return this.inner.upsertDevice(token, environment);
  }

  async upsertWatch(watch: WatchInput): Promise<void> {
    await this.inner.upsertWatch(watch);
    // The database is awake now, and it knows this watch's device. Read just this watch back rather than rebuild the row here.
    const saved = await this.inner.activeWatch(watch.id);
    if (saved) this.watches.set(saved.id, saved);
    else this.watches.delete(watch.id);
  }

  countActive(deviceId: string): Promise<number> {
    return this.inner.countActive(deviceId);
  }

  async cancelWatch(id: string, deviceId: string): Promise<void> {
    await this.inner.cancelWatch(id, deviceId);
    if (this.watches.get(id)?.deviceId === deviceId) this.watches.delete(id);
  }

  async deleteDevice(id: string): Promise<void> {
    await this.inner.deleteDevice(id);
    for (const [watchId, w] of this.watches) if (w.deviceId === id) this.watches.delete(watchId);
  }

  async deleteDeviceByToken(token: string): Promise<void> {
    await this.inner.deleteDeviceByToken(token);
    for (const [watchId, w] of this.watches) if (w.device.apnsToken === token) this.watches.delete(watchId);
  }

  /** Only a change in what the person was told is written down. The routine "checked, nothing changed" stays in memory. */
  async recordAssessment(id: string, status: string, notified: string | null | undefined, at: Date): Promise<void> {
    const w = this.watches.get(id);
    if (notified === undefined || !w) return;
    if (w.lastNotifiedStatus === notified) return;
    w.lastNotifiedStatus = notified;
    // If the database cannot be reached, the cache still stops a repeat push. One more may go after a restart.
    await this.inner.recordAssessment(id, status, notified, at).catch(() => undefined);
  }

  async finishWatch(id: string): Promise<void> {
    this.watches.delete(id);
    await this.inner.finishWatch(id).catch(() => undefined);
  }

  purge(before: Date): Promise<number> {
    return this.inner.purge(before);
  }
}
