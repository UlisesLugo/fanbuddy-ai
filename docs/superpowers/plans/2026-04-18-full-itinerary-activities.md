# Full Itinerary Activities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add LLM-generated, day-by-day activity recommendations (football culture + city highlights) to the trip itinerary, displayed as a collapsible accordion in the Live Itinerary sidebar.

**Architecture:** A new `activities_node` appended to the end of the LangGraph pipeline calls Claude once with structured output (Zod schema) to generate 4–5 activities per travel day. The activities data flows through the SSE `done` event to the frontend, where an `ActivitiesAccordion` component renders it below the cost breakdown in the sidebar. Pure helpers (`buildDayEntries`, `buildActivitiesPrompt`) are extracted to `lib/langchain/activities.ts` for testability.

**Tech Stack:** LangGraph, LangChain Anthropic, Zod structured output, React useState, Tailwind CSS, lucide-react.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `lib/langchain/activities.ts` | Pure helpers + Zod schema for activities |
| Create | `lib/__tests__/activities.test.ts` | Unit tests for pure helpers |
| Modify | `lib/langchain/types.ts` | Add `ActivityItem`, `DayActivities`, `ActivitiesData` types; update `ChatStreamEvent` |
| Modify | `lib/langchain/graph.ts` | Add `activities` state field, `activities_node` function, wire edge |
| Modify | `app/api/chat/route.ts` | Capture activities from stream, include in `done` event |
| Modify | `components/chat/PlanningChat.tsx` | `ActivitiesAccordion` component, sidebar wiring, state |

---

## Task 1: Add types to `lib/langchain/types.ts`

**Files:**
- Modify: `lib/langchain/types.ts`

- [ ] **Step 1: Add the three new exported types after `FormattedItinerary`**

Open `lib/langchain/types.ts`. After the `FormattedItinerary` interface (line 91), insert:

```ts
export interface ActivityItem {
  name: string;
  category: 'football' | 'culture' | 'food' | 'sightseeing';
  description: string;
  estimatedDuration: string;
  tip?: string;
}

export interface DayActivities {
  day: 'arrival' | 'match' | 'departure';
  date: string;
  label: string;
  activities: ActivityItem[];
}

export interface ActivitiesData {
  city: string;
  days: DayActivities[];
}
```

- [ ] **Step 2: Update `ChatStreamEvent` to include `activities`**

In `lib/langchain/types.ts`, find the `ChatStreamEvent` type (currently the last export, around line 141). Replace the `done` variant:

```ts
export type ChatStreamEvent =
  | { type: 'status'; message: string }
  | { type: 'done'; reply: string; itinerary: FormattedItinerary | null; links: FreeTierLinks | null; fixtures: FixtureSummary[] | null; activities: ActivitiesData | null }
  | { type: 'error'; message: string };
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/langchain/types.ts
git commit -m "feat: add ActivityItem, DayActivities, ActivitiesData types and update ChatStreamEvent"
```

---

## Task 2: Create `lib/langchain/activities.ts` with pure helpers

**Files:**
- Create: `lib/langchain/activities.ts`

- [ ] **Step 1: Create the file with Zod schema and pure helpers**

