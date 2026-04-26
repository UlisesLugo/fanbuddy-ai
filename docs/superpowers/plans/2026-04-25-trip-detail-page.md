# Trip Detail Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users click a trip card in the Hub and see a split-view page with the full conversation history on the left and the complete itinerary (timeline, cost, activities) on the right.

**Architecture:** `trips` already stores `thread_id`; `PostgresSaver` already persists full graph state (messages + itinerary) to Postgres. A new `GET /api/trips/[id]` endpoint fetches the trip row and calls `compiledGraph.getState(thread_id)` to retrieve the conversation and itinerary. A new `/hub/[id]` page renders the split view using a shared `ItineraryPanel` component extracted from `PlanningChat`.

**Tech Stack:** Next.js 14 App Router, TypeScript, Drizzle ORM, Clerk auth, LangGraph (`buildGraph` / `getState`), Tailwind CSS (`landing-*` palette), Jest, `@langchain/core/messages`

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `components/shared/ItineraryPanel.tsx` | Timeline + cost card + activities accordion; receives `itinerary` and `activities` as props |
| Modify | `components/chat/PlanningChat.tsx` | Replace inline aside content with `<ItineraryPanel>` |
| Create | `lib/__tests__/trips-id-route.test.ts` | Unit tests for `GET /api/trips/[id]` |
| Create | `app/api/trips/[id]/route.ts` | New auth-gated API route — fetches trip + calls `getState` |
| Modify | `app/hub/page.tsx` | Wrap trip cards in `<Link href="/hub/{id}">` |
| Create | `app/hub/[id]/page.tsx` | Trip detail page — split view client component |

---

## Task 1: Extract ItineraryPanel shared component

**Files:**
- Create: `components/shared/ItineraryPanel.tsx`
- Modify: `components/chat/PlanningChat.tsx`

This is a pure refactor. Move the entire aside body (timeline, cost card, activities) into a standalone component. No new tests — the existing UI must be visually unchanged.

- [ ] **Step 1: Create `components/shared/ItineraryPanel.tsx`**

