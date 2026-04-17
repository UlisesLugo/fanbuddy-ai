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
