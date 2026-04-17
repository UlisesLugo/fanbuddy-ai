# LiteAPI Hotel Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Duffel Stays API with LiteAPI in `lib/hotels.ts` while keeping the public `HotelOption` / `HotelSearchParams` interface and `searchHotels()` signature identical so `graph.ts` requires zero changes.

**Architecture:** `lib/hotels.ts` is the only file that changes. The Duffel single-POST is replaced by two sequential LiteAPI calls — `GET /data/hotels` (fetch hotel IDs near coordinates) followed by `POST /rates` (fetch pricing for those IDs). All downstream consumers remain untouched.

**Tech Stack:** TypeScript, native `fetch`, Jest / ts-jest

---

## File Map

| File | Change |
|---|---|
| `lib/__tests__/hotels.test.ts` | Rewrite — replace Duffel mock shapes with LiteAPI two-call mocks |
| `lib/hotels.ts` | Rewrite internals — new internal types, new auth header, two-step fetch |
| `.env.example` | Replace `DUFFEL_ACCESS_TOKEN` entry with `LITEAPI_API_KEY` |

---

## Task 1: Rewrite hotel tests for LiteAPI

**Files:**
- Modify: `lib/__tests__/hotels.test.ts`

- [ ] **Step 1: Replace the entire test file with LiteAPI-shaped mocks and tests**

