# Trip Detail Page — Design Spec

**Date:** 2026-04-25  
**Status:** Approved

## Overview

When a user clicks a trip card in the Hub, they navigate to a dedicated trip detail page at `/hub/[id]`. The page shows the full conversation that led to the trip on the left and the complete itinerary on the right — a read-only split view that mirrors the PlanningChat layout and design system.

---

## 1. Data Model

Two nullable JSON columns added to the existing `trips` table:

| Column | Type | Notes |
|---|---|---|
| `messages` | `json` nullable | `{role: 'user' \| 'ai', content: string}[]` — human and AI turns only, tool noise excluded |
| `formatted_itinerary` | `json` nullable | `FormattedItinerary` shape (match, flight, hotel, cost, validationStatus, validationNotes, summary) |

Both columns are nullable so existing trip rows are unaffected. The `ActivitiesData` for the trip is stored separately if available (see Section 3).

**Why nullable:** existing trips in the DB have no messages or itinerary data. The UI handles `null` gracefully (empty left panel, empty right panel with placeholder).

**Why Option A (columns on `trips`) over separate table:** single-table reads, no joins, trivially updateable if itinerary changes in the future. Versioning can be added later without changing the API contract.

---

## 2. Data Persistence

In `app/api/chat/route.ts`, when `tripCompleted === true`:

1. Call `compiledGraph.getState({ configurable: { thread_id } })` — already done to pull match/prefs.
2. From `stateValues.messages` (a `BaseMessage[]`), filter to `HumanMessage` and `AIMessage` instances only, serialize each to `{ role: 'user' | 'ai', content: string }`.
3. From `stateValues.formatted`, use the `FormattedItinerary` object directly.
4. Pass both into the existing `db.insert(trips).values({...})` call as `messages` and `formatted_itinerary`.

Activities (`ActivitiesData`) are also saved if present in `stateValues.activities` — add an `activities` nullable JSON column alongside the other two.

---

## 3. API

### Existing: `GET /api/trips`
No changes. Returns lightweight list columns only (no `messages` or `formatted_itinerary` to keep list payloads small).

### New: `GET /api/trips/[id]`

- Auth-gated via Clerk (`auth()`)
- Fetch trip row by `id`
- If not found → `404`
- If `trip.user_id !== userId` → `403`
- Returns `{ trip }` — the full row including `messages`, `formatted_itinerary`, `activities`

---

## 4. Pages & Components

### `app/hub/page.tsx` (change)
Wrap each trip card `div` in a `<Link href={`/hub/${trip.id}`}>`. Style the card to show a hover state (subtle shadow lift or border highlight).

### `app/hub/[id]/page.tsx` (new)
Client component. On mount, fetches `GET /api/trips/[id]`. Renders:

- **Shell:** `<AppShell activePage="hub">` — identical sidebar as Hub page
- **Top bar:** back link (`← My Trips` → `/hub`), trip title (`{team} — {match_label}`), date, tier badge
- **Split body:**
  - **Left panel** (flex-1, white bg): read-only conversation replay. Maps `trip.messages` to the same bubble styles as PlanningChat — user messages right-aligned in `bg-landing-primary`, AI messages left-aligned in `bg-landing-container-low` with `AiAvatar`. If `messages` is null/empty, shows a placeholder ("Conversation not available for this trip").
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
| Loaded, `messages` null | "Conversation not available for this trip" placeholder | Full itinerary (if present) |
| Loaded, `formatted_itinerary` null | Conversation bubbles | "No itinerary data" placeholder |
| Error (fetch failed) | Full-width error state with retry button | — |

---

## 6. Error Handling

- **Fetch error:** show full-width error message with a Retry button (same pattern as Hub page's error state).
- **403 response:** redirect to `/hub` — user should not see another user's trip.
- **404 response:** show "Trip not found" message with link back to `/hub`.

---

## 7. Testing

- Unit test for `GET /api/trips/[id]`: auth missing → 401, wrong user → 403, not found → 404, happy path → 200 with messages and itinerary.
- Update `app/api/chat/route.ts` test to verify `messages` and `formatted_itinerary` are passed to `db.insert` when a trip completes.
- No E2E tests for the page itself (visual/integration).

---

## 8. Out of Scope

- Continuing the conversation from the detail page (read-only only)
- Itinerary editing
- Sharing a trip with another user
- Itinerary version history
