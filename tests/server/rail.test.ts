import { basicAuthHeader, getDepartures, LDBWS_BASE, parseBoard } from '../../server/rail';

const creds = { username: 'ww-user', token: 'tok-123' };

const board = {
  generatedAt: '2026-10-29T06:04:00Z',
  locationName: 'Bathgate',
  platformAvailable: false,
  nrccMessages: [{ Value: 'Engineering work this weekend.' }],
  trainServices: [
    {
      serviceID: 'svc-1',
      std: '07:57',
      etd: 'Cancelled',
      platform: '2',
      isCancelled: true,
      cancelReason: 'This train has been cancelled.',
      destination: [{ locationName: 'Edinburgh Waverley' }],
      subsequentCallingPoints: [{ callingPoint: [{ locationName: 'Edinburgh Waverley' }] }],
    },
    {
      serviceID: 'svc-2',
      std: '08:12',
      etd: 'On time',
      platform: '1',
      isCancelled: false,
      delayReason: 'A signal failure.',
      destination: [{ locationName: 'Edinburgh Waverley' }],
      subsequentCallingPoints: [{ callingPoint: [{ locationName: 'Edinburgh Waverley' }] }],
    },
  ],
};

function fakeFetch(status: number, body: unknown = board) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('rail departures', () => {
  it('sends HTTP Basic authentication built from the username and token', () => {
    expect(basicAuthHeader(creds)).toBe(`Basic ${Buffer.from('ww-user:tok-123').toString('base64')}`);
  });

  it('asks for departures from a station, filtered to trains calling at the destination', async () => {
    const { impl, calls } = fakeFetch(200);
    await getDepartures({ crs: 'BTG', toCrs: 'EDB', numRows: 5 }, creds, impl);
    const url = new URL(calls[0].url);
    expect(url.href.startsWith(`${LDBWS_BASE}/GetDepBoardWithDetails/BTG`)).toBe(true);
    expect(url.searchParams.get('filterCrs')).toBe('EDB');
    expect(url.searchParams.get('filterType')).toBe('to');
    expect(url.searchParams.get('numRows')).toBe('5');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe(basicAuthHeader(creds));
  });

  it('rejects a station code that is not three uppercase letters, without calling the service', async () => {
    const { impl, calls } = fakeFetch(200);
    expect(await getDepartures({ crs: 'bgt' }, creds, impl)).toEqual({ ok: false, error: 'invalid_station' });
    expect(calls).toHaveLength(0);
  });

  it('reports a rejected token as unauthorised, not as a generic failure', async () => {
    const { impl } = fakeFetch(401, {});
    expect(await getDepartures({ crs: 'BTG' }, creds, impl)).toEqual({ ok: false, error: 'unauthorised' });
  });

  it('keeps the feed time as the as-of time', async () => {
    const { impl } = fakeFetch(200);
    const result = await getDepartures({ crs: 'BTG' }, creds, impl);
    if (!result.ok) throw new Error('expected a board');
    expect(result.board.asOf).toBe('2026-10-29T06:04:00Z');
    expect(result.board.messages).toEqual(['Engineering work this weekend.']);
  });

  it('hides platform numbers unless the feed says they may be shown', () => {
    const hidden = parseBoard({ ...board, platformAvailable: false });
    expect(hidden.departures.map((d) => d.platform)).toEqual([null, null]);
    const shown = parseBoard({ ...board, platformAvailable: true });
    expect(shown.departures.map((d) => d.platform)).toEqual(['2', '1']);
  });

  it('reports a cancellation and a delay reason from the feed', () => {
    const [cancelled, delayed] = parseBoard(board).departures;
    expect(cancelled).toMatchObject({ cancelled: true, cancelReason: 'This train has been cancelled.', scheduled: '07:57' });
    expect(delayed).toMatchObject({ cancelled: false, delayReason: 'A signal failure.', expected: 'On time' });
  });

  it('lists the calling points of each train', () => {
    expect(parseBoard(board).departures[1].callingAt).toEqual(['Edinburgh Waverley']);
  });
});