```tsx
'use client';

import { BarChart3, Compass, CreditCard, Hotel, Landmark, MapPin, Plane } from 'lucide-react';
import { useState } from 'react';

import type { ActivitiesData, FormattedItinerary } from '@/lib/langchain/types';

function formatDate(isoUtc: string) {
  try {
    return new Date(isoUtc).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return isoUtc;
  }
}

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

const CATEGORY_BADGE_COLOR: Record<string, string> = {
  football: 'text-emerald-600',
  culture: 'text-violet-600',
  food: 'text-orange-500',
  sightseeing: 'text-sky-600',
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
  const defaultOpen =
    activities.days.find((d) => d.day === 'arrival')?.day ??
    activities.days[0]?.day ??
    '';
  const [openDay, setOpenDay] = useState<string>(defaultOpen);

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
            <div key={d.day} className="overflow-hidden rounded-xl border border-landing-outline-variant/15">
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
                      key={a.name}
                      className={`flex gap-2 py-2 ${i < d.activities.length - 1 ? 'border-b border-landing-outline-variant/10' : ''}`}
                    >
                      <span className="shrink-0 text-sm">{CATEGORY_EMOJI[a.category] ?? '📍'}</span>
                      <div>
                        <div className="flex items-baseline gap-2">
                          <p className="text-[11px] font-semibold text-landing-on-surface">{a.name}</p>
                          {a.recommendedTime && (
                            <span className="text-[9px] text-landing-on-surface-variant/80">{a.recommendedTime}</span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[10px] text-landing-on-surface-variant">{a.description}</p>
                        {a.tip && (
                          <p className="mt-0.5 text-[10px] italic text-landing-on-surface-variant/70">{a.tip}</p>
                        )}
                        <span className={`mt-1 inline-block text-[9px] font-semibold ${CATEGORY_BADGE_COLOR[a.category] ?? 'text-emerald-600'}`}>
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

interface ItineraryPanelProps {
  itinerary: FormattedItinerary | null;
  activities: ActivitiesData | null;
}

export default function ItineraryPanel({ itinerary, activities }: ItineraryPanelProps) {
  return (
    <>
      <h3 className="mb-8 font-headline text-lg font-bold tracking-tight">Live Itinerary</h3>
      {!itinerary && !activities ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-landing-container-highest">
            <Compass className="size-7 text-landing-on-surface-variant/40" strokeWidth={1.5} />
          </div>
          <p className="text-sm font-semibold text-landing-on-surface-variant">No trip planned yet</p>
          <p className="text-xs text-landing-on-surface-variant/60">
            Your itinerary will appear here once FanBuddy plans your trip.
          </p>
        </div>
      ) : (
        <div className="no-scrollbar flex flex-1 flex-col overflow-y-auto">
          {itinerary && (
            <>
              <div className="relative space-y-10">
                <div className="absolute bottom-2 left-[11px] top-2 w-0.5 bg-landing-outline-variant/20" />
                <div className="relative flex gap-4">
                  <div className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-landing-primary">
                    <Plane className="size-3.5 text-white" strokeWidth={2} fill="currentColor" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-landing-primary">
                      Flight Outbound
                    </h4>
                    <p className="mt-1 text-sm font-semibold">
                      {itinerary.flight.outbound.origin} → {itinerary.flight.outbound.destination}
                    </p>
                    <p className="mt-0.5 text-[10px] text-landing-on-surface-variant">
                      {formatDate(itinerary.flight.outbound.departureUtc)}, {itinerary.flight.outbound.airline}
                    </p>
                  </div>
                </div>
                <div className="relative flex gap-4">
                  <div className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-landing-outline-variant/30 bg-landing-container-highest">
                    <Hotel className="size-3.5 text-landing-on-surface-variant" strokeWidth={2} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider">Accommodation</h4>
                    <p className="mt-1 text-sm font-semibold">{itinerary.hotel.name}</p>
                    <p className="mt-0.5 text-[10px] text-landing-on-surface-variant">
                      {itinerary.hotel.nights} Nights •{' '}
                      {itinerary.hotel.wasDowngraded ? 'Downgraded' : 'Suggested'}
                    </p>
                  </div>
                </div>
                <div className="relative flex gap-4">
                  <div className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-landing-outline-variant/30 bg-landing-container-highest">
                    <Landmark className="size-3.5 text-landing-on-surface-variant" strokeWidth={2} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider">Main Event</h4>
                    <p className="mt-1 text-sm font-semibold">{itinerary.match.venue}</p>
                    <p className="mt-0.5 text-[10px] text-landing-on-surface-variant">
                      Kickoff: {formatDate(itinerary.match.kickoffUtc)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-6 rounded-2xl border border-landing-outline-variant/5 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h4 className="text-xs font-bold text-landing-on-surface-variant">ESTIMATED COST</h4>
                  <BarChart3 className="size-4 text-landing-primary" strokeWidth={2} />
                </div>
                <div className="mb-6 space-y-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-landing-on-surface-variant">Flights</span>
                    <span className="font-medium">{itinerary.cost.flightsEur} EUR</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-landing-on-surface-variant">Match Tickets</span>
                    <span className="font-medium">{itinerary.cost.matchTicketEur} EUR</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-landing-on-surface-variant">Stay (Avg)</span>
                    <span className="font-medium">{itinerary.cost.stayEur} EUR</span>
                  </div>
                </div>
                <div className="flex items-end justify-between border-t border-landing-outline-variant/10 pt-4">
                  <div>
                    <p className="text-[10px] text-landing-on-surface-variant">TOTAL</p>
                    <p className="font-headline text-2xl font-black text-landing-on-surface">
                      {itinerary.cost.totalEur} EUR
                    </p>
                  </div>
                  <div className="rounded-lg bg-landing-primary p-1 text-landing-primary-container">
                    <CreditCard className="size-5" strokeWidth={2} />
                  </div>
                </div>
              </div>
            </>
          )}
          {activities && <ActivitiesAccordion activities={activities} />}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Update `components/chat/PlanningChat.tsx`**

Remove these from the lucide-react import: `BarChart3`, `Compass`, `CreditCard`, `Landmark`, `MapPin`. Keep all others.

Remove these declarations entirely from the file (they move to ItineraryPanel):
- `CATEGORY_EMOJI` constant
- `DAY_DOT_COLOR` constant
- `CATEGORY_BADGE_COLOR` constant
- `sumDurationMinutes` function
- `formatTotalHours` function
- `ActivitiesAccordion` function

Add this import after the existing imports:

```tsx
import ItineraryPanel from '@/components/shared/ItineraryPanel';
```

Replace the `<aside>` block (the one with `aria-label="Live itinerary"`) with:

```tsx
<aside
  className="hidden w-80 flex-col border-l border-landing-outline-variant/10 bg-landing-container-low p-8 lg:flex"
  aria-label="Live itinerary"
