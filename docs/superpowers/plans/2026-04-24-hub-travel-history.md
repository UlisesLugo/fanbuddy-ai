# Hub / Travel History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/hub` page where authenticated users see a read-only list of their past completed trips fetched from a new `GET /api/trips` endpoint.

**Architecture:** Client Component at `app/hub/page.tsx` calls `GET /api/trips` on mount. The route handler authenticates via Clerk, queries the `trips` table with Drizzle ordered by `created_at DESC`, and returns a JSON array. Clerk middleware already protects the routes — middleware just needs two new entries. Navigation in `PlanningChat.tsx` already has "Hub" links pointing to `/` that need to be updated to `/hub`.

**Tech Stack:** Next.js 15 App Router, Clerk (`@clerk/nextjs`), Drizzle ORM on Neon Postgres, Tailwind CSS (`glass-panel`, `landing-*` palette, `bg-pitch-gradient`), Lucide React, Jest + ts-jest.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `middleware.ts` | Modify | Add `/hub(.*)` and `/api/trips(.*)` to protected routes |
| `app/api/trips/route.ts` | Create | GET handler — auth, DB query, return trips JSON |
| `lib/__tests__/trips-route.test.ts` | Create | Unit tests for the GET handler |
| `app/hub/page.tsx` | Create | Client Component — fetch `/api/trips`, render trip cards |
| `components/chat/PlanningChat.tsx` | Modify | Change Hub `href="/"` to `href="/hub"` (desktop + mobile nav) |

---

## Task 1: Protect `/hub` and `/api/trips` in middleware

**Files:**
- Modify: `middleware.ts`

- [ ] **Step 1: Update the protected route matcher**

Open `middleware.ts`. Replace the existing `isProtected` matcher with:

```ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtected = createRouteMatcher([
  '/chat(.*)',
  '/hub(.*)',
  '/api/chat(.*)',
  '/api/trips(.*)',
  '/api/stripe/checkout(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtected(req)) await auth.protect();
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
```

- [ ] **Step 2: Commit**

```bash
git add middleware.ts
git commit -m "feat: protect /hub and /api/trips routes in middleware"
```

---

## Task 2: Implement `GET /api/trips`

**Files:**
- Create: `app/api/trips/route.ts`
- Create: `lib/__tests__/trips-route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/trips-route.test.ts`:

```ts
import { GET } from '@/app/api/trips/route';

const mockAuth = jest.fn();
jest.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
}));

const mockOrderBy = jest.fn();
const mockWhere = jest.fn();
const mockFrom = jest.fn();
const mockSelect = jest.fn();
jest.mock('@/lib/db', () => ({
  db: { select: () => mockSelect() },
}));
jest.mock('drizzle-orm', () => ({
  eq: jest.fn(),
  desc: jest.fn(),
}));
jest.mock('@/lib/db/schema', () => ({
  trips: {},
}));

describe('GET /api/trips', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
  });

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns trips array for authenticated user', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    const fakeRows = [
      {
        id: 'trip-1',
        team: 'Barcelona',
        match_label: 'Barcelona vs Real Madrid',
        match_date: '2026-05-15',
        destination: 'Barcelona',
        tier: 'paid',
        created_at: new Date('2026-04-01T10:00:00Z'),
      },
    ];
    mockOrderBy.mockResolvedValue(fakeRows);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { trips: typeof fakeRows };
    expect(body.trips).toHaveLength(1);
    expect(body.trips[0].team).toBe('Barcelona');
    expect(body.trips[0].tier).toBe('paid');
  });

  it('returns empty array when user has no trips', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_456' });
    mockOrderBy.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { trips: unknown[] };
    expect(body.trips).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- --testPathPattern=trips-route
```

Expected: FAIL — `Cannot find module '@/app/api/trips/route'`

- [ ] **Step 3: Create the route handler**

Create `app/api/trips/route.ts`:

```ts
import { auth } from '@clerk/nextjs/server';
import { desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { trips } from '@/lib/db/schema';

export const runtime = 'nodejs';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const rows = await db
    .select()
    .from(trips)
    .where(eq(trips.user_id, userId))
    .orderBy(desc(trips.created_at));

  return Response.json({ trips: rows });
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- --testPathPattern=trips-route
```

Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/trips/route.ts lib/__tests__/trips-route.test.ts
git commit -m "feat: add GET /api/trips endpoint with auth and DB query"
```

---

## Task 3: Build Hub page

**Files:**
- Create: `app/hub/page.tsx`

- [ ] **Step 1: Create the Hub page component**

Create `app/hub/page.tsx`:

```tsx
'use client';

