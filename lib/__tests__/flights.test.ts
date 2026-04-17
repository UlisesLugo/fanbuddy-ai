import { searchRoundTrip } from '../flights';

// ─── Mock: global fetch ────────────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

// ─── Helpers ──────────────────────────────────────────────────────────────────

type RawSegment = {
  departing_at: string;
  arriving_at: string;
  origin: { iata_code: string };
  destination: { iata_code: string };
  marketing_carrier: { iata_code: string };
  marketing_carrier_flight_designator: string;
};

type RawSlice = { duration: string; segments: RawSegment[] };

type RawOffer = {
  id: string;
  total_amount: string;
  total_currency: string;
  owner: { iata_code: string };
  slices: RawSlice[];
};

function makeSegment(overrides: {
  departing_at?: string;
  arriving_at?: string;
  originIata?: string;
  destinationIata?: string;
  carrierIata?: string;
  flightDesignator?: string;
} = {}): RawSegment {
  return {
    departing_at: overrides.departing_at ?? '2026-05-09T07:00:00Z',
    arriving_at: overrides.arriving_at ?? '2026-05-09T09:30:00Z',
    origin: { iata_code: overrides.originIata ?? 'LHR' },
    destination: { iata_code: overrides.destinationIata ?? 'MAD' },
    marketing_carrier: { iata_code: overrides.carrierIata ?? 'IB' },
    marketing_carrier_flight_designator: overrides.flightDesignator ?? 'IB3166',
  };
}

function makeRawOffer(overrides: {
  id?: string;
  total_amount?: string;
  outDepartingAt?: string;
  outArrivingAt?: string;
  inDepartingAt?: string;
  inArrivingAt?: string;
} = {}): RawOffer {
  return {
    id: overrides.id ?? 'off_001',
    total_amount: overrides.total_amount ?? '200.00',
    total_currency: 'EUR',
    owner: { iata_code: 'IB' },
    slices: [
      {
        duration: 'PT2H30M',
        segments: [
          makeSegment({
            departing_at: overrides.outDepartingAt ?? '2026-05-09T07:00:00Z',
            arriving_at: overrides.outArrivingAt ?? '2026-05-09T09:30:00Z',
            originIata: 'LHR',
            destinationIata: 'MAD',
          }),
        ],
      },
      {
        duration: 'PT2H30M',
        segments: [
          makeSegment({
            departing_at: overrides.inDepartingAt ?? '2026-05-12T14:00:00Z',
            arriving_at: overrides.inArrivingAt ?? '2026-05-12T16:30:00Z',
            originIata: 'MAD',
            destinationIata: 'LHR',
          }),
        ],
      },
    ],
  };
}