>
  <ItineraryPanel itinerary={currentItinerary} activities={currentActivities} />
</aside>
```

- [ ] **Step 3: Verify the dev server compiles with no errors**

```bash
npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors, build succeeds (or "Route (app)" table printed).

- [ ] **Step 4: Commit**

```bash
git add components/shared/ItineraryPanel.tsx components/chat/PlanningChat.tsx
git commit -m "refactor: extract ItineraryPanel shared component from PlanningChat"
```

---

## Task 2: Write failing tests for `GET /api/trips/[id]`

**Files:**
- Create: `lib/__tests__/trips-id-route.test.ts`

- [ ] **Step 1: Create `lib/__tests__/trips-id-route.test.ts`**

```ts
// Mock @langchain/core/messages so instanceof checks work in the route handler
class MockHumanMessage {
  content: string;
  constructor(content: string) { this.content = content; }
}
class MockAIMessage {
  content: string;
  constructor(content: string) { this.content = content; }
}
jest.mock('@langchain/core/messages', () => ({
  HumanMessage: MockHumanMessage,
  AIMessage: MockAIMessage,
}));

import { GET } from '@/app/api/trips/[id]/route';

const mockAuth = jest.fn();
jest.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
}));

const mockWhere = jest.fn();
const mockFrom = jest.fn();
const mockSelect = jest.fn();
jest.mock('@/lib/db', () => ({
  db: { select: (...args: unknown[]) => mockSelect(...args) },
}));
jest.mock('drizzle-orm', () => ({ eq: jest.fn() }));
jest.mock('@/lib/db/schema', () => ({
  trips: { id: 'id', user_id: 'user_id' },
}));

const mockGetState = jest.fn();
jest.mock('@/lib/langchain/graph', () => ({
  buildGraph: jest.fn(),
}));

import { buildGraph } from '@/lib/langchain/graph';
const mockBuildGraph = buildGraph as jest.Mock;

const fakeTrip = {
  id: 'trip-123',
  user_id: 'user_abc',
  thread_id: 'thread-xyz',
  team: 'Arsenal',
  match_label: 'Arsenal vs Chelsea',
  match_date: '2025-03-15',
  destination: 'London',
  tier: 'paid',
  created_at: new Date('2025-01-01T00:00:00Z'),
};

const fakeItinerary = {
  match: { venue: 'Emirates', kickoffUtc: '2025-03-15T15:00:00Z', homeTeam: 'Arsenal', awayTeam: 'Chelsea', league: 'PL', matchday: '28', ticketPriceEur: 85, tvConfirmed: true },
  flight: {
    outbound: { origin: 'MAD', destination: 'LHR', departureUtc: '2025-03-14T07:30:00Z', arrivalUtc: '2025-03-14T09:30:00Z', airline: 'Iberia', direct: true, priceEur: 155 },
    inbound: { origin: 'LHR', destination: 'MAD', departureUtc: '2025-03-16T18:00:00Z', arrivalUtc: '2025-03-16T21:00:00Z', airline: 'Iberia', direct: true, priceEur: 155 },
    totalPriceEur: 310,
  },
  hotel: { name: 'Premier Inn', city: 'London', checkIn: '2025-03-14', checkOut: '2025-03-16', nights: 2, pricePerNightEur: 85, totalEur: 170, wasDowngraded: false },
  cost: { flightsEur: 310, matchTicketEur: 85, stayEur: 170, totalEur: 565 },
  validationStatus: 'OK' as const,
  validationNotes: [],
  summary: 'Your Arsenal trip is ready!',
};

function makeRequest(id: string) {
  return { params: { id } } as unknown as Parameters<typeof GET>[1];
}

describe('GET /api/trips/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockBuildGraph.mockResolvedValue({ getState: mockGetState });
  });

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const res = await GET({} as Request, makeRequest('trip-123'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when trip does not exist', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_abc' });
    mockWhere.mockResolvedValue([]);
    const res = await GET({} as Request, makeRequest('trip-999'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when trip belongs to a different user', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_other' });
    mockWhere.mockResolvedValue([fakeTrip]);
    const res = await GET({} as Request, makeRequest('trip-123'));
    expect(res.status).toBe(403);
  });

  it('returns 500 when getState throws', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_abc' });
    mockWhere.mockResolvedValue([fakeTrip]);
    mockGetState.mockRejectedValue(new Error('DB connection lost'));
    const res = await GET({} as Request, makeRequest('trip-123'));
    expect(res.status).toBe(500);
  });

  it('returns trip, serialized messages, itinerary, and activities on success', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_abc' });
    mockWhere.mockResolvedValue([fakeTrip]);

    const { HumanMessage, AIMessage } = jest.requireMock('@langchain/core/messages') as {
      HumanMessage: typeof MockHumanMessage;
      AIMessage: typeof MockAIMessage;
    };

    mockGetState.mockResolvedValue({
      values: {
        messages: [
          new HumanMessage('I want to watch Arsenal'),
          new AIMessage('Which city are you travelling from?'),
          new HumanMessage('Madrid'),
          new AIMessage('Here is your trip!'),
        ],
        formatted: fakeItinerary,
        activities: null,
      },
    });

    const res = await GET({} as Request, makeRequest('trip-123'));
    expect(res.status).toBe(200);

    const body = await res.json() as {
      trip: typeof fakeTrip;
      messages: { role: string; content: string }[];
      itinerary: typeof fakeItinerary;
      activities: null;
    };

    expect(body.trip.id).toBe('trip-123');
    expect(body.messages).toEqual([
      { role: 'user', content: 'I want to watch Arsenal' },
      { role: 'ai', content: 'Which city are you travelling from?' },
      { role: 'user', content: 'Madrid' },
      { role: 'ai', content: 'Here is your trip!' },
    ]);
    expect(body.itinerary?.cost.totalEur).toBe(565);
    expect(body.activities).toBeNull();

    expect(mockGetState).toHaveBeenCalledWith({ configurable: { thread_id: 'thread-xyz' } });
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
npm test -- --testPathPattern="trips-id-route" --no-coverage 2>&1 | tail -20
```

