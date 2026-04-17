# Agent Redesign: Multi-Step Flow + Free Tier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-step auto-planning agent with a guided multi-step conversation flow (team → match list → match selection → preferences → dates → free-tier links).

**Architecture:** Add four new LangGraph nodes (`list_matches_node`, `collect_preferences_node`, `confirm_dates_node`, `generate_links_node`) that gate on incremental user input, persisting all preferences via the existing MemorySaver checkpointer. Free-tier path returns Google Flights + Booking.com dynamic links; paid-tier nodes (`plan_travel_node`, `validator_node`, `formatter_node`) remain in the file but are not wired into the graph.

**Tech Stack:** LangGraph, LangChain/Anthropic, Next.js App Router, TypeScript, Jest + ts-jest

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `lib/langchain/free-tier.ts` | Pure helper functions: URL builders, date recommender, fixture list formatter |
| Create | `__tests__/lib/langchain/free-tier.test.ts` | Unit tests for free-tier helpers |
| Modify | `lib/langchain/types.ts` | Add `FreeTierLinks`, `UserPreferences`; update `RawMatchFixture`, `ChatStreamEvent` |
| Modify | `lib/football-data.ts` | Add `city` field to `GeocodedVenue`; update `geocodeVenue` to return city |
| Modify | `lib/langchain/graph.ts` | Expand `router_node` schema; add 4 new nodes; add new state fields; rewire topology |
| Modify | `app/api/chat/route.ts` | Capture `free_tier_links`; pass `links` in `done` SSE event; reset new state fields |
| Modify | `components/chat/PlanningChat.tsx` | Add `links` message kind; render Transport + Accommodation CTA buttons |

---

## Task 1: Update Types

**Files:**
- Modify: `lib/langchain/types.ts`

- [ ] **Step 1: Replace the types file contents**

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors (or only pre-existing unrelated errors, not in types.ts)

- [ ] **Step 3: Commit**

```bash
git add lib/langchain/types.ts
git commit -m "feat: expand types for multi-step flow and free-tier links"
```

---

## Task 2: Add `city` to `GeocodedVenue`

**Files:**
- Modify: `lib/football-data.ts`

- [ ] **Step 1: Update the `GeocodedVenue` interface** (around line 23)

Old:
```typescript
export interface GeocodedVenue {
  lat: number;
  lng: number;
  nearestAirportCode: string;
}
```

New:
```typescript
export interface GeocodedVenue {
  lat: number;
  lng: number;
  nearestAirportCode: string;
  city: string; // human-readable city name from Geoapify
}
```

- [ ] **Step 2: Update `geocodeVenue` to return `city`** (around line 267)

Old return block:
```typescript
    return {
      lat,
      lng,
      nearestAirportCode: nearestAirportFromCity(cityHint),
    };
```

New return block:
```typescript
    return {
      lat,
      lng,
      nearestAirportCode: nearestAirportFromCity(cityHint),
      city: feature.properties.city ?? feature.properties.county ?? feature.properties.country ?? venueName,
    };
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors in `lib/football-data.ts`

- [ ] **Step 4: Commit**

```bash
git add lib/football-data.ts
git commit -m "feat: add city to GeocodedVenue return value"
```

---

## Task 3: Create Free-Tier Helpers + Tests

**Files:**
- Create: `lib/langchain/free-tier.ts`
- Create: `__tests__/lib/langchain/free-tier.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/langchain/free-tier.test.ts`:

```typescript
import {
  buildTransportUrl,
  buildAccommodationUrl,
  recommendTravelDates,
  formatFixtureList,
  type FixtureSummary,
} from '@/lib/langchain/free-tier';

describe('buildTransportUrl', () => {
  it('builds google search URL with formatted dates', () => {
    const url = buildTransportUrl('Madrid', 'Barcelona', '2026-04-20', '2026-04-24');
    expect(url).toBe(
      'https://www.google.com/search?q=madrid+to+barcelona+apr+20+2026+to+apr+24+2026',
    );
  });

  it('handles multi-word city names', () => {
    const url = buildTransportUrl('New York', 'Los Angeles', '2026-05-01', '2026-05-03');
    expect(url).toBe(
      'https://www.google.com/search?q=new+york+to+los+angeles+may+1+2026+to+may+3+2026',
    );
  });

  it('lowercases city names', () => {
    const url = buildTransportUrl('LONDON', 'PARIS', '2026-06-10', '2026-06-12');
    expect(url).toContain('london+to+paris');
  });
});

