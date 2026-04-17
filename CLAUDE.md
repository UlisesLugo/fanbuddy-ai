# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server at http://localhost:3000
npm run build    # Production build
npm run lint     # ESLint via next lint
npm test         # Jest unit tests
```

## Architecture

Next.js 14 App Router project. All routing lives under `app/`:

| Route | Component |
|-------|-----------|
| `/` | `components/landing/MarketingLanding.tsx` — split-panel marketing/signup page |
| `/chat` | `components/chat/PlanningChat.tsx` — AI chat UI with sidebar itinerary panel |

`PlanningChat` is a live AI chat backed by a LangGraph agent (see below). `MarketingLanding` is static.

## Agent architecture

The AI backend lives in `lib/langchain/` and is exposed via `app/api/chat/route.ts`.

### Files

| File | Purpose |
|------|---------|
| `lib/langchain/graph.ts` | LangGraph `StateGraph` definition — all nodes, edges, and the compiled graph |
| `lib/langchain/types.ts` | Shared TypeScript interfaces (safe to import in client components) |
| `lib/football-data.ts` | football-data.org v4 API client — fixture search, geocoding, retry logic, telemetry |
| `lib/flights.ts` | Duffel API v2 client — round-trip flight search (`searchRoundTrip`) |
| `lib/hotels.ts` | LiteAPI v3 client — two-step hotel search (`searchHotels`): `GET /data/hotels` then `POST /hotels/rates` |
| `app/api/chat/route.ts` | Next.js POST handler — runs the graph, streams SSE back to the client |

### Graph topology

```
START
  └─► router_node ──► search_matches_node
                            │
              missing data / unsupported team ──► END  (prompt user)
                            │
                       plan_travel_node ──► validator_node
                                                  │
                              hard errors + attempts < 3 ──► plan_travel_node (retry)
                                                  │
                                             (pass / provisional)
                                                  │
                                           formatter_node ──► END
```

### Nodes

| Node | What it does |
|------|-------------|
| `router_node` | Extracts `origin_city` and `favorite_team` from the user's message using `withStructuredOutput`. Merges extracted values with checkpointed preferences — null means "keep prior value". |
| `search_matches_node` | Gates on both preferences being present. If either is missing, sets `direct_reply` with a prompt and ends early. If the team is unsupported, returns an error message. Otherwise calls `searchFixtures()` from `lib/football-data.ts` for the next 90 days, picks the nearest fixture, and geocodes the venue. |
| `plan_travel_node` | Calls `searchRoundTrip` (Duffel) and `searchHotels` (LiteAPI) directly. Runs a deterministic budget check — walks hotel results to find the best hotel that keeps flight + hotel total under €800. |
| `validator_node` | Pure TypeScript validation: arrival buffer ≥ 6 h before kickoff, departure buffer ≥ 4 h after match end, TV schedule confirmed. Writes errors to `state.validation_errors`. **Do not modify.** |
| `formatter_node` | Assembles `FormattedItinerary` from raw state in TypeScript. Calls the LLM **once** — only to generate the natural-language `summary` string. Adds the summary to `messages`. **Do not modify.** |

### State

```ts
{
  messages:          BaseMessage[]   // conversation history (user + AI replies only, no tool noise)
  itinerary:         ItineraryData   // raw match / flight / hotel data
  validation_errors: string[]
  user_preferences:  { origin_city, favorite_team }  // persisted across turns via checkpointer
  attempt_count:     number          // retry counter; resets to 0 each new user message
  formatted:         FormattedItinerary | null
  direct_reply:      string | null   // set when the graph short-circuits (missing data, unsupported team)
}
```

### Conversation memory

The graph is compiled with a `MemorySaver` checkpointer. Each browser session generates a `thread_id` (`crypto.randomUUID()`) that is sent with every request. The `messages` field uses a concat reducer, so conversation history accumulates across turns. `user_preferences` also persists via the checkpointer — `router_node` only overwrites a field when the user explicitly mentions it. All other planning state fields (`itinerary`, `formatted`, etc.) use the overwrite reducer and are reset to `null`/`0` at the start of each new message.

### Preference extraction

`router_node` uses `withStructuredOutput` to extract `origin_city` and `favorite_team` from every message. The conversation will not advance to trip planning until both are known. `search_matches_node` prompts for whichever field is still missing:

- Neither known → "Tell me which team and city…"
- Team missing → "Which team would you like to watch?"
- City missing → "What city are you travelling from?"

### Hotel data

`lib/hotels.ts` wraps the LiteAPI v3 API with a two-step search:

1. `GET https://api.liteapi.travel/v3.0/data/hotels?latitude=…&longitude=…&radius=5000&limit=20` — fetches up to 20 hotels within 5 km of the venue
2. `POST https://api.liteapi.travel/v3.0/hotels/rates` — fetches rates for those hotel IDs; body includes `hotelIds`, `occupancies`, `checkin`, `checkout`, `guestNationality`, `currency`

