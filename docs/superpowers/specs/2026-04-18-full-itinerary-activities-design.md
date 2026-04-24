# Full Itinerary Activities — Design Spec

**Date:** 2026-04-18  
**Status:** Approved

## Overview

Add LLM-generated, day-by-day activity recommendations (football culture + city highlights) to FanBuddy's trip itinerary. Activities appear in the Live Itinerary sidebar as an accordion section beneath the existing Flight / Hotel / Match timeline.

## Data Model

New types added to `lib/langchain/types.ts`:

```ts
export interface ActivityItem {
  name: string;
  category: 'football' | 'culture' | 'food' | 'sightseeing';
  description: string;        // 1 short sentence
  estimatedDuration: string;  // e.g. "2 hours", "45 minutes"
  tip?: string;               // optional insider tip
}

export interface DayActivities {
  day: 'arrival' | 'match' | 'departure';
  date: string;               // YYYY-MM-DD
  label: string;              // e.g. "Arrival Day — Sat 19 Apr"
  activities: ActivityItem[]; // 4–5 items that fit within available hours
}

export interface ActivitiesData {
  city: string;
  days: DayActivities[];
}
```

`ChatStreamEvent` `done` variant gains one new optional field:

```ts
| { type: 'done'; reply: string; itinerary: FormattedItinerary | null; links: FreeTierLinks | null; fixtures: FixtureSummary[] | null; activities: ActivitiesData | null }
```

Graph state gains one new annotation:

```ts
activities: Annotation<ActivitiesData | null>({
  reducer: (_, y) => y,
  default: () => null,
})
```

## Graph Changes

### New node: `activities_node`

Position: after `generate_links_node`, before `END`.

```
generate_links_node → activities_node → END
```

**What it does:**
1. Reads `state.itinerary.match` (city, homeTeam, awayTeam, kickoffUtc) and `state.user_preferences.travel_dates` (checkIn, checkOut).
2. Derives day labels and available hours per day:
   - Arrival day (checkIn): ~6 hours available (afternoon + evening after landing/settling)
   - Match day (kickoff date): ~4 hours available (morning before heading to stadium)
   - Departure day (checkOut): ~3 hours available (morning before checkout/flight)
3. Makes **one LLM call** using `withStructuredOutput` with a Zod schema matching `ActivitiesData`.
4. Prompt instructs the model to:
   - Generate 4–5 activities per day that fit within available hours
   - Include a mix of football culture, local sightseeing, food, and city culture
   - Provide realistic `estimatedDuration` for each activity
   - Only include activities that collectively fit within the day's time budget
   - Tailor suggestions to the specific city and match (e.g. stadium tours for the home team)
5. Returns `{ activities }` on success; returns `{ activities: null }` on any error (non-blocking).

**Guard:** If `state.itinerary?.match` or `state.user_preferences.travel_dates` is null, sets `activities: null` and returns immediately — activities are optional, never blocking.

**Same-day deduplication:** If `checkIn === kickoffDate` (budget tier, 0 days before), arrival and match are the same calendar day — only generate one entry with `day: 'match'` for that date, covering both arrival activities and pre-match time (~4 hrs). Never emit two entries for the same date.

### `route.ts` changes

One new capture line in the stream loop:
```ts
if (update.activities != null) {
  activities = update.activities as ActivitiesData;
}
```

One new field in the `done` send:
```ts
send({ type: 'done', reply, itinerary: formatted, links, fixtures, activities });
```

One new status message in `NODE_STATUS`:
```ts
activities_node: 'Planning your activities...',
```

## UI Changes

### `PlanningChat.tsx`

**`ChatMessage` type:** `done` event now carries `activities: ActivitiesData | null`. Store in `useState<ActivitiesData | null>` alongside `currentItinerary`.

**`handleSendMessage`:** On `event.type === 'done'`, capture `event.activities` and call `setCurrentActivities(event.activities ?? null)`.

**Sidebar:** Below the existing 3-item timeline (Flight / Hotel / Match) and cost card, add an `ActivitiesAccordion` component when `currentActivities` is non-null.

### `ActivitiesAccordion` component

- Renders a section header "Activities" with a `MapPin` icon.
- Maps over `currentActivities.days` — one collapsible panel per day.
- Each panel header shows: colored dot (green = arrival, amber = match, indigo = departure), day label, item count, total time budget.
- Arrival day panel is **open by default**; match and departure are collapsed.
- Each activity row shows: category emoji icon, name (bold), description (muted), duration badge (green).
- Category → emoji mapping: `football` → ⚽, `culture` → 🏛️, `food` → 🍽️, `sightseeing` → 🗺️.
- If `tip` is present, show it as a small italic line below the description.

### Category color coding

| Category   | Emoji | Color accent |
|------------|-------|-------------|
| football   | ⚽    | emerald     |
| culture    | 🏛️   | violet      |
| food       | 🍽️   | orange      |
| sightseeing| 🗺️   | sky          |

## Error Handling

- `activities_node` catches all errors and returns `{ activities: null }` — the trip still completes normally.
- If `currentActivities` is null in the sidebar, the Activities section simply doesn't render. No empty state needed.

## LLM Call Budget

| Flow                  | LLM calls |
|-----------------------|-----------|
| Full trip (free tier) | 2 — `router_node` (extraction) + `activities_node` (activities generation) |
| Incomplete / missing  | 1 — `router_node` only |

## Out of Scope

- Real-time availability or booking links for activities
- User ability to remove / reorder activities
- Persisting activities across conversation turns (generated fresh each trip)
