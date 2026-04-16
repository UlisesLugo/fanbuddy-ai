# Duffel API Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Amadeus SDK flight and hotel integrations with the Duffel REST API v2, adopting provider-agnostic file names (`lib/flights.ts`, `lib/hotels.ts`).

**Architecture:** Create two new modules (`lib/flights.ts`, `lib/hotels.ts`) that call the Duffel REST API using native `fetch`, expose the same `FlightOption`/`HotelOption` interfaces consumed by `plan_travel_node`, then delete all Amadeus files. The hotel search switches from IATA city code to lat/lng coordinates already present in match state.

**Tech Stack:** TypeScript, native `fetch` (Node 18+ / Next.js 14), Jest with `global.fetch` mocking, Duffel API v2.

**Spec:** `docs/superpowers/specs/2026-04-16-duffel-integration-design.md`

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `lib/flights.ts` | Duffel flight search — exports `FlightOption`, `FlightLeg`, `FlightSearchParams`, `searchRoundTrip` |
| Create | `lib/hotels.ts` | Duffel Stays search — exports `HotelOption`, `HotelSearchParams`, `searchHotels` |
| Create | `lib/__tests__/flights.test.ts` | Mocks `global.fetch`; full behavioral test suite for `searchRoundTrip` |
| Create | `lib/__tests__/hotels.test.ts` | Mocks `global.fetch`; full behavioral test suite for `searchHotels` |
| Modify | `lib/langchain/types.ts` | Add `lat?: number`, `lng?: number` to `RawMatchFixture` |
| Modify | `lib/langchain/graph.ts` | Update imports; fix hotel callsite to pass `lat`/`lng` |
| Modify | `.env.example` | Replace `AMADEUS_*` vars with `DUFFEL_ACCESS_TOKEN` |
| Modify | `package.json` | Remove `amadeus` dependency |
| Delete | `lib/amadeus-flights.ts` | Replaced |
| Delete | `lib/amadeus-hotels.ts` | Replaced |
| Delete | `lib/amadeus.d.ts` | Replaced |
| Delete | `lib/__tests__/amadeus-flights.test.ts` | Replaced |
| Delete | `lib/__tests__/amadeus-hotels.test.ts` | Replaced |

---

## Task 1: Flight module — write failing tests

**Files:**
- Create: `lib/__tests__/flights.test.ts`

- [ ] **Step 1: Create `lib/__tests__/flights.test.ts`**

```typescript
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest lib/__tests__/flights.test.ts --no-coverage
```

Expected: `Cannot find module '../flights'`

---

## Task 2: Flight module — implement `lib/flights.ts`

**Files:**
- Create: `lib/flights.ts`

- [ ] **Step 1: Create `lib/flights.ts`**

