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
