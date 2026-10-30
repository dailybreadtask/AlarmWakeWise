/**
 * Reads National Rail Darwin Push Port messages (v16) and keeps the latest
 * train forecasts. Server only. Station codes in the feed are TIPLOCs; the
 * caller supplies the CRS-to-TIPLOC lookup from the reference data.
 */
import { gunzipSync } from 'node:zlib';

export interface StopForecast {
  tiploc: string;
  /** Scheduled times as "HH:mm" in the feed. */
  scheduledArr: string | null;
  scheduledDep: string | null;
  /** Estimated times, or the feed's word such as "On time", "Delayed" or "Cancelled". */
  estArr: string | null;
  estDep: string | null;
  /** Null when the platform is not allowed to be shown (platsup). */
  platform: string | null;
}

export interface TrainForecast {
  rid: string;
  uid: string | null;
  ssd: string | null;
  stops: StopForecast[];
}

/** Feed times can carry seconds ("13:15:30"). The app works in minutes. */
const hhmm = (t: string | undefined): string | null => (t && /^\d\d:\d\d(:\d\d)?$/.test(t) ? t.slice(0, 5) : (t ?? null));

const attrs = (raw: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(/(\w+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
};

/** Decompresses a message body if it is gzip. Darwin sends gzip-compressed messages. */
export function decodeMessage(body: Buffer): string {
  const bytes = body[0] === 0x1f && body[1] === 0x8b ? gunzipSync(body) : body;
  return bytes.toString('utf8');
}

/** Parses the schedule elements: each train's full calling pattern, with scheduled times and no estimates. */
export function parseSchedules(xml: string): TrainForecast[] {
  const trains: TrainForecast[] = [];
  for (const sch of xml.matchAll(/<(?:\w+:)?schedule\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?schedule>/g)) {
    const head = attrs(sch[1]);
    if (!head.rid) continue;
    const stops: StopForecast[] = [];
    for (const point of sch[2].matchAll(/<(?:\w+:)?(OR|OPOR|IP|OPIP|PP|DT|OPDT)\b([^>]*?)\/?>/g)) {
      const at = attrs(point[2]);
      const isDest = point[1] === 'DT' || point[1] === 'OPDT';
      const isOrigin = point[1] === 'OR' || point[1] === 'OPOR';
      stops.push({
        tiploc: at.tpl ?? '',
        scheduledArr: isOrigin ? null : hhmm(at.wta ?? at.pta ?? at.wtp),
        scheduledDep: isDest ? null : hhmm(at.wtd ?? at.ptd ?? at.wtp),
        estArr: null,
        estDep: null,
        platform: null,
      });
    }
    trains.push({ rid: head.rid, uid: head.uid ?? null, ssd: head.ssd ?? null, stops: stops.filter((x) => x.tiploc) });
  }
  return trains;
}

/** Parses the train forecasts (TS elements) in one Push Port message. Other elements are ignored. */
export function parseForecasts(xml: string): TrainForecast[] {
  const trains: TrainForecast[] = [];
  for (const ts of xml.matchAll(/<(?:\w+:)?TS\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?TS>/g)) {
    const head = attrs(ts[1]);
    if (!head.rid) continue;
    const stops: StopForecast[] = [];
    for (const loc of ts[2].matchAll(/<(?:\w+:)?Location\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?Location>/g)) {
      const at = attrs(loc[1]);
      const body = loc[2];
      const arr = body.match(/<(?:\w+:)?arr\b([^>]*?)\/?>/);
      const dep = body.match(/<(?:\w+:)?dep\b([^>]*?)\/?>/);
      const plat = body.match(/<(?:\w+:)?plat\b([^>]*)>([^<]*)<\/(?:\w+:)?plat>/);
      const platAttrs = plat ? attrs(plat[1]) : {};
      stops.push({
        tiploc: at.tpl ?? '',
        scheduledArr: hhmm(at.wta ?? at.pta),
        scheduledDep: hhmm(at.wtd ?? at.ptd),
        estArr: arr ? hhmm(attrs(arr[1]).et ?? undefined) : null,
        estDep: dep ? hhmm(attrs(dep[1]).et ?? undefined) : null,
        platform: plat && platAttrs.platsup !== 'true' ? plat[2].trim() || null : null,
      });
    }
    trains.push({ rid: head.rid, uid: head.uid ?? null, ssd: head.ssd ?? null, stops });
  }
  return trains;
}

/** The latest forecast for each train. A newer message for the same train replaces the older one. */
export class ForecastStore {
  private readonly trains = new Map<string, TrainForecast>();

  /**
   * Merges a message into the store. A schedule supplies the whole route; a
   * forecast updates the stops it names. Estimates are kept when a schedule
   * arrives later, and stops are matched by their station code.
   */
  apply(trains: TrainForecast[]): void {
    for (const incoming of trains) {
      const held = this.trains.get(incoming.rid);
      if (!held) {
        this.trains.set(incoming.rid, incoming);
        continue;
      }
      const merged = held.stops.map((s) => ({ ...s }));
      for (const stop of incoming.stops) {
        const match = merged.find((m) => m.tiploc === stop.tiploc);
        if (!match) {
          merged.push({ ...stop });
          continue;
        }
        match.scheduledArr = stop.scheduledArr ?? match.scheduledArr;
        match.scheduledDep = stop.scheduledDep ?? match.scheduledDep;
        match.estArr = stop.estArr ?? match.estArr;
        match.estDep = stop.estDep ?? match.estDep;
        match.platform = stop.platform ?? match.platform;
      }
      this.trains.set(incoming.rid, { ...held, ssd: incoming.ssd ?? held.ssd, uid: incoming.uid ?? held.uid, stops: merged });
    }
  }

  get size(): number {
    return this.trains.size;
  }

  /** The first stop at one of `tiplocs` after `afterTiploc`, or null if the train does not go there. */
  destinationStop(rid: string, tiplocs: ReadonlySet<string>, afterTiploc: string): StopForecast | null {
    const train = this.trains.get(rid);
    if (!train) return null;
    const index = train.stops.findIndex((s) => s.tiploc === afterTiploc);
    return train.stops.slice(index + 1).find((s) => tiplocs.has(s.tiploc)) ?? null;
  }

  /** The service date (ssd) of a held train, or null. */
  serviceDate(rid: string): string | null {
    return this.trains.get(rid)?.ssd ?? null;
  }

  /** Departures from one station, using the CRS-to-TIPLOC lookup supplied by the caller. */
  departuresFrom(tiplocs: ReadonlySet<string>): { rid: string; stop: StopForecast }[] {
    const out: { rid: string; stop: StopForecast }[] = [];
    for (const t of this.trains.values()) {
      for (const stop of t.stops) if (tiplocs.has(stop.tiploc) && stop.scheduledDep) out.push({ rid: t.rid, stop });
    }
    return out.sort((a, b) => (a.stop.scheduledDep ?? '').localeCompare(b.stop.scheduledDep ?? ''));
  }
}