describe('buildAccommodationUrl', () => {
  it('builds booking.com URL with match city and ISO dates', () => {
    const url = buildAccommodationUrl('Barcelona', '2026-04-22', '2026-04-24');
    expect(url).toBe(
      'https://www.booking.com/searchresults.en-gb.html?ss=Barcelona&checkin=2026-04-22&checkout=2026-04-24&group_adults=1&no_rooms=1',
    );
  });

  it('URL-encodes city names with spaces', () => {
    const url = buildAccommodationUrl('Los Angeles', '2026-05-01', '2026-05-03');
    expect(url).toContain('ss=Los%20Angeles');
  });
});

describe('recommendTravelDates', () => {
  const kickoff = '2026-04-20T20:00:00Z';

  it('luxury: arrives 2 days before, departs 2 days after', () => {
    const result = recommendTravelDates(kickoff, 'luxury');
    expect(result.checkIn).toBe('2026-04-18');
    expect(result.checkOut).toBe('2026-04-22');
  });

  it('value: arrives 1 day before, departs 1 day after', () => {
    const result = recommendTravelDates(kickoff, 'value');
    expect(result.checkIn).toBe('2026-04-19');
    expect(result.checkOut).toBe('2026-04-21');
  });

  it('budget: arrives day of kickoff, departs day after', () => {
    const result = recommendTravelDates(kickoff, 'budget');
    expect(result.checkIn).toBe('2026-04-20');
    expect(result.checkOut).toBe('2026-04-21');
  });

  it('handles kickoff near month boundary', () => {
    const result = recommendTravelDates('2026-05-01T19:00:00Z', 'luxury');
    expect(result.checkIn).toBe('2026-04-29');
    expect(result.checkOut).toBe('2026-05-03');
  });
});

