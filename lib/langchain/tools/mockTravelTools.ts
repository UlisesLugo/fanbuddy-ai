import { tool } from '@langchain/core/tools';
import { z } from 'zod/v3';

const MATCH_END_OFFSET_HOURS = 2;

export type MockMatch = {
  competition: string;
  venue: string;
  kickoff_iso: string;
  home_team: string;
  away_team: string;
  match_ticket_price_eur: number;
  time_confirmed_by_tv: boolean;
};

export type MockFlightOption = {
  id: string;
  label: string;
  depart_iso: string;
  arrive_iso: string;
  return_depart_iso: string;
  return_arrive_iso: string;
  carrier: string;
  price_eur: number;
};

export type MockHotelTier = {
  tier: 'luxury' | 'mid' | 'budget';
  name: string;
  price_eur: number;
};

/** Tool: discover fixtures for a team / window (mock). */
export const searchMatchesTool = tool(
  async ({
    team,
    date_from,
    date_to,
  }: {
    team: string;
    date_from: string;
    date_to: string;
  }) => {
    void date_from;
    void date_to;
    const normalized = team.toLowerCase();
    const isMadrid =
      normalized.includes('madrid') || normalized.includes('real');

    const result: MockMatch = isMadrid
      ? {
          competition: 'La Liga',
          venue: 'Santiago Bernabéu',
          kickoff_iso: '2026-04-22T19:00:00.000Z',
          home_team: 'Real Madrid',
          away_team: 'Barcelona',
          match_ticket_price_eur: 245,
          time_confirmed_by_tv: false,
        }
      : {
          competition: 'Premier League',
          venue: 'Emirates Stadium',
          kickoff_iso: '2026-04-20T15:00:00.000Z',
          home_team: 'Arsenal',
          away_team: 'Chelsea',
          match_ticket_price_eur: 180,
          time_confirmed_by_tv: true,
        };

    return JSON.stringify({ matches: [result] });
  },
  {
    name: 'search_matches',
    description:
      'Find upcoming football matches for a team within a date window. Returns fixtures with kickoff times and venue.',
    schema: z.object({
      team: z.string().describe('Favorite team name'),
      date_from: z.string().describe('ISO date start of search window'),
      date_to: z.string().describe('ISO date end of search window'),
    }),
  },
);

/** Round-trip options; ordering shifts on replan so validator loop can converge. */
export function mockFlightOptions(args: {
  origin: string;
  destination: string;
  kickoff_iso: string;
  revision_attempt: number;
}): MockFlightOption[] {
  const kickoff = new Date(args.kickoff_iso);
  const fmt = (d: Date) => d.toISOString();

  const arriveTight = new Date(kickoff.getTime() - 5 * 60 * 60 * 1000);
  const departTight = new Date(arriveTight.getTime() - 2.5 * 60 * 60 * 1000);

  const arriveSafe = new Date(kickoff.getTime() - 8 * 60 * 60 * 1000);
  const departSafe = new Date(arriveSafe.getTime() - 2.5 * 60 * 60 * 1000);

  const matchEnd = new Date(
    kickoff.getTime() + MATCH_END_OFFSET_HOURS * 60 * 60 * 1000,
  );

  const retDepartTight = new Date(matchEnd.getTime() + 3 * 60 * 60 * 1000);
  const retArriveTight = new Date(retDepartTight.getTime() + 2.5 * 60 * 60 * 1000);

  const retDepartSafe = new Date(matchEnd.getTime() + 5 * 60 * 60 * 1000);
  const retArriveSafe = new Date(retDepartSafe.getTime() + 2.5 * 60 * 60 * 1000);

  const retDepartMid = new Date(matchEnd.getTime() + 3.5 * 60 * 60 * 1000);
  const retArriveMid = new Date(retDepartMid.getTime() + 2.5 * 60 * 60 * 1000);

  const cheapTight: MockFlightOption = {
    id: 'opt-cheap-tight',
    label: `${args.origin} → ${args.destination} (value)`,
    depart_iso: fmt(departTight),
    arrive_iso: fmt(arriveTight),
    return_depart_iso: fmt(retDepartTight),
    return_arrive_iso: fmt(retArriveTight),
    carrier: 'Mock Air',
    price_eur: 120,
  };

  const mid: MockFlightOption = {
    id: 'opt-mid',
    label: `${args.origin} → ${args.destination} (standard)`,
    depart_iso: fmt(departSafe),
    arrive_iso: fmt(arriveSafe),
    return_depart_iso: fmt(retDepartMid),
    return_arrive_iso: fmt(retArriveMid),
    carrier: 'Mock Airways',
    price_eur: 185,
  };

  const safe: MockFlightOption = {
    id: 'opt-safe',
    label: `${args.origin} → ${args.destination} (fan-safe)`,
    depart_iso: fmt(departSafe),
    arrive_iso: fmt(arriveSafe),
    return_depart_iso: fmt(retDepartSafe),
    return_arrive_iso: fmt(retArriveSafe),
    carrier: 'Mock Premium',
    price_eur: 240,
  };

  const allOrdered: MockFlightOption[] = [cheapTight, mid, safe];
  const attempt = Math.max(0, args.revision_attempt);
  const rotate = attempt % allOrdered.length;
  return [...allOrdered.slice(rotate), ...allOrdered.slice(0, rotate)];
}

export const searchFlightsTool = tool(
  async ({
    origin,
    destination,
    kickoff_iso,
    revision_attempt,
  }: {
    origin: string;
    destination: string;
    kickoff_iso: string;
    revision_attempt: number;
  }) => {
    const options = mockFlightOptions({
      origin,
      destination,
      kickoff_iso,
      revision_attempt,
    });
    return JSON.stringify({ options });
  },
  {
    name: 'search_flights',
    description:
      'Search round-trip flights between origin city airport and destination. Use kickoff_iso from the selected match. Pass revision_attempt (0 first plan, increment when replanning).',
    schema: z.object({
      origin: z.string().describe('Origin city or airport code'),
      destination: z.string().describe('Destination city near the stadium'),
      kickoff_iso: z.string().describe('Match kickoff as ISO timestamp'),
      revision_attempt: z
        .number()
        .describe('0 on first search; increase when replanning after validation failure'),
    }),
  },
);

export const searchHotelsTool = tool(
  async ({
    city,
    check_in,
    check_out,
  }: {
    city: string;
    check_in: string;
    check_out: string;
  }) => {
    void check_in;
    void check_out;
    const tiers: MockHotelTier[] = [
      { tier: 'luxury', name: `Grand Stadium ${city}`, price_eur: 320 },
      { tier: 'mid', name: `City Center ${city}`, price_eur: 195 },
      { tier: 'budget', name: `Fan Lodge ${city}`, price_eur: 95 },
    ];
    return JSON.stringify({ city, tiers });
  },
  {
    name: 'search_hotels',
    description:
      'Search hotels in the host city for match weekend. Returns luxury, mid, and budget tiers with prices for the stay.',
    schema: z.object({
      city: z.string(),
      check_in: z.string().describe('Check-in date ISO'),
      check_out: z.string().describe('Check-out date ISO'),
    }),
  },
);

export { MATCH_END_OFFSET_HOURS };
