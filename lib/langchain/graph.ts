import { ChatAnthropic } from '@langchain/anthropic';
import { AIMessage, BaseMessage } from '@langchain/core/messages';
import {
  Annotation,
  END,
  MemorySaver,
  START,
  StateGraph,
} from '@langchain/langgraph';
import { z } from 'zod';

import {
  geocodeVenue,
  resolveTeamId,
  searchFixtures,
  toFanBuddyStatus,
} from '../football-data';

import { searchRoundTrip, type FlightOption } from '../flights';
import { searchHotels, type HotelOption } from '../hotels';

import type {
  ConversationStage,
  FixtureSummary,
  FormattedItinerary,
  FreeTierLinks,
  ItineraryData,
  RawFlightOption,
  RawHotelOption,
  RawMatchFixture,
  UserPreferences,
} from './types';

import {
  buildAccommodationUrl,
  buildTransportUrl,
  formatFixtureList,
  recommendTravelDates,
} from './free-tier';

import { ActivitiesDataSchema, buildActivitiesPrompt } from './activities';
import type { ActivitiesData } from './types';

// ─── Model ────────────────────────────────────────────────────────────────────

const model = new ChatAnthropic({
  model: 'claude-sonnet-4-20250514',
  temperature: 0,
});

const TRIP_COMPLETE_MSG =
  'Your trip is already planned! Refresh the page to start planning a new one.';

// ─── Graph State ──────────────────────────────────────────────────────────────