```typescript
import { searchHotels } from '../hotels';

// ─── Mock: global fetch ────────────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

// ─── Internal LiteAPI shapes (mirrors lib/hotels.ts internal types) ───────────

type LiteApiHotel = {
  id: string;
  name: string;
  starRating: number | null;
  location: { latitude: number; longitude: number };
  distance: number | null;
};

type LiteApiRate = {
  hotelId: string;
  cheapestRate: {
    retailRate: { total: Array<{ amount: number; currency: string }> };
    cancellationPolicies: { refundable: boolean };
  } | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeLiteApiHotel(overrides: {
  id?: string;
  name?: string;
  starRating?: number | null;
  distance?: number | null;
} = {}): LiteApiHotel {
  return {
    id: overrides.id ?? 'lp001',
    name: overrides.name ?? 'Test Hotel',
    starRating: overrides.starRating !== undefined ? overrides.starRating : 4,
    location: { latitude: 40.4168, longitude: -3.7038 },
    distance: overrides.distance !== undefined ? overrides.distance : 1.2,
  };
}

function makeLiteApiRate(overrides: {
  hotelId?: string;
  amount?: number;
  refundable?: boolean;
} = {}): LiteApiRate {
  return {
    hotelId: overrides.hotelId ?? 'lp001',
    cheapestRate: {
      retailRate: {
        total: [{ amount: overrides.amount ?? 300, currency: 'EUR' }],
      },
      cancellationPolicies: {
        refundable: overrides.refundable !== undefined ? overrides.refundable : true,
      },
    },
  };
}

/** Mock both fetch calls in order: GET /data/hotels, then POST /rates */
function mockLiteApi(hotels: LiteApiHotel[], rates: LiteApiRate[]) {
  mockFetch
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: hotels }),
    } as unknown as Response)
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: rates }),
    } as unknown as Response);
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockFetch.mockReset();
  process.env.LITEAPI_API_KEY = 'test_liteapi_key';
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('searchHotels', () => {
  it('returns HotelOption[] sorted by starRating DESC then totalPriceUSD ASC', async () => {
    mockLiteApi(
      [
        makeLiteApiHotel({ id: 'lp1', starRating: 3 }),
        makeLiteApiHotel({ id: 'lp2', starRating: 5 }),
        makeLiteApiHotel({ id: 'lp3', starRating: 5 }),
      ],
      [
        makeLiteApiRate({ hotelId: 'lp1', amount: 200 }),
        makeLiteApiRate({ hotelId: 'lp2', amount: 500 }),
        makeLiteApiRate({ hotelId: 'lp3', amount: 400 }),
      ],
    );

    const results = await searchHotels({
      lat: 40.4168,
      lng: -3.7038,
      checkInDate: '2026-05-09',
      checkOutDate: '2026-05-12',
      adults: 1,
    });

    expect(results).toHaveLength(3);
    expect(results[0].id).toBe('lp3'); // 5-star cheapest
    expect(results[1].id).toBe('lp2'); // 5-star expensive
    expect(results[2].id).toBe('lp1'); // 3-star
  });

  it('filters out hotels below minStarRating', async () => {
    mockLiteApi(
      [
        makeLiteApiHotel({ id: 'lp1', starRating: 2 }),
        makeLiteApiHotel({ id: 'lp2', starRating: 4 }),
      ],
      [
        makeLiteApiRate({ hotelId: 'lp1', amount: 100 }),
        makeLiteApiRate({ hotelId: 'lp2', amount: 350 }),
      ],
    );

    const results = await searchHotels({
      lat: 40.4168,
      lng: -3.7038,
      checkInDate: '2026-05-09',
      checkOutDate: '2026-05-12',
      adults: 1,
      minStarRating: 3,
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('lp2');
  });

  it('calculates pricePerNight correctly (totalPrice / nights)', async () => {
    mockLiteApi(
      [makeLiteApiHotel()],
      [makeLiteApiRate({ amount: 300 })], // 3 nights (May 9–12)
    );

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
    mockLiteApi(
      [makeLiteApiHotel({ starRating: null })],
      [makeLiteApiRate()],
    );

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
    mockLiteApi([makeLiteApiHotel()], [makeLiteApiRate({ refundable: true })]);

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
    mockLiteApi([makeLiteApiHotel()], [makeLiteApiRate({ refundable: false })]);

    const [result] = await searchHotels({
      lat: 40.4168,
      lng: -3.7038,
      checkInDate: '2026-05-09',
      checkOutDate: '2026-05-12',
      adults: 1,
    });

    expect(result.cancellable).toBe(false);
  });

  it('throws NO_HOTEL_AVAILABILITY when /data/hotels returns empty array', async () => {
    mockLiteApi([], []);

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

  it('throws NO_HOTEL_AVAILABILITY when all hotels have no available rates', async () => {
    mockLiteApi(
      [makeLiteApiHotel({ id: 'lp1' })],
      [{ hotelId: 'lp1', cheapestRate: null }],
    );

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
    mockLiteApi(
      [makeLiteApiHotel({ starRating: 2 })],
      [makeLiteApiRate()],
    );

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
    mockLiteApi(
      [
        makeLiteApiHotel({ id: 'lp1' }),
        makeLiteApiHotel({ id: 'lp2' }),
        makeLiteApiHotel({ id: 'lp3' }),
      ],
      [
        makeLiteApiRate({ hotelId: 'lp1' }),
        makeLiteApiRate({ hotelId: 'lp2' }),
        makeLiteApiRate({ hotelId: 'lp3' }),
      ],
    );

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

  it('passes correct params to LiteAPI /data/hotels', async () => {
    mockLiteApi([makeLiteApiHotel()], [makeLiteApiRate()]);

    await searchHotels({
      lat: 40.4168,
      lng: -3.7038,
      checkInDate: '2026-05-09',
      checkOutDate: '2026-05-12',
      adults: 1,
    });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('https://api.liteapi.travel/v3.0/data/hotels');
    expect(url).toContain('latitude=40.4168');
    expect(url).toContain('longitude=-3.7038');
    expect(url).toContain('radius=5');
    expect(url).toContain('limit=20');
    expect((init.headers as Record<string, string>)['X-API-Key']).toBe('test_liteapi_key');
  });

  it('passes correct params to LiteAPI /rates', async () => {
    mockLiteApi(
      [makeLiteApiHotel({ id: 'lp001' })],
      [makeLiteApiRate({ hotelId: 'lp001' })],
    );

    await searchHotels({
      lat: 40.4168,
      lng: -3.7038,
      checkInDate: '2026-05-09',
      checkOutDate: '2026-05-12',
      adults: 2,
    });

    const [url, init] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('https://api.liteapi.travel/v3.0/rates');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.hotelIds).toEqual(['lp001']);
    expect(body.occupancies).toEqual([{ adults: 2 }]);
    expect(body.checkin).toBe('2026-05-09');
    expect(body.checkout).toBe('2026-05-12');
    expect(body.currency).toBe('EUR');
  });

  it('populates distanceFromVenueKm from LiteAPI distance field', async () => {
    mockLiteApi(
      [makeLiteApiHotel({ distance: 2.4 })],
      [makeLiteApiRate()],
    );

    const [result] = await searchHotels({
      lat: 40.4168,
      lng: -3.7038,
      checkInDate: '2026-05-09',
      checkOutDate: '2026-05-12',
      adults: 1,
    });

    expect(result.distanceFromVenueKm).toBe(2.4);
  });

  it('throws NO_HOTEL_AVAILABILITY when /data/hotels returns non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: () => Promise.resolve({}),
    } as unknown as Response);

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

  it('throws NO_HOTEL_AVAILABILITY when /rates returns non-ok response', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [makeLiteApiHotel()] }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () => Promise.resolve({}),
      } as unknown as Response);

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
});
```

