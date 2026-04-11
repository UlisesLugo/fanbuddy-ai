import { ChatAnthropic } from '@langchain/anthropic';
import { AIMessage, BaseMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { Annotation, END, MemorySaver, START, StateGraph } from '@langchain/langgraph';
import { z } from 'zod';

import {
  geocodeVenue,
  resolveTeamId,
  searchFixtures,
  toFanBuddyStatus,
} from '../football-data';

import { searchRoundTrip, type FlightOption } from '../amadeus-flights';

import type {
  FlightLeg,
  FormattedItinerary,
  ItineraryData,
  RawFlightOption,
  RawHotelOption,
  RawMatchFixture,
} from './types';

// Helper: tool.invoke() may return string or ToolMessage depending on @langchain/core version
function extractToolString(result: unknown): string {
  if (typeof result === 'string') return result;
  if (result instanceof ToolMessage) {
    return typeof result.content === 'string'
      ? result.content
      : JSON.stringify(result.content);
  }
  return JSON.stringify(result);
}

// ─── Model ────────────────────────────────────────────────────────────────────

const model = new ChatAnthropic({
  model: 'claude-sonnet-4-20250514',
  temperature: 0,
});

// ─── Graph State ──────────────────────────────────────────────────────────────

const GraphState = Annotation.Root({
  // Conversational history — user messages + AI replies only (no tool noise)
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  itinerary: Annotation<ItineraryData | null>({
    reducer: (_, y) => y,
    default: () => null,
  }),
  validation_errors: Annotation<string[]>({
    reducer: (_, y) => y,
    default: () => [],
  }),
  user_preferences: Annotation<{ origin_city: string; favorite_team: string }>({
    reducer: (_, y) => y,
    default: () => ({ origin_city: '', favorite_team: '' }),
  }),
  attempt_count: Annotation<number>({
    reducer: (_, y) => y,
    default: () => 0,
  }),
  formatted: Annotation<FormattedItinerary | null>({
    reducer: (_, y) => y,
    default: () => null,
  }),
  direct_reply: Annotation<string | null>({
    reducer: (_, y) => y,
    default: () => null,
  }),
  flight_results: Annotation<FlightOption[] | null>({
    reducer: (_, y) => y,
    default: () => null,
  }),
  flight_results_cursor: Annotation<number>({
    reducer: (_, y) => y,
    default: () => 0,
  }),
});

type State = typeof GraphState.State;

// ─── Mock Tools ───────────────────────────────────────────────────────────────

const searchMatchesTool = tool(
  async ({ team }: { team: string; date_from: string; date_to: string }) => {
    const isHomeTeamMadrid =
      team.toLowerCase().includes('madrid') ||
      team.toLowerCase().includes('real');
    const fixture: RawMatchFixture = {
      id: 'match-001',
      league: 'La Liga',
      matchday: 'Matchday 32',
      homeTeam: isHomeTeamMadrid ? 'REAL MADRID' : 'BARCELONA',
      awayTeam: isHomeTeamMadrid ? 'BARCELONA' : 'REAL MADRID',
      venue: 'Santiago Bernabéu',
      kickoffUtc: '2026-05-10T21:00:00Z',
      ticketPriceEur: 245,
      tvConfirmed: false,
    };
    return JSON.stringify(fixture);
  },
  {
    name: 'search_matches',
    description:
      'Search upcoming match fixtures for a football team within a date range.',
    schema: z.object({
      team: z.string().describe('The team name to search fixtures for'),
      date_from: z.string().describe('Start date in ISO format YYYY-MM-DD'),
      date_to: z.string().describe('End date in ISO format YYYY-MM-DD'),
    }),
  },
);


const searchHotelsTool = tool(
  async (_args: {
    city: string;
    check_in: string;
    check_out: string;
    max_price_per_night: number;
  }) => {
    void _args;
    const result: RawHotelOption = {
      name: 'Pestana CR7 Madrid',
      city: 'Madrid',
      checkIn: '2026-05-09',
      checkOut: '2026-05-12',
      nights: 3,
      pricePerNightEur: 95,
      totalEur: 285,
    };
    return JSON.stringify(result);
  },
  {
    name: 'search_hotels',
    description:
      'Search hotels near the stadium for the given dates and budget.',
    schema: z.object({
      city: z.string().describe('City where the match is held'),
      check_in: z.string().describe('Check-in date YYYY-MM-DD'),
      check_out: z.string().describe('Check-out date YYYY-MM-DD'),
      max_price_per_night: z
        .number()
        .describe('Maximum price per night in EUR'),
    }),
  },
);

const downgradeHotelTool = tool(
  async (_args: { city: string; check_in: string; check_out: string }) => {
    void _args;
    const result: RawHotelOption = {
      name: 'Hotel Moderno Madrid',
      city: 'Madrid',
      checkIn: '2026-05-09',
      checkOut: '2026-05-12',
      nights: 3,
      pricePerNightEur: 65,
      totalEur: 195,
    };
    return JSON.stringify(result);
  },
  {
    name: 'downgrade_hotel',
    description:
      'Find a more budget-friendly hotel when the current selection exceeds the cost baseline.',
    schema: z.object({
      city: z.string().describe('City where the match is held'),
      check_in: z.string().describe('Check-in date YYYY-MM-DD'),
      check_out: z.string().describe('Check-out date YYYY-MM-DD'),
    }),
  },
);

// ─── Node: router_node ────────────────────────────────────────────────────────
// Classifies user intent AND extracts travel preferences from the message in a
// single withStructuredOutput call — no extra LLM overhead.

const RouterSchema = z.object({
  origin_city: z
    .string()
    .nullable()
    .describe(
      'City the user is travelling FROM (e.g. "London", "Berlin"). Null if not mentioned.',
    ),
  favorite_team: z
    .string()
    .nullable()
    .describe(
      'Football club the user wants to watch (e.g. "Barcelona", "Real Madrid"). Null if not mentioned.',
    ),
});

async function router_node(state: State): Promise<Partial<State>> {
  const lastMessage = state.messages[state.messages.length - 1];
  const structured = model.withStructuredOutput(RouterSchema);

  const result = await structured.invoke(
    `You are an information extractor for FanBuddy.AI, a football trip planning app.

Extract the following from the user's message if present:
- origin_city: the city the user is travelling FROM (e.g. "from London", "leaving Berlin"). Set null if not mentioned.
- favorite_team: the football club the user wants to watch (e.g. "watch Barcelona", "Real Madrid game"). Set null if not mentioned.

User message: "${lastMessage.content}"`,
  );

  // Only overwrite a preference when the user explicitly mentions it;
  // otherwise keep the value that was persisted from a previous turn.
  return {
    user_preferences: {
      origin_city: result.origin_city ?? state.user_preferences.origin_city,
      favorite_team: result.favorite_team ?? state.user_preferences.favorite_team,
    },
  };
}

// ─── Node: search_matches_node ────────────────────────────────────────────────
// Calls football-data.org directly — no LLM routing overhead for deterministic calls.

async function search_matches_node(state: State): Promise<Partial<State>> {
  const { origin_city, favorite_team: teamName } = state.user_preferences;

  // Gate: ask for whichever piece of data is still missing
  if (!teamName && !origin_city) {
    const reply = "To get started, tell me which team you'd like to watch and the city you're travelling from.";
    return { direct_reply: reply, messages: [new AIMessage(reply)] };
  }
  if (!teamName) {
    const reply = `Got it — travelling from ${origin_city}. Which team would you like to watch?`;
    return { direct_reply: reply, messages: [new AIMessage(reply)] };
  }
  if (!origin_city) {
    const reply = `Great choice! What city are you travelling from to watch ${teamName}?`;
    return { direct_reply: reply, messages: [new AIMessage(reply)] };
  }

  const teamId = resolveTeamId(teamName);

  if (!teamId) {
    const reply = `Sorry, ${teamName} isn't supported yet. Try a club like Real Madrid, Barcelona, Liverpool, or Manchester City.`;
    return { direct_reply: reply, messages: [new AIMessage(reply)] };
  }

  // Search window: 2 days from now → 90 days out
  // Matches sooner than 2 days away cannot be planned (flight lead-time constraint).
  const today = new Date();
  const minPlanDate = new Date(today);
  minPlanDate.setDate(today.getDate() + 2);
  const ninetyDaysOut = new Date(today);
  ninetyDaysOut.setDate(today.getDate() + 90);
  const dateFrom = minPlanDate.toISOString().slice(0, 10);
  const dateTo = ninetyDaysOut.toISOString().slice(0, 10);

  try {
    const fixtures = await searchFixtures(teamId, dateFrom, dateTo);

    if (fixtures.length === 0) {
      return {
        itinerary: {
          match: null,
          flight: state.itinerary?.flight ?? null,
          hotel: state.itinerary?.hotel ?? null,
        },
      };
    }

    // Pick the nearest upcoming fixture
    const fixture = fixtures[0];
    const venueName = fixture.venue ?? `${fixture.homeTeam.name} Stadium`;
    const geo = await geocodeVenue(venueName);

    const match: RawMatchFixture = {
      id: String(fixture.id),
      league: fixture.competition.name,
      matchday: `Matchday`,
      homeTeam: fixture.homeTeam.name,
      awayTeam: fixture.awayTeam.name,
      venue: venueName,
      kickoffUtc: fixture.utcDate, // ISO 8601 UTC — required by validator_node
      ticketPriceEur: 0, // placeholder; tickets API not yet integrated
      tvConfirmed: toFanBuddyStatus(fixture.status) === 'CONFIRMED',
      ...(geo ? { lat: geo.lat, lng: geo.lng, nearestAirportCode: geo.nearestAirportCode } : {}),
    };

    return {
      itinerary: {
        match,
        flight: state.itinerary?.flight ?? null,
        hotel: state.itinerary?.hotel ?? null,
      },
    };
  } catch (err) {
    console.error('[search_matches_node] football-data.org call failed:', err);
    // Degrade gracefully — return empty match so the graph can surface the error
    return {
      itinerary: {
        match: null,
        flight: state.itinerary?.flight ?? null,
        hotel: state.itinerary?.hotel ?? null,
      },
    };
  }
}

// ─── Node: plan_travel_node ───────────────────────────────────────────────────
// Fetches flights from Amadeus (first run) or advances the cursor through cached
// results (retry). Applies the hotel budget check on every run.

const BUDGET_BASELINE_EUR = 800;

async function plan_travel_node(state: State): Promise<Partial<State>> {
  const match = state.itinerary?.match;

  // Guard: match must exist to derive travel dates
  if (!match) {
    return {
      validation_errors: ['No match data available — cannot plan travel'],
      attempt_count: 3, // exit retry loop
    };
  }

  // ── Date derivation ────────────────────────────────────────────────────────
  const kickoff = new Date(match.kickoffUtc);
  const matchEndMs = kickoff.getTime() + 105 * 60 * 1000; // kickoff + 105 min

  const departureDate = new Date(kickoff);
  departureDate.setDate(departureDate.getDate() - 1); // arrive 1 day before
  const returnDate = new Date(matchEndMs);
  returnDate.setDate(returnDate.getDate() + 1); // depart 1 day after match end

  const departureDateStr = departureDate.toISOString().slice(0, 10);
  const returnDateStr = returnDate.toISOString().slice(0, 10);

  // ── IATA codes ─────────────────────────────────────────────────────────────
  const originGeo = await geocodeVenue(state.user_preferences.origin_city);
  const originIata = originGeo?.nearestAirportCode ?? 'UNKNOWN';
  const destinationIata = match.nearestAirportCode ?? 'UNKNOWN';

  // ── Flight selection ───────────────────────────────────────────────────────
  let flightResults = state.flight_results;
  let cursor = state.flight_results_cursor;

  if (flightResults === null) {
    // First run — fetch from Amadeus and cache results
    try {
      flightResults = await searchRoundTrip({
        originIata,
        destinationIata,
        departureDateUtc: departureDateStr,
        returnDateUtc: returnDateStr,
        adults: 1,
      });
    } catch (err) {
      console.error('[plan_travel_node] Amadeus search failed:', err);
      const detail =
        err &&
        typeof err === 'object' &&
        'description' in err &&
        Array.isArray((err as { description: unknown }).description)
          ? ((err as { description: Array<{ detail?: string }> }).description[0]?.detail ?? 'unknown error')
          : String(err);
      return {
        flight_results: [],
        flight_results_cursor: 0,
        validation_errors: [`Flight search failed — ${detail}`],
        itinerary: {
          match: state.itinerary?.match ?? null,
          flight: null,
          hotel: state.itinerary?.hotel ?? null,
        },
        attempt_count: 3, // exit retry loop
      };
    }
    cursor = 0;
  } else {
    // Retry — shouldRetryOrFinish already decided to loop back, advance cursor
    cursor += 1;
  }

  // ── Cursor exhaustion ──────────────────────────────────────────────────────
  if (flightResults.length === 0 || cursor >= flightResults.length) {
    console.warn('[plan_travel_node] NO_VALID_FLIGHTS — cursor exhausted at index', cursor);
    return {
      flight_results: flightResults,
      flight_results_cursor: cursor,
      itinerary: {
        match: state.itinerary?.match ?? null,
        flight: null,
        hotel: state.itinerary?.hotel ?? null,
      },
      attempt_count: state.attempt_count + 1,
    };
  }

  // ── Map FlightOption → RawFlightOption ────────────────────────────────────
  const chosen = flightResults[cursor];
  const pricePerLeg = chosen.totalPriceUSD / 2; // TODO: USD→EUR conversion

  const flight: RawFlightOption = {
    outbound: {
      origin: chosen.outbound.origin,
      destination: chosen.outbound.destination,
      departureUtc: chosen.outbound.departureUtc,
      arrivalUtc: chosen.outbound.arrivalUtc,
      airline: `${chosen.outbound.carrierCode} ${chosen.outbound.flightNumber}`,
      direct: chosen.outbound.stops === 0,
      priceEur: pricePerLeg,
    },
    inbound: {
      origin: chosen.inbound.origin,
      destination: chosen.inbound.destination,
      departureUtc: chosen.inbound.departureUtc,
      arrivalUtc: chosen.inbound.arrivalUtc,
      airline: `${chosen.inbound.carrierCode} ${chosen.inbound.flightNumber}`,
      direct: chosen.inbound.stops === 0,
      priceEur: pricePerLeg,
    },
  };

  // ── Hotel logic (unchanged) ────────────────────────────────────────────────
  const city = match.venue?.includes('Bernabéu') ? 'Madrid' : 'Barcelona';

  const hotelRaw = await searchHotelsTool.invoke({
    city,
    check_in: departureDateStr,
    check_out: returnDateStr,
    max_price_per_night: 120,
  });
  let hotel = JSON.parse(extractToolString(hotelRaw)) as RawHotelOption;

  // Deterministic budget check — downgrade hotel if total exceeds baseline
  const flightTotal = flight.outbound.priceEur + flight.inbound.priceEur;
  if (flightTotal + hotel.totalEur > BUDGET_BASELINE_EUR) {
    const downgraded = await downgradeHotelTool.invoke({
      city: hotel.city,
      check_in: hotel.checkIn,
      check_out: hotel.checkOut,
    });
    hotel = JSON.parse(extractToolString(downgraded)) as RawHotelOption;
  }

  return {
    flight_results: flightResults,
    flight_results_cursor: cursor,
    itinerary: {
      match: state.itinerary?.match ?? null,
      flight,
      hotel,
    },
    attempt_count: state.attempt_count + 1,
  };
}

// ─── Node: validator_node ─────────────────────────────────────────────────────

async function validator_node(state: State): Promise<Partial<State>> {
  const errors: string[] = [];
  const itinerary = state.itinerary;

  if (!itinerary?.match || !itinerary?.flight || !itinerary?.hotel) {
    return {
      validation_errors: [
        'Incomplete itinerary — missing match, flight, or hotel data',
      ],
    };
  }

  const kickoffMs = new Date(itinerary.match.kickoffUtc).getTime();
  const arrivalMs = new Date(itinerary.flight.outbound.arrivalUtc).getTime();
  const departureMs = new Date(itinerary.flight.inbound.departureUtc).getTime();
  const matchEndMs = kickoffMs + 2 * 60 * 60 * 1000;

  const arrivalBufferHours = (kickoffMs - arrivalMs) / (1000 * 60 * 60);
  const departureBufferHours = (departureMs - matchEndMs) / (1000 * 60 * 60);

  if (arrivalBufferHours < 6) {
    errors.push(
      `Flight arrives too late — buffer is ${arrivalBufferHours.toFixed(1)}h, minimum 6h required before kickoff`,
    );
  }

  if (departureBufferHours < 4) {
    errors.push(
      `Flight departs too early — buffer is ${departureBufferHours.toFixed(1)}h, minimum 4h required after match end`,
    );
  }

  if (!itinerary.match.tvConfirmed) {
    errors.push('TV schedule unconfirmed — marked PROVISIONAL');
  }

  return { validation_errors: errors };
}

// ─── Node: formatter_node ─────────────────────────────────────────────────────
// Pure TypeScript data assembly — only calls LLM once for the summary string.

async function formatter_node(state: State): Promise<Partial<State>> {
  const { itinerary, validation_errors: errors } = state;

  if (!itinerary?.match || !itinerary?.flight || !itinerary?.hotel) {
    return { formatted: null };
  }

  const hasHardErrors = errors.some((e) => !e.includes('PROVISIONAL'));
  const isProvisional = errors.some((e) => e.includes('PROVISIONAL'));
  const validationStatus = hasHardErrors
    ? 'FAILED'
    : isProvisional
      ? 'PROVISIONAL'
      : 'OK';

  const flightsEur =
    itinerary.flight.outbound.priceEur + itinerary.flight.inbound.priceEur;
  const matchTicketEur = itinerary.match.ticketPriceEur;
  const stayEur = itinerary.hotel.totalEur;
  const totalEur = flightsEur + matchTicketEur + stayEur;
  const wasDowngraded = itinerary.hotel.name.toLowerCase().includes('moderno');

  // Single LLM call — only for the natural-language summary
  const summaryResponse = await model.invoke(
    `You are FanBuddy.AI. Write a friendly, enthusiastic 1-2 sentence summary for this football trip.
Match: ${itinerary.match.homeTeam} vs ${itinerary.match.awayTeam} at ${itinerary.match.venue} on ${new Date(itinerary.match.kickoffUtc).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.
Flight: ${itinerary.flight.outbound.airline}, €${flightsEur}. Hotel: ${itinerary.hotel.name} (${itinerary.hotel.nights} nights, €${stayEur}). Tickets: €${matchTicketEur}. Total: €${totalEur}.${validationStatus === 'PROVISIONAL' ? ' Note: TV schedule is unconfirmed, so the matchday is provisional.' : ''}`,
  );
  const summary =
    typeof summaryResponse.content === 'string'
      ? summaryResponse.content
      : JSON.stringify(summaryResponse.content);

  const formatted: FormattedItinerary = {
    match: {
      league: itinerary.match.league,
      matchday: itinerary.match.matchday,
      homeTeam: itinerary.match.homeTeam,
      awayTeam: itinerary.match.awayTeam,
      venue: itinerary.match.venue,
      kickoffUtc: itinerary.match.kickoffUtc,
      ticketPriceEur: itinerary.match.ticketPriceEur,
      tvConfirmed: itinerary.match.tvConfirmed,
    },
    flight: {
      outbound: itinerary.flight.outbound,
      inbound: itinerary.flight.inbound,
      totalPriceEur: flightsEur,
    },
    hotel: {
      name: itinerary.hotel.name,
      city: itinerary.hotel.city,
      checkIn: itinerary.hotel.checkIn,
      checkOut: itinerary.hotel.checkOut,
      nights: itinerary.hotel.nights,
      pricePerNightEur: itinerary.hotel.pricePerNightEur,
      totalEur: stayEur,
      wasDowngraded,
    },
    cost: { flightsEur, matchTicketEur, stayEur, totalEur },
    validationStatus,
    validationNotes: errors,
    summary,
  };

  return {
    formatted,
    // Append the summary as AI message to maintain conversation context
    messages: [new AIMessage(summary)],
  };
}

// ─── Conditional Edges ────────────────────────────────────────────────────────

// Short-circuit to END if search_matches_node returned a prompt (missing data / unsupported team).
function afterSearchMatches(state: State): 'plan_travel_node' | typeof END {
  return state.direct_reply ? END : 'plan_travel_node';
}

function shouldRetryOrFinish(
  state: State,
): 'plan_travel_node' | 'formatter_node' {
  // Cursor exhausted — no more cached flights to try
  if (
    state.flight_results !== null &&
    state.flight_results_cursor >= state.flight_results.length
  ) {
    return 'formatter_node';
  }
  const hardErrors = state.validation_errors.filter(
    (e) => !e.includes('PROVISIONAL'),
  );
  if (hardErrors.length > 0 && state.attempt_count < 3) {
    return 'plan_travel_node';
  }
  return 'formatter_node';
}

// ─── Graph Assembly ───────────────────────────────────────────────────────────

const checkpointer = new MemorySaver();

const graph = new StateGraph(GraphState)
  .addNode('router_node', router_node)
  .addNode('search_matches_node', search_matches_node)
  .addNode('plan_travel_node', plan_travel_node)
  .addNode('validator_node', validator_node)
  .addNode('formatter_node', formatter_node)
  .addEdge(START, 'router_node')
  .addEdge('router_node', 'search_matches_node')
  .addConditionalEdges('search_matches_node', afterSearchMatches, {
    plan_travel_node: 'plan_travel_node',
    [END]: END,
  })
  .addEdge('plan_travel_node', 'validator_node')
  .addConditionalEdges('validator_node', shouldRetryOrFinish, {
    plan_travel_node: 'plan_travel_node',
    formatter_node: 'formatter_node',
  })
  .addEdge('formatter_node', END)
  .compile({ checkpointer });

export { graph };
export type { State as GraphStateType };