```ts
// lib/langchain/activities.ts
import { z } from 'zod';
import type { RawMatchFixture } from './types';

// ─── Zod schema for structured LLM output ─────────────────────────────────────

const ActivityItemSchema = z.object({
  name: z.string(),
  category: z.enum(['football', 'culture', 'food', 'sightseeing']),
  description: z.string(),
  estimatedDuration: z.string(),
  tip: z.string().optional(),
});

const DayActivitiesSchema = z.object({
  day: z.enum(['arrival', 'match', 'departure']),
  date: z.string(),
  label: z.string(),
  activities: z.array(ActivityItemSchema),
});

export const ActivitiesDataSchema = z.object({
  city: z.string(),
  days: z.array(DayActivitiesSchema),
});

// ─── Pure helpers (exported for testing) ──────────────────────────────────────

export interface DayEntry {
  day: 'arrival' | 'match' | 'departure';
  date: string;
  availableHours: number;
}

/**
 * Derives which days need activity planning and how many hours are available.
 * Deduplicates arrival and match when checkIn === kickoffDate (budget tier).
 */
export function buildDayEntries(
  kickoffUtc: string,
  travelDates: { checkIn: string; checkOut: string },
): DayEntry[] {
  const kickoffDate = kickoffUtc.slice(0, 10);
  const { checkIn, checkOut } = travelDates;
  const entries: DayEntry[] = [];

  if (checkIn !== kickoffDate) {
    entries.push({ day: 'arrival', date: checkIn, availableHours: 6 });
  }

  entries.push({ day: 'match', date: kickoffDate, availableHours: 4 });

  if (checkOut !== kickoffDate) {
    entries.push({ day: 'departure', date: checkOut, availableHours: 3 });
  }

  return entries;
}

/**
 * Builds the prompt string for the activities LLM call.
 */
export function buildActivitiesPrompt(
  match: Pick<RawMatchFixture, 'homeTeam' | 'awayTeam' | 'kickoffUtc' | 'match_city' | 'venue'>,
  travelDates: { checkIn: string; checkOut: string },
): string {
  const city = match.match_city ?? match.venue;
  const entries = buildDayEntries(match.kickoffUtc, travelDates);

  const dayLines = entries
    .map((e) => {
      const d = new Date(e.date + 'T00:00:00Z');
      const dateStr = d.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      });
      return `- ${e.day} day (${dateStr}): ${e.availableHours} hours available`;
    })
    .join('\n');

  return `You are FanBuddy.AI. Generate day-by-day activity recommendations for a football fan visiting ${city} to watch ${match.homeTeam} vs ${match.awayTeam}.

Days and available time:
${dayLines}

For each day generate 4-5 activities that collectively fit within the available hours. Mix these categories: football (stadium tours, fan pubs, sports museums), culture (museums, art, history), food (restaurants, markets, local specialties), sightseeing (landmarks, viewpoints, neighbourhoods).

Requirements per activity:
- name: specific, real place or activity in ${city}
- category: one of football, culture, food, sightseeing
- description: one sentence
- estimatedDuration: realistic time (e.g. "2 hours", "45 minutes")
- tip: optional insider tip (short phrase)

Prioritise football-themed activities on match day (pre-match atmosphere, fan zones, local sports bars near the stadium).
On arrival day, favour relaxed, arrival-friendly options.
On departure day, suggest morning activities close to transport links.
Ensure the total estimatedDuration for each day fits within its available hours.`;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

---

## Task 3: Write and pass tests for pure helpers

**Files:**
- Create: `lib/__tests__/activities.test.ts`

- [ ] **Step 1: Write the test file**

```ts
// lib/__tests__/activities.test.ts
import { buildActivitiesPrompt, buildDayEntries } from '../langchain/activities';

describe('buildDayEntries', () => {
  const kickoffUtc = '2026-04-20T18:00:00Z';

  it('returns 3 entries for a standard 3-day trip', () => {
    const result = buildDayEntries(kickoffUtc, { checkIn: '2026-04-19', checkOut: '2026-04-21' });
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ day: 'arrival', date: '2026-04-19', availableHours: 6 });
    expect(result[1]).toEqual({ day: 'match', date: '2026-04-20', availableHours: 4 });
    expect(result[2]).toEqual({ day: 'departure', date: '2026-04-21', availableHours: 3 });
  });

  it('omits arrival when checkIn equals kickoff date (budget tier)', () => {
    const result = buildDayEntries(kickoffUtc, { checkIn: '2026-04-20', checkOut: '2026-04-21' });
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ day: 'match', date: '2026-04-20', availableHours: 4 });
    expect(result[1]).toEqual({ day: 'departure', date: '2026-04-21', availableHours: 3 });
  });

  it('omits departure when checkOut equals kickoff date', () => {
    const result = buildDayEntries(kickoffUtc, { checkIn: '2026-04-19', checkOut: '2026-04-20' });
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ day: 'arrival', date: '2026-04-19', availableHours: 6 });
    expect(result[1]).toEqual({ day: 'match', date: '2026-04-20', availableHours: 4 });
  });

  it('returns only match day when checkIn and checkOut both equal kickoff date', () => {
    const result = buildDayEntries(kickoffUtc, { checkIn: '2026-04-20', checkOut: '2026-04-20' });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ day: 'match', date: '2026-04-20', availableHours: 4 });
  });
});

