import { gzipSync } from 'node:zlib';

import { decodeMessage, ForecastStore, parseForecasts, parseSchedules } from '../../server/darwinFeed';

// Synthetic message in the shape of the Push Port v16 forecast (TS) elements.
const message = `<?xml version="1.0" encoding="UTF-8"?><Pport xmlns="http://www.thalesgroup.com/rtti/PushPort/v16"><uR><TS rid="202610298962134" uid="Y62134" ssd="2026-10-29"><ns5:Location tpl="CRPHLY" wta="09:58" wtd="09:59" pta="09:58" ptd="09:59"><ns5:arr et="09:58" src="Darwin"/><ns5:dep et="09:59" src="Darwin"/><ns5:plat platsrc="P">3</ns5:plat></ns5:Location><ns5:Location tpl="BAGE" wtd="10:12" ptd="10:12"><ns5:dep et="Delayed" src="Darwin"/><ns5:plat platsup="true">4</ns5:plat></ns5:Location></TS></uR></Pport>`;

describe('decodeMessage', () => {
  it('reads a plain message and a gzip-compressed one the same way', () => {
    expect(decodeMessage(Buffer.from(message))).toBe(message);
    expect(decodeMessage(gzipSync(Buffer.from(message)))).toBe(message);
  });
});

describe('parseForecasts', () => {
  it('reads each train and its stops with estimated times', () => {
    const [train] = parseForecasts(message);
    expect(train).toMatchObject({ rid: '202610298962134', uid: 'Y62134', ssd: '2026-10-29' });
    expect(train.stops[0]).toMatchObject({ tiploc: 'CRPHLY', scheduledDep: '09:59', estDep: '09:59', platform: '3' });
    expect(train.stops[1]).toMatchObject({ tiploc: 'BAGE', scheduledDep: '10:12', estDep: 'Delayed' });
  });

  it('hides a platform the feed marks as suppressed', () => {
    const [train] = parseForecasts(message);
    expect(train.stops[1].platform).toBeNull();
    expect(train.stops[0].platform).toBe('3');
  });

  it('ignores elements that carry no train forecast', () => {
    expect(parseForecasts('<Pport><uR><schedule rid="1"/></uR></Pport>')).toEqual([]);
  });
});

describe('ForecastStore', () => {
  it('keeps only the latest message for each train', () => {
    const store = new ForecastStore();
    store.apply(parseForecasts(message));
    const updated = message.replace('<ns5:dep et="09:59"', '<ns5:dep et="10:04"');
    store.apply(parseForecasts(updated));
    expect(store.size).toBe(1);
    const [departure] = store.departuresFrom(new Set(['CRPHLY']));
    expect(departure.stop.estDep).toBe('10:04');
  });

  it('lists departures from the stations the caller maps to a CRS code, in time order', () => {
    const store = new ForecastStore();
    store.apply(parseForecasts(message));
    const board = store.departuresFrom(new Set(['CRPHLY', 'BAGE']));
    expect(board.map((d) => d.stop.tiploc)).toEqual(['CRPHLY', 'BAGE']);
    expect(store.departuresFrom(new Set(['XXXXX']))).toEqual([]);
  });
});

describe('schedules', () => {
  const schedule = `<Pport><uR><schedule rid="S1" uid="C1" ssd="2026-10-29"><OR wtd="07:57" ptd="07:57" tpl="BTHGATE"/><PP wtp="08:05" tpl="MIDLOTH"/><DT wta="08:34" pta="08:34" tpl="EDINBUR"/></schedule></uR></Pport>`;

  it('reads the whole calling pattern from a schedule', () => {
    const [train] = parseSchedules(schedule);
    expect(train.rid).toBe('S1');
    expect(train.stops.map((s) => s.tiploc)).toEqual(['BTHGATE', 'MIDLOTH', 'EDINBUR']);
    expect(train.stops[2]).toMatchObject({ scheduledArr: '08:34', scheduledDep: null });
  });

  it('trims seconds from feed times, so 13:15:30 reads as 13:15', () => {
    const [train] = parseSchedules(schedule.replace('wta="08:34" pta="08:34"', 'wta="08:34:30" pta="08:34:30"'));
    expect(train.stops[2].scheduledArr).toBe('08:34');
  });

  it('keeps the full route when a later forecast names only some stops', () => {
    const store = new ForecastStore();
    store.apply(parseSchedules(schedule));
    store.apply(parseForecasts('<Pport><uR><TS rid="S1" ssd="2026-10-29"><Location tpl="BTHGATE" wtd="07:57"><dep et="07:59"/></Location></TS></uR></Pport>'));
    expect(store.destinationStop('S1', new Set(['EDINBUR']), 'BTHGATE')?.scheduledArr).toBe('08:34');
    expect(store.departuresFrom(new Set(['BTHGATE']))[0].stop.estDep).toBe('07:59');
  });
});
