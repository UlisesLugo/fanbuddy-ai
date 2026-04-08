import {
  geocodeVenue,
  resolveTeamId,
  searchFixtures,
  toFanBuddyStatus,
  type Fixture,
} from '../football-data';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: 1,
    utcDate: '2026-05-10T20:00:00Z',
    status: 'TIMED',
    homeTeam: { id: 86, name: 'Real Madrid CF', shortName: 'Real Madrid', tla: 'RMA' },
    awayTeam: { id: 81, name: 'FC Barcelona', shortName: 'Barcelona', tla: 'FCB' },
    competition: { id: 2014, name: 'Primera Division', code: 'PD' },
    venue: 'Santiago Bernabéu',
    ...overrides,
  };
}

function mockOkResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function mockErrorResponse(status: number) {
  return {
    ok: false,
    status,
    statusText: String(status),
    json: () => Promise.resolve({}),
  } as unknown as Response;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.FOOTBALL_DATA_API_KEY = 'test-key';
  process.env.GEOAPIFY_API_KEY = 'geoapify-test-key';
  jest.resetAllMocks();
});

// ─── toFanBuddyStatus ─────────────────────────────────────────────────────────

describe('toFanBuddyStatus', () => {
  it('maps "TIMED" to "CONFIRMED"', () => {
    expect(toFanBuddyStatus('TIMED')).toBe('CONFIRMED');
  });

  it('maps "SCHEDULED" to "PROVISIONAL"', () => {
    expect(toFanBuddyStatus('SCHEDULED')).toBe('PROVISIONAL');
  });

  it('maps any other status to "PROVISIONAL"', () => {
    expect(toFanBuddyStatus('IN_PLAY')).toBe('PROVISIONAL');
    expect(toFanBuddyStatus('FINISHED')).toBe('PROVISIONAL');
    expect(toFanBuddyStatus('')).toBe('PROVISIONAL');
  });
});

// ─── resolveTeamId ────────────────────────────────────────────────────────────

describe('resolveTeamId', () => {
  it('returns the correct ID for well-known teams', () => {
    expect(resolveTeamId('Real Madrid')).toBe(86);
    expect(resolveTeamId('Barcelona')).toBe(81);
    expect(resolveTeamId('Manchester City')).toBe(65);
  });

  it('is case-insensitive', () => {
    expect(resolveTeamId('real madrid')).toBe(86);
    expect(resolveTeamId('BARCELONA')).toBe(81);
    expect(resolveTeamId('MAN CITY')).toBe(65);
  });

  it('returns null for unknown teams', () => {
    expect(resolveTeamId('Unknown FC')).toBeNull();
    expect(resolveTeamId('')).toBeNull();
  });
});

// ─── searchFixtures ───────────────────────────────────────────────────────────

describe('searchFixtures', () => {
  it('returns correctly shaped Fixture[] on success', async () => {
    const fixture = makeFixture();
    global.fetch = jest.fn().mockResolvedValue(mockOkResponse({ matches: [fixture] }));

    const results = await searchFixtures(86, '2026-05-01', '2026-06-01');

    expect(results).toHaveLength(1);
    const [result] = results;
    expect(result.id).toBe(1);
    expect(result.utcDate).toBe('2026-05-10T20:00:00Z');
    expect(result.status).toBe('TIMED');
    expect(result.homeTeam.name).toBe('Real Madrid CF');
    expect(result.awayTeam.name).toBe('FC Barcelona');
    expect(result.competition.name).toBe('Primera Division');
    expect(result.venue).toBe('Santiago Bernabéu');
  });

  it('sends the correct auth header and query params', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockOkResponse({ matches: [] }));

    await searchFixtures(86, '2026-05-01', '2026-06-01');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/v4/teams/86/matches');
    expect(calledUrl).toContain('dateFrom=2026-05-01');
    expect(calledUrl).toContain('dateTo=2026-06-01');
    expect(calledUrl).toContain('status=TIMED%2CSCHEDULED');
    expect((calledInit as { headers: Record<string, string> }).headers['X-Auth-Token']).toBe('test-key');
  });

  it('filters out POSTPONED fixtures', async () => {
    const timedFixture = makeFixture({ id: 1, status: 'TIMED' });
    const postponedFixture = makeFixture({ id: 2, status: 'POSTPONED' });
    const scheduledFixture = makeFixture({ id: 3, status: 'SCHEDULED' });

    global.fetch = jest
      .fn()
      .mockResolvedValue(mockOkResponse({ matches: [timedFixture, postponedFixture, scheduledFixture] }));

    const results = await searchFixtures(86, '2026-05-01', '2026-06-01');

    expect(results).toHaveLength(2);
    expect(results.map((f) => f.id)).toEqual([1, 3]);
    expect(results.find((f) => f.status === 'POSTPONED')).toBeUndefined();
  });

  it('returns an empty array when the API returns no matches', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockOkResponse({ matches: [] }));

    const results = await searchFixtures(86, '2026-05-01', '2026-06-01');

    expect(results).toHaveLength(0);
  });

  it('throws on non-429 API errors', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockErrorResponse(500));

    await expect(searchFixtures(86, '2026-05-01', '2026-06-01')).rejects.toThrow(
      'football-data.org API error: 500',
    );
  });

  it('retries on 429 and succeeds on the third attempt', async () => {
    const fixture = makeFixture();
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(mockErrorResponse(429))
      .mockResolvedValueOnce(mockErrorResponse(429))
      .mockResolvedValueOnce(mockOkResponse({ matches: [fixture] }));

    // Speed up the test by mocking setTimeout
    jest.useFakeTimers();
    const fetchPromise = searchFixtures(86, '2026-05-01', '2026-06-01');
    // Advance past the backoff delays (1s + 2s)
    jest.runAllTimers();
    jest.useRealTimers();

    const results = await fetchPromise;

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(results).toHaveLength(1);
  });

  it('throws after exhausting all retries on persistent 429', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockErrorResponse(429));

    jest.useFakeTimers();
    const fetchPromise = searchFixtures(86, '2026-05-01', '2026-06-01');
    jest.runAllTimers();
    jest.useRealTimers();

    await expect(fetchPromise).rejects.toThrow('Rate limited');
  });
});

// ─── geocodeVenue ─────────────────────────────────────────────────────────────

describe('geocodeVenue', () => {
  it('returns lat/lng and infers nearestAirportCode from city', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      mockOkResponse({
        features: [
          {
            geometry: { coordinates: [-3.688344, 40.453054] },
            properties: { city: 'Madrid', country: 'Spain' },
          },
        ],
      }),
    );

    const result = await geocodeVenue('Santiago Bernabéu');

    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(40.453054);
    expect(result!.lng).toBeCloseTo(-3.688344);
    expect(result!.nearestAirportCode).toBe('MAD');
  });

  it('returns null when GEOAPIFY_API_KEY is not set', async () => {
    delete process.env.GEOAPIFY_API_KEY;
    global.fetch = jest.fn();

    const result = await geocodeVenue('Some Stadium');

    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns null when the API returns no features', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockOkResponse({ features: [] }));

    const result = await geocodeVenue('Unknown Stadium');

    expect(result).toBeNull();
  });

  it('returns null and does not throw on network errors', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    jest.useFakeTimers();
    const geocodePromise = geocodeVenue('Camp Nou');
    jest.runAllTimers();
    jest.useRealTimers();

    const result = await geocodePromise;

    expect(result).toBeNull();
  });
});