function mockDuffelFlights(offers: RawOffer[]) {
  mockFetch
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { id: 'orq_001' } }),
    } as unknown as Response)
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: offers }),
    } as unknown as Response);
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockFetch.mockReset();
  process.env.DUFFEL_ACCESS_TOKEN = 'duffel_test_token';
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('searchRoundTrip', () => {
  it('returns FlightOption[] in price order (cheapest first, as Duffel sorts)', async () => {
    mockDuffelFlights([
      makeRawOffer({ id: 'off_cheap', total_amount: '150.00' }),
      makeRawOffer({ id: 'off_expensive', total_amount: '300.00' }),
    ]);

    const results = await searchRoundTrip({
      originIata: 'LHR',
      destinationIata: 'MAD',
      departureDateUtc: '2026-05-09',
      returnDateUtc: '2026-05-12',
      adults: 1,
    });

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('off_cheap');
    expect(results[0].totalPriceUSD).toBe(150);
    expect(results[1].id).toBe('off_expensive');
  });

  it('converts departure/arrival times to UTC ISO strings', async () => {
    mockDuffelFlights([
      makeRawOffer({
        outDepartingAt: '2026-05-09T09:00:00+02:00',
        outArrivingAt: '2026-05-09T11:30:00+02:00',
      }),
    ]);

    const [result] = await searchRoundTrip({
      originIata: 'CDG',
      destinationIata: 'MAD',
      departureDateUtc: '2026-05-09',
      returnDateUtc: '2026-05-12',
      adults: 1,
    });

    expect(result.outbound.departureUtc).toBe('2026-05-09T07:00:00.000Z');
    expect(result.outbound.arrivalUtc).toBe('2026-05-09T09:30:00.000Z');
  });

  it('returns empty array when offers list is empty', async () => {
    mockDuffelFlights([]);

    const results = await searchRoundTrip({
      originIata: 'LHR',
      destinationIata: 'MAD',
      departureDateUtc: '2026-05-09',
      returnDateUtc: '2026-05-12',
      adults: 1,
    });

    expect(results).toEqual([]);
  });

  it('passes correct params to Duffel offer request', async () => {
    mockDuffelFlights([]);

    await searchRoundTrip({
      originIata: 'LHR',
      destinationIata: 'MAD',
      departureDateUtc: '2026-05-09',
      returnDateUtc: '2026-05-12',
      adults: 2,
      maxResults: 5,
    });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.duffel.com/air/offer_requests');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.data.slices).toEqual([
      { origin: 'LHR', destination: 'MAD', departure_date: '2026-05-09' },
      { origin: 'MAD', destination: 'LHR', departure_date: '2026-05-12' },
    ]);
    expect(body.data.passengers).toEqual([{ type: 'adult' }, { type: 'adult' }]);
  });

  it('maps seatsRemaining to null (Duffel v2 does not expose seat count)', async () => {
    mockDuffelFlights([makeRawOffer()]);

    const [result] = await searchRoundTrip({
      originIata: 'LHR',
      destinationIata: 'MAD',
      departureDateUtc: '2026-05-09',
      returnDateUtc: '2026-05-12',
      adults: 1,
    });

    expect(result.seatsRemaining).toBeNull();
  });

  it('maps outbound leg fields correctly', async () => {
    mockDuffelFlights([makeRawOffer()]);

    const [result] = await searchRoundTrip({
      originIata: 'LHR',
      destinationIata: 'MAD',
      departureDateUtc: '2026-05-09',
      returnDateUtc: '2026-05-12',
      adults: 1,
    });

    expect(result.outbound).toEqual({
      origin: 'LHR',
      destination: 'MAD',
      departureUtc: '2026-05-09T07:00:00.000Z',
      arrivalUtc: '2026-05-09T09:30:00.000Z',
      durationMinutes: 150,
      stops: 0,
      carrierCode: 'IB',
      flightNumber: 'IB3166',
    });
  });
});

// ─── shouldRetryOrFinish cursor logic ─────────────────────────────────────────
// Mirrors production logic from graph.ts — tests state-machine transitions.

function shouldRetryOrFinish(state: {
  flight_results: unknown[] | null;
  flight_results_cursor: number;
  validation_errors: string[];
  attempt_count: number;
}): string {
  if (
    state.flight_results !== null &&
    state.flight_results_cursor >= state.flight_results.length
  ) {
    return 'formatter_node';
  }
  const hardErrors = state.validation_errors.filter(
    (e) => !e.includes('PROVISIONAL'),
  );
  if (hardErrors.length > 0 && state.attempt_count < 3) return 'plan_travel_node';
  return 'formatter_node';
}

describe('shouldRetryOrFinish cursor logic', () => {
  it('routes to formatter_node when flight_results is null and no hard errors', () => {
    expect(
      shouldRetryOrFinish({
        flight_results: null,
        flight_results_cursor: 0,
        validation_errors: [],
        attempt_count: 0,
      }),
    ).toBe('formatter_node');
  });

  it('retries when ARRIVAL_GAP error and cursor has remaining results', () => {
    expect(
      shouldRetryOrFinish({
        flight_results: [{}, {}],
        flight_results_cursor: 0,
        validation_errors: [
          'Flight arrives too late — buffer is 3.5h, minimum 6h required before kickoff',
        ],
        attempt_count: 1,
      }),
    ).toBe('plan_travel_node');
  });

  it('retries when DEPARTURE_GAP error and cursor has remaining results', () => {
    expect(
      shouldRetryOrFinish({
        flight_results: [{}, {}],
        flight_results_cursor: 0,
        validation_errors: [
          'Flight departs too early — buffer is 2.0h, minimum 4h required after match end',
        ],
        attempt_count: 1,
      }),
    ).toBe('plan_travel_node');
  });

  it('routes to formatter_node when cursor is exhausted', () => {
    expect(
      shouldRetryOrFinish({
        flight_results: [{}],
        flight_results_cursor: 1,
        validation_errors: [
          'Flight arrives too late — buffer is 3.5h, minimum 6h required before kickoff',
        ],
        attempt_count: 1,
      }),
    ).toBe('formatter_node');
  });
});