- [ ] **Step 2: Run the tests — confirm they all fail**

```bash
cd /Users/uliseslugo/code/fanbuddy-ai && npx jest lib/__tests__/hotels.test.ts --no-coverage
```

Expected: All 13 tests FAIL. They will fail because `hotels.ts` still uses Duffel (wrong URL, wrong env var, wrong response shape). If any pass, stop and investigate before continuing.

- [ ] **Step 3: Commit the failing tests**

```bash
git add lib/__tests__/hotels.test.ts
git commit -m "test: rewrite hotel tests for LiteAPI two-step flow (failing)"
```

---

## Task 2: Replace lib/hotels.ts internals with LiteAPI

**Files:**
- Modify: `lib/hotels.ts`

- [ ] **Step 1: Replace the entire file**

```typescript
// ─── Internal LiteAPI types ───────────────────────────────────────────────────

type LiteApiHotel = {
  id: string;
  name: string;
  starRating: number | null;
  location: { latitude: number; longitude: number };
  distance: number | null;
};

type LiteApiRate = {
  hotelId: string;
  cheapestRate: {
    retailRate: {
      total: Array<{ amount: number; currency: string }>;
    };
    cancellationPolicies: {
      refundable: boolean;
    };
  } | null;
};

// ─── Exported types ────────────────────────────────────────────────────────────

export interface HotelOption {
  id: string;
  name: string;
  starRating: number;           // 1–5; defaults to 3 if API omits the field
  totalPriceUSD: number;        // full stay price (field name kept for interface compat)
  pricePerNight: number;
  currency: string;
  checkInDate: string;          // YYYY-MM-DD
  checkOutDate: string;         // YYYY-MM-DD
  nights: number;
  distanceFromVenueKm: number | null;  // km from venue; null if API omits
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

function getLiteApiHeaders(): Record<string, string> {
  const key = process.env.LITEAPI_API_KEY;
  if (!key) throw new Error('LITEAPI_API_KEY must be set');
  return {
    'X-API-Key': key,
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
  const headers = getLiteApiHeaders();
  const minStarRating = params.minStarRating ?? 3;
  const maxResults = params.maxResults ?? 20;
  const nights = calculateNights(params.checkInDate, params.checkOutDate);

  // ── Step 1: Get hotels near coordinates ─────────────────────────────────────
  const hotelsUrl =
    `https://api.liteapi.travel/v3.0/data/hotels` +
    `?latitude=${params.lat}&longitude=${params.lng}&radius=5&limit=20`;
  const step1Start = Date.now();
  const hotelsRes = await fetch(hotelsUrl, { headers });
  console.log(
    `[api] ${hotelsRes.ok ? '✓' : '✗'} liteapi GET /data/hotels → ${hotelsRes.status} (${Date.now() - step1Start}ms)`,
  );

  if (!hotelsRes.ok) throw new Error('NO_HOTEL_AVAILABILITY');

  const hotelsData = await hotelsRes.json();
  const hotels: LiteApiHotel[] = hotelsData.data ?? [];

  if (hotels.length === 0) throw new Error('NO_HOTEL_AVAILABILITY');

  const hotelIds = hotels.map((h) => h.id);

  // ── Step 2: Get rates for those hotels ──────────────────────────────────────
  const ratesUrl = 'https://api.liteapi.travel/v3.0/rates';
  const step2Start = Date.now();
  const ratesRes = await fetch(ratesUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      hotelIds,
      occupancies: [{ adults: params.adults }],
      checkin: params.checkInDate,
      checkout: params.checkOutDate,
      currency: 'EUR',
    }),
  });
  console.log(
    `[api] ${ratesRes.ok ? '✓' : '✗'} liteapi POST /rates → ${ratesRes.status} (${Date.now() - step2Start}ms)`,
  );

  if (!ratesRes.ok) throw new Error('NO_HOTEL_AVAILABILITY');

  const ratesData = await ratesRes.json();
  const rates: LiteApiRate[] = ratesData.data ?? [];

  // Build a lookup map from hotelId → rate entry
  const rateMap = new Map<string, LiteApiRate>(rates.map((r) => [r.hotelId, r]));

  // Merge hotel info + rates — drop hotels with no available rate
  const hotelOptions: HotelOption[] = [];
  for (const hotel of hotels) {
    const rateEntry = rateMap.get(hotel.id);
    if (!rateEntry?.cheapestRate) continue;

    const total = rateEntry.cheapestRate.retailRate.total[0];
    if (!total) continue;

    const starRating =
      hotel.starRating !== null && !isNaN(hotel.starRating as number)
        ? (hotel.starRating as number)
        : 3;

    hotelOptions.push({
      id: hotel.id,
      name: hotel.name,
      starRating,
      totalPriceUSD: total.amount,
      pricePerNight: nights > 0 ? total.amount / nights : total.amount,
      currency: total.currency,
      checkInDate: params.checkInDate,
      checkOutDate: params.checkOutDate,
      nights,
      distanceFromVenueKm: hotel.distance ?? null,
      amenities: [],
      cancellable: rateEntry.cheapestRate.cancellationPolicies.refundable,
      latitude: hotel.location.latitude,
      longitude: hotel.location.longitude,
    });
  }

  if (hotelOptions.length === 0) throw new Error('NO_HOTEL_AVAILABILITY');

  const filtered = hotelOptions.filter((h) => h.starRating >= minStarRating);
  filtered.sort((a, b) => {
    if (b.starRating !== a.starRating) return b.starRating - a.starRating;
    return a.totalPriceUSD - b.totalPriceUSD;
  });

  if (filtered.length === 0) throw new Error('NO_HOTEL_AVAILABILITY');

  return filtered.slice(0, maxResults);
}
```

- [ ] **Step 2: Run the tests — confirm they all pass**

```bash
cd /Users/uliseslugo/code/fanbuddy-ai && npx jest lib/__tests__/hotels.test.ts --no-coverage
```

Expected: All 13 tests PASS. If any fail, read the error message carefully — it will point to a field name mismatch between the test mock shapes and the implementation.

- [ ] **Step 3: Run the full test suite to check for regressions**

```bash
cd /Users/uliseslugo/code/fanbuddy-ai && npx jest --no-coverage
```

Expected: All tests pass. `lib/__tests__/flights.test.ts` and `lib/__tests__/football-data.test.ts` should be unaffected.

- [ ] **Step 4: Commit**

```bash
git add lib/hotels.ts lib/__tests__/hotels.test.ts
git commit -m "feat: replace Duffel Stays with LiteAPI two-step hotel search"
```

---

## Task 3: Update environment configuration

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Replace the Duffel hotel entry in .env.example**

Open `.env.example`. Find these lines:

```
# Used for both flight and hotel search (lib/flights.ts, lib/hotels.ts)
DUFFEL_ACCESS_TOKEN=your_duffel_access_token_here
```

Replace with:

```
# Used for flight search (lib/flights.ts)
DUFFEL_ACCESS_TOKEN=your_duffel_access_token_here

# Used for hotel search (lib/hotels.ts)
LITEAPI_API_KEY=your_liteapi_api_key_here
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: add LITEAPI_API_KEY to env config"
```