Auth: `X-API-Key: $LITEAPI_API_KEY` header.

Response parsing notes:
- Rates are nested under `roomTypes[].rates[]` — the cheapest `retailRate.total[0].amount` across all room types is used
- Cancellability: `cancellationPolicies.refundableTag === 'RFN'` → cancellable; `"NRFN"` → non-cancellable
- `hotel.location` may be absent — `latitude`/`longitude` default to `null`
- Empty response body from `/hotels/rates` (no inventory) is treated as `NO_HOTEL_AVAILABILITY`

`HotelOption` fields populated: `id`, `name`, `starRating` (default 3), `totalPriceUSD`, `pricePerNight`, `currency`, `checkInDate`, `checkOutDate`, `nights`, `distanceFromVenueKm`, `cancellable`, `latitude`, `longitude`. `amenities` is always `[]` (not returned by this endpoint).

### Football data

`lib/football-data.ts` wraps the football-data.org v4 API:
- `resolveTeamId(name)` — maps common team names to numeric IDs (case-insensitive)
- `searchFixtures(teamId, dateFrom, dateTo)` — fetches `TIMED`/`SCHEDULED` matches, filters out `POSTPONED`
- `toFanBuddyStatus(apiStatus)` — `"TIMED"` → `"CONFIRMED"`, anything else → `"PROVISIONAL"`
- `geocodeVenue(name)` — Geoapify geocoding → `{ lat, lng, nearestAirportCode }`
- All external calls go through `fetchWithRetry` (exponential backoff: 1 s / 2 s / 4 s, max 3 attempts) with console telemetry (`[api] ✓/✗ service GET url → status (ms, attempt N)`)
- Auth tokens are redacted from logged URLs

### Streaming (SSE)

`route.ts` runs `graph.stream(..., { streamMode: 'updates' })` and returns a `text/event-stream` response. Three event types:

| Event | Shape | When |
|-------|-------|------|
| `status` | `{ type, message }` | After each node completes — describes what's happening next |
| `done` | `{ type, reply, itinerary }` | After the graph finishes |
| `error` | `{ type, message }` | On unhandled exception |

The client (`PlanningChat.tsx`) reads chunks line-by-line with a string buffer and updates the loading bubble message in real time.

### Observability

Langfuse tracing is enabled when `LANGFUSE_SECRET_KEY` and `LANGFUSE_PUBLIC_KEY` are set in `.env`. The handler is passed as a LangChain callback to `graph.stream()`.

### LLM calls per turn

| Flow | LLM calls |
|------|-----------|
| Data incomplete / unsupported team | 1 — `router_node` (extraction) |
| Full `plan_trip` | 2 — `router_node` (extraction) + `formatter_node` (summary) |
| `plan_trip` with retry | 2 + 0 per retry (retries are pure tool calls) |

## Safety rules — do not change

- Arrival gap: min 6 hours between flight landing and match kickoff (`validator_node`)
- Departure gap: min 4 hours after match ends before return flight (`validator_node`)
- Budget pressure: downgrade hotels (4★→3★) before changing flights (`plan_travel_node`)
- Status logic: `CONFIRMED` if fixture status is `"TIMED"`, else `PROVISIONAL`
- All timestamps must stay as ISO 8601 UTC strings — `kickoffUtc` is what `validator_node` uses for buffer math

## Styling conventions

The project uses a custom Tailwind color palette namespaced under `landing-*` (e.g. `landing-primary`, `landing-surface`, `landing-container-low`). These are defined in `tailwind.config.ts` and should be used instead of raw hex or generic Tailwind colors for UI elements.

Key custom utilities (defined in `app/globals.css`):
- `bg-pitch-gradient` / `text-pitch-gradient` — green gradient (#006a35 → #6bfe9c) used for CTAs and accents
- `glass-panel` — frosted glass card style
- `no-scrollbar` — hides scrollbars while preserving scroll behavior

Typography uses two font families:
- Default body: Inter (via `inter.className` / `--font-inter`)
- Headlines: Manrope (via `font-headline` Tailwind class / `--font-headline`)