describe('buildActivitiesPrompt', () => {
  const match = {
    homeTeam: 'FC Barcelona',
    awayTeam: 'Real Madrid',
    kickoffUtc: '2026-04-20T18:00:00Z',
    match_city: 'Barcelona',
    venue: 'Camp Nou',
  };

  it('includes city, home team, and away team', () => {
    const prompt = buildActivitiesPrompt(match, { checkIn: '2026-04-19', checkOut: '2026-04-21' });
    expect(prompt).toContain('Barcelona');
    expect(prompt).toContain('FC Barcelona');
    expect(prompt).toContain('Real Madrid');
  });

  it('falls back to venue when match_city is undefined', () => {
    const matchNoCity = { ...match, match_city: undefined };
    const prompt = buildActivitiesPrompt(matchNoCity, { checkIn: '2026-04-19', checkOut: '2026-04-21' });
    expect(prompt).toContain('Camp Nou');
  });

  it('includes all 3 day labels for a standard trip', () => {
    const prompt = buildActivitiesPrompt(match, { checkIn: '2026-04-19', checkOut: '2026-04-21' });
    expect(prompt).toContain('arrival day');
    expect(prompt).toContain('match day');
    expect(prompt).toContain('departure day');
  });

  it('excludes arrival day when checkIn equals kickoff date', () => {
    const prompt = buildActivitiesPrompt(match, { checkIn: '2026-04-20', checkOut: '2026-04-21' });
    expect(prompt).not.toContain('arrival day');
    expect(prompt).toContain('match day');
    expect(prompt).toContain('departure day');
  });
});
```

- [ ] **Step 2: Run tests and confirm they pass**

```bash
npm test -- --testPathPattern=activities
```

Expected output: `PASS lib/__tests__/activities.test.ts` with 8 passing tests.

- [ ] **Step 3: Commit**

```bash
git add lib/langchain/activities.ts lib/__tests__/activities.test.ts
git commit -m "feat: add activities helpers with buildDayEntries and buildActivitiesPrompt"
```

---

## Task 4: Add `activities_node` to the graph

**Files:**
- Modify: `lib/langchain/graph.ts`

- [ ] **Step 1: Add imports at the top of `graph.ts`**

In `lib/langchain/graph.ts`, after the existing imports, add:

```ts
import { ActivitiesDataSchema, buildActivitiesPrompt } from './activities';
import type { ActivitiesData } from './types';
```

- [ ] **Step 2: Add `activities` field to `GraphState`**

Inside the `Annotation.Root({...})` block in `graph.ts`, after the `fixture_list` annotation (around line 112), add:

```ts
  activities: Annotation<ActivitiesData | null>({
    reducer: (_, y) => y,
    default: () => null,
  }),
```

- [ ] **Step 3: Add the `activities_node` function**

After the `generate_links_node` function (around line 416), add:

```ts
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
    const result = await structured.invoke(prompt);
    return { activities: result as ActivitiesData };
  } catch (err) {
    console.error('[activities_node] LLM call failed:', err);
    return { activities: null };
  }
}
```

- [ ] **Step 4: Wire `activities_node` into the graph**

In the graph assembly block at the bottom of `graph.ts`, find:

```ts
const graph = new StateGraph(GraphState)
  .addNode('router_node', router_node)
  .addNode('list_matches_node', list_matches_node)
  .addNode('collect_preferences_node', collect_preferences_node)
  .addNode('confirm_dates_node', confirm_dates_node)
  .addNode('generate_links_node', generate_links_node)
```

Add `.addNode('activities_node', activities_node)` after `generate_links_node`:

```ts
const graph = new StateGraph(GraphState)
  .addNode('router_node', router_node)
  .addNode('list_matches_node', list_matches_node)
  .addNode('collect_preferences_node', collect_preferences_node)
  .addNode('confirm_dates_node', confirm_dates_node)
  .addNode('generate_links_node', generate_links_node)
  .addNode('activities_node', activities_node)
