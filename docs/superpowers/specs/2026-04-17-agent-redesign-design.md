# Agent Redesign: Multi-Step Conversation Flow + Free Tier

**Date:** 2026-04-17  
**Branch:** claude-graph-redesign  
**Status:** Approved

---

## Overview

Redesign the FanBuddy.AI LangGraph agent to support a guided multi-step conversation flow (team → match selection → preferences → dates → links) and introduce a free-tier path that generates dynamic search links instead of calling real flight/hotel APIs.

---

## 1. Conversation Flow

The agent now guides the user through discrete steps, gating on each piece of missing information before proceeding:

1. **Team** — if unknown, ask for it
2. **List matches** — fetch next 5 fixtures across all competitions; present as a numbered list; wait for user to pick one
3. **Match selected** — if not yet selected, hold at step 2
4. **Origin city** — if unknown, ask for it
5. **Spending tier** — if unknown, ask: Luxury / Value / Budget
6. **Travel dates** — if not provided, recommend based on spending tier (see below); otherwise use user-provided dates
7. **Generate links** — build Google Flights + Booking.com URLs and return them

---

## 2. Date Recommendation Logic (by spending tier)

| Tier | Arrive | Depart |
|------|--------|--------|
| Luxury | 2 days before kickoff | 2 days after match |
| Value | 1 day before kickoff | 1 day after match |
| Budget | Day of kickoff | Day after match |

---

## 3. Graph Topology

```
START
  └─► router_node
        └─► list_matches_node
              │
        match not selected ──► END (fixture list + prompt)
              │
        match selected
              └─► collect_preferences_node
                    │
              origin_city or spending_tier missing ──► END (prompt)
                    │
              all preferences collected
                    └─► confirm_dates_node
                          │
                    dates not confirmed ──► END (ask / recommend)
                          │
                    dates confirmed
                          └─► generate_links_node ──► END
```

**Removed from free-tier path:** `plan_travel_node`, `validator_node`, `formatter_node` are not invoked. They remain in the codebase for the future paid tier.

---

## 4. New & Modified Nodes

### `router_node` (modified)
`withStructuredOutput` schema expands to extract:
- `origin_city` — city travelling from (existing)
- `favorite_team` — club to watch (existing)
- `selected_match_id` — if user picks a match (e.g. "I'll take match 3", "the second one")
- `spending_tier` — `'luxury' | 'value' | 'budget'` if user mentions preference
- `travel_dates` — `{ checkIn, checkOut }` if user provides specific dates
- `wants_date_recommendation` — `boolean`, true if user says "give me a recommendation" / "you decide"

All extracted values merge with checkpointed preferences (null = keep prior value).

### `list_matches_node` (new)
- Fetches next 5 fixtures for `favorite_team` across all competitions (next 90 days)
- If `selected_match_id` is null: formats a numbered list as `direct_reply` and returns to END
- If `selected_match_id` is set: finds the matching fixture, geocodes venue, sets `itinerary.match` (including new `match_city` field)

### `collect_preferences_node` (new)
- Gates on `origin_city` and `spending_tier` both being present
- If either is missing: sets `direct_reply` prompting for the missing field(s) and returns to END
- If both present: passes through to `confirm_dates_node`

### `confirm_dates_node` (new)
- If `travel_dates` already set in preferences: passes through
- If user said `wants_date_recommendation` or no dates set: computes recommended dates based on `spending_tier` (see table above), sets `user_preferences.travel_dates`
- If neither: sets `direct_reply` asking for dates and returns to END

### `generate_links_node` (new)
- Builds transport URL:
  ```
  https://www.google.com/search?q={origin_city}+to+{match_city}+{checkIn}+to+{checkOut}
  ```
- Builds accommodation URL:
  ```
  https://www.booking.com/searchresults.en-gb.html?ss={match_city}&checkin={checkIn}&checkout={checkOut}&group_adults=1&no_rooms=1
  ```
- Sets `state.free_tier_links` with both URLs + metadata
- Sets `direct_reply` with a friendly summary message

---

## 5. State Changes

### `user_preferences` (expanded)
```ts
interface UserPreferences {
  origin_city: string
  favorite_team: string
  selected_match_id: string | null
  travel_dates: { checkIn: string; checkOut: string } | null
  spending_tier: 'luxury' | 'value' | 'budget' | null
}
```

All fields persist via `MemorySaver` checkpointer across turns.

### New graph state fields
```ts
free_tier_links: FreeTierLinks | null   // set by generate_links_node
wants_date_recommendation: boolean      // extracted by router_node, reset each turn
```

---

## 6. Type Changes (`lib/langchain/types.ts`)

### New: `FreeTierLinks`
```ts
interface FreeTierLinks {
  transportUrl: string
  accommodationUrl: string
  matchCity: string
  checkIn: string
  checkOut: string
}
```

### Updated: `RawMatchFixture`
```ts
match_city: string   // city name from geocoding, populated in list_matches_node
```

### Updated: `ChatStreamEvent`
```ts
{ type: 'done'; reply: string; itinerary: FormattedItinerary | null; links: FreeTierLinks | null }
```

---

## 7. API & Client Changes

**`route.ts`:** passes `links` field from graph state through the `done` SSE event.

**`PlanningChat.tsx`:** when `links` is present (free tier), renders two CTA buttons instead of rich itinerary cards:
- **Transport** → opens `transportUrl`
- **Accommodation** → opens `accommodationUrl`

---

## 8. Free vs. Paid Tier

- **Current:** everyone is on the free tier (hardcoded)
- **Free tier path:** `generate_links_node` — returns Google/Booking.com links
- **Paid tier path:** `plan_travel_node` → `validator_node` → `formatter_node` — real API results (Duffel flights + LiteAPI hotels)
- **Future:** when auth lands, `isPaid` flag on the user object routes the graph to the paid path after `confirm_dates_node`

---

## 9. Out of Scope

- Auth system / user accounts
- Paid tier routing logic
- Ticket purchasing
- Currency conversion (existing TODO in `plan_travel_node`)
