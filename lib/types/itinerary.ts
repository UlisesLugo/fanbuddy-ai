import { z } from 'zod/v3';

export const tripStatusSchema = z.enum(['PROVISIONAL', 'CONFIRMED']);

export const flightLegSchema = z.object({
  label: z.string(),
  depart_iso: z.string(),
  arrive_iso: z.string(),
  carrier: z.string(),
  price_eur: z.number(),
});

export const accommodationSchema = z.object({
  name: z.string(),
  nights: z.number(),
  tier: z.enum(['luxury', 'mid', 'budget']),
  price_eur: z.number(),
  status_label: z.string(),
});

export const mainEventSchema = z.object({
  competition: z.string(),
  venue: z.string(),
  kickoff_iso: z.string(),
  home_team: z.string(),
  away_team: z.string(),
  match_ticket_price_eur: z.number(),
  time_confirmed_by_tv: z.boolean(),
});

export const costBreakdownSchema = z.object({
  flights_eur: z.number(),
  match_tickets_eur: z.number(),
  stay_eur: z.number(),
  total_eur: z.number(),
  currency: z.literal('EUR'),
});

/** Full trip payload streamed to the chat UI (matches Live Itinerary sidebar fields). */
export const itinerarySchema = z.object({
  status: tripStatusSchema,
  flight_outbound: flightLegSchema,
  flight_return: flightLegSchema,
  accommodation: accommodationSchema,
  main_event: mainEventSchema,
  costs: costBreakdownSchema,
  planning_failed: z.boolean().optional(),
  validation_errors: z.array(z.string()).optional(),
  summary_line: z.string().optional(),
});

export type TripStatus = z.infer<typeof tripStatusSchema>;
export type Itinerary = z.infer<typeof itinerarySchema>;
export type FlightLeg = z.infer<typeof flightLegSchema>;

export function parseItinerary(data: unknown): Itinerary {
  return itinerarySchema.parse(data);
}
