// Types for the Amadeus SDK are declared in lib/amadeus.d.ts (ambient).
import Amadeus from 'amadeus';

// ─── Internal raw shape from Amadeus Flight Offers Search response ────────────

type AmadeusItinerary = {
  duration: string; // ISO 8601 duration e.g. "PT2H30M"
  segments: Array<{
    departure: { iataCode: string; at: string };
    arrival: { iataCode: string; at: string };
    carrierCode: string;
    number: string;
    numberOfStops: number;
  }>;
};

// ─── Exported types ───────────────────────────────────────────────────────────

export interface FlightLeg {
  origin: string;
  destination: string;
  departureUtc: string; // ISO 8601 UTC — validator_node reads this
  arrivalUtc: string; // ISO 8601 UTC — validator_node reads this
  durationMinutes: number;
  stops: number;
  carrierCode: string;
  flightNumber: string;
}

export interface FlightOption {
  id: string; // Amadeus offer id
  outbound: FlightLeg;
  inbound: FlightLeg;
  totalPriceUSD: number;
  currency: string;
  validatingCarrier: string;
  seatsRemaining: number | null;
}

export interface FlightSearchParams {
  originIata: string;
  destinationIata: string;
  departureDateUtc: string; // YYYY-MM-DD
  returnDateUtc: string; // YYYY-MM-DD
  adults: number;
  maxResults?: number; // default 10
  currencyCode?: string; // default USD
}

// ─── Client ───────────────────────────────────────────────────────────────────
// Lazy factory — avoids throwing at module-load time when env vars are absent
// (e.g. during Jest runs of unrelated test files).

function getClient(): Amadeus {
  const clientId = process.env.AMADEUS_API_KEY;
  const clientSecret = process.env.AMADEUS_API_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('AMADEUS_API_KEY and AMADEUS_API_SECRET must be set');
  }
  return new Amadeus({
    clientId,
    clientSecret,
    hostname: (process.env.AMADEUS_HOSTNAME ?? 'test') as 'test' | 'production',
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDurationMinutes(isoDuration: string): number {
  const h = parseInt(isoDuration.match(/(\d+)H/)?.[1] ?? '0', 10);
  const m = parseInt(isoDuration.match(/(\d+)M/)?.[1] ?? '0', 10);
  return h * 60 + m;
}

// Builds a FlightLeg from an Amadeus itinerary, using the first segment's
// departure and last segment's arrival to handle connecting flights correctly.
function buildLeg(itinerary: AmadeusItinerary): FlightLeg {
  const first = itinerary.segments[0];
  const last = itinerary.segments[itinerary.segments.length - 1];
  return {
    origin: first.departure.iataCode,
    destination: last.arrival.iataCode,
    // new Date(str).toISOString() normalises any local time with UTC offset
    // (e.g. "2026-05-09T09:00:00+02:00") to a UTC ISO 8601 string.
    departureUtc: new Date(first.departure.at).toISOString(),
    arrivalUtc: new Date(last.arrival.at).toISOString(),
    durationMinutes: parseDurationMinutes(itinerary.duration),
    stops: itinerary.segments.length - 1,
    carrierCode: first.carrierCode,
    flightNumber: first.number,
  };
}

// ─── searchRoundTrip ──────────────────────────────────────────────────────────

export async function searchRoundTrip(
  params: FlightSearchParams,
): Promise<FlightOption[]> {
  const client = getClient();
  const response = await client.shopping.flightOffersSearch.get({
    originLocationCode: params.originIata,
    destinationLocationCode: params.destinationIata,
    departureDate: params.departureDateUtc,
    returnDate: params.returnDateUtc,
    adults: params.adults,
    currencyCode: params.currencyCode ?? 'USD',
    max: params.maxResults ?? 10,
  });

  return response.data
    .map(
      (offer): FlightOption => ({
        id: offer.id,
        outbound: buildLeg(offer.itineraries[0]),
        inbound: buildLeg(offer.itineraries[1]),
        totalPriceUSD: parseFloat(offer.price.grandTotal),
        currency: offer.price.currency,
        validatingCarrier: offer.validatingAirlineCodes?.[0] ?? '',
        seatsRemaining: offer.numberOfBookableSeats ?? null,
      }),
    )
    .sort((a, b) => a.totalPriceUSD - b.totalPriceUSD);
}

// ─── confirmOffer ─────────────────────────────────────────────────────────────
// TODO: wire to real booking in Phase 4

export async function confirmOffer(
  offerId: string,
  _flightOffers: unknown[],
): Promise<{ confirmed: boolean; offerId: string }> {
  console.log(`[amadeus] confirmOffer stub called for offerId=${offerId}`);
  return { confirmed: true, offerId };
}