import { AlertCircle, Calendar, LayoutGrid, MapPin } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type TripRecord = {
  id: string;
  team: string;
  match_label: string;
  match_date: string;
  destination: string;
  tier: 'free' | 'paid';
  created_at: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
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

function SkeletonCard() {
  return (
    <div className="glass-panel animate-pulse rounded-2xl p-5">
      <div className="mb-2 h-5 w-32 rounded bg-zinc-200" />
      <div className="mb-1 h-4 w-48 rounded bg-zinc-100" />
      <div className="h-4 w-24 rounded bg-zinc-100" />
    </div>
  );
}

export default function HubPage() {
  const [tripList, setTripList] = useState<TripRecord[]>([]);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

  const fetchTrips = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/trips');
      if (!res.ok) throw new Error('non-200');
      const data = (await res.json()) as { trips: TripRecord[] };
      setTripList(data.trips);
      setStatus('loaded');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void fetchTrips();
  }, [fetchTrips]);

  return (
    <div className="min-h-screen bg-landing-surface px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center gap-3">
          <LayoutGrid className="size-7 text-emerald-600" strokeWidth={2} />
          <h1 className="font-headline text-3xl font-bold text-landing-on-surface">
            My Trips
          </h1>
        </div>

        {status === 'loading' && (
          <div className="flex flex-col gap-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <AlertCircle className="size-10 text-red-400" />
            <p className="text-landing-on-surface/70">
              Failed to load trips. Please try again.
            </p>
            <button
              type="button"
              onClick={() => void fetchTrips()}
              className="rounded-xl bg-emerald-600 px-5 py-2.5 font-headline font-semibold text-white transition hover:bg-emerald-700"
            >
              Retry
            </button>
          </div>
        )}

        {status === 'loaded' && tripList.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <LayoutGrid className="size-10 text-zinc-300" strokeWidth={2} />
            <p className="text-landing-on-surface/70">
              No trips yet. Plan your first trip!
            </p>
            <Link
              href="/chat"
              className="rounded-xl bg-pitch-gradient px-5 py-2.5 font-headline font-semibold text-white shadow-lg shadow-emerald-600/20 transition-transform active:scale-95"
            >
              Plan a Trip
            </Link>
          </div>
        )}

        {status === 'loaded' && tripList.length > 0 && (
          <div className="flex flex-col gap-4">
            {tripList.map((trip) => (
              <div key={trip.id} className="glass-panel rounded-2xl p-5">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-headline text-lg font-bold text-landing-on-surface">
                    {trip.team}
                  </span>
                  <TierBadge tier={trip.tier} />
                </div>
                <p className="mb-3 text-sm text-landing-on-surface/70">
                  {trip.match_label}
                </p>
                <div className="flex items-center gap-4 text-xs text-landing-on-surface/50">
                  <span className="flex items-center gap-1">
                    <Calendar className="size-3.5" />
                    {formatDate(trip.match_date)}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3.5" />
                    {trip.destination}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run lint to catch any issues**

```bash
npm run lint
```

Expected: no errors in `app/hub/page.tsx`

- [ ] **Step 3: Commit**

```bash
git add app/hub/page.tsx
git commit -m "feat: add Hub page with trip history list"
```

---

## Task 4: Wire Hub nav links in PlanningChat

**Files:**
- Modify: `components/chat/PlanningChat.tsx`

The sidebar already has "Hub" links — both desktop (`href="/"` at the nav section) and mobile bottom nav (`href="/"` in the mobile nav) — that need to point to `/hub`.

- [ ] **Step 1: Update desktop sidebar Hub link**

In `components/chat/PlanningChat.tsx`, find the desktop sidebar nav (the `<nav aria-label="Main">` block around line 745). Change the Hub link `href` from `"/"` to `"/hub"`:

```tsx
<Link
  href="/hub"
  className="mx-2 my-1 flex items-center gap-3 rounded-lg px-4 py-3 font-headline text-sm font-semibold text-zinc-600 transition-all duration-300 hover:bg-zinc-200/50"
>
  <LayoutGrid className="size-5 shrink-0" strokeWidth={2} />
  Hub
</Link>
```

- [ ] **Step 2: Update mobile bottom nav Hub link**

In the same file, find the mobile `<nav aria-label="Mobile">` block (around line 1106). Change the Hub link `href` from `"/"` to `"/hub"`:

```tsx
<Link
  href="/hub"
  className="flex flex-col items-center justify-center p-2 text-landing-on-surface/50"
>
  <LayoutGrid className="size-6" strokeWidth={2} />
  <span className="mt-1 text-[10px] font-bold uppercase tracking-widest">
    Hub
  </span>
</Link>
```

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: no errors

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add components/chat/PlanningChat.tsx
git commit -m "feat: wire Hub nav links to /hub in PlanningChat"
```

---

## Manual Verification Checklist

After all tasks are complete, start the dev server and verify:

```bash
npm run dev
```

- [ ] Navigate to `http://localhost:3000/hub` while signed out — Clerk redirects to sign-in
- [ ] Sign in, navigate to `/hub` — page loads with skeleton cards, then shows empty state or trip list
- [ ] Complete a chat trip — navigate to `/hub` — new trip card appears
- [ ] Click "Hub" in the desktop sidebar from `/chat` — navigates to `/hub`
- [ ] On mobile viewport, tap "Hub" in the bottom nav — navigates to `/hub`
- [ ] Disconnect network (DevTools), visit `/hub` — error state appears with retry button
- [ ] Click retry — trips reload successfully