```

Then find the final edge:

```ts
  .addEdge('generate_links_node', END)
```

Replace it with:

```ts
  .addEdge('generate_links_node', 'activities_node')
  .addEdge('activities_node', END)
```

- [ ] **Step 5: Verify TypeScript compiles and tests still pass**

```bash
npx tsc --noEmit && npm test
```

Expected: no TypeScript errors, all existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/langchain/graph.ts
git commit -m "feat: add activities_node to graph, wire after generate_links_node"
```

---

## Task 5: Update `app/api/chat/route.ts` to stream activities

**Files:**
- Modify: `app/api/chat/route.ts`

- [ ] **Step 1: Add `ActivitiesData` to the import from types**

In `app/api/chat/route.ts`, find the existing import:

```ts
import type {
  ChatApiRequest,
  ChatStreamEvent,
  FixtureSummary,
  FormattedItinerary,
  FreeTierLinks,
} from '@/lib/langchain/types';
```

Add `ActivitiesData`:

```ts
import type {
  ActivitiesData,
  ChatApiRequest,
  ChatStreamEvent,
  FixtureSummary,
  FormattedItinerary,
  FreeTierLinks,
} from '@/lib/langchain/types';
```

- [ ] **Step 2: Add `activities_node` to `NODE_STATUS`**

In `route.ts`, find the `NODE_STATUS` object:

```ts
const NODE_STATUS: Record<string, string> = {
  router_node: 'Finding upcoming fixtures...',
  list_matches_node: 'Loaded fixtures...',
  collect_preferences_node: 'Got your preferences...',
  confirm_dates_node: 'Confirmed your dates...',
  generate_links_node: 'Building your trip links...',
};
```

Add the new entry:

```ts
const NODE_STATUS: Record<string, string> = {
  router_node: 'Finding upcoming fixtures...',
  list_matches_node: 'Loaded fixtures...',
  collect_preferences_node: 'Got your preferences...',
  confirm_dates_node: 'Confirmed your dates...',
  generate_links_node: 'Building your trip links...',
  activities_node: 'Planning your activities...',
};
```

- [ ] **Step 3: Add `activities` capture variable**

In the `POST` handler, find the existing capture variables (around line 84):

```ts
let directReply: string | null = null;
let formatted: FormattedItinerary | null = null;
let links: FreeTierLinks | null = null;
let fixtures: FixtureSummary[] | null = null;
```

Add `activities`:

```ts
let directReply: string | null = null;
let formatted: FormattedItinerary | null = null;
let links: FreeTierLinks | null = null;
let fixtures: FixtureSummary[] | null = null;
let activities: ActivitiesData | null = null;
```

- [ ] **Step 4: Capture `activities` from the stream update**

In the stream loop, after the `fixture_list` capture block:

```ts
if (update.fixture_list != null) {
  fixtures = update.fixture_list as FixtureSummary[];
}
```

Add:

```ts
if (update.activities != null) {
  activities = update.activities as ActivitiesData;
}
```

- [ ] **Step 5: Include `activities` in the `done` event**

Find:

```ts
send({ type: 'done', reply, itinerary: formatted, links, fixtures });
```

Replace with:

```ts
send({ type: 'done', reply, itinerary: formatted, links, fixtures, activities });
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat: stream activities through SSE done event"
```

---

## Task 6: Add `ActivitiesAccordion` to the sidebar

**Files:**
- Modify: `components/chat/PlanningChat.tsx`

- [ ] **Step 1: Add `ActivitiesData` to the import from types**

In `PlanningChat.tsx`, find:

```ts
import type { ChatStreamEvent, FixtureSummary, FormattedItinerary, FreeTierLinks } from '@/lib/langchain/types';
```

Add `ActivitiesData`:

```ts
import type { ActivitiesData, ChatStreamEvent, FixtureSummary, FormattedItinerary, FreeTierLinks } from '@/lib/langchain/types';
```

- [ ] **Step 2: Add `MapPin` to the lucide-react import**