Expected: `Cannot find module '@/app/api/trips/[id]/route'`

---

## Task 3: Implement `GET /api/trips/[id]`

**Files:**
- Create: `app/api/trips/[id]/route.ts`

- [ ] **Step 1: Create `app/api/trips/[id]/route.ts`**

```ts
import { auth } from '@clerk/nextjs/server';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { trips } from '@/lib/db/schema';
import { buildGraph } from '@/lib/langchain/graph';
import type { ActivitiesData, FormattedItinerary } from '@/lib/langchain/types';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const [trip] = await db
    .select()
    .from(trips)
    .where(eq(trips.id, params.id));

  if (!trip) return new Response('Not Found', { status: 404 });
  if (trip.user_id !== userId) return new Response('Forbidden', { status: 403 });

  try {
    const graph = await buildGraph();
    const state = await graph.getState({ configurable: { thread_id: trip.thread_id } });
    const stateValues = state.values as Record<string, unknown>;

    const rawMessages = (stateValues.messages ?? []) as unknown[];
    const messages = rawMessages
      .filter((m): m is HumanMessage | AIMessage => m instanceof HumanMessage || m instanceof AIMessage)
      .map((m) => ({
        role: m instanceof HumanMessage ? ('user' as const) : ('ai' as const),
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      }));

    const itinerary = (stateValues.formatted ?? null) as FormattedItinerary | null;
    const activities = (stateValues.activities ?? null) as ActivitiesData | null;

    return Response.json({ trip, messages, itinerary, activities });
  } catch (err) {
    console.error('[trips/[id]] getState error', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}
```

