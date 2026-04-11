import { searchHotels, type HotelOption } from '../amadeus-hotels';

// ─── Mock: amadeus SDK ────────────────────────────────────────────────────────

const mockHotelsByCity = jest.fn();
const mockHotelOffersSearch = jest.fn();

jest.mock('amadeus', () =>
  jest.fn().mockImplementation(() => ({
    referenceData: {
      locations: {
        hotels: {
          byCity: { get: mockHotelsByCity },
        },
      },
    },
    shopping: {
      hotelOffersSearch: { get: mockHotelOffersSearch },
      flightOffersSearch: { get: jest.fn() },
    },
    booking: { flightOrders: { post: jest.fn() } },
  })),
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeHotelListResponse(hotelIds: string[]) {
  return {
    data: hotelIds.map((id) => ({ hotelId: id, name: `Hotel ${id}` })),
  };
}

function makeHotelOffersItem(overrides: {
  hotelId?: string;
  name?: string;
  rating?: string;
  total?: string;
  currency?: string;
  amenities?: string[];
  latitude?: number;
  longitude?: number;
  cancellationDeadline?: string;
} = {}): object {
  return {
    hotel: {
      hotelId: overrides.hotelId ?? 'HOTEL001',
      name: overrides.name ?? 'Test Hotel',
      rating: overrides.rating ?? '4',
      amenities: overrides.amenities ?? ['WIFI'],
      latitude: overrides.latitude ?? 40.4168,
      longitude: overrides.longitude ?? -3.7038,
    },
    offers: [
      {
        id: 'offer-001',
        price: {
          total: overrides.total ?? '300.00',
          currency: overrides.currency ?? 'USD',
        },
        policies: {
          cancellations: overrides.cancellationDeadline
            ? [{ deadline: overrides.cancellationDeadline, amount: '0' }]
            : [],
        },
      },
    ],
    available: true,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.AMADEUS_API_KEY = 'test-key';
  process.env.AMADEUS_API_SECRET = 'test-secret';
  mockHotelsByCity.mockReset();
  mockHotelOffersSearch.mockReset();
});

// ─── Test 1: sorted by starRating DESC then totalPriceUSD ASC ────────────────

describe('searchHotels', () => {
  it('returns HotelOption[] sorted by starRating DESC then totalPriceUSD ASC', async () => {
    mockHotelsByCity.mockResolvedValue(
      makeHotelListResponse(['H1', 'H2', 'H3']),
    );
    mockHotelOffersSearch.mockResolvedValue({
      data: [
        makeHotelOffersItem({ hotelId: 'H1', rating: '3', total: '200.00' }),
        makeHotelOffersItem({ hotelId: 'H2', rating: '5', total: '500.00' }),
        makeHotelOffersItem({ hotelId: 'H3', rating: '5', total: '400.00' }),
      ],
    });

    const results = await searchHotels({
      destinationIata: 'MAD',
      checkInDate: '2026-05-09',
      checkOutDate: '2026-05-12',
      adults: 1,
    });

    expect(results).toHaveLength(3);
    // 5-star cheapest first, then 5-star expensive, then 3-star
    expect(results[0].id).toBe('H3');
    expect(results[0].starRating).toBe(5);
    expect(results[0].totalPriceUSD).toBe(400);
    expect(results[1].id).toBe('H2');
    expect(results[1].starRating).toBe(5);
    expect(results[1].totalPriceUSD).toBe(500);
    expect(results[2].id).toBe('H1');
    expect(results[2].starRating).toBe(3);
  });

  // ─── Test 2: minStarRating filter ────────────────────────────────────────────

  it('filters out hotels below minStarRating', async () => {
    mockHotelsByCity.mockResolvedValue(
      makeHotelListResponse(['H1', 'H2']),
    );
    mockHotelOffersSearch.mockResolvedValue({
      data: [
        makeHotelOffersItem({ hotelId: 'H1', rating: '2', total: '100.00' }),
        makeHotelOffersItem({ hotelId: 'H2', rating: '4', total: '350.00' }),
      ],
    });

    const results = await searchHotels({
      destinationIata: 'MAD',
      checkInDate: '2026-05-09',
      checkOutDate: '2026-05-12',
      adults: 1,
      minStarRating: 3,
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('H2');
    expect(results[0].starRating).toBe(4);
  });

  // ─── Test 3: pricePerNight calculation ────────────────────────────────────────

  it('calculates pricePerNight correctly from totalPriceUSD / nights', async () => {
    mockHotelsByCity.mockResolvedValue(makeHotelListResponse(['H1']));
    mockHotelOffersSearch.mockResolvedValue({
      data: [makeHotelOffersItem({ total: '300.00' })], // 3 nights (May 9–12)
    });

    const [result] = await searchHotels({
      destinationIata: 'MAD',
      checkInDate: '2026-05-09',
      checkOutDate: '2026-05-12',
      adults: 1,
    });

    expect(result.nights).toBe(3);
    expect(result.pricePerNight).toBeCloseTo(100, 2); // 300 / 3
  });

  // ─── Test 4: missing rating defaults to 3 ────────────────────────────────────

  it('defaults starRating to 3 when rating field is absent', async () => {
    mockHotelsByCity.mockResolvedValue(makeHotelListResponse(['H1']));
    const item = makeHotelOffersItem() as Record<string, unknown>;
    // Remove the rating field entirely
    delete (item.hotel as Record<string, unknown>).rating;
    mockHotelOffersSearch.mockResolvedValue({ data: [item] });

    const [result] = await searchHotels({
      destinationIata: 'MAD',
      checkInDate: '2026-05-09',
      checkOutDate: '2026-05-12',
      adults: 1,
    });

    expect(result.starRating).toBe(3);
  });

  // ─── Test 5: cancellable = true when future deadline exists ──────────────────

  it('sets cancellable=true when a cancellation policy has a future deadline', async () => {
    mockHotelsByCity.mockResolvedValue(makeHotelListResponse(['H1']));
    mockHotelOffersSearch.mockResolvedValue({
      data: [
        makeHotelOffersItem({ cancellationDeadline: '2030-01-01T00:00:00Z' }),
      ],
    });

    const [result] = await searchHotels({
      destinationIata: 'MAD',
      checkInDate: '2026-05-09',
      checkOutDate: '2026-05-12',
      adults: 1,
    });

    expect(result.cancellable).toBe(true);
  });

  // ─── Test 6: cancellable = false when no cancellation policies ───────────────

  it('sets cancellable=false when no cancellation policies exist', async () => {
    mockHotelsByCity.mockResolvedValue(makeHotelListResponse(['H1']));
    mockHotelOffersSearch.mockResolvedValue({
      data: [makeHotelOffersItem({ cancellationDeadline: undefined })],
    });

    const [result] = await searchHotels({
      destinationIata: 'MAD',
      checkInDate: '2026-05-09',
      checkOutDate: '2026-05-12',
      adults: 1,
    });

    expect(result.cancellable).toBe(false);
  });

  // ─── Test 7: Step 1 returns 0 hotels → throws NO_HOTELS_IN_CITY ─────────────

  it('throws NO_HOTELS_IN_CITY when step 1 returns empty list', async () => {
    mockHotelsByCity.mockResolvedValue({ data: [] });

    await expect(
      searchHotels({
        destinationIata: 'XYZ',
        checkInDate: '2026-05-09',
        checkOutDate: '2026-05-12',
        adults: 1,
      }),
    ).rejects.toThrow('NO_HOTELS_IN_CITY');
  });

  // ─── Test 8: Step 2 returns 0 offers → throws NO_HOTEL_AVAILABILITY ──────────

  it('throws NO_HOTEL_AVAILABILITY when step 2 returns no offers', async () => {
    mockHotelsByCity.mockResolvedValue(makeHotelListResponse(['H1', 'H2']));
    mockHotelOffersSearch.mockResolvedValue({ data: [] });

    await expect(
      searchHotels({
        destinationIata: 'MAD',
        checkInDate: '2026-05-09',
        checkOutDate: '2026-05-12',
        adults: 1,
      }),
    ).rejects.toThrow('NO_HOTEL_AVAILABILITY');
  });

  // ─── Test 8b: all step 2 items have no offers → throws NO_HOTEL_AVAILABILITY ──

  it('throws NO_HOTEL_AVAILABILITY when all step 2 items have no offers', async () => {
    mockHotelsByCity.mockResolvedValue(makeHotelListResponse(['H1']));
    mockHotelOffersSearch.mockResolvedValue({
      data: [
        {
          hotel: { hotelId: 'H1', name: 'Hotel H1' },
          offers: [], // empty offers array — no available rooms
          available: false,
        },
      ],
    });

    await expect(
      searchHotels({
        destinationIata: 'MAD',
        checkInDate: '2026-05-09',
        checkOutDate: '2026-05-12',
        adults: 1,
      }),
    ).rejects.toThrow('NO_HOTEL_AVAILABILITY');
  });

  // ─── Test 9: passes correct params to Amadeus Step 1 ─────────────────────────

  it('passes correct params to Amadeus hotel list call', async () => {
    mockHotelsByCity.mockResolvedValue(makeHotelListResponse(['H1']));
    mockHotelOffersSearch.mockResolvedValue({
      data: [makeHotelOffersItem()],
    });

    await searchHotels({
      destinationIata: 'MAD',
      checkInDate: '2026-05-09',
      checkOutDate: '2026-05-12',
      adults: 2,
    });

    expect(mockHotelsByCity).toHaveBeenCalledWith({
      cityCode: 'MAD',
      radius: 5,
      radiusUnit: 'KM',
      hotelSource: 'ALL',
    });
  });

  // ─── Test 10: passes correct params to Amadeus Step 2 ────────────────────────

  it('passes correct params to Amadeus hotel offers call', async () => {
    mockHotelsByCity.mockResolvedValue(makeHotelListResponse(['H1', 'H2']));
    mockHotelOffersSearch.mockResolvedValue({
      data: [makeHotelOffersItem()],
    });

    await searchHotels({
      destinationIata: 'MAD',
      checkInDate: '2026-05-09',
      checkOutDate: '2026-05-12',
      adults: 2,
    });

    expect(mockHotelOffersSearch).toHaveBeenCalledWith({
      hotelIds: 'H1,H2',
      checkInDate: '2026-05-09',
      checkOutDate: '2026-05-12',
      adults: 2,
      roomQuantity: 1,
      currency: 'USD',
      bestRateOnly: true,
    });
  });

  // ─── Test 11: respects maxResults cap ─────────────────────────────────────────

  it('returns at most maxResults hotels', async () => {
    mockHotelsByCity.mockResolvedValue(
      makeHotelListResponse(['H1', 'H2', 'H3']),
    );
    mockHotelOffersSearch.mockResolvedValue({
      data: [
        makeHotelOffersItem({ hotelId: 'H1' }),
        makeHotelOffersItem({ hotelId: 'H2' }),
        makeHotelOffersItem({ hotelId: 'H3' }),
      ],
    });

    const results = await searchHotels({
      destinationIata: 'MAD',
      checkInDate: '2026-05-09',
      checkOutDate: '2026-05-12',
      adults: 1,
      maxResults: 2,
    });

    expect(results).toHaveLength(2);
  });

  // ─── Test 12: slices hotel list to 50 IDs max ─────────────────────────────────

  it('sends at most 50 hotel IDs to step 2', async () => {
    const ids = Array.from({ length: 60 }, (_, i) => `H${i + 1}`);
    mockHotelsByCity.mockResolvedValue(makeHotelListResponse(ids));
    mockHotelOffersSearch.mockResolvedValue({ data: [makeHotelOffersItem()] });

    await searchHotels({
      destinationIata: 'MAD',
      checkInDate: '2026-05-09',
      checkOutDate: '2026-05-12',
      adults: 1,
    });

    const callArg = mockHotelOffersSearch.mock.calls[0][0] as { hotelIds: string };
    const sentIds = callArg.hotelIds.split(',');
    expect(sentIds).toHaveLength(50);
  });
});
