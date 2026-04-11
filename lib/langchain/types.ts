// ─── Shared TypeScript interfaces ───────────────────────────────────────────
// Pure types only — no server-only imports. Safe to use in client components.

// ── Formatted output (frontend-facing) ──────────────────────────────────────

export interface MatchCard {
  league: string;
  matchday: string;
  homeTeam: string;
  awayTeam: string;
  venue: string;
  kickoffUtc: string; // ISO-8601
  ticketPriceEur: number;
  tvConfirmed: boolean;
}

export interface FlightLeg {
  origin: string; // IATA e.g. "LHR"
  destination: string; // IATA e.g. "MAD"
  departureUtc: string; // ISO-8601
  arrivalUtc: string; // ISO-8601
  airline: string;
  direct: boolean;
  priceEur: number;
}

export interface FlightCard {
  outbound: FlightLeg;
  inbound: FlightLeg;
  totalPriceEur: number;
}

export interface HotelCard {
  name: string;
  city: string;
  checkIn: string; // "YYYY-MM-DD"
  checkOut: string; // "YYYY-MM-DD"
  nights: number;
  pricePerNightEur: number;
  totalEur: number;
  wasDowngraded: boolean;
}

export interface CostBreakdown {
  flightsEur: number;
  matchTicketEur: number;
  stayEur: number;
  totalEur: number;
}

export type ValidationStatus = 'OK' | 'PROVISIONAL' | 'FAILED';

export interface FormattedItinerary {
  match: MatchCard;
  flight: FlightCard;
  hotel: HotelCard;
  cost: CostBreakdown;
  validationStatus: ValidationStatus;
  validationNotes: string[];
  summary: string; // Friendly LLM-generated text reply
}

// ── Internal graph types (raw tool outputs) ──────────────────────────────────

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

export interface RawFlightOption {
  outbound: FlightLeg;
  inbound: FlightLeg;
}

export interface RawHotelOption {
  name: string;
  city: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  pricePerNightEur: number;
  totalEur: number;
  wasDowngraded: boolean; // true when budget pressure caused a lower-ranked hotel to be selected
}

export interface ItineraryData {
  match: RawMatchFixture | null;
  flight: RawFlightOption | null;
  hotel: RawHotelOption | null;
}

// ── API contract ─────────────────────────────────────────────────────────────

export interface ChatApiRequest {
  message: string;
  thread_id: string;
  user_preferences?: {
    origin_city: string;
    favorite_team: string;
  };
}

export type ChatStreamEvent =
  | { type: 'status'; message: string }
  | { type: 'done'; reply: string; itinerary: FormattedItinerary | null }
  | { type: 'error'; message: string };