describe('formatFixtureList', () => {
  const fixtures: FixtureSummary[] = [
    {
      homeTeam: 'Real Madrid',
      awayTeam: 'Barcelona',
      kickoffUtc: '2026-04-20T20:00:00Z',
      competition: 'La Liga',
      venue: 'Estadio Santiago Bernabéu',
    },
    {
      homeTeam: 'Real Madrid',
      awayTeam: 'Manchester City',
      kickoffUtc: '2026-04-28T19:00:00Z',
      competition: 'Champions League',
      venue: null,
    },
  ];

  it('numbers each fixture starting from 1', () => {
    const result = formatFixtureList(fixtures);
    expect(result).toContain('1. Real Madrid vs Barcelona');
    expect(result).toContain('2. Real Madrid vs Manchester City');
  });

  it('includes competition name', () => {
    const result = formatFixtureList(fixtures);
    expect(result).toContain('La Liga');
    expect(result).toContain('Champions League');
  });

  it('includes venue when present', () => {
    const result = formatFixtureList(fixtures);
    expect(result).toContain('Estadio Santiago Bernabéu');
  });

  it('omits venue section when null', () => {
    const result = formatFixtureList(fixtures);
    // Second fixture has no venue — should not show "(null)"
    const lines = result.split('\n');
    const secondLine = lines.find((l) => l.startsWith('2.'))!;
    expect(secondLine).not.toContain('null');
  });

  it('ends with a prompt to pick a number', () => {
    const result = formatFixtureList(fixtures);
    expect(result).toMatch(/reply with the number/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern="free-tier" --no-coverage`
Expected: FAIL — `Cannot find module '@/lib/langchain/free-tier'`

- [ ] **Step 3: Create `lib/langchain/free-tier.ts`**

```typescript
// ─── Free-tier pure helpers ───────────────────────────────────────────────────
// These functions contain no side effects and can be unit tested directly.

// ── Fixture list formatter ────────────────────────────────────────────────────

export interface FixtureSummary {
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string;
  competition: string;
  venue: string | null;
}

/**
 * Format a numbered list of upcoming fixtures for display in chat.
 */
export function formatFixtureList(fixtures: FixtureSummary[]): string {
  const lines = fixtures.map((f, i) => {
    const date = new Date(f.kickoffUtc).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
    const venue = f.venue ? ` (${f.venue})` : '';
    return `${i + 1}. ${f.homeTeam} vs ${f.awayTeam} — ${date}, ${f.competition}${venue}`;
  });
  return (
    `Here are the next upcoming fixtures:\n\n${lines.join('\n')}\n\n` +
    `Reply with the number of the match you'd like to travel to!`
  );
}

// ── Date recommendation ───────────────────────────────────────────────────────

const TIER_OFFSETS: Record<'luxury' | 'value' | 'budget', { before: number; after: number }> = {
  luxury: { before: 2, after: 2 },
  value:  { before: 1, after: 1 },
  budget: { before: 0, after: 1 },
};

/**
 * Recommend check-in/check-out dates based on kickoff time and spending tier.
 * All arithmetic is done in UTC to avoid timezone drift.
 */
export function recommendTravelDates(
  kickoffUtc: string,
  tier: 'luxury' | 'value' | 'budget',
): { checkIn: string; checkOut: string } {
  const kickoff = new Date(kickoffUtc);
  // Normalise to midnight UTC on the kickoff date
  const kickoffDay = new Date(
    Date.UTC(kickoff.getUTCFullYear(), kickoff.getUTCMonth(), kickoff.getUTCDate()),
  );

  const { before, after } = TIER_OFFSETS[tier];

  const checkIn = new Date(kickoffDay);
  checkIn.setUTCDate(checkIn.getUTCDate() - before);

  const checkOut = new Date(kickoffDay);
  checkOut.setUTCDate(checkOut.getUTCDate() + after);

  return {
    checkIn: checkIn.toISOString().slice(0, 10),
    checkOut: checkOut.toISOString().slice(0, 10),
  };
}

// ── URL builders ──────────────────────────────────────────────────────────────

/**
 * Format a YYYY-MM-DD date string to "mmm+d+yyyy" (Google Flights style).
 * Example: "2026-04-20" → "apr+20+2026"
 */
function formatDateForGoogle(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toLowerCase();
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  return `${month}+${day}+${year}`;
}

/**
 * Build a Google search URL for flights.
 * Example: https://www.google.com/search?q=madrid+to+barcelona+apr+20+2026+to+apr+24+2026
 */
export function buildTransportUrl(
  originCity: string,
  matchCity: string,
  checkIn: string,
  checkOut: string,
): string {
  const origin = originCity.toLowerCase().replace(/\s+/g, '+');
  const dest = matchCity.toLowerCase().replace(/\s+/g, '+');
  const from = formatDateForGoogle(checkIn);
  const to = formatDateForGoogle(checkOut);
  return `https://www.google.com/search?q=${origin}+to+${dest}+${from}+to+${to}`;
}

/**
 * Build a Booking.com search URL for accommodation.
 * Example: https://www.booking.com/searchresults.en-gb.html?ss=Barcelona&checkin=2026-04-22&checkout=2026-04-24&group_adults=1&no_rooms=1
 */
export function buildAccommodationUrl(
  matchCity: string,
  checkIn: string,
  checkOut: string,
): string {
  const city = encodeURIComponent(matchCity);
  return (
    `https://www.booking.com/searchresults.en-gb.html` +
    `?ss=${city}&checkin=${checkIn}&checkout=${checkOut}&group_adults=1&no_rooms=1`
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPattern="free-tier" --no-coverage`
Expected: All 12 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/langchain/free-tier.ts __tests__/lib/langchain/free-tier.test.ts
git commit -m "feat: add free-tier URL builders, date recommender, and fixture formatter with tests"
```

---

## Task 4: Update `router_node` Schema

**Files:**
- Modify: `lib/langchain/graph.ts`

- [ ] **Step 1: Replace `RouterSchema` and update imports** (around lines 1–11 and 93–131)

At the top of `graph.ts`, add the `UserPreferences` import:
```typescript
import type {
  FormattedItinerary,
  FreeTierLinks,
  ItineraryData,
  RawFlightOption,
  RawHotelOption,
  RawMatchFixture,
  UserPreferences,
} from './types';
```

Replace the `RouterSchema` definition (lines 93–106):
```typescript
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
});
```

- [ ] **Step 2: Update `router_node` to merge new preference fields**

Replace the `router_node` function body (lines 108–131):
```typescript
async function router_node(state: State): Promise<Partial<State>> {
  const lastMessage = state.messages[state.messages.length - 1];
  const structured = model.withStructuredOutput(RouterSchema);

  const result = await structured.invoke(
    `You are an information extractor for FanBuddy.AI, a football trip planning app.

Extract the following from the user's message if present:
- origin_city: the city the user is travelling FROM. Null if not mentioned.
- favorite_team: the football club the user wants to watch. Null if not mentioned.
- selected_match_id: a 1-based index if the user picks a match from a numbered list (e.g. "match 2" → "2"). Null if not mentioned.
- spending_tier: "luxury", "value", or "budget" if the user expresses a spending preference. Null if not mentioned.
- travel_dates: { checkIn, checkOut } in YYYY-MM-DD format if the user provides specific travel dates. Null if not mentioned.
- wants_date_recommendation: true ONLY if the user explicitly asks you to recommend dates or says "you decide". false otherwise.

User message: "${lastMessage.content}"`,
  );

  return {
    user_preferences: {
      origin_city: result.origin_city ?? state.user_preferences.origin_city,
      favorite_team: result.favorite_team ?? state.user_preferences.favorite_team,
      selected_match_id: result.selected_match_id ?? state.user_preferences.selected_match_id,
      travel_dates: result.travel_dates ?? state.user_preferences.travel_dates,
      spending_tier: result.spending_tier ?? state.user_preferences.spending_tier,
    },
    wants_date_recommendation: result.wants_date_recommendation,
  };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add lib/langchain/graph.ts
git commit -m "feat: expand router_node schema to extract match, dates, and spending tier"
```

---

## Task 5: Add `list_matches_node`

**Files:**
- Modify: `lib/langchain/graph.ts`

- [ ] **Step 1: Add import for free-tier helpers** (top of file, after existing imports)

```typescript
import { formatFixtureList, type FixtureSummary } from './free-tier';
```

- [ ] **Step 2: Add `list_matches_node` after the `router_node` function**

```typescript
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

  let fixtures;
  try {
    fixtures = await searchFixtures(teamId, dateFrom, dateTo);
  } catch (err) {
    console.error('[list_matches_node] football-data.org call failed:', err);
    const reply = 'I had trouble fetching fixtures right now. Please try again in a moment.';
    return { direct_reply: reply, messages: [new AIMessage(reply)] };
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
    }));
    const reply = formatFixtureList(summaries);
    return { direct_reply: reply, messages: [new AIMessage(reply)] };
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
    }));
    const reply =
      `I didn't catch which match you meant. Here are the options again:\n\n` +
      formatFixtureList(summaries);
    return { direct_reply: reply, messages: [new AIMessage(reply)] };
  }

  const fixture = upcoming[index];
  const venueName = fixture.venue ?? `${fixture.homeTeam.name} Stadium`;
  const [venueGeo, originGeo] = await Promise.all([
    geocodeVenue(venueName),
    geocodeVenue(state.user_preferences.origin_city || venueName),
  ]);

  // Same-city guardrail
  if (
    venueGeo?.nearestAirportCode &&
    originGeo?.nearestAirportCode &&
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
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors in `graph.ts`

- [ ] **Step 4: Commit**

```bash
git add lib/langchain/graph.ts
git commit -m "feat: add list_matches_node with fixture listing and match selection"
```

---

## Task 6: Add `collect_preferences_node`

**Files:**
- Modify: `lib/langchain/graph.ts`

- [ ] **Step 1: Add `collect_preferences_node` after `list_matches_node`**

```typescript
// ─── Node: collect_preferences_node ──────────────────────────────────────────
// Gates on origin_city and spending_tier both being present.

async function collect_preferences_node(state: State): Promise<Partial<State>> {
  const { origin_city, spending_tier } = state.user_preferences;

  if (!origin_city && !spending_tier) {
    const reply =
      "What city are you travelling from, and what's your spending style? " +
      "Choose: **Luxury** (premium experience), **Value** (quality-price balance), or **Budget** (cheapest options).";
    return { direct_reply: reply, messages: [new AIMessage(reply)] };
  }

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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add lib/langchain/graph.ts
git commit -m "feat: add collect_preferences_node gating on origin_city and spending_tier"
```

---

## Task 7: Add `confirm_dates_node`

**Files:**
- Modify: `lib/langchain/graph.ts`

- [ ] **Step 1: Add `recommendTravelDates` import** (update the free-tier import line added in Task 5)

```typescript
import { formatFixtureList, recommendTravelDates, type FixtureSummary } from './free-tier';
```

- [ ] **Step 2: Add `confirm_dates_node` after `collect_preferences_node`**

```typescript
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

    const dates = recommendTravelDates(match.kickoffUtc, spending_tier!);
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
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add lib/langchain/graph.ts
git commit -m "feat: add confirm_dates_node with spending-tier-aware date recommendation"
```

---

## Task 8: Add `generate_links_node`

**Files:**
- Modify: `lib/langchain/graph.ts`

- [ ] **Step 1: Add `buildTransportUrl` and `buildAccommodationUrl` to the free-tier import** (update the import line)

```typescript
import {
  buildAccommodationUrl,
  buildTransportUrl,
  formatFixtureList,
  recommendTravelDates,
  type FixtureSummary,
} from './free-tier';
```

- [ ] **Step 2: Add `generate_links_node` after `confirm_dates_node`**

```typescript
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
  };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add lib/langchain/graph.ts
git commit -m "feat: add generate_links_node for free-tier transport and accommodation URLs"
```

---

## Task 9: Update Graph State + Rewire Topology

**Files:**
- Modify: `lib/langchain/graph.ts`

- [ ] **Step 1: Update `GraphState` to add new fields and update `user_preferences` default**

Replace the `GraphState` definition (lines 39–85):

```typescript
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
});
```

- [ ] **Step 2: Replace the conditional edges and graph assembly section**

Find the section starting with `// ─── Conditional Edges` (around line 590) and replace everything from there to the end of the file:

```typescript
// ─── Conditional Edges ────────────────────────────────────────────────────────

function afterDirectReply(
  state: State,
  nextNode: string,
): typeof nextNode | typeof END {
  return state.direct_reply ? END : nextNode;
}

// ─── Graph Assembly ───────────────────────────────────────────────────────────

const checkpointer = new MemorySaver();

const graph = new StateGraph(GraphState)
  .addNode('router_node', router_node)
  .addNode('list_matches_node', list_matches_node)
  .addNode('collect_preferences_node', collect_preferences_node)
  .addNode('confirm_dates_node', confirm_dates_node)
  .addNode('generate_links_node', generate_links_node)
  .addEdge(START, 'router_node')
  .addEdge('router_node', 'list_matches_node')
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
  .addEdge('generate_links_node', END)
  .compile({ checkpointer });

export { graph };
export type { State as GraphStateType };
```

- [ ] **Step 3: Verify TypeScript compiles with no errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run the test suite to make sure nothing broke**

Run: `npm test -- --no-coverage`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/langchain/graph.ts
git commit -m "feat: add new graph state fields and rewire topology for multi-step free-tier flow"
```

---

## Task 10: Update `route.ts`

**Files:**
- Modify: `app/api/chat/route.ts`

- [ ] **Step 1: Add `FreeTierLinks` to imports**

```typescript
import type {
  ChatApiRequest,
  ChatStreamEvent,
  FormattedItinerary,
  FreeTierLinks,
} from '@/lib/langchain/types';
```

- [ ] **Step 2: Update `NODE_STATUS` map**

Replace the `NODE_STATUS` constant:
```typescript
const NODE_STATUS: Record<string, string> = {
  router_node: 'Finding upcoming fixtures...',
  list_matches_node: 'Loaded fixtures...',
  collect_preferences_node: 'Got your preferences...',
  confirm_dates_node: 'Confirmed your dates...',
  generate_links_node: 'Building your trip links...',
};
```

- [ ] **Step 3: Reset new state fields in `initialState` and capture `free_tier_links` in the stream loop**

Replace the `initialState` block and stream loop inside `start(controller)`:

```typescript
        send({ type: 'status', message: 'Analysing your request...' });

        const initialState = {
          messages: [new HumanMessage(message)],
          itinerary: null,
          validation_errors: [],
          attempt_count: 0,
          formatted: null,
          direct_reply: null,
          free_tier_links: null,
          wants_date_recommendation: false,
        };

        const graphStream = await graph.stream(initialState, {
          ...config,
          streamMode: 'updates',
        });

        let directReply: string | null = null;
        let formatted: FormattedItinerary | null = null;
        let freeTierLinks: FreeTierLinks | null = null;

        for await (const chunk of graphStream) {
          const nodeName = Object.keys(chunk)[0] as string;
          const update = (chunk as Record<string, Record<string, unknown>>)[nodeName];

          if (update.direct_reply != null) {
            directReply = update.direct_reply as string;
          }
          if (update.formatted != null) {
            formatted = update.formatted as FormattedItinerary;
          }
          if (update.free_tier_links != null) {
            freeTierLinks = update.free_tier_links as FreeTierLinks;
          }

          if (NODE_STATUS[nodeName]) {
            send({ type: 'status', message: NODE_STATUS[nodeName] });
          }
        }

        const reply =
          directReply ??
          formatted?.summary ??
          'I was unable to help. Please try again.';

        send({ type: 'done', reply, itinerary: formatted, links: freeTierLinks });
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat: pass free_tier_links through SSE done event"
```

---

## Task 11: Update `PlanningChat.tsx` to Render CTA Buttons

**Files:**
- Modify: `components/chat/PlanningChat.tsx`

- [ ] **Step 1: Add `FreeTierLinks` import**

```typescript
import type { ChatStreamEvent, FormattedItinerary, FreeTierLinks } from '@/lib/langchain/types';
```

- [ ] **Step 2: Add `links` message kind to `ChatMessage` union type**

Replace the `ChatMessage` type definition:
```typescript
type ChatMessage =
  | { id: string; role: 'ai'; kind: 'text'; body: string; time: string }
  | { id: string; role: 'user'; body: string; time: string }
  | { id: string; role: 'ai'; kind: 'cards'; time: string; itinerary: FormattedItinerary | null }
  | { id: string; role: 'ai'; kind: 'links'; time: string; body: string; links: FreeTierLinks };
```

- [ ] **Step 3: Add `LinksBlock` component** (add after the `AiAvatar` function, before `RichCardsBlock`)

```typescript
function LinksBlock({
  time,
  body,
  links,
}: {
  time: string;
  body: string;
  links: FreeTierLinks;
}) {
  return (
    <div className="flex max-w-[90%] gap-4">
      <AiAvatar />
      <div className="flex-1 space-y-4">
        <div className="rounded-2xl rounded-tl-none bg-landing-container-low p-4 leading-relaxed text-landing-on-surface">
          {body}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <a
            href={links.transportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl bg-landing-primary px-5 py-3 text-sm font-bold text-white shadow-md transition-transform hover:opacity-90 active:scale-95"
          >
            <Plane className="size-4 shrink-0" strokeWidth={2} />
            Search Transport
          </a>
          <a
            href={links.accommodationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl border border-landing-primary px-5 py-3 text-sm font-bold text-landing-primary transition-transform hover:bg-landing-primary/5 active:scale-95"
          >
            <Hotel className="size-4 shrink-0" strokeWidth={2} />
            Search Accommodation
          </a>
        </div>
        <span className="ml-1 text-[10px] text-landing-on-surface-variant/60">{time}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add `pushAiLinks` callback** (inside `PlanningChat`, after `pushAiCards`)

```typescript
  const pushAiLinks = useCallback((body: string, links: FreeTierLinks) => {
    setItems((prev) => [
      ...prev,
      {
        id: newId(),
        role: 'ai',
        kind: 'links',
        body,
        time: formatMessageTime(new Date()),
        links,
      },
    ]);
  }, []);
```

- [ ] **Step 5: Handle `links` in the `done` event inside `handleSendMessage`**

Find the block that handles `event.type === 'done'` and replace it:
```typescript
              } else if (event.type === 'done') {
                if (event.links) {
                  pushAiLinks(event.reply, event.links);
                } else {
                  pushAiText(event.reply);
                }
                if (event.itinerary) {
                  pushAiCards(event.itinerary);
                  setCurrentItinerary(event.itinerary);
                }
```

- [ ] **Step 6: Render `links` messages in the message list**

Find the block that checks `if (m.kind === 'text')` in the `.map()` call and add a handler for `links` after `cards`:
```typescript
                  if (m.role === 'ai' && m.kind === 'links') {
                    return (
                      <LinksBlock
                        key={m.id}
                        time={m.time}
                        body={m.body}
                        links={m.links}
                      />
                    );
                  }
```

Place this before the `if (!m.itinerary) return null;` line.

- [ ] **Step 7: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add components/chat/PlanningChat.tsx
git commit -m "feat: render free-tier transport and accommodation CTA buttons in chat"
```

---

## Final Verification

- [ ] **Run the full test suite**

Run: `npm test -- --no-coverage`
Expected: All tests PASS

- [ ] **Start dev server and do an end-to-end smoke test**

Run: `npm run dev`

Test the full flow in the browser:
1. Say "I want to watch Real Madrid" → agent lists 5 fixtures
2. Say "I'll take match 1" → agent asks for origin city and spending tier
3. Say "I'm from Madrid" → agent asks for spending tier
4. Say "Value" → agent asks for travel dates
5. Say "recommend dates" → agent sets dates and shows Transport + Accommodation buttons
6. Verify both buttons link to correct Google/Booking.com URLs

- [ ] **Final commit**

```bash
git add -A
git commit -m "chore: verify agent redesign smoke test complete"
```
