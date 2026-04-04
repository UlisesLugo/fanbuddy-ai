import { ChatAnthropic } from '@langchain/anthropic';
import { AIMessage, BaseMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { Annotation, END, MemorySaver, START, StateGraph } from '@langchain/langgraph';
import { z } from 'zod';

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
  intent: Annotation<'plan_trip' | 'general_question' | 'modify_plan' | null>({
    reducer: (_, y) => y,
    default: () => null,
  }),
  direct_reply: Annotation<string | null>({
    reducer: (_, y) => y,
    default: () => null,
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

const searchFlightsTool = tool(
  async (_args: {
    origin: string;
    destination: string;
    date: string;
    return_date: string;
  }) => {
    void _args;
    const outbound: FlightLeg = {
      origin: 'LHR',
      destination: 'MAD',
      departureUtc: '2026-05-09T07:00:00Z',
      arrivalUtc: '2026-05-09T10:30:00Z',
      airline: 'British Airways',
      direct: true,
      priceEur: 60,
    };
    const inbound: FlightLeg = {
      origin: 'MAD',
      destination: 'LHR',
      departureUtc: '2026-05-12T14:00:00Z',
      arrivalUtc: '2026-05-12T15:30:00Z',
      airline: 'British Airways',
      direct: true,
      priceEur: 60,
    };
    const result: RawFlightOption = { outbound, inbound };
    return JSON.stringify(result);
  },
  {
    name: 'search_flights',
    description:
      'Search round-trip flights between two cities. Returns the cheapest available option.',
    schema: z.object({
      origin: z.string().describe('Origin city or IATA code'),
      destination: z.string().describe('Destination city or IATA code'),
      date: z.string().describe('Outbound departure date YYYY-MM-DD'),
      return_date: z.string().describe('Return departure date YYYY-MM-DD'),
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
// Classifies user intent to avoid running the full planning pipeline for simple
// questions. Uses withStructuredOutput for a reliable enum response.

const IntentSchema = z.object({
  intent: z.enum(['plan_trip', 'general_question', 'modify_plan']),
});

async function router_node(state: State): Promise<Partial<State>> {
  const lastMessage = state.messages[state.messages.length - 1];
  const structured = model.withStructuredOutput(IntentSchema);

  const result = await structured.invoke(
    `You are a classifier for FanBuddy.AI, a football trip planning app.
Classify the user's intent into exactly one category:
- plan_trip: wants to plan a new football trip, find matches, search for flights or hotels, see ticket options
- modify_plan: wants to change details of an existing trip plan (different dates, hotel, flight, etc.)
- general_question: asking a general question, chatting, or anything that does NOT require a full trip plan

User message: "${lastMessage.content}"`,
  );

  return { intent: result.intent };
}

function route_after_router(
  state: State,
): 'search_matches_node' | 'direct_answer_node' {
  if (state.intent === 'plan_trip' || state.intent === 'modify_plan') {
    return 'search_matches_node';
  }
  return 'direct_answer_node';
}

// ─── Node: direct_answer_node ─────────────────────────────────────────────────
// Handles general questions using full conversation history for context.

async function direct_answer_node(state: State): Promise<Partial<State>> {
  const response = await model.invoke([
    new HumanMessage(
      'You are FanBuddy.AI, a helpful and enthusiastic assistant for football trip planning. Answer concisely and helpfully. You have access to the full conversation history.',
    ),
    ...state.messages,
  ]);

  const reply =
    typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

  return {
    direct_reply: reply,
    // Append the AI reply to conversation history
    messages: [new AIMessage(reply)],
  };
}

// ─── Node: search_matches_node ────────────────────────────────────────────────
// Directly invokes the tool — no LLM routing overhead for deterministic calls.

async function search_matches_node(state: State): Promise<Partial<State>> {
  const raw = await searchMatchesTool.invoke({
    team: state.user_preferences.favorite_team,
    date_from: '2026-04-03',
    date_to: '2026-06-03',
  });
  const match = JSON.parse(extractToolString(raw)) as RawMatchFixture;

  return {
    itinerary: {
      match,
      flight: state.itinerary?.flight ?? null,
      hotel: state.itinerary?.hotel ?? null,
    },
  };
}

// ─── Node: plan_travel_node ───────────────────────────────────────────────────
// Directly invokes flight + hotel tools and applies the budget check.

const BUDGET_BASELINE_EUR = 800;

async function plan_travel_node(state: State): Promise<Partial<State>> {
  const match = state.itinerary?.match;

  // Derive dates from match kickoff: arrive day before, leave 2 days after
  const kickoff = match ? new Date(match.kickoffUtc) : new Date('2026-05-10');
  const arrivalDate = new Date(kickoff);
  arrivalDate.setDate(arrivalDate.getDate() - 1);
  const departureDate = new Date(kickoff);
  departureDate.setDate(departureDate.getDate() + 2);

  const flightDateStr = arrivalDate.toISOString().slice(0, 10);
  const returnDateStr = departureDate.toISOString().slice(0, 10);
  const city = match?.venue.includes('Bernabéu') ? 'Madrid' : 'Barcelona';

  const flightRaw = await searchFlightsTool.invoke({
    origin: state.user_preferences.origin_city,
    destination: city,
    date: flightDateStr,
    return_date: returnDateStr,
  });
  const flight = JSON.parse(extractToolString(flightRaw)) as RawFlightOption;

  const hotelRaw = await searchHotelsTool.invoke({
    city,
    check_in: flightDateStr,
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

// ─── Conditional Edge ─────────────────────────────────────────────────────────

function shouldRetryOrFinish(
  state: State,
): 'plan_travel_node' | 'formatter_node' {
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
  .addNode('direct_answer_node', direct_answer_node)
  .addNode('search_matches_node', search_matches_node)
  .addNode('plan_travel_node', plan_travel_node)
  .addNode('validator_node', validator_node)
  .addNode('formatter_node', formatter_node)
  .addEdge(START, 'router_node')
  .addConditionalEdges('router_node', route_after_router, {
    search_matches_node: 'search_matches_node',
    direct_answer_node: 'direct_answer_node',
  })
  .addEdge('search_matches_node', 'plan_travel_node')
  .addEdge('plan_travel_node', 'validator_node')
  .addConditionalEdges('validator_node', shouldRetryOrFinish, {
    plan_travel_node: 'plan_travel_node',
    formatter_node: 'formatter_node',
  })
  .addEdge('formatter_node', END)
  .addEdge('direct_answer_node', END)
  .compile({ checkpointer });

export { graph };
export type { State as GraphStateType };
