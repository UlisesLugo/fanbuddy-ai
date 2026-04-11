import { getClient } from './amadeus-flights';

// ─── Exported types ───────────────────────────────────────────────────────────

export interface HotelOption {
  id: string;                     // Amadeus hotel ID
  name: string;
  starRating: number;             // 1–5; defaults to 3 if API omits the field
  totalPriceUSD: number;          // full stay price
  pricePerNight: number;          // totalPriceUSD / nights (for display)
  currency: string;
  checkInDate: string;            // YYYY-MM-DD
  checkOutDate: string;           // YYYY-MM-DD
  nights: number;
  distanceFromVenueKm: number | null;
  amenities: string[];            // e.g. ["WIFI", "BREAKFAST"]
  cancellable: boolean;
  latitude: number | null;
  longitude: number | null;
}

export interface HotelSearchParams {
  destinationIata: string;        // IATA city code (e.g. "MAD")
  checkInDate: string;            // YYYY-MM-DD
  checkOutDate: string;           // YYYY-MM-DD
  adults: number;
  minStarRating?: number;         // default 3
  maxResults?: number;            // default 20
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
): Promise<T> {
  const delays = [1000, 2000, 4000];
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
  throw new Error('unreachable');
}

function calculateNights(checkInDate: string, checkOutDate: string): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round(
    (new Date(checkOutDate).getTime() - new Date(checkInDate).getTime()) /
      msPerDay,
  );
}

// ─── searchHotels ─────────────────────────────────────────────────────────────

export async function searchHotels(
  params: HotelSearchParams,
): Promise<HotelOption[]> {
  const client = getClient();
  const minStarRating = params.minStarRating ?? 3;
  const maxResults = params.maxResults ?? 20;
  const nights = calculateNights(params.checkInDate, params.checkOutDate);

  // Step 1 — Hotel List by City
  const listResponse = await fetchWithRetry(() =>
    client.referenceData.locations.hotels.byCity.get({
      cityCode: params.destinationIata,
      radius: 5,
      radiusUnit: 'KM',
      hotelSource: 'ALL',
    }),
  );

  const hotelIds = (listResponse.data ?? []).map((h: { hotelId: string }) => h.hotelId);

  if (hotelIds.length === 0) {
    throw new Error('NO_HOTELS_IN_CITY');
  }

  // Step 2 — Hotel Offers Search (max 50 IDs per request)
  const offersResponse = await fetchWithRetry(() =>
    client.shopping.hotelOffersSearch.get({
      hotelIds: hotelIds.slice(0, 50).join(','),
      checkInDate: params.checkInDate,
      checkOutDate: params.checkOutDate,
      adults: params.adults,
      roomQuantity: 1,
      currency: 'USD',
      bestRateOnly: true,
    }),
  );

  const items = offersResponse.data ?? [];

  if (items.length === 0) {
    throw new Error('NO_HOTEL_AVAILABILITY');
  }

  // Map offers → HotelOption
  const hotels: HotelOption[] = items.flatMap((item: {
    hotel: {
      hotelId: string;
      name: string;
      rating?: string;
      amenities?: string[];
      latitude?: number;
      longitude?: number;
    };
    offers?: Array<{
      id: string;
      price: { total: string; currency: string };
      policies?: {
        cancellations?: Array<{ deadline?: string; amount?: string }>;
      };
    }>;
    available?: boolean;
  }) => {
    const offer = item.offers?.[0];
    if (!offer) return [];

    const rawRating = item.hotel.rating;
    const parsed = rawRating !== undefined ? parseInt(rawRating, 10) : NaN;
    const starRating = !isNaN(parsed) ? parsed : 3;

    const totalPriceUSD = parseFloat(offer.price.total);
    const pricePerNight = nights > 0 ? totalPriceUSD / nights : totalPriceUSD;

    const now = new Date();
    const cancellable = (offer.policies?.cancellations ?? []).some(
      (c: { deadline?: string }) => c.deadline !== undefined && new Date(c.deadline) > now,
    );

    return [
      {
        id: item.hotel.hotelId,
        name: item.hotel.name,
        starRating,
        totalPriceUSD,
        pricePerNight,
        currency: offer.price.currency,
        checkInDate: params.checkInDate,
        checkOutDate: params.checkOutDate,
        nights,
        distanceFromVenueKm: null,
        amenities: item.hotel.amenities ?? [],
        cancellable,
        latitude: item.hotel.latitude ?? null,
        longitude: item.hotel.longitude ?? null,
      },
    ];
  });

  // Filter by minimum star rating
  const filtered = hotels.filter((h) => h.starRating >= minStarRating);

  // Sort: starRating DESC, then totalPriceUSD ASC (best value at each tier)
  filtered.sort((a, b) => {
    if (b.starRating !== a.starRating) return b.starRating - a.starRating;
    return a.totalPriceUSD - b.totalPriceUSD;
  });

  return filtered.slice(0, maxResults);
}