```typescript
// ─── Internal Duffel types ─────────────────────────────────────────────────────

type DuffelSegment = {
  departing_at: string;
  arriving_at: string;
  origin: { iata_code: string };
  destination: { iata_code: string };
  marketing_carrier: { iata_code: string };
  marketing_carrier_flight_designator: string;
};

type DuffelSlice = {
  duration: string; // ISO 8601 e.g. "PT2H30M"
  segments: DuffelSegment[];
};

type DuffelOffer = {
  id: string;
  total_amount: string;
  total_currency: string;
  owner: { iata_code: string };
  slices: DuffelSlice[];
};

// ─── Exported types ────────────────────────────────────────────────────────────

export interface FlightLeg {
  origin: string;
  destination: string;
  departureUtc: string; // ISO 8601 UTC — validator_node reads this
  arrivalUtc: string;   // ISO 8601 UTC — validator_node reads this
  durationMinutes: number;
  stops: number;
  carrierCode: string;
  flightNumber: string;
}

export interface FlightOption {
  id: string;
  outbound: FlightLeg;
  inbound: FlightLeg;
  totalPriceUSD: number; // Duffel returns currency per route; field name kept for interface compat
  currency: string;
  validatingCarrier: string;
  seatsRemaining: null; // Duffel v2 does not expose seat count at offer level
}

export interface FlightSearchParams {
  originIata: string;
  destinationIata: string;
  departureDateUtc: string; // YYYY-MM-DD
  returnDateUtc: string;    // YYYY-MM-DD
  adults: number;
  maxResults?: number;      // default 10
}

// ─── Auth ──────────────────────────────────────────────────────────────────────

function getDuffelHeaders(): Record<string, string> {
  const token = process.env.DUFFEL_ACCESS_TOKEN;
  if (!token) throw new Error('DUFFEL_ACCESS_TOKEN must be set');
  return {
    Authorization: `Bearer ${token}`,
    'Duffel-Version': 'v2',
    'Content-Type': 'application/json',
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function parseDurationMinutes(isoDuration: string): number {
  const h = parseInt(isoDuration.match(/(\d+)H/)?.[1] ?? '0', 10);
  const m = parseInt(isoDuration.match(/(\d+)M/)?.[1] ?? '0', 10);
  return h * 60 + m;
}

function buildLeg(slice: DuffelSlice): FlightLeg {
  const first = slice.segments[0];
  const last = slice.segments[slice.segments.length - 1];
  return {
    origin: first.origin.iata_code,
    destination: last.destination.iata_code,
    departureUtc: new Date(first.departing_at).toISOString(),
    arrivalUtc: new Date(last.arriving_at).toISOString(),
    durationMinutes: parseDurationMinutes(slice.duration),
    stops: slice.segments.length - 1,
    carrierCode: first.marketing_carrier.iata_code,
    flightNumber: first.marketing_carrier_flight_designator,
  };
}

// ─── searchRoundTrip ───────────────────────────────────────────────────────────

export async function searchRoundTrip(
  params: FlightSearchParams,
): Promise<FlightOption[]> {
  const headers = getDuffelHeaders();
  const limit = params.maxResults ?? 10;

  // Step 1 — Create offer request
  const offerRequestRes = await fetch('https://api.duffel.com/air/offer_requests', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      data: {
        slices: [
          {
            origin: params.originIata,
            destination: params.destinationIata,
            departure_date: params.departureDateUtc,
          },
          {
            origin: params.destinationIata,
            destination: params.originIata,
            departure_date: params.returnDateUtc,
          },
        ],
        passengers: Array.from({ length: params.adults }, () => ({ type: 'adult' })),
        cabin_class: 'economy',
        return_offers: false,
      },
    }),
  });

  if (!offerRequestRes.ok) {
    throw new Error('NO_FLIGHTS_AVAILABLE');
  }

  const offerRequestData = await offerRequestRes.json();
  const offerRequestId: string = offerRequestData.data.id;

  // Step 2 — Fetch offers (sorted cheapest first by Duffel)
  const offersRes = await fetch(
    `https://api.duffel.com/air/offers?offer_request_id=${offerRequestId}&sort=total_amount&limit=${limit}`,
    { method: 'GET', headers },
  );

  if (!offersRes.ok) {
    throw new Error('NO_FLIGHTS_AVAILABLE');
  }

  const offersData = await offersRes.json();
  const offers: DuffelOffer[] = offersData.data ?? [];

  return offers
    .filter((o) => o.slices.length === 2)
    .map((o) => ({
      id: o.id,
      outbound: buildLeg(o.slices[0]),
      inbound: buildLeg(o.slices[1]),
      totalPriceUSD: parseFloat(o.total_amount),
      currency: o.total_currency,
      validatingCarrier: o.owner.iata_code,
      seatsRemaining: null,
    }));
}
```

- [ ] **Step 2: Run tests to confirm they pass**

```bash
npx jest lib/__tests__/flights.test.ts --no-coverage
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add lib/flights.ts lib/__tests__/flights.test.ts
git commit -m "feat: add lib/flights.ts backed by Duffel API v2"
```

---

## Task 3: Hotel module — write failing tests

**Files:**
- Create: `lib/__tests__/hotels.test.ts`

- [ ] **Step 1: Create `lib/__tests__/hotels.test.ts`**

```typescript
import { searchHotels } from '../hotels';

// ─── Mock: global fetch ────────────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

// ─── Helpers ──────────────────────────────────────────────────────────────────

type RawResult = {
  accommodation: {
    id: string;
    name: string;
    rating: number | null;
    amenities: Array<{ type: string }>;
    location: {
      geographic_coordinates: { latitude: number; longitude: number };
    };
  };
  cheapest_rate: {
    total_amount: string;
    total_currency: string;
    cancellation_policy: { refundable: boolean };
  };
};