Find the lucide-react import block at the top of the file. Add `MapPin` to the list:

```ts
import {
  BarChart3,
  Bell,
  Bot,
  Check,
  ChevronRight,
  Compass,
  CreditCard,
  Crown,
  Hotel,
  Landmark,
  LayoutGrid,
  MapPin,
  Plane,
  PlaneTakeoff,
  Plus,
  Radar,
  Send,
  Settings,
  Shield,
  UserCircle,
  UtensilsCrossed,
} from 'lucide-react';
```

- [ ] **Step 3: Add `ActivitiesAccordion` component**

Add this component after the `RichCardsBlock` component definition (before `QUICK_CHIPS`):

```tsx
const CATEGORY_EMOJI: Record<string, string> = {
  football: '⚽',
  culture: '🏛️',
  food: '🍽️',
  sightseeing: '🗺️',
};

const DAY_DOT_COLOR: Record<string, string> = {
  arrival: 'bg-emerald-500',
  match: 'bg-amber-400',
  departure: 'bg-indigo-500',
};

function sumDurationMinutes(durations: string[]): number {
  return durations.reduce((sum, d) => {
    const m = d.match(/(\d+(?:\.\d+)?)\s*(hour|hr|minute|min)/i);
    if (!m) return sum;
    const val = parseFloat(m[1]);
    return sum + (m[2].toLowerCase().startsWith('h') ? val * 60 : val);
  }, 0);
}

function formatTotalHours(minutes: number): string {
  const h = minutes / 60;
  return h < 1 ? `${Math.round(minutes)}m` : `~${h % 1 === 0 ? h : h.toFixed(1)}h`;
}

function ActivitiesAccordion({ activities }: { activities: ActivitiesData }) {
  const [openDay, setOpenDay] = useState<string>(activities.days[0]?.day ?? '');

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center gap-2">
        <MapPin className="size-4 text-landing-primary" strokeWidth={2} />
        <h4 className="text-xs font-bold uppercase tracking-wider text-landing-on-surface-variant">
          Activities
        </h4>
      </div>
      <div className="flex flex-col gap-2">
        {activities.days.map((d) => {
          const isOpen = openDay === d.day;
          const totalMins = sumDurationMinutes(d.activities.map((a) => a.estimatedDuration));
          return (
            <div
              key={d.day}
              className="overflow-hidden rounded-xl border border-landing-outline-variant/15"
            >
              <button
                type="button"
                onClick={() => setOpenDay(isOpen ? '' : d.day)}
                className="flex w-full items-center justify-between bg-white px-3 py-2.5 text-left"
              >
                <div className="flex items-center gap-2">
                  <div className={`h-1.5 w-1.5 rounded-full ${DAY_DOT_COLOR[d.day] ?? 'bg-zinc-400'}`} />
                  <span className="text-[11px] font-bold text-landing-on-surface">{d.label}</span>
                </div>
                <span className="text-[10px] text-landing-on-surface-variant">
                  {d.activities.length} items · {formatTotalHours(totalMins)}
                </span>
              </button>
              {isOpen && (
                <div className="border-t border-landing-outline-variant/10 bg-landing-container-lowest px-3 py-2">
                  {d.activities.map((a, i) => (
                    <div
                      key={i}
                      className={`flex gap-2 py-2 ${i < d.activities.length - 1 ? 'border-b border-landing-outline-variant/10' : ''}`}
                    >
                      <span className="shrink-0 text-sm">
                        {CATEGORY_EMOJI[a.category] ?? '📍'}
                      </span>
                      <div>
                        <p className="text-[11px] font-semibold text-landing-on-surface">{a.name}</p>
                        <p className="mt-0.5 text-[10px] text-landing-on-surface-variant">
                          {a.description}
                        </p>
                        {a.tip && (
                          <p className="mt-0.5 text-[10px] italic text-landing-on-surface-variant/70">
                            {a.tip}
                          </p>
                        )}
                        <span className="mt-1 inline-block text-[9px] font-semibold text-emerald-600">
                          {a.estimatedDuration}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add `currentActivities` state**

In `PlanningChat`, find:

```ts
const [currentItinerary, setCurrentItinerary] = useState<FormattedItinerary | null>(null);
```

Add after it:

```ts
const [currentActivities, setCurrentActivities] = useState<ActivitiesData | null>(null);
```

- [ ] **Step 5: Capture `activities` from the SSE `done` event**

In `handleSendMessage`, find the `done` event handler block:

```ts
} else if (event.type === 'done') {
  if (event.fixtures && event.fixtures.length > 0) {
    pushAiFixtures(event.reply, event.fixtures);
  } else if (event.links) {
    pushAiLinks(event.reply, event.links);
  } else {
    pushAiText(event.reply);
  }
  if (event.itinerary) {
    pushAiCards(event.itinerary);
    setCurrentItinerary(event.itinerary);
  }
}
```

Add the activities capture after `setCurrentItinerary`:

```ts
} else if (event.type === 'done') {
  if (event.fixtures && event.fixtures.length > 0) {
    pushAiFixtures(event.reply, event.fixtures);
  } else if (event.links) {
    pushAiLinks(event.reply, event.links);
  } else {
    pushAiText(event.reply);
  }
  if (event.itinerary) {
    pushAiCards(event.itinerary);
    setCurrentItinerary(event.itinerary);
  }
  if (event.activities) {
    setCurrentActivities(event.activities);
  }
}
```

- [ ] **Step 6: Render `ActivitiesAccordion` in the sidebar**

In the sidebar `<aside>`, find the block that renders when `currentItinerary` exists. The current structure ends with the cost card. The cost card has `className="mt-auto ..."`. 

Replace the `<>` fragment that wraps the timeline and cost card with a scrollable wrapper, and add the accordion after the cost card:

Find:
```tsx
) : (
  <>
    <div className="relative space-y-10">
```

Replace with:
```tsx
) : (
  <div className="no-scrollbar flex flex-1 flex-col overflow-y-auto">
    <div className="relative space-y-10">
```

Find the closing tags after the cost card (currently ends `</div> </>` for the fragment):
```tsx
        </div>
      </div>
    </>
  )}
