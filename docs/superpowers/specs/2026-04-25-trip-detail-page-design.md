# Trip Detail Page — Design Spec

**Date:** 2026-04-25  
**Status:** Approved

## Overview

When a user clicks a trip card in the Hub, they navigate to a dedicated trip detail page at `/hub/[id]`. The page shows the full conversation that led to the trip on the left and the complete itinerary on the right — a read-only split view that mirrors the PlanningChat layout and design system.

---

## 1. Data Model

**No schema migration required.**

The graph uses `PostgresSaver` (from `@langchain/langgraph-checkpoint-postgres`), which writes the full conversation state to 4 Postgres tables (`checkpoints`, `checkpoint_blobs`, `checkpoint_writes`, `checkpoint_metadata`) on every turn, keyed by `thread_id`. The `trips` table already stores `thread_id`, so all conversation history, the formatted itinerary, and activities are already persisted and survive server restarts.

---

## 2. Data Persistence

**No changes to `app/api/chat/route.ts`.** The `PostgresSaver` checkpointer handles persistence automatically on every graph turn. Conversation messages, `FormattedItinerary`, and `ActivitiesData` are all recoverable by calling:

```ts
compiledGraph.getState({ configurable: { thread_id } })
```

---

## 3. API

### Existing: `GET /api/trips`
No changes. Returns lightweight list columns only.

### New: `GET /api/trips/[id]`

- Auth-gated via Clerk (`auth()`)
- Fetch trip row by `id` from the `trips` table
- If not found → `404`
- If `trip.user_id !== userId` → `403`
- Build the compiled graph, call `compiledGraph.getState({ configurable: { thread_id: trip.thread_id } })`
- From the returned state, extract and serialize:
  - `messages`: filter `BaseMessage[]` to `HumanMessage` and `AIMessage` only, map to `{ role: 'user' | 'ai', content: string }[]`
  - `formatted`: the `FormattedItinerary` object (may be `null` if trip was free-tier)
  - `activities`: the `ActivitiesData` object (may be `null`)
- Returns `{ trip, messages, itinerary, activities }`

---

## 4. Pages & Components

### `app/hub/page.tsx` (change)
Wrap each trip card `div` in a `<Link href={`/hub/${trip.id}`}>`. Style the card to show a hover state (subtle shadow lift or border highlight).

### `app/hub/[id]/page.tsx` (new)
Client component. On mount, fetches `GET /api/trips/[id]`. Renders:

- **Shell:** `<AppShell activePage="hub">` — identical sidebar as Hub page
- **Top bar:** back link (`← My Trips` → `/hub`), trip title (`{team} — {match_label}`), date, tier badge
- **Split body:**
  - **Left panel** (flex-1, white bg): read-only conversation replay. Maps `messages` to the same bubble styles as PlanningChat — user messages right-aligned in `bg-landing-primary`, AI messages left-aligned in `bg-landing-container-low` with `AiAvatar`. If `messages` is empty, shows a placeholder ("Conversation not available for this trip").
  - **Right panel** (w-80, `bg-landing-container-low`): `<ItineraryPanel>` shared component (see below).

### `components/shared/ItineraryPanel.tsx` (new — extracted from PlanningChat)
Receives `itinerary: FormattedItinerary | null` and `activities: ActivitiesData | null` as props. Renders the timeline (flight outbound, accommodation, main event, flight return), cost breakdown card, and activities accordion — identical markup to what currently lives inline in `PlanningChat`.

PlanningChat's existing sidebar `<aside>` is refactored to use `<ItineraryPanel>` — zero visual change, no duplication.

---

## 5. UI States

| State | Left panel | Right panel |
|---|---|---|
| Loading | Skeleton pulse | Skeleton pulse |
| Loaded, data present | Conversation bubbles | Full itinerary timeline + cost + activities |
| Loaded, `messages` empty | "Conversation not available for this trip" placeholder | Full itinerary (if present) |
| Loaded, `itinerary` null | Conversation bubbles | "No itinerary data" placeholder |
| Error (fetch failed) | Full-width error state with retry button | — |

---

## 6. Error Handling

- **Fetch error:** show full-width error message with a Retry button (same pattern as Hub page's error state).
- **403 response:** redirect to `/hub` — user should not see another user's trip.
- **404 response:** show "Trip not found" message with link back to `/hub`.
- **getState failure:** treat as a fetch error — if the checkpoint is somehow missing, show the error state rather than crashing.

---

## 7. Testing

- Unit test for `GET /api/trips/[id]`: auth missing → 401, wrong user → 403, not found → 404, happy path → 200 with messages and itinerary.
- Mock `compiledGraph.getState` in tests — no need to hit real checkpoint tables.
- No E2E tests for the page itself (visual/integration).

---

## 8. Out of Scope

- Continuing the conversation from the detail page (read-only only)
- Itinerary editing
- Sharing a trip with another user
- Itinerary version history
