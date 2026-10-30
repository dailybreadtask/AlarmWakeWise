import { departureBoard, searchStations } from '../../server/railService';
import { ForecastStore, parseForecasts } from '../../server/darwinFeed';
import { parseCrsTable } from '../../server/stationLookup';

const table = parseCrsTable({ BTG: ['BTHGATE'], EDB: ['EDINBUR'] });

// Train 1 leaves Bathgate on time and reaches Edinburgh. Train 2 is cancelled and its platform is hidden.
const xml = `<Pport><uR>
<TS rid="R1" ssd="2026-10-29"><Location tpl="BTHGATE" wtd="07:57" ptd="07:57"><arr et="08:00"/><dep et="On time"/><plat>2</plat></Location><Location tpl="EDINBUR" wta="08:34" pta="08:34"><arr et="On time"/></Location></TS>
<TS rid="R2" ssd="2026-10-29"><Location tpl="BTHGATE" wtd="08:12" ptd="08:12"><dep et="Cancelled"/><plat platsup="true">1</plat></Location><Location tpl="EDINBUR" wta="08:49" pta="08:49"><arr et="Cancelled"/></Location></TS>
</uR></Pport>`;

function store(): ForecastStore {
  const s = new ForecastStore();
  s.apply(parseForecasts(xml));
  return s;
}

describe('departureBoard', () => {
  it('reports when the reference data has not been loaded', () => {
    expect(departureBoard(store(), null, 'BTG')).toEqual({ ok: false, error: 'no_feed' });
  });

  it('rejects a station the reference data does not know', () => {
    expect(departureBoard(store(), table, 'ZZZ')).toEqual({ ok: false, error: 'unknown_station' });
  });

  it('lists departures with status and hides a suppressed platform', () => {
    const result = departureBoard(store(), table, 'BTG');
    if (!result.ok) throw new Error('expected a board');
    expect(result.departures).toEqual([
      { trainId: 'R1', serviceDate: '2026-10-29', scheduled: '07:57', expected: 'On time', arrivesScheduled: null, arrivesExpected: null, status: 'On time', platform: '2' },
      { trainId: 'R2', serviceDate: '2026-10-29', scheduled: '08:12', expected: 'Cancelled', arrivesScheduled: null, arrivesExpected: null, status: 'Cancelled', platform: null },
    ]);
  });

  it('keeps only trains that go on to the destination', () => {
    const result = departureBoard(store(), table, 'BTG', 'EDB');
    if (!result.ok) throw new Error('expected a board');
    expect(result.departures.map((d) => d.trainId)).toEqual(['R1', 'R2']);
    expect(result.departures[0]).toMatchObject({ arrivesScheduled: '08:34', arrivesExpected: 'On time' });
    const none = departureBoard(store(), table, 'EDB', 'BTG');
    if (!none.ok) throw new Error('expected a board');
    expect(none.departures).toEqual([]);
  });
});

describe('parseCrsTable', () => {
  it('accepts a well-formed table and rejects a malformed one', () => {
    expect(parseCrsTable({ BTG: ['BTHGATE'] })).toEqual({ BTG: ['BTHGATE'] });
    expect(parseCrsTable({ btg: ['BTHGATE'] })).toBeNull();
    expect(parseCrsTable({ BTG: 'BTHGATE' })).toBeNull();
    expect(parseCrsTable([])).toBeNull();
  });
});

describe('searchStations', () => {
  const names = { BHG: 'Bathgate', EDB: 'Edinburgh', EDW: 'Edinburgh Waverley', BGN: 'Bargeddie', HYM: 'Hymers Street' };
  it('puts names that start with the text first', () => {
    expect(searchStations(names, 'edin').map((m) => m.crs)).toEqual(['EDB', 'EDW']);
    expect(searchStations(names, 'bath').map((m) => m.crs)).toEqual(['BHG']);
  });
  it('finds names that contain the text, and ignores very short queries', () => {
    expect(searchStations(names, 'street').map((m) => m.crs)).toEqual(['HYM']);
    expect(searchStations(names, 'b')).toEqual([]);
  });
});
