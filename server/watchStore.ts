/**
 * What the server remembers so it can watch a journey while the person sleeps: a push token, and the journeys to watch.
 * Nothing else. Journeys end by themselves after they are over, and a person can delete everything.
 */
import type { Pool } from 'pg';

export type PushEnvironment = 'sandbox' | 'production';

export interface DeviceRecord {
  id: string;
  apnsToken: string;
  environment: PushEnvironment;
}

export interface WatchInput {
  id: string;
  deviceId: string;
  fromCrs: string;
  toCrs: string;
  trainId: string;
  departsAt: Date;
  arrivesAt: Date;
  deadlineAt: Date;
  leaveAfterWakeMinutes: number;
  bufferMinutes: number;
  earliestWakeAt: Date | null;
  wakeAt: Date;
  timezone: string;
}

export interface ActiveWatch extends WatchInput {
  lastNotifiedStatus: string | null;
  device: DeviceRecord;
}

export interface WatchStore {
  upsertDevice(token: string, environment: PushEnvironment): Promise<string>;
  upsertWatch(watch: WatchInput): Promise<void>;
  countActive(deviceId: string): Promise<number>;
  cancelWatch(id: string, deviceId: string): Promise<void>;
  deleteDevice(id: string): Promise<void>;
  deleteDeviceByToken(token: string): Promise<void>;
  activeWatches(): Promise<ActiveWatch[]>;
  /** Records what the last check found. `notified` is the status a push was sent for, null to clear it, undefined to keep it. */
  recordAssessment(id: string, status: string, notified: string | null | undefined, at: Date): Promise<void>;
  finishWatch(id: string): Promise<void>;
  /** Removes finished and cancelled watches older than the cutoff. */
  purge(before: Date): Promise<number>;
}

export class PgWatchStore implements WatchStore {
  constructor(private readonly pool: Pool) {}

  async upsertDevice(token: string, environment: PushEnvironment): Promise<string> {
    const res = await this.pool.query<{ id: string }>(
      `INSERT INTO device (id, apns_token, environment) VALUES (gen_random_uuid(), $1, $2)
       ON CONFLICT (apns_token) DO UPDATE SET environment = EXCLUDED.environment, last_seen_at = now()
       RETURNING id`,
      [token, environment],
    );
    return res.rows[0].id;
  }

  async upsertWatch(w: WatchInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO watch (id, device_id, from_crs, to_crs, train_id, departs_at, arrives_at, deadline_at, leave_after_wake_minutes, buffer_minutes, earliest_wake_at, wake_at, timezone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO UPDATE SET from_crs = EXCLUDED.from_crs, to_crs = EXCLUDED.to_crs, train_id = EXCLUDED.train_id, departs_at = EXCLUDED.departs_at,
         arrives_at = EXCLUDED.arrives_at, deadline_at = EXCLUDED.deadline_at, leave_after_wake_minutes = EXCLUDED.leave_after_wake_minutes,
         buffer_minutes = EXCLUDED.buffer_minutes, earliest_wake_at = EXCLUDED.earliest_wake_at, wake_at = EXCLUDED.wake_at, timezone = EXCLUDED.timezone,
         status = 'active', last_notified_status = NULL, updated_at = now()
       WHERE watch.device_id = EXCLUDED.device_id`,
      [w.id, w.deviceId, w.fromCrs, w.toCrs, w.trainId, w.departsAt, w.arrivesAt, w.deadlineAt, w.leaveAfterWakeMinutes, w.bufferMinutes, w.earliestWakeAt, w.wakeAt, w.timezone],
    );
  }

  async countActive(deviceId: string): Promise<number> {
    const res = await this.pool.query<{ n: string }>("SELECT count(*) AS n FROM watch WHERE device_id = $1 AND status = 'active'", [deviceId]);
    return Number(res.rows[0].n);
  }

  async cancelWatch(id: string, deviceId: string): Promise<void> {
    await this.pool.query("UPDATE watch SET status = 'cancelled', updated_at = now() WHERE id = $1 AND device_id = $2", [id, deviceId]);
  }

  async deleteDevice(id: string): Promise<void> {
    await this.pool.query('DELETE FROM device WHERE id = $1', [id]);
  }

  async deleteDeviceByToken(token: string): Promise<void> {
    await this.pool.query('DELETE FROM device WHERE apns_token = $1', [token]);
  }

  async activeWatches(): Promise<ActiveWatch[]> {
    const res = await this.pool.query(
      `SELECT w.*, d.apns_token, d.environment FROM watch w JOIN device d ON d.id = w.device_id WHERE w.status = 'active'`,
    );
    return res.rows.map((r) => ({
      id: r.id,
      deviceId: r.device_id,
      fromCrs: r.from_crs,
      toCrs: r.to_crs,
      trainId: r.train_id,
      departsAt: r.departs_at,
      arrivesAt: r.arrives_at,
      deadlineAt: r.deadline_at,
      leaveAfterWakeMinutes: r.leave_after_wake_minutes,
      bufferMinutes: r.buffer_minutes,
      earliestWakeAt: r.earliest_wake_at,
      wakeAt: r.wake_at,
      timezone: r.timezone,
      lastNotifiedStatus: r.last_notified_status,
      device: { id: r.device_id, apnsToken: r.apns_token, environment: r.environment },
    }));
  }

  async recordAssessment(id: string, status: string, notified: string | null | undefined, at: Date): Promise<void> {
    if (notified === undefined) await this.pool.query('UPDATE watch SET last_status = $2, last_assessed_at = $3 WHERE id = $1', [id, status, at]);
    else await this.pool.query('UPDATE watch SET last_status = $2, last_assessed_at = $3, last_notified_status = $4 WHERE id = $1', [id, status, at, notified]);
  }

  async finishWatch(id: string): Promise<void> {
    await this.pool.query("UPDATE watch SET status = 'done', updated_at = now() WHERE id = $1", [id]);
  }

  async purge(before: Date): Promise<number> {
    const res = await this.pool.query("DELETE FROM watch WHERE status <> 'active' AND updated_at < $1", [before]);
    return res.rowCount ?? 0;
  }
}
