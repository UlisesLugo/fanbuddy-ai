# User Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/profile` page where users can save a home city and favorite team, and have those preferences pre-seed new chat sessions with a confirmation bubble.

**Architecture:** A `teams` table seeded from the existing `TEAM_ID_MAP` stores canonical team IDs. `GET/PATCH /api/profile` manages user preferences stored in the `users` table. `PlanningChat` fetches prefs on mount, renders a synthetic confirmation bubble, and injects `user_preferences` into the first `/api/chat` request.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM + Neon Postgres, Clerk auth, React 19, Tailwind CSS with `landing-*` palette.

---

## File Map

| File | Action | What it does |
|------|--------|-------------|
| `lib/db/schema.ts` | Modify | Add `teams` table; add `home_city` + `favorite_team_id` to `users` |
| `lib/db/seed-teams.ts` | Create | One-time script: inserts 25 teams from `TEAM_ID_MAP` |
| `app/api/teams/route.ts` | Create | `GET /api/teams` — returns all teams sorted A-Z |
| `app/api/profile/route.ts` | Create | `GET` + `PATCH /api/profile` — read/update user preferences |
| `lib/__tests__/teams-route.test.ts` | Create | Jest tests for GET /api/teams |
| `lib/__tests__/profile-route.test.ts` | Create | Jest tests for GET + PATCH /api/profile |
| `middleware.ts` | Modify | Add `/profile(.*)`, `/api/profile(.*)`, `/api/teams(.*)` |
| `components/shared/AppShell.tsx` | Modify | Rename "Subscription" → "Profile", update href, add `'profile'` to `activePage` type |
| `app/profile/page.tsx` | Create | Profile UI: account info card + preferences form |
| `components/chat/PlanningChat.tsx` | Modify | Fetch prefs on mount, show synthetic prefill bubble, inject on first send |
| `app/api/chat/route.ts` | Modify | Accept + inject optional `user_preferences` from request body |

---

## Task 1 — Schema: add `teams` table and `users` columns

**Files:**
- Modify: `lib/db/schema.ts`

- [ ] **Step 1: Open the schema file and add the teams table and two new user columns**

Replace the contents of `lib/db/schema.ts` with:

```ts
import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const planEnum = pgEnum('plan', ['free', 'paid']);
export const tierEnum = pgEnum('tier', ['free', 'paid']);

export const teams = pgTable('teams', {
  id: integer('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
});

export const users = pgTable('users', {
  id: varchar('id', { length: 255 }).primaryKey(),
  email: varchar('email', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  phone_verified: boolean('phone_verified').notNull().default(false),
  plan: planEnum('plan').notNull().default('free'),
  trips_used: integer('trips_used').notNull().default(0),
  stripe_customer_id: varchar('stripe_customer_id', { length: 255 }),
  stripe_subscription_id: varchar('stripe_subscription_id', { length: 255 }),
  home_city: varchar('home_city', { length: 255 }),
  favorite_team_id: integer('favorite_team_id').references(() => teams.id),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const trips = pgTable('trips', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: varchar('user_id', { length: 255 })
    .notNull()
    .references(() => users.id),
  thread_id: varchar('thread_id', { length: 255 }).notNull(),
  team: varchar('team', { length: 255 }).notNull(),
  match_label: varchar('match_label', { length: 500 }).notNull(),
  match_date: varchar('match_date', { length: 10 }).notNull(),
  destination: varchar('destination', { length: 255 }).notNull(),
  tier: tierEnum('tier').notNull(),
  created_at: timestamp('created_at').notNull().defaultNow(),
});
```

- [ ] **Step 2: Push the schema to Neon**

```bash
npx drizzle-kit push
```

Expected: output showing `teams` table created and two columns added to `users`. No errors.

- [ ] **Step 3: Commit**

```bash
git add lib/db/schema.ts
git commit -m "feat: add teams table and home_city/favorite_team_id to users"
```

---

## Task 2 — Seed the teams table

**Files:**
- Create: `lib/db/seed-teams.ts`

- [ ] **Step 1: Create the seed script**

Create `lib/db/seed-teams.ts`:

```ts
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { teams } from './schema';

const TEAMS = [
  { id: 4, name: 'Borussia Dortmund' },
  { id: 5, name: 'Bayern Munich' },
  { id: 57, name: 'Arsenal' },
  { id: 58, name: 'Aston Villa' },
  { id: 61, name: 'Chelsea' },
  { id: 64, name: 'Liverpool' },
  { id: 65, name: 'Manchester City' },
  { id: 66, name: 'Manchester United' },
  { id: 67, name: 'Newcastle United' },
  { id: 73, name: 'Tottenham Hotspur' },
  { id: 78, name: 'Atletico Madrid' },
  { id: 81, name: 'Barcelona' },
  { id: 86, name: 'Real Madrid' },
  { id: 98, name: 'AC Milan' },
  { id: 100, name: 'AS Roma' },
  { id: 108, name: 'Inter Milan' },
  { id: 109, name: 'Juventus' },
  { id: 113, name: 'Napoli' },
  { id: 264, name: 'Celtic' },
  { id: 294, name: 'Benfica' },
  { id: 498, name: 'Sporting CP' },
  { id: 503, name: 'Porto' },
  { id: 524, name: 'Paris Saint-Germain' },
  { id: 678, name: 'Ajax' },
  { id: 1107, name: 'Rangers' },
];

async function seed() {
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);
  await db.insert(teams).values(TEAMS).onConflictDoNothing();
  console.log(`Seeded ${TEAMS.length} teams.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the seed**

```bash
npx tsx lib/db/seed-teams.ts
```

Expected output:
```
Seeded 25 teams.
```

- [ ] **Step 3: Commit**

```bash
git add lib/db/seed-teams.ts
git commit -m "feat: add teams seed script"
```

---

## Task 3 — GET /api/teams (TDD)

**Files:**
- Create: `lib/__tests__/teams-route.test.ts`
- Create: `app/api/teams/route.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/teams-route.test.ts`:

```ts
import { GET } from '@/app/api/teams/route';

const mockAuth = jest.fn();
jest.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
}));

const mockOrderBy = jest.fn();
const mockFrom = jest.fn();
const mockSelect = jest.fn();
jest.mock('@/lib/db', () => ({
  db: { select: (...args: unknown[]) => mockSelect(...args) },
}));
jest.mock('drizzle-orm', () => ({ asc: jest.fn() }));
jest.mock('@/lib/db/schema', () => ({ teams: { name: 'name' } }));

describe('GET /api/teams', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ orderBy: mockOrderBy });
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns teams sorted by name', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockOrderBy.mockResolvedValue([
      { id: 57, name: 'Arsenal' },
      { id: 81, name: 'Barcelona' },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { teams: { id: number; name: string }[] };
    expect(body.teams).toHaveLength(2);
    expect(body.teams[0].name).toBe('Arsenal');
  });

  it('returns 500 on DB error', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockOrderBy.mockRejectedValue(new Error('db fail'));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- --testPathPatterns=teams-route
```

Expected: FAIL — `Cannot find module '@/app/api/teams/route'`

- [ ] **Step 3: Create the route**

Create `app/api/teams/route.ts`:

```ts
import { auth } from '@clerk/nextjs/server';
import { asc } from 'drizzle-orm';

import { db } from '@/lib/db';
import { teams } from '@/lib/db/schema';

export const runtime = 'nodejs';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  try {
    const rows = await db.select().from(teams).orderBy(asc(teams.name));
    return Response.json({ teams: rows });
  } catch (err) {
    console.error('[teams] DB error', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -- --testPathPatterns=teams-route
```

Expected: PASS — 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add app/api/teams/route.ts lib/__tests__/teams-route.test.ts
git commit -m "feat: add GET /api/teams route"
```

---

## Task 4 — GET + PATCH /api/profile (TDD)

**Files:**
- Create: `lib/__tests__/profile-route.test.ts`
- Create: `app/api/profile/route.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/profile-route.test.ts`:

```ts
import { GET, PATCH } from '@/app/api/profile/route';

const mockAuth = jest.fn();
jest.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn(),
}));
jest.mock('@/lib/db/schema', () => ({
  users: { id: 'id', email: 'email', plan: 'plan', home_city: 'home_city', favorite_team_id: 'favorite_team_id' },
  teams: { id: 'id', name: 'name' },
}));

// DB mock — flexible enough for all chain shapes used by this route
const mockWhere = jest.fn();
const mockLeftJoin = jest.fn();
const mockFrom = jest.fn();
const mockSelect = jest.fn();
const mockUpdateWhere = jest.fn();
const mockSet = jest.fn();
const mockUpdate = jest.fn();