- [ ] **Step 2: Run the tests and confirm they all pass**

```bash
npm test -- --testPathPattern="trips-id-route" --no-coverage 2>&1 | tail -20
```

Expected:
```
PASS lib/__tests__/trips-id-route.test.ts
  GET /api/trips/[id]
    ✓ returns 401 when not authenticated
    ✓ returns 404 when trip does not exist
    ✓ returns 403 when trip belongs to a different user
    ✓ returns 500 when getState throws
    ✓ returns trip, serialized messages, itinerary, and activities on success
```

- [ ] **Step 3: Run full test suite to check for regressions**

```bash
npm test --no-coverage 2>&1 | tail -10
```

Expected: all existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add app/api/trips/[id]/route.ts lib/__tests__/trips-id-route.test.ts
git commit -m "feat: add GET /api/trips/[id] endpoint with auth and graph state retrieval"
```

---

## Task 4: Make Hub trip cards clickable links

**Files:**
- Modify: `app/hub/page.tsx`

- [ ] **Step 1: Update `app/hub/page.tsx`**

Add `Link` to the imports at the top of the file (it's already imported — verify it's there).

Replace the trip card `div` wrapper:

```tsx
// Before
<div key={trip.id} className="glass-panel rounded-2xl p-5">

// After
<Link key={trip.id} href={`/hub/${trip.id}`} className="glass-panel block rounded-2xl p-5 transition-shadow hover:shadow-md">
```

Close the `</div>` → `</Link>` accordingly.

- [ ] **Step 2: Verify build compiles cleanly**

```bash
npm run build 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/hub/page.tsx
git commit -m "feat: make hub trip cards link to trip detail page"
```

---

## Task 5: Build the trip detail page

**Files:**
- Create: `app/hub/[id]/page.tsx`

- [ ] **Step 1: Create `app/hub/[id]/page.tsx`**

```tsx
'use client';

import { AlertCircle, ArrowLeft, Bot } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import AppShell from '@/components/shared/AppShell';
import ItineraryPanel from '@/components/shared/ItineraryPanel';
import type { ActivitiesData, FormattedItinerary } from '@/lib/langchain/types';

type TripRecord = {
  id: string;
  team: string;
  match_label: string;
  match_date: string;
  destination: string;
  tier: 'free' | 'paid';
  thread_id: string;
  created_at: string;
};

type Message = { role: 'user' | 'ai'; content: string };

type TripDetailData = {
  trip: TripRecord;
  messages: Message[];
  itinerary: FormattedItinerary | null;
  activities: ActivitiesData | null;
};

function AiAvatar() {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-landing-primary-container/30">
      <Bot className="size-5 text-landing-primary" strokeWidth={2} />
    </div>
  );
}

function TierBadge({ tier }: { tier: 'free' | 'paid' }) {
  if (tier === 'paid') {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
        Pro
      </span>
    );
  }
  return (
    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-500">
      Free
    </span>
  );
}

