// ─── Shared TypeScript interfaces ───────────────────────────────────────────
// Pure types only — no server-only imports. Safe to use in client components.

// ── User preferences (persisted via checkpointer) ────────────────────────────

export interface UserPreferences {
  origin_city: string;
  favorite_team: string;
  selected_match_id: string | null; // 1-based index string e.g. "2"
  travel_dates: { checkIn: string; checkOut: string } | null; // "YYYY-MM-DD"
  spending_tier: 'luxury' | 'value' | 'budget' | null;
}

// ── Free-tier link output ─────────────────────────────────────────────────────

export interface FreeTierLinks {
  transportUrl: string;      // Google Flights search URL
  accommodationUrl: string;  // Booking.com search URL
  matchCity: string;
  checkIn: string;           // "YYYY-MM-DD"
  checkOut: string;          // "YYYY-MM-DD"
}

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
  origin: string;
  destination: string;
  departureUtc: string;
  arrivalUtc: string;
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
  checkIn: string;
  checkOut: string;
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
  summary: string;
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
  lat?: number;
  lng?: number;
  match_city?: string; // city name from geocoding, used by generate_links_node
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
  wasDowngraded: boolean;
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
  user_preferences?: UserPreferences;
}

export type ChatStreamEvent =
  | { type: 'status'; message: string }
  | { type: 'done'; reply: string; itinerary: FormattedItinerary | null; links: FreeTierLinks | null }
  | { type: 'error'; message: string };