const GraphState = Annotation.Root({
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
  user_preferences: Annotation<UserPreferences>({
    reducer: (_, y) => y,
    default: () => ({
      origin_city: '',
      favorite_team: '',
      selected_match_id: null,
      travel_dates: null,
      spending_tier: null,
    }),
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
  free_tier_links: Annotation<FreeTierLinks | null>({
    reducer: (_, y) => y,
    default: () => null,
  }),
  wants_date_recommendation: Annotation<boolean>({
    reducer: (_, y) => y,
    default: () => false,
  }),
  flight_results: Annotation<FlightOption[] | null>({
    reducer: (_, y) => y,
    default: () => null,
  }),
  flight_results_cursor: Annotation<number>({
    reducer: (_, y) => y,
    default: () => 0,
  }),
  hotel_results: Annotation<HotelOption[] | null>({
    reducer: (_, y) => y,
    default: () => null,
  }),
  hotel_results_cursor: Annotation<number>({
    reducer: (_, y) => y,
    default: () => 0,
  }),
  fixture_list: Annotation<FixtureSummary[] | null>({
    reducer: (_, y) => y,
    default: () => null,
  }),
  activities: Annotation<ActivitiesData | null>({
    reducer: (_, y) => y,
    default: () => null,
  }),
  conversation_stage: Annotation<ConversationStage>({
    reducer: (_, y) => y,
    default: () => 'collecting_team' as ConversationStage,
  }),
  trip_complete: Annotation<boolean>({
    reducer: (_, y) => y,
    default: () => false,
  }),
});

type State = typeof GraphState.State;

// ─── Node: router_node ────────────────────────────────────────────────────────
// Classifies user intent AND extracts travel preferences from the message in a
// single withStructuredOutput call — no extra LLM overhead.

const RouterSchema = z.object({
  origin_city: z
    .string()
    .nullable()
    .describe(
      'City the user is travelling FROM (e.g. "from London", "leaving Berlin"). Null if not mentioned.',
    ),
  favorite_team: z
    .string()
    .nullable()
    .describe(
      'Football club the user wants to watch (e.g. "watch Barcelona", "Real Madrid game"). Null if not mentioned.',
    ),
  selected_match_id: z
    .string()
    .nullable()
    .describe(
      'The 1-based index of the match the user selected from a numbered list (e.g. "I\'ll take match 3" → "3", "the second one" → "2"). Null if the user has not selected a match.',
    ),
  spending_tier: z
    .enum(['luxury', 'value', 'budget'])
    .nullable()
    .describe(
      'Spending preference: "luxury" (premium/high-end), "value" (quality-price balance), "budget" (cheapest option). Null if not mentioned.',
    ),
  travel_dates: z
    .object({
      checkIn: z.string().describe('Check-in date in YYYY-MM-DD format'),
      checkOut: z.string().describe('Check-out date in YYYY-MM-DD format'),
    })
    .nullable()
    .describe('Travel dates if the user provides specific dates. Null if not mentioned.'),
  wants_date_recommendation: z
    .boolean()
    .describe(
      'True if the user asks the agent to recommend dates or says "you decide" / "give me a recommendation". False otherwise.',
    ),
  conversation_stage: z
    .enum([
      'collecting_team',
      'selecting_match',
      'collecting_preferences',
      'confirming_dates',
      'trip_complete',
    ])
    .describe(
      'Stage of the trip-planning conversation based on what is already known. ' +
      'Use collecting_team if favorite_team is unknown. ' +
      'Use selecting_match if team is known and fixtures are loaded but no match is selected. ' +
      'Use collecting_preferences if match is selected but origin_city or spending_tier is missing. ' +
      'Use confirming_dates if match and preferences are known but travel_dates is missing. ' +
      'Use trip_complete if trip_complete context value is true.',
    ),
});

async function router_node(state: State): Promise<Partial<State>> {
  const lastMessage = state.messages[state.messages.length - 1];
  const structured = model.withStructuredOutput(RouterSchema);

  // Include the last AI message so the extractor can resolve ambiguous replies
  // (e.g. "Barcelona" after "What city are you travelling from?" → origin_city, not team).
  const priorAiMessages = state.messages.filter((m) => m._getType() === 'ai');
  const lastAiMessage = priorAiMessages[priorAiMessages.length - 1];
  const contextLine = lastAiMessage
    ? `\nConversation context — the assistant just asked: "${lastAiMessage.content}"\n`
    : '';

  const stateContext = `
Current session state (use this to classify conversation_stage):
- favorite_team: ${state.user_preferences.favorite_team || 'UNKNOWN'}
- fixture_list loaded: ${state.fixture_list?.length ? `yes (${state.fixture_list.length} fixtures)` : 'no'}
- selected_match_id: ${state.user_preferences.selected_match_id ?? 'UNKNOWN'}
- origin_city: ${state.user_preferences.origin_city || 'UNKNOWN'}
- spending_tier: ${state.user_preferences.spending_tier ?? 'UNKNOWN'}
- travel_dates: ${state.user_preferences.travel_dates ? `${state.user_preferences.travel_dates.checkIn} to ${state.user_preferences.travel_dates.checkOut}` : 'UNKNOWN'}
- trip_complete: ${state.trip_complete}
`;

  const result = await structured.invoke(
    `You are an information extractor for FanBuddy.AI, a football trip planning app.
${contextLine}
${stateContext}
Extract the following from the user's message if present:
- origin_city: the city the user is travelling FROM. Null if not mentioned. Use the conversation context to resolve ambiguity — if the assistant just asked for the origin city and the user replied with a place name (even one that shares a name with a football club), treat it as origin_city.
- favorite_team: the football club the user wants to watch. Null if not mentioned. Only extract this if the user is clearly referring to a team, not answering a question about where they live or travel from.
- selected_match_id: a 1-based index if the user picks a match from a numbered list (e.g. "match 2" → "2"). Null if not mentioned.
- spending_tier: "luxury", "value", or "budget" if the user expresses a spending preference. Null if not mentioned.
- travel_dates: { checkIn, checkOut } in YYYY-MM-DD format if the user provides specific travel dates. Null if not mentioned.
- wants_date_recommendation: true ONLY if the user explicitly asks you to recommend dates or says "you decide". false otherwise.
- conversation_stage: classify using the session state provided above.

User message: "${lastMessage.content}"`,
  );

  const stage = result.conversation_stage;
  const isComplete = stage === 'trip_complete';

  return {
    user_preferences: {
      origin_city: result.origin_city ?? state.user_preferences.origin_city,
      favorite_team: result.favorite_team ?? state.user_preferences.favorite_team,
      selected_match_id: result.selected_match_id ?? state.user_preferences.selected_match_id ?? null,
      travel_dates: result.travel_dates ?? state.user_preferences.travel_dates ?? null,
      spending_tier: result.spending_tier ?? state.user_preferences.spending_tier ?? null,
    },
    wants_date_recommendation: result.wants_date_recommendation,
    conversation_stage: stage,
    trip_complete: isComplete || state.trip_complete,
    ...(isComplete ? { direct_reply: TRIP_COMPLETE_MSG, messages: [new AIMessage(TRIP_COMPLETE_MSG)] } : {}),
  };
}

// ─── Node: list_matches_node ──────────────────────────────────────────────────
// Shows the next 5 upcoming fixtures when no match is selected yet.
// When a match is already selected, geocodes the venue and sets itinerary.match.

async function list_matches_node(state: State): Promise<Partial<State>> {
  const { favorite_team: teamName, selected_match_id } = state.user_preferences;

  if (!teamName) {
    const reply = "Which football team would you like to watch? I'll find their upcoming fixtures.";
    return { direct_reply: reply, messages: [new AIMessage(reply)] };
  }

  const teamId = resolveTeamId(teamName);
  if (!teamId) {
    const reply = `Sorry, ${teamName} isn't supported yet. Try a club like Real Madrid, Barcelona, Liverpool, or Manchester City.`;
    return { direct_reply: reply, messages: [new AIMessage(reply)] };
  }

  const today = new Date();
  const minPlanDate = new Date(today);
  minPlanDate.setDate(today.getDate() + 2);
  const ninetyDaysOut = new Date(today);
  ninetyDaysOut.setDate(today.getDate() + 90);
  const dateFrom = minPlanDate.toISOString().slice(0, 10);
  const dateTo = ninetyDaysOut.toISOString().slice(0, 10);

  let fixtures: Array<{ id: number; homeTeam: { name: string }; awayTeam: { name: string }; utcDate: string; competition: { name: string }; venue: string | null; status: string }>;

  if (state.fixture_list?.length) {
    // Use cached fixture list — skip searchFixtures API call
    fixtures = state.fixture_list.map((s, i) => ({
      id: i + 1,
      homeTeam: { name: s.homeTeam },
      awayTeam: { name: s.awayTeam },
      utcDate: s.kickoffUtc,
      competition: { name: s.competition },
      venue: s.venue,
      status: s.status,
    }));
  } else {
    try {
      fixtures = await searchFixtures(teamId, dateFrom, dateTo);
    } catch (err) {
      console.error('[list_matches_node] football-data.org call failed:', err);
      const reply = 'I had trouble fetching fixtures right now. Please try again in a moment.';
      return { direct_reply: reply, messages: [new AIMessage(reply)] };
    }
  }

  const upcoming = fixtures.slice(0, 5);

  if (upcoming.length === 0) {
    const reply = `No upcoming fixtures found for ${teamName} in the next 90 days.`;
    return { direct_reply: reply, messages: [new AIMessage(reply)] };
  }

  // No match selected yet — return the numbered list
  if (!selected_match_id) {
    const summaries: FixtureSummary[] = upcoming.map((f) => ({
      homeTeam: f.homeTeam.name,
      awayTeam: f.awayTeam.name,
      kickoffUtc: f.utcDate,
      competition: f.competition.name,
      venue: f.venue,
      status: f.status,
    }));
    const reply = formatFixtureList(summaries);
    return { direct_reply: reply, fixture_list: summaries, messages: [new AIMessage(reply)] };
  }

  // Match selected — resolve by 1-based index
  const index = parseInt(selected_match_id, 10) - 1;
  if (isNaN(index) || index < 0 || index >= upcoming.length) {
    const summaries: FixtureSummary[] = upcoming.map((f) => ({
      homeTeam: f.homeTeam.name,
      awayTeam: f.awayTeam.name,
      kickoffUtc: f.utcDate,
      competition: f.competition.name,
      venue: f.venue,
      status: f.status,
    }));
    const reply =
      `I didn't catch which match you meant. Here are the options again:\n\n` +
      formatFixtureList(summaries);
    return { direct_reply: reply, fixture_list: summaries, messages: [new AIMessage(reply)] };
  }

  const fixture = upcoming[index];
  const venueName = fixture.venue ?? `${fixture.homeTeam.name} Stadium`;
  const originCity = state.user_preferences.origin_city;
  const [venueGeo, originGeo] = await Promise.all([
    geocodeVenue(venueName),
    originCity ? geocodeVenue(originCity) : Promise.resolve(null),
  ]);

  // Same-city guardrail — only fires when we have an origin city to compare.
  // Explicitly exclude 'UNKNOWN': two unresolved cities must not be treated as equal.
  if (
    originCity &&
    venueGeo?.nearestAirportCode &&
    venueGeo.nearestAirportCode !== 'UNKNOWN' &&
    originGeo?.nearestAirportCode &&
    originGeo.nearestAirportCode !== 'UNKNOWN' &&
    venueGeo.nearestAirportCode === originGeo.nearestAirportCode
  ) {
    const reply =
      `The next ${fixture.homeTeam.name} match is at ${venueName} — ` +
      `that's right in ${state.user_preferences.origin_city}! No travel needed for a home game. ` +
      `Would you like to plan a trip to an away match instead?`;
    return { direct_reply: reply, messages: [new AIMessage(reply)] };
  }

  const match: RawMatchFixture = {
    id: String(fixture.id),
    league: fixture.competition.name,
    matchday: 'Matchday',
    homeTeam: fixture.homeTeam.name,
    awayTeam: fixture.awayTeam.name,
    venue: venueName,
    kickoffUtc: fixture.utcDate,
    ticketPriceEur: 0,
    tvConfirmed: toFanBuddyStatus(fixture.status) === 'CONFIRMED',
    match_city: venueGeo?.city ?? venueName,
    ...(venueGeo
      ? { lat: venueGeo.lat, lng: venueGeo.lng, nearestAirportCode: venueGeo.nearestAirportCode }
      : {}),
  };

  return {
    itinerary: {
      match,
      flight: state.itinerary?.flight ?? null,
      hotel: state.itinerary?.hotel ?? null,
    },
  };
}

// ─── Node: collect_preferences_node ──────────────────────────────────────────
// Gates on origin_city and spending_tier both being present.

async function collect_preferences_node(state: State): Promise<Partial<State>> {
  const { origin_city, spending_tier } = state.user_preferences;

  if (!origin_city) {
    const reply = 'What city are you travelling from?';
    return { direct_reply: reply, messages: [new AIMessage(reply)] };
  }

  if (!spending_tier) {
    const reply =
      "What's your spending style? Choose: **Luxury** (premium experience), **Value** (quality-price balance), or **Budget** (cheapest options).";
    return { direct_reply: reply, messages: [new AIMessage(reply)] };
  }

  return {};
}

// ─── Node: confirm_dates_node ─────────────────────────────────────────────────
// If travel_dates are already set, passes through.
// If wants_date_recommendation is true, computes dates from spending_tier.
// Otherwise, asks the user for dates.

async function confirm_dates_node(state: State): Promise<Partial<State>> {
  const { travel_dates, spending_tier } = state.user_preferences;

  // Already have dates — pass through
  if (travel_dates) {
    return {};
  }

  // User asked for a recommendation — compute dates from spending tier
  if (state.wants_date_recommendation) {
    const match = state.itinerary?.match;
    if (!match) {
      const reply = 'I lost track of the match details. Could you pick a match again?';
      return { direct_reply: reply, messages: [new AIMessage(reply)] };
    }

    if (!spending_tier) {
      const reply = 'Please choose a spending style first: Luxury, Value, or Budget.';
      return { direct_reply: reply, messages: [new AIMessage(reply)] };
    }
    const dates = recommendTravelDates(match.kickoffUtc, spending_tier);
    return {
      user_preferences: {
        ...state.user_preferences,
        travel_dates: dates,
      },
    };
  }

  // Ask for dates
  const match = state.itinerary?.match;
  const kickoffHint = match
    ? ` The match is on ${new Date(match.kickoffUtc).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}.`
    : '';

  const reply =
    `Do you know when you'd like to travel?${kickoffHint} ` +
    `You can give me specific dates (e.g. "Apr 19 to Apr 22"), or just say **"recommend dates"** and I'll suggest based on your ${spending_tier} budget.`;
  return { direct_reply: reply, messages: [new AIMessage(reply)] };
}

// ─── Node: generate_links_node ────────────────────────────────────────────────
// Builds free-tier search links for transport and accommodation.

async function generate_links_node(state: State): Promise<Partial<State>> {
  const match = state.itinerary?.match;
  const { origin_city, travel_dates } = state.user_preferences;

  if (!match || !travel_dates) {
    const reply = 'Something went wrong putting your trip together. Please start over.';
    return { direct_reply: reply, messages: [new AIMessage(reply)] };
  }

  const matchCity = match.match_city ?? match.venue;
  const { checkIn, checkOut } = travel_dates;

  const transportUrl = buildTransportUrl(origin_city, matchCity, checkIn, checkOut);
  const accommodationUrl = buildAccommodationUrl(matchCity, checkIn, checkOut);

  const links: FreeTierLinks = {
    transportUrl,
    accommodationUrl,
    matchCity,
    checkIn,
    checkOut,
  };

  const reply =
    `Here's your trip to ${match.homeTeam} vs ${match.awayTeam} in ${matchCity}! ` +
    `I've put together search links for flights from ${origin_city} and accommodation — tap below to explore your options.`;

  return {
    free_tier_links: links,
    direct_reply: reply,
    messages: [new AIMessage(reply)],
    trip_complete: true,
    conversation_stage: 'trip_complete' as ConversationStage,
  };
}

// ─── Node: activities_node ────────────────────────────────────────────────────
// Generates day-by-day activity recommendations via one structured LLM call.
// Non-blocking: returns activities: null on any error or missing prerequisite.

async function activities_node(state: State): Promise<Partial<State>> {
  const match = state.itinerary?.match;
  const travelDates = state.user_preferences.travel_dates;

  if (!match || !travelDates) {
    return { activities: null };
  }

  try {
    const structured = model.withStructuredOutput(ActivitiesDataSchema);
    const prompt = buildActivitiesPrompt(match, travelDates);
    const result: ActivitiesData = await structured.invoke(prompt);
    return { activities: result };
  } catch (err) {
    console.error('[activities_node] LLM call failed:', err);
    return { activities: null };
  }
}

// ─── Paid-tier nodes (not wired — reserved for future paid-tier flow) ─────────
// The nodes below (search_matches_node, plan_travel_node, validator_node,
// formatter_node) implement the original auto-planning flow using Duffel + LiteAPI.
// They are intentionally excluded from the current graph topology. Do not delete.

// ─── Node: search_matches_node ────────────────────────────────────────────────
// Calls football-data.org directly — no LLM routing overhead for deterministic calls.

async function search_matches_node(state: State): Promise<Partial<State>> {
  const { origin_city, favorite_team: teamName } = state.user_preferences;

  // Gate: ask for whichever piece of data is still missing
  if (!teamName && !origin_city) {
    const reply =
      "To get started, tell me which team you'd like to watch and the city you're travelling from.";
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
    const [geo, originGeo] = await Promise.all([
      geocodeVenue(venueName),
      geocodeVenue(origin_city),
    ]);

    // Guardrail: if the match venue is in the user's home city, trip planning
    // makes no sense. Compare nearest airport codes — same IATA code = same city.
    // Exclude 'UNKNOWN': two unresolved cities must not be treated as equal.
    if (
      geo?.nearestAirportCode &&
      geo.nearestAirportCode !== 'UNKNOWN' &&
      originGeo?.nearestAirportCode &&
      originGeo.nearestAirportCode !== 'UNKNOWN' &&
      geo.nearestAirportCode === originGeo.nearestAirportCode
    ) {
      const reply =
        `The next ${fixture.homeTeam.name} match is at ${venueName} — ` +
        `that's right in ${origin_city}! No travel needed for a home game. ` +
        `Would you like to plan a trip to an away match instead?`;
      return { direct_reply: reply, messages: [new AIMessage(reply)] };
    }

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
      ...(geo
        ? {
            lat: geo.lat,
            lng: geo.lng,
            nearestAirportCode: geo.nearestAirportCode,
          }
        : {}),
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
      flight_results: null,
      flight_results_cursor: 0,
      hotel_results: null,
      hotel_results_cursor: 0,
    };
  }

  // ── Date derivation ────────────────────────────────────────────────────────
  const kickoff = new Date(match.kickoffUtc);
  const matchEndMs = kickoff.getTime() + 105 * 60 * 1000; // kickoff + 105 min

  // Arrive the day before the match, depart the day after it ends.
  // Use UTC date methods to avoid local-timezone drift on Amadeus date params.
  const departureDate = new Date(kickoff);
  departureDate.setUTCDate(departureDate.getUTCDate() - 1);
  const returnDate = new Date(matchEndMs);
  returnDate.setUTCDate(returnDate.getUTCDate() + 1);

  const departureDateStr = departureDate.toISOString().slice(0, 10);
  const returnDateStr = returnDate.toISOString().slice(0, 10);

  // ── IATA codes ─────────────────────────────────────────────────────────────
  const originGeo = await geocodeVenue(state.user_preferences.origin_city);
  const originIata = originGeo?.nearestAirportCode ?? 'UNKNOWN';
  const destinationIata = match.nearestAirportCode ?? 'UNKNOWN';

  // ── Flight selection ───────────────────────────────────────────────────────
  let flightResults = state.flight_results;
  let flightCursor = state.flight_results_cursor;

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
      console.error('[plan_travel_node] Amadeus flight search failed:', err);
      const detail =
        err &&
        typeof err === 'object' &&
        'description' in err &&
        Array.isArray((err as { description: unknown }).description)
          ? ((err as { description: Array<{ detail?: string }> }).description[0]
              ?.detail ?? 'unknown error')
          : String(err);
      return {
        flight_results: [],
        flight_results_cursor: 0,
        hotel_results: state.hotel_results,
        hotel_results_cursor: 0,
        validation_errors: [`Flight search failed — ${detail}`],
        itinerary: {
          match: state.itinerary?.match ?? null,
          flight: null,
          hotel: null,
        },
        attempt_count: 3, // exit retry loop
      };
    }
    flightCursor = 0;
  } else {
    // Retry — shouldRetryOrFinish already decided to loop back; advance to next flight
    flightCursor += 1;
  }

  // ── Cursor exhaustion — flights ────────────────────────────────────────────
  if (flightResults.length === 0 || flightCursor >= flightResults.length) {
    console.warn(
      '[plan_travel_node] NO_VALID_FLIGHTS — cursor exhausted at index',
      flightCursor,
    );
    return {
      flight_results: flightResults,
      flight_results_cursor: flightCursor,
      hotel_results: state.hotel_results,
      hotel_results_cursor: 0,
      itinerary: {
        match: state.itinerary?.match ?? null,
        flight: null,
        hotel: null,
      },
      attempt_count: state.attempt_count + 1,
    };
  }

  // ── Map chosen FlightOption → RawFlightOption ──────────────────────────────
  const chosen = flightResults[flightCursor];
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

  // ── Hotel selection ────────────────────────────────────────────────────────
  // Hotel results are fetched once and cached. On flight retry, the hotel
  // cursor always resets to 0 — we want the best available hotel for each
  // new flight candidate.
  let hotelResults = state.hotel_results;

  if (hotelResults === null) {
    try {
      hotelResults = await searchHotels({
        lat: match.lat ?? 0,
        lng: match.lng ?? 0,
        checkInDate: departureDateStr,
        checkOutDate: returnDateStr,
        adults: 1,
        minStarRating: 3,
      });
    } catch (err) {
      console.error('[plan_travel_node] Duffel hotel search failed:', err);
      return {
        flight_results: flightResults,
        flight_results_cursor: flightCursor,
        hotel_results: [],
        hotel_results_cursor: 0,
        validation_errors: [`Hotel search failed — ${String(err)}`],
        itinerary: {
          match: state.itinerary?.match ?? null,
          flight,
          hotel: null,
        },
        attempt_count: 3, // exit retry loop
      };
    }
  }

  // ── Budget-aware hotel selection (hotels before flights) ───────────────────
  // Sorted list from searchHotels: starRating DESC, price ASC.
  // Walk from index 0 to find the best hotel that keeps total under budget.
  // On a flight retry the cursor always resets to 0 (we pick fresh for new flight).
  const flightTotalEur = flight.outbound.priceEur + flight.inbound.priceEur;
  let selectedHotel: RawHotelOption | null = null;
  let finalHotelCursor = 0;

  for (let hc = 0; hc < hotelResults.length; hc++) {
    const h = hotelResults[hc];
    // TODO: h.totalPriceUSD is in USD (Amadeus returns USD); flightTotalEur is
    // approximated from USD/2 with no conversion. Budget comparison mixes currencies.
    // Wire a real USD→EUR rate before shipping to production.
    if (flightTotalEur + h.totalPriceUSD <= BUDGET_BASELINE_EUR) {
      selectedHotel = {
        name: h.name,
        city: destinationIata,
        checkIn: h.checkInDate,
        checkOut: h.checkOutDate,
        nights: h.nights,
        pricePerNightEur: h.pricePerNight,
        totalEur: h.totalPriceUSD,
        wasDowngraded: hc > 0, // true when budget pressure forced skipping higher-ranked options
      };
      finalHotelCursor = hc;
      break;
    }
  }

  if (selectedHotel === null) {
    // No hotel fits within budget for this flight candidate. Return with
    // hotel = null so validator_node emits an incomplete-itinerary error,
    // which triggers the retry loop to advance the flight cursor on the
    // next call to plan_travel_node.
    console.warn(
      '[plan_travel_node] No hotel within budget for flight cursor',
      flightCursor,
    );
    return {
      flight_results: flightResults,
      flight_results_cursor: flightCursor,
      hotel_results: hotelResults,
      hotel_results_cursor: hotelResults.length, // mark as exhausted
      itinerary: {
        match: state.itinerary?.match ?? null,
        flight,
        hotel: null,
      },
      attempt_count: state.attempt_count + 1,
    };
  }

  return {
    flight_results: flightResults,
    flight_results_cursor: flightCursor,
    hotel_results: hotelResults,
    hotel_results_cursor: finalHotelCursor,
    itinerary: {
      match: state.itinerary?.match ?? null,
      flight,
      hotel: selectedHotel,
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
  const wasDowngraded = itinerary.hotel.wasDowngraded;

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

function afterDirectReply(
  state: State,
  nextNode: string,
): string | typeof END {
  return state.direct_reply ? END : nextNode;
}

export function routeFromRouter(
  state: Pick<State, 'trip_complete' | 'conversation_stage' | 'itinerary'>,
): string | typeof END {
  if (state.trip_complete) return END;
  switch (state.conversation_stage) {
    case 'collecting_team':
    case 'selecting_match':
      return 'list_matches_node';
    case 'collecting_preferences':
    case 'confirming_dates':
      // If a match ID was just selected but the fixture hasn't been geocoded yet,
      // pass through list_matches_node first so it can resolve and set itinerary.match.
      if (!state.itinerary?.match) return 'list_matches_node';
      return state.conversation_stage === 'collecting_preferences'
        ? 'collect_preferences_node'
        : 'confirm_dates_node';
    case 'trip_complete':
      return END;
    default:
      return 'list_matches_node';
  }
}

// ─── Graph Assembly ───────────────────────────────────────────────────────────

const checkpointer = new MemorySaver();

const graph = new StateGraph(GraphState)
  .addNode('router_node', router_node)
  .addNode('list_matches_node', list_matches_node)
  .addNode('collect_preferences_node', collect_preferences_node)
  .addNode('confirm_dates_node', confirm_dates_node)
  .addNode('generate_links_node', generate_links_node)
  .addNode('activities_node', activities_node)
  .addEdge(START, 'router_node')
  .addConditionalEdges(
    'router_node',
    routeFromRouter,
    {
      list_matches_node: 'list_matches_node',
      collect_preferences_node: 'collect_preferences_node',
      confirm_dates_node: 'confirm_dates_node',
      [END]: END,
    },
  )
  .addConditionalEdges(
    'list_matches_node',
    (state) => afterDirectReply(state, 'collect_preferences_node'),
    { collect_preferences_node: 'collect_preferences_node', [END]: END },
  )
  .addConditionalEdges(
    'collect_preferences_node',
    (state) => afterDirectReply(state, 'confirm_dates_node'),
    { confirm_dates_node: 'confirm_dates_node', [END]: END },
  )
  .addConditionalEdges(
    'confirm_dates_node',
    (state) => afterDirectReply(state, 'generate_links_node'),
    { generate_links_node: 'generate_links_node', [END]: END },
  )
  .addEdge('generate_links_node', 'activities_node')
  .addEdge('activities_node', END)
  .compile({ checkpointer });

export { graph };
export type { State as GraphStateType };