function SkeletonPane() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-4">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-zinc-100" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-48 animate-pulse rounded bg-zinc-100" />
            <div className="h-4 w-64 animate-pulse rounded bg-zinc-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TripDetailPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<TripDetailData | null>(null);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error' | 'not-found'>('loading');

  const fetchTrip = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch(`/api/trips/${params.id}`);
      if (res.status === 404 || res.status === 403) {
        setStatus('not-found');
        return;
      }
      if (!res.ok) throw new Error('non-200');
      const json = (await res.json()) as TripDetailData;
      setData(json);
      setStatus('loaded');
    } catch {
      setStatus('error');
    }
  }, [params.id]);

  useEffect(() => {
    void fetchTrip();
  }, [fetchTrip]);

  return (
    <AppShell activePage="hub">
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center gap-3 border-b border-landing-outline-variant/10 px-8 py-5">
          <Link
            href="/hub"
            className="flex items-center gap-1.5 text-sm text-landing-on-surface-variant hover:text-landing-on-surface"
          >
            <ArrowLeft className="size-4" strokeWidth={2} />
            My Trips
          </Link>
          {data && (
            <>
              <span className="text-landing-outline-variant">/</span>
              <div>
                <h2 className="font-headline text-lg font-bold tracking-tight">
                  {data.trip.team} — {data.trip.match_label}
                </h2>
                <p className="text-[10px] uppercase tracking-wider text-landing-on-surface-variant">
                  {data.trip.destination} ·{' '}
                  {new Date(data.trip.match_date).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              </div>
              <div className="ml-auto">
                <TierBadge tier={data.trip.tier} />
              </div>
            </>
          )}
        </div>

        {status === 'loading' && (
          <div className="flex flex-1 overflow-hidden">
            <SkeletonPane />
            <div className="w-80 border-l border-landing-outline-variant/10 bg-landing-container-low">
              <SkeletonPane />
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <AlertCircle className="size-10 text-red-400" />
            <p className="text-landing-on-surface/70">Failed to load trip. Please try again.</p>
            <button
              type="button"
              onClick={() => void fetchTrip()}
              className="rounded-xl bg-emerald-600 px-5 py-2.5 font-headline font-semibold text-white transition hover:bg-emerald-700"
            >
              Retry
            </button>
          </div>
        )}

        {status === 'not-found' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <p className="text-landing-on-surface/70">Trip not found.</p>
            <Link
              href="/hub"
              className="rounded-xl bg-emerald-600 px-5 py-2.5 font-headline font-semibold text-white transition hover:bg-emerald-700"
            >
              Back to My Trips
            </Link>
          </div>
        )}

        {status === 'loaded' && data && (
          <div className="flex flex-1 overflow-hidden">
            {/* Conversation panel */}
            <section className="relative flex flex-1 flex-col bg-white">
              <div className="border-b border-landing-outline-variant/10 px-8 py-5">
                <h3 className="font-headline text-lg font-bold tracking-tight">Conversation</h3>
                <p className="text-[10px] uppercase tracking-wider text-landing-on-surface-variant">
                  Read-only
                </p>
              </div>
              <div className="no-scrollbar flex flex-1 flex-col space-y-8 overflow-y-auto p-8">
                {data.messages.length === 0 && (
                  <p className="text-sm text-landing-on-surface-variant">
                    Conversation not available for this trip.
                  </p>
                )}
                {data.messages.map((m, i) => {
                  if (m.role === 'user') {
                    return (
                      <div key={`user-${i}`} className="flex flex-col items-end space-y-3">
                        <div className="max-w-[80%] rounded-2xl rounded-tr-none bg-landing-primary px-5 py-4 text-[15px] leading-[1.65] text-white shadow-sm">
                          {m.content}
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={`ai-${i}`} className="flex max-w-[85%] gap-4">
                      <AiAvatar />
                      <div className="rounded-2xl rounded-tl-none bg-landing-container-low px-5 py-4 text-[15px] leading-[1.65] text-landing-on-surface/80">
                        {m.content}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Itinerary panel */}
            <aside className="hidden w-80 flex-col overflow-y-auto border-l border-landing-outline-variant/10 bg-landing-container-low p-8 lg:flex">
              <ItineraryPanel itinerary={data.itinerary} activities={data.activities} />
            </aside>
          </div>
        )}
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 2: Run build to verify no TypeScript errors**

```bash
npm run build 2>&1 | tail -20
```

Expected: clean build, no TypeScript errors.

- [ ] **Step 3: Run the full test suite one final time**

```bash
npm test --no-coverage 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/hub/[id]/page.tsx
git commit -m "feat: add trip detail page with conversation history and itinerary panel"
```