```

Replace with (close the new wrapper div, add accordion, close everything):
```tsx
        </div>
      </div>
      {currentActivities && (
        <ActivitiesAccordion activities={currentActivities} />
      )}
    </div>
  )}
```

Also remove the `mt-auto` from the cost card's className since the parent is now a scrollable flex column. Find:

```tsx
<div className="mt-auto rounded-2xl border border-landing-outline-variant/5 bg-white p-6 shadow-sm">
```

Replace with:

```tsx
<div className="mt-6 rounded-2xl border border-landing-outline-variant/5 bg-white p-6 shadow-sm">
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add components/chat/PlanningChat.tsx
git commit -m "feat: add ActivitiesAccordion to sidebar, wire currentActivities state"
```

---

## Task 7: Manual smoke test

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

Open `http://localhost:3000/chat`.

- [ ] **Step 2: Run a full trip flow**

Send: "I'm from London and want to watch FC Barcelona"

Expected: fixture list appears as cards.

- [ ] **Step 3: Select a match**

Click any fixture card.

Expected: asked for spending style.

- [ ] **Step 4: Complete preferences**

Reply: "value"

Expected: asked for travel dates.

- [ ] **Step 5: Complete dates**

Reply: "recommend dates"

Expected: status messages include "Planning your activities..." then transport/accommodation links appear. Shortly after, the Live Itinerary sidebar shows the Activities section below the cost card.

- [ ] **Step 6: Verify accordion behaviour**

- First day panel should be open by default showing 4–5 activity rows with emoji, name, description, duration badge.
- Clicking another day panel opens it and closes the first.
- Clicking the open panel closes it.

- [ ] **Step 7: Verify error resilience**

Temporarily break the activities prompt by adding `throw new Error('test')` at the start of `activities_node`. Restart dev server, run a full trip. The trip should complete normally with links shown; the Activities section simply doesn't render in the sidebar. Remove the throw after verifying.

- [ ] **Step 8: Final commit (if any fixes were made)**

```bash
git add -p
git commit -m "fix: <describe any fixes found during smoke test>"
```