function makeRawResult(overrides: {
  id?: string;
  name?: string;
  rating?: number | null;
  total_amount?: string;
  refundable?: boolean;
} = {}): RawResult {
  return {
    accommodation: {
      id: overrides.id ?? 'acc_001',
      name: overrides.name ?? 'Test Hotel',
      rating: overrides.rating !== undefined ? overrides.rating : 4,
      amenities: [{ type: 'wifi' }],
      location: {
        geographic_coordinates: { latitude: 40.4168, longitude: -3.7038 },
      },
    },
    cheapest_rate: {
      total_amount: overrides.total_amount ?? '300.00',
      total_currency: 'EUR',
      cancellation_policy: {
        refundable: overrides.refundable !== undefined ? overrides.refundable : true,
      },
    },
  };
}

function mockDuffelStays(results: RawResult[]) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ data: { results } }),
  } as unknown as Response);
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockFetch.mockReset();
  process.env.DUFFEL_ACCESS_TOKEN = 'duffel_test_token';
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('searchHotels', () => {
  it('returns HotelOption[] sorted by starRating DESC then totalPriceUSD ASC', async () => {
    mockDuffelStays([
      makeRawResult({ id: 'acc_1', rating: 3, total_amount: '200.00' }),
      makeRawResult({ id: 'acc_2', rating: 5, total_amount: '500.00' }),
      makeRawResult({ id: 'acc_3', rating: 5, total_amount: '400.00' }),
    ]);

    const results = await searchHotels({
      lat: 40.4168,
      lng: -3.7038,
      checkInDate: '2026-05-09',
      checkOutDate: '2026-05-12',
      adults: 1,
    });

    expect(results).toHaveLength(3);
    expect(results[0].id).toBe('acc_3'); // 5-star cheapest
    expect(results[1].id).toBe('acc_2'); // 5-star expensive
    expect(results[2].id).toBe('acc_1'); // 3-star
  });

  it('filters out hotels below minStarRating', async () => {
    mockDuffelStays([
      makeRawResult({ id: 'acc_1', rating: 2, total_amount: '100.00' }),
      makeRawResult({ id: 'acc_2', rating: 4, total_amount: '350.00' }),
    ]);

    const results = await searchHotels({
      lat: 40.4168,
      lng: -3.7038,
      checkInDate: '2026-05-09',
      checkOutDate: '2026-05-12',
      adults: 1,
      minStarRating: 3,
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('acc_2');
  });

  it('calculates pricePerNight correctly (totalPrice / nights)', async () => {
    mockDuffelStays([makeRawResult({ total_amount: '300.00' })]); // 3 nights (May 9–12)

    const [result] = await searchHotels({
      lat: 40.4168,
      lng: -3.7038,
      checkInDate: '2026-05-09',
      checkOutDate: '2026-05-12',
      adults: 1,
    });

    expect(result.nights).toBe(3);
    expect(result.pricePerNight).toBeCloseTo(100, 2);
  });

  it('defaults starRating to 3 when rating field is null', async () => {
    mockDuffelStays([makeRawResult({ rating: null })]);

    const [result] = await searchHotels({
      lat: 40.4168,
      lng: -3.7038,
      checkInDate: '2026-05-09',
      checkOutDate: '2026-05-12',
      adults: 1,
    });

    expect(result.starRating).toBe(3);
  });

  it('sets cancellable=true when refundable is true', async () => {
    mockDuffelStays([makeRawResult({ refundable: true })]);

    const [result] = await searchHotels({
      lat: 40.4168,
      lng: -3.7038,
      checkInDate: '2026-05-09',
      checkOutDate: '2026-05-12',
      adults: 1,
    });

    expect(result.cancellable).toBe(true);
  });

  it('sets cancellable=false when refundable is false', async () => {
    mockDuffelStays([makeRawResult({ refundable: false })]);

    const [result] = await searchHotels({
      lat: 40.4168,
      lng: -3.7038,
      checkInDate: '2026-05-09',
      checkOutDate: '2026-05-12',
      adults: 1,
    });

    expect(result.cancellable).toBe(false);
  });

  it('throws NO_HOTEL_AVAILABILITY when results array is empty', async () => {
    mockDuffelStays([]);

    await expect(
      searchHotels({
        lat: 40.4168,
        lng: -3.7038,
        checkInDate: '2026-05-09',
        checkOutDate: '2026-05-12',
        adults: 1,
      }),
    ).rejects.toThrow('NO_HOTEL_AVAILABILITY');
  });

  it('throws NO_HOTEL_AVAILABILITY when all results are below minStarRating', async () => {
    mockDuffelStays([makeRawResult({ rating: 2 })]);

    await expect(
      searchHotels({
        lat: 40.4168,
        lng: -3.7038,
        checkInDate: '2026-05-09',
        checkOutDate: '2026-05-12',
        adults: 1,
        minStarRating: 3,
      }),
    ).rejects.toThrow('NO_HOTEL_AVAILABILITY');
  });

  it('respects maxResults cap', async () => {
    mockDuffelStays([
      makeRawResult({ id: 'acc_1' }),
      makeRawResult({ id: 'acc_2' }),
      makeRawResult({ id: 'acc_3' }),
    ]);

    const results = await searchHotels({
      lat: 40.4168,
      lng: -3.7038,
      checkInDate: '2026-05-09',
      checkOutDate: '2026-05-12',
      adults: 1,
      maxResults: 2,
    });

    expect(results).toHaveLength(2);
  });

  it('passes correct params to Duffel Stays search', async () => {
    mockDuffelStays([makeRawResult()]);

    await searchHotels({
      lat: 40.4168,
      lng: -3.7038,
      checkInDate: '2026-05-09',
      checkOutDate: '2026-05-12',
      adults: 2,
    });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.duffel.com/stays/search');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.data.check_in_date).toBe('2026-05-09');
    expect(body.data.check_out_date).toBe('2026-05-12');
    expect(body.data.rooms).toBe(1);
    expect(body.data.guests).toEqual([{ type: 'adult' }, { type: 'adult' }]);
    expect(body.data.location.geographic_coordinates).toMatchObject({
      latitude: 40.4168,
      longitude: -3.7038,
      radius: 5,
      radius_unit: 'km',
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest lib/__tests__/hotels.test.ts --no-coverage
```

Expected: `Cannot find module '../hotels'`

---

## Task 4: Hotel module — implement `lib/hotels.ts`

**Files:**
- Create: `lib/hotels.ts`

- [ ] **Step 1: Create `lib/hotels.ts`**

```typescript
// ─── Internal Duffel types ─────────────────────────────────────────────────────

type DuffelStaysResult = {
  accommodation: {
    id: string;
    name: string;
    rating: number | null;
    amenities: Array<{ type: string }>;
    location: {
      geographic_coordinates: {
        latitude: number;
        longitude: number;
      };
    };
  };
  cheapest_rate: {
    total_amount: string;
    total_currency: string;
    cancellation_policy: {
      refundable: boolean;
    };
  };
};

// ─── Exported types ────────────────────────────────────────────────────────────

export interface HotelOption {
  id: string;
  name: string;
  starRating: number;           // 1–5; defaults to 3 if API omits the field
  totalPriceUSD: number;        // full stay price (currency per route; field name kept for interface compat)
  pricePerNight: number;
  currency: string;
  checkInDate: string;          // YYYY-MM-DD
  checkOutDate: string;         // YYYY-MM-DD
  nights: number;
  distanceFromVenueKm: null;    // not available from Duffel
  amenities: string[];
  cancellable: boolean;
  latitude: number | null;
  longitude: number | null;
}

export interface HotelSearchParams {
  lat: number;
  lng: number;
  checkInDate: string;          // YYYY-MM-DD
  checkOutDate: string;         // YYYY-MM-DD
  adults: number;
  minStarRating?: number;       // default 3
  maxResults?: number;          // default 20
}

// ─── Auth ──────────────────────────────────────────────────────────────────────

function getDuffelHeaders(): Record<string, string> {
  const token = process.env.DUFFEL_ACCESS_TOKEN;
  if (!token) throw new Error('DUFFEL_ACCESS_TOKEN must be set');
  return {
    Authorization: `Bearer ${token}`,
    'Duffel-Version': 'v2',
    'Content-Type': 'application/json',
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function calculateNights(checkInDate: string, checkOutDate: string): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round(
    (new Date(checkOutDate).getTime() - new Date(checkInDate).getTime()) /
      msPerDay,
  );
}

// ─── searchHotels ──────────────────────────────────────────────────────────────

export async function searchHotels(
  params: HotelSearchParams,
): Promise<HotelOption[]> {
  const headers = getDuffelHeaders();
  const minStarRating = params.minStarRating ?? 3;
  const maxResults = params.maxResults ?? 20;
  const nights = calculateNights(params.checkInDate, params.checkOutDate);

  const res = await fetch('https://api.duffel.com/stays/search', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      data: {
        check_in_date: params.checkInDate,
        check_out_date: params.checkOutDate,
        rooms: 1,
        guests: Array.from({ length: params.adults }, () => ({ type: 'adult' })),
        location: {
          geographic_coordinates: {
            latitude: params.lat,
            longitude: params.lng,
            radius: 5,
            radius_unit: 'km',
          },
        },
      },
    }),
  });

  if (!res.ok) {
    throw new Error('NO_HOTEL_AVAILABILITY');
  }

  const data = await res.json();
  const results: DuffelStaysResult[] = data.data?.results ?? [];

  if (results.length === 0) {
    throw new Error('NO_HOTEL_AVAILABILITY');
  }

  const hotels: HotelOption[] = results.map((r) => {
    const acc = r.accommodation;
    const rate = r.cheapest_rate;
    const starRating =
      acc.rating !== null && !isNaN(acc.rating) ? acc.rating : 3;
    const totalPriceUSD = parseFloat(rate.total_amount);
    const pricePerNight = nights > 0 ? totalPriceUSD / nights : totalPriceUSD;

    return {
      id: acc.id,
      name: acc.name,
      starRating,
      totalPriceUSD,
      pricePerNight,
      currency: rate.total_currency,
      checkInDate: params.checkInDate,
      checkOutDate: params.checkOutDate,
      nights,
      distanceFromVenueKm: null,
      amenities: acc.amenities.map((a) => a.type),
      cancellable: rate.cancellation_policy.refundable,
      latitude: acc.location.geographic_coordinates.latitude,
      longitude: acc.location.geographic_coordinates.longitude,
    };
  });

  // Sort: starRating DESC, then totalPriceUSD ASC
  const filtered = hotels.filter((h) => h.starRating >= minStarRating);
  filtered.sort((a, b) => {
    if (b.starRating !== a.starRating) return b.starRating - a.starRating;
    return a.totalPriceUSD - b.totalPriceUSD;
  });

  if (filtered.length === 0) {
    throw new Error('NO_HOTEL_AVAILABILITY');
  }

  return filtered.slice(0, maxResults);
}
```

- [ ] **Step 2: Run tests to confirm they pass**

```bash
npx jest lib/__tests__/hotels.test.ts --no-coverage
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add lib/hotels.ts lib/__tests__/hotels.test.ts
git commit -m "feat: add lib/hotels.ts backed by Duffel Stays API v2"
```

---

## Task 5: Wire Duffel modules into graph.ts

**Files:**
- Modify: `lib/langchain/types.ts`
- Modify: `lib/langchain/graph.ts`

- [ ] **Step 1: Add `lat` and `lng` to `RawMatchFixture` in `lib/langchain/types.ts`**

Find this block (around line 65):

```typescript
export interface RawMatchFixture {
  id: string;
  league: string;
  matchday: string;
  homeTeam: string;
  awayTeam: string;
  venue: string;
  kickoffUtc: string;
  ticketPriceEur: number;
  tvConfirmed: boolean;
  nearestAirportCode?: string;
}
```

Replace with:

```typescript
export interface RawMatchFixture {
  id: string;
  league: string;
  matchday: string;
  homeTeam: string;
  awayTeam: string;
  venue: string;
  kickoffUtc: string;
  ticketPriceEur: number;
  tvConfirmed: boolean;
  nearestAirportCode?: string;
  lat?: number;
  lng?: number;
}
```

- [ ] **Step 2: Update imports in `lib/langchain/graph.ts`**

Find:

```typescript
import { searchRoundTrip, type FlightOption } from '../amadeus-flights';
import { searchHotels, type HotelOption } from '../amadeus-hotels';
```

Replace with:

```typescript
import { searchRoundTrip, type FlightOption } from '../flights';
import { searchHotels, type HotelOption } from '../hotels';
```

- [ ] **Step 3: Update hotel callsite in `plan_travel_node` in `lib/langchain/graph.ts`**

Find (around line 381):

```typescript
  if (hotelResults === null) {
    try {
      hotelResults = await searchHotels({
        destinationIata,
        checkInDate: departureDateStr,
        checkOutDate: returnDateStr,
        adults: 1,
        minStarRating: 3,
      });
    } catch (err) {
      console.error('[plan_travel_node] Amadeus hotel search failed:', err);
```

Replace with:

```typescript
  if (hotelResults === null) {
    try {
      hotelResults = await searchHotels({
        lat: match.lat ?? 0,
        lng: match.lng ?? 0,
        checkInDate: departureDateStr,
        checkOutDate: returnDateStr,
        adults: 1,
        minStarRating: 3,
      });
    } catch (err) {
      console.error('[plan_travel_node] Duffel hotel search failed:', err);
```

- [ ] **Step 4: Run full test suite to confirm no regressions**

```bash
npx jest --no-coverage
```

Expected: All existing tests pass (football-data tests unchanged; new flights/hotels tests pass).

- [ ] **Step 5: Commit**

```bash
git add lib/langchain/types.ts lib/langchain/graph.ts
git commit -m "feat: wire Duffel flights and hotels into plan_travel_node"
```

---

## Task 6: Delete Amadeus files and update config

**Files:**
- Delete: `lib/amadeus-flights.ts`
- Delete: `lib/amadeus-hotels.ts`
- Delete: `lib/amadeus.d.ts`
- Delete: `lib/__tests__/amadeus-flights.test.ts`
- Delete: `lib/__tests__/amadeus-hotels.test.ts`
- Modify: `.env.example`
- Modify: `package.json`

- [ ] **Step 1: Delete all Amadeus files**

```bash
rm lib/amadeus-flights.ts lib/amadeus-hotels.ts lib/amadeus.d.ts
rm lib/__tests__/amadeus-flights.test.ts lib/__tests__/amadeus-hotels.test.ts
```

- [ ] **Step 2: Update `.env.example`**

Find:

```
# Used for both flight and hotel search (lib/amadeus-flights.ts, lib/amadeus-hotels.ts)
AMADEUS_API_KEY=your_amadeus_api_key_here
AMADEUS_API_SECRET=your_amadeus_api_secret_here
AMADEUS_HOSTNAME=test
```

Replace with:

```
# Used for both flight and hotel search (lib/flights.ts, lib/hotels.ts)
DUFFEL_ACCESS_TOKEN=your_duffel_access_token_here
```

- [ ] **Step 3: Remove `amadeus` from `package.json`**

Run:

```bash
npm uninstall amadeus
```

- [ ] **Step 4: Run full test suite to confirm clean**

```bash
npx jest --no-coverage
```

Expected: All tests pass. No references to Amadeus in output.

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "chore: remove Amadeus SDK and replace with Duffel integration"
```

---

## Self-Review Checklist

- [x] Spec coverage: `lib/flights.ts` (Task 2) ✓, `lib/hotels.ts` (Task 4) ✓, `graph.ts` wiring (Task 5) ✓, `lat`/`lng` in `RawMatchFixture` (Task 5) ✓, `.env.example` (Task 6) ✓, `package.json` (Task 6) ✓
- [x] Placeholder scan: no TBD/TODO in plan
- [x] Type consistency: `FlightOption.seatsRemaining` is typed `null` in implementation; tests assert `null`; `HotelSearchParams` uses `lat`/`lng` consistently across Tasks 3, 4, 5
- [x] `getDuffelHeaders()` defined independently in both `flights.ts` and `hotels.ts` — no shared dependency
- [x] Error strings `NO_FLIGHTS_AVAILABLE` and `NO_HOTEL_AVAILABILITY` match graph.ts error handling
