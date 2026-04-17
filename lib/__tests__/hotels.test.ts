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
  roomTypes: Array<{
    rates: Array<{
      retailRate: { total: Array<{ amount: number; currency: string }> };
      cancellationPolicies: { refundableTag: string };
    }>;
  }>;
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
  const isRefundable = overrides.refundable !== undefined ? overrides.refundable : true;
  return {
    hotelId: overrides.hotelId ?? 'lp001',
    roomTypes: [
      {
        rates: [
          {
            retailRate: {
              total: [{ amount: overrides.amount ?? 300, currency: 'EUR' }],
            },
            cancellationPolicies: {
              refundableTag: isRefundable ? 'RFN' : 'NRFN',
            },
          },
        ],
      },
    ],
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
      text: () => Promise.resolve(JSON.stringify({ data: rates })),
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
      [{ hotelId: 'lp1', roomTypes: [] }],
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
    expect(url).toBe('https://api.liteapi.travel/v3.0/hotels/rates');
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
        text: () => Promise.resolve(''),
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