jest.mock('@/lib/db', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

function mockSelectChain(resolveValue: unknown[]) {
  mockSelect.mockReturnValueOnce({
    from: () => ({
      leftJoin: () => ({ where: jest.fn().mockResolvedValue(resolveValue) }),
      where: jest.fn().mockResolvedValue(resolveValue),
    }),
  });
}

const profileRow = {
  email: 'fan@example.com',
  plan: 'free',
  home_city: 'London',
  team_id: 57,
  team_name: 'Arsenal',
};

describe('GET /api/profile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockResolvedValue(undefined);
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns profile with team when user has preferences', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockSelectChain([profileRow]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      email: string;
      plan: string;
      home_city: string;
      favorite_team: { id: number; name: string };
    };
    expect(body.email).toBe('fan@example.com');
    expect(body.home_city).toBe('London');
    expect(body.favorite_team).toEqual({ id: 57, name: 'Arsenal' });
  });

  it('returns profile with null team when no team set', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockSelectChain([{ ...profileRow, team_id: null, team_name: null }]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { favorite_team: null };
    expect(body.favorite_team).toBeNull();
  });

  it('returns 404 when user row not found', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockSelectChain([]);
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it('returns 500 on DB error', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockSelect.mockReturnValueOnce({
      from: () => ({ leftJoin: () => ({ where: jest.fn().mockRejectedValue(new Error('db fail')) }) }),
    });
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe('PATCH /api/profile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockResolvedValue(undefined);
  });

  const mockReq = (body: object) =>
    ({ json: () => Promise.resolve(body) }) as unknown as Request;

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const res = await PATCH(mockReq({ home_city: 'Madrid' }));
    expect(res.status).toBe(401);
  });

  it('updates home_city and returns updated profile', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    // Profile fetch after update
    mockSelectChain([{ ...profileRow, home_city: 'Madrid', team_id: null, team_name: null }]);
    const res = await PATCH(mockReq({ home_city: 'Madrid' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { home_city: string };
    expect(body.home_city).toBe('Madrid');
    expect(mockUpdateWhere).toHaveBeenCalled();
  });

  it('returns 400 when favorite_team_id does not exist in teams table', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    // Team validation returns empty
    mockSelect.mockReturnValueOnce({
      from: () => ({ where: jest.fn().mockResolvedValue([]) }),
    });
    const res = await PATCH(mockReq({ favorite_team_id: 9999 }));
    expect(res.status).toBe(400);
  });

  it('updates favorite_team_id after validating team exists', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    // Team validation returns team
    mockSelect.mockReturnValueOnce({
      from: () => ({ where: jest.fn().mockResolvedValue([{ id: 57 }]) }),
    });
    // Profile fetch after update
    mockSelectChain([profileRow]);
    const res = await PATCH(mockReq({ favorite_team_id: 57 }));
    expect(res.status).toBe(200);
    expect(mockUpdateWhere).toHaveBeenCalled();
  });

  it('returns 500 on DB error', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockSelect.mockReturnValueOnce({
      from: () => ({ leftJoin: () => ({ where: jest.fn().mockRejectedValue(new Error('db fail')) }) }),
    });
    const res = await PATCH(mockReq({ home_city: 'London' }));
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- --testPathPatterns=profile-route
```

Expected: FAIL — `Cannot find module '@/app/api/profile/route'`

- [ ] **Step 3: Create the route**

Create `app/api/profile/route.ts`:

```ts
import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { teams, users } from '@/lib/db/schema';

export const runtime = 'nodejs';

type ProfileResponse = {
  email: string;
  plan: 'free' | 'paid';
  home_city: string | null;
  favorite_team: { id: number; name: string } | null;
};

async function fetchProfile(userId: string): Promise<ProfileResponse | null> {
  const rows = await db
    .select({
      email: users.email,
      plan: users.plan,
      home_city: users.home_city,
      team_id: teams.id,
      team_name: teams.name,
    })
    .from(users)
    .leftJoin(teams, eq(users.favorite_team_id, teams.id))
    .where(eq(users.id, userId));

  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    email: row.email,
    plan: row.plan as 'free' | 'paid',
    home_city: row.home_city ?? null,
    favorite_team: row.team_id ? { id: row.team_id, name: row.team_name! } : null,
  };
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  try {
    const profile = await fetchProfile(userId);
    if (!profile) return new Response('Not found', { status: 404 });
    return Response.json(profile);
  } catch (err) {
    console.error('[profile] GET error', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  try {
    const body = (await request.json()) as {
      home_city?: string | null;
      favorite_team_id?: number | null;
    };

    if (body.favorite_team_id != null) {
      const teamRows = await db
        .select({ id: teams.id })
        .from(teams)
        .where(eq(teams.id, body.favorite_team_id));
      if (teamRows.length === 0) {
        return Response.json({ error: 'Invalid team ID' }, { status: 400 });
      }
    }

    const patch: Record<string, unknown> = {};
    if ('home_city' in body) patch.home_city = body.home_city ?? null;
    if ('favorite_team_id' in body) patch.favorite_team_id = body.favorite_team_id ?? null;

    if (Object.keys(patch).length > 0) {
      await db.update(users).set(patch).where(eq(users.id, userId));
    }

    const profile = await fetchProfile(userId);
    return Response.json(profile);
  } catch (err) {
    console.error('[profile] PATCH error', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -- --testPathPatterns=profile-route
```

Expected: PASS — all tests passing.

- [ ] **Step 5: Commit**

```bash
git add app/api/profile/route.ts lib/__tests__/profile-route.test.ts
git commit -m "feat: add GET and PATCH /api/profile route"
```

---

## Task 5 — Middleware + AppShell navigation

**Files:**
- Modify: `middleware.ts`
- Modify: `components/shared/AppShell.tsx`

- [ ] **Step 1: Update middleware to protect new routes**

In `middleware.ts`, update the `createRouteMatcher` array:

```ts
const isProtected = createRouteMatcher([
  '/chat(.*)',
  '/hub(.*)',
  '/profile(.*)',
  '/api/chat(.*)',
  '/api/trips(.*)',
  '/api/profile(.*)',
  '/api/teams(.*)',
  '/api/stripe/checkout(.*)',
]);
```

- [ ] **Step 2: Update AppShell — rename nav link and extend activePage type**

In `components/shared/AppShell.tsx`:

Change the interface:
```ts
interface AppShellProps {
  children: React.ReactNode;
  activePage?: 'hub' | 'chat' | 'profile';
}
```

Replace the `Subscription` anchor (around line 71-74) with a `Link`:
```tsx
<Link
  href="/profile"
  className={`${navBase} ${activePage === 'profile' ? navActive : navInactive}`}
>
  <Crown className="size-5 shrink-0" strokeWidth={2} />
  Profile
</Link>
```

Add `Link` to the import at the top of the file if not already present:
```ts
import Link from 'next/link';
```

- [ ] **Step 3: Run the full test suite to confirm no regressions**

```bash
npm test
```

Expected: all existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add middleware.ts components/shared/AppShell.tsx
git commit -m "feat: add profile and teams routes to middleware; rename Subscription nav to Profile"
```

---

## Task 6 — Profile page UI

**Files:**
- Create: `app/profile/page.tsx`

- [ ] **Step 1: Create the profile page**

Create `app/profile/page.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import AppShell from '@/components/shared/AppShell';

type ProfileData = {
  email: string;
  plan: 'free' | 'paid';
  home_city: string | null;
  favorite_team: { id: number; name: string } | null;
};

type TeamOption = { id: number; name: string };

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-zinc-200 ${className ?? ''}`} />;
}

function PlanBadge({ plan }: { plan: 'free' | 'paid' }) {
  if (plan === 'paid') {
    return (
      <span className="rounded-full bg-pitch-gradient px-3 py-1 text-xs font-bold text-white shadow">
        Pro
      </span>
    );
  }
  return (
    <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-500">
      Free
    </span>
  );
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>([]);
  const [pageStatus, setPageStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

  const [homeCity, setHomeCity] = useState('');
  const [teamId, setTeamId] = useState<number | ''>('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const origCityRef = useRef('');
  const origTeamIdRef = useRef<number | ''>('');

  const isDirty =
    homeCity !== origCityRef.current || teamId !== origTeamIdRef.current;

  const load = useCallback(async () => {
    setPageStatus('loading');
    try {
      const [profileRes, teamsRes] = await Promise.all([
        fetch('/api/profile'),
        fetch('/api/teams'),
      ]);
      if (!profileRes.ok || !teamsRes.ok) throw new Error('non-200');
      const profileData = (await profileRes.json()) as ProfileData;
      const teamsData = (await teamsRes.json()) as { teams: TeamOption[] };

      setProfile(profileData);
      setTeamOptions(teamsData.teams);
      const city = profileData.home_city ?? '';
      const tid = profileData.favorite_team?.id ?? '';
      setHomeCity(city);
      setTeamId(tid);
      origCityRef.current = city;
      origTeamIdRef.current = tid;
      setPageStatus('loaded');
    } catch {
      setPageStatus('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          home_city: homeCity || null,
          favorite_team_id: teamId || null,
        }),
      });
      if (!res.ok) throw new Error('non-200');
      const updated = (await res.json()) as ProfileData;
      setProfile(updated);
      const city = updated.home_city ?? '';
      const tid = updated.favorite_team?.id ?? '';
      setHomeCity(city);
      setTeamId(tid);
      origCityRef.current = city;
      origTeamIdRef.current = tid;
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    }
  };

  if (pageStatus === 'loading') {
    return (
      <AppShell activePage="profile">
        <div className="mx-auto max-w-xl space-y-6 px-4 py-10 sm:px-8">
          <SkeletonBlock className="h-8 w-48" />
          <div className="glass-panel space-y-4 rounded-2xl p-6">
            <SkeletonBlock className="h-5 w-32" />
            <SkeletonBlock className="h-5 w-56" />
            <SkeletonBlock className="h-5 w-24" />
          </div>
          <div className="glass-panel space-y-4 rounded-2xl p-6">
            <SkeletonBlock className="h-5 w-32" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-28" />
          </div>
        </div>
      </AppShell>
    );
  }

  if (pageStatus === 'error') {
    return (
      <AppShell activePage="profile">
        <div className="mx-auto max-w-xl px-4 py-10 sm:px-8">
          <div className="glass-panel rounded-2xl p-6 text-center">
            <p className="mb-4 text-landing-on-surface/70">
              Failed to load profile. Please try again.
            </p>
            <button
              type="button"
              onClick={load}
              className="rounded-xl bg-landing-primary px-5 py-2 font-headline font-bold text-white transition-transform active:scale-95"
            >
              Retry
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell activePage="profile">
      <div className="mx-auto max-w-xl space-y-6 px-4 py-10 sm:px-8">
        <h1 className="font-headline text-2xl font-black tracking-tight text-landing-on-surface">
          Profile
        </h1>

        {/* Account Info */}
        <section className="glass-panel space-y-4 rounded-2xl p-6">
          <h2 className="font-headline text-sm font-bold uppercase tracking-wider text-landing-on-surface-variant">
            Account
          </h2>
          <div className="flex items-center justify-between">
            <span className="text-sm text-landing-on-surface/80">{profile!.email}</span>
            <PlanBadge plan={profile!.plan} />
          </div>
          <button
            type="button"
            disabled
            className="text-sm font-semibold text-landing-primary/60"
          >
            Manage subscription →
          </button>
        </section>

        {/* Preferences */}
        <section className="glass-panel space-y-5 rounded-2xl p-6">
          <h2 className="font-headline text-sm font-bold uppercase tracking-wider text-landing-on-surface-variant">
            Preferences
          </h2>

          <div className="space-y-1">
            <label
              htmlFor="home-city"
              className="block text-sm font-semibold text-landing-on-surface"
            >
              Home city
            </label>
            <input
              id="home-city"
              type="text"
              value={homeCity}
              onChange={(e) => setHomeCity(e.target.value)}
              placeholder="e.g. London"
              disabled={saveStatus === 'saving'}
              className="w-full rounded-xl border border-landing-outline-variant/30 bg-white px-4 py-2.5 text-sm text-landing-on-surface outline-none focus:border-landing-primary/60 focus:ring-2 focus:ring-landing-primary/20 disabled:opacity-50"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="favorite-team"
              className="block text-sm font-semibold text-landing-on-surface"
            >
              Favorite team
            </label>
            <select
              id="favorite-team"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value ? Number(e.target.value) : '')}
              disabled={saveStatus === 'saving'}
              className="w-full rounded-xl border border-landing-outline-variant/30 bg-white px-4 py-2.5 text-sm text-landing-on-surface outline-none focus:border-landing-primary/60 focus:ring-2 focus:ring-landing-primary/20 disabled:opacity-50"
            >
              <option value="">Select a team</option>
              {teamOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={!isDirty || saveStatus === 'saving'}
              className="rounded-xl bg-pitch-gradient px-6 py-2.5 font-headline font-bold text-white shadow shadow-emerald-600/20 transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saveStatus === 'saving' ? 'Saving…' : 'Save'}
            </button>
            {saveStatus === 'saved' && (
              <span className="text-sm font-semibold text-emerald-600">Saved!</span>
            )}
            {saveStatus === 'error' && (
              <span className="text-sm font-semibold text-red-500">
                Failed to save. Try again.
              </span>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 2: Start the dev server and verify the page renders**

```bash
npm run dev
```

Navigate to `http://localhost:3000/profile`. Verify:
- Loading skeletons appear briefly
- Account info card shows email and plan badge
- Preferences form shows home city input and team dropdown (populated with 25 teams)
- Save button is disabled until a field is changed
- Saving a value shows "Saved!" inline feedback
- Page matches the visual style of `/hub` (glass-panel cards, emerald accents)

- [ ] **Step 3: Commit**

```bash
git add app/profile/page.tsx
git commit -m "feat: add profile page UI"
```

---

## Task 7 — Chat pre-seeding

**Files:**
- Modify: `components/chat/PlanningChat.tsx`
- Modify: `app/api/chat/route.ts`

### Part A — Update the chat route to accept prefill preferences

- [ ] **Step 1: Extract `user_preferences` from the request body and inject into graph initial state**

In `app/api/chat/route.ts`, find the body parsing section (around line 53) and update:

```ts
const { message, thread_id, user_preferences } = body;
```

Then find the `initialState` object (around line 95) and add the conditional field:

```ts
const initialState = {
  messages: [new HumanMessage(message)],
  validation_errors: [],
  attempt_count: 0,
  formatted: null,
  direct_reply: null,
  free_tier_links: null,
  wants_date_recommendation: false,
  user_plan: user.plan as 'free' | 'paid',
  ...(user_preferences ? { user_preferences } : {}),
};
```

### Part B — Update PlanningChat to fetch prefs and show prefill bubble

- [ ] **Step 2: Add savedPrefs state and fetch on mount**

In `components/chat/PlanningChat.tsx`, add a state for saved preferences near the top of the component (alongside the other `useState` declarations):

```ts
const [savedPrefs, setSavedPrefs] = useState<{
  home_city: string;
  favorite_team: { id: number; name: string };
} | null>(null);
```

Add a `useEffect` to fetch the profile on mount (place after existing `useEffect` calls):

```ts
useEffect(() => {
  fetch('/api/profile')
    .then((r) => (r.ok ? r.json() : null))
    .then((data: { home_city: string | null; favorite_team: { id: number; name: string } | null } | null) => {
      if (data?.home_city && data?.favorite_team) {
        setSavedPrefs({ home_city: data.home_city, favorite_team: data.favorite_team });
      }
    })
    .catch(() => {});
}, []);
```

- [ ] **Step 3: Inject prefill into the first message send**

Find the `handleSendMessage` function (or the POST to `/api/chat`). Locate the fetch call body. Update it to include `user_preferences` on the first send (when `items` is empty):

```ts
const isFirstMessage = items.length === 0;
const body: Record<string, unknown> = { message: trimmed, thread_id: threadId };

if (isFirstMessage && savedPrefs) {
  body.user_preferences = {
    origin_city: savedPrefs.home_city,
    favorite_team: savedPrefs.favorite_team.name,
    selected_match_id: null,
    travel_dates: null,
    spending_tier: null,
  };
}

const res = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
```

- [ ] **Step 4: Render the synthetic prefill bubble**

In the chat messages area — find the section that renders `{items.map(...)}`. Just before the map, add a conditional prefill bubble:

```tsx
{savedPrefs && items.length === 0 && (
  <div className="flex max-w-[85%] gap-4">
    <AiAvatar />
    <div className="space-y-2">
      <div className="rounded-2xl rounded-tl-none bg-landing-container-low px-5 py-4 text-[15px] leading-[1.65] text-landing-on-surface/80">
        Planning a trip from <strong>{savedPrefs.home_city}</strong> for{' '}
        <strong>{savedPrefs.favorite_team.name}</strong>? Type anything to confirm, or tell
        me something different.
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 5: Test the full flow manually**

Start the dev server (`npm run dev`), go to `/chat`. Verify:

1. If profile has both `home_city` and `favorite_team` set: the prefill bubble appears immediately.
2. Typing "yes" starts planning with the saved city + team.
3. Typing "Actually from Madrid for Barcelona" plans with Madrid + Barcelona.
4. If profile has no prefs: no bubble, chat starts as before.

- [ ] **Step 6: Run the full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/api/chat/route.ts components/chat/PlanningChat.tsx
git commit -m "feat: pre-seed new chats with saved profile preferences"
```

---

## Final check

- [ ] **Run the full test suite one last time**

```bash
npm test
```

Expected: all tests pass, no regressions.

- [ ] **Verify all routes are protected**

Navigate to `/profile`, `/api/profile`, `/api/teams` while logged out — Clerk should redirect to sign-in each time.
