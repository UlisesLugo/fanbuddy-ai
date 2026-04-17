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
