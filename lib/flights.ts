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
