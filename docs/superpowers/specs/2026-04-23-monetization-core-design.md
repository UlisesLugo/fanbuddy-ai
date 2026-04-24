# FanBuddy MVP — Monetization Core Design Spec

**Date:** 2026-04-23  
**Status:** Approved  
**Scope:** Spec 1 of 2 — auth, trip enforcement, Stripe subscription, paid-tier wiring  
**Out of scope:** Hub/history page (Spec 2), more teams, ticket purchasing, Radar/alerts

---

## Goal

Ship a monetizable MVP: users sign up with phone verification, get 3 free trip plans (Google Flights/Booking.com links), then must upgrade to FanBuddy Pro to get real curated itineraries via Duffel + LiteAPI.

---

## Architecture Overview

```
Browser
  │
  ├─► Clerk (auth UI — sign in / sign up + phone verification)
  │
  └─► Next.js App
        │
        ├─► /api/chat (POST) ──► Clerk middleware (auth gate)
        │        │
        │        ├─► Neon Postgres — check phone_verified, trips_used < 3 or plan = 'paid'
        │        │
        │        ├─► LangGraph graph (PostgresCheckpointer instead of MemorySaver)
        │        │        │
        │        │        ├─► FREE path: existing free-tier nodes → links + activities
        │        │        └─► PAID path: plan_travel_node → validator_node → formatter_node
        │        │
        │        └─► on trip complete: increment trips_used in DB
        │
        ├─► /api/stripe/webhook (POST) ── updates user plan in DB on subscription events
        ├─► /api/stripe/checkout (POST) ── creates Stripe Checkout session
        └─► /api/webhooks/clerk (POST) ── syncs user on sign-up / phone verify
```

**Key insight:** The paid-tier nodes (`plan_travel_node`, `validator_node`, `formatter_node`) are already fully implemented in `lib/langchain/graph.ts` — they just need to be wired into the compiled graph behind a plan check. The gate lives in `route.ts`, not in the graph itself.

---

## Database Schema

Library: **Drizzle ORM** on **Neon Postgres** (serverless, Vercel-native).

### `users` table

```ts
users {
  id                      string     // primary key — Clerk userId (e.g. "user_2abc...")
  email                   string
  phone                   string | null
  phone_verified          boolean    // default: false
  plan                    enum       // 'free' | 'paid', default: 'free'
  trips_used              int        // default: 0
  stripe_customer_id      string | null
  stripe_subscription_id  string | null
  created_at              timestamp
}
```

### `trips` table

```ts
trips {
  id           uuid       // primary key
  user_id      string     // foreign key → users.id
  thread_id    string     // LangGraph thread_id — links to checkpointed conversation in Postgres
  team         string     // e.g. "Barcelona"
  match_label  string     // e.g. "Barcelona vs Real Madrid"
  match_date   string     // ISO date
  destination  string     // match city
  tier         enum       // 'free' | 'paid' — which flow produced this trip
  created_at   timestamp
}
```

`thread_id` in `trips` links to the LangGraph `PostgresCheckpointer` state. This enables the Hub page (Spec 2) to replay or display the full conversation for any past trip without separate storage.

---

## Auth: Clerk Integration

### Middleware

```ts
// middleware.ts (project root)
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtected = createRouteMatcher([
  '/chat(.*)',
  '/api/chat(.*)',
  '/api/stripe/checkout(.*)',
]);

export default clerkMiddleware((auth, req) => {
  if (isProtected(req)) auth().protect();
});
```

Public routes: `/` (marketing), `/api/stripe/webhook`, `/api/webhooks/clerk`.

### Clerk configuration (dashboard)

- Require phone number on sign-up
- Enforce SMS OTP verification before account activation
- Enable Clerk webhooks: `user.created`, `user.updated`

### Clerk webhook handler — `app/api/webhooks/clerk/route.ts`

| Event | Action |
|---|---|
| `user.created` | Insert row in `users` table with `plan = 'free'`, `trips_used = 0` |
| `user.updated` | Sync `phone`, `phone_verified` (check `phoneNumbers[0].verification.status === 'verified'`), `email` |

Verify webhook authenticity using `svix` (Clerk's webhook library) and `CLERK_WEBHOOK_SECRET`.

### Auth in `route.ts`

```ts
import { auth } from '@clerk/nextjs/server';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });
  // ... load user from DB, run gates
}
```

### UI change in `PlanningChat.tsx`

Replace the hardcoded `USER_AVATAR` image with Clerk's `<UserButton />` component in the chat header. No other UI changes needed — Clerk handles sign-in/sign-up pages.

---

## Trip Count Enforcement & Paywall Gate

Lives entirely in `app/api/chat/route.ts` as a pre-flight check before the graph runs.

### Gate logic (in order)

```ts
const user = await db.query.users.findFirst({ where: eq(users.id, userId) });

// 1. Phone verification gate
if (!user.phone_verified) {
  return Response.json({ error: 'phone_unverified' }, { status: 403 });
}

// 2. Trip limit gate
const isPaid = user.plan === 'paid';
const atLimit = user.trips_used >= 3;

if (!isPaid && atLimit) {
  return Response.json({ error: 'upgrade_required' }, { status: 403 });
}
```

### Trip count increment

Only fires when a trip fully completes (not on every message). Detected when `trip_complete: true` appears in the stream state updates. Only increments for free-tier users.

```ts
if (tripCompleted && !isPaid) {
  await db.update(users)
    .set({ trips_used: user.trips_used + 1 })
    .where(eq(users.id, userId));
}
```

Also inserts a row in `trips` table at the same time:
```ts
await db.insert(trips).values({
  user_id: userId,
  thread_id: threadId,
  team: favorite_team,
  match_label: `${homeTeam} vs ${awayTeam}`,
  match_date: kickoffUtc.slice(0, 10),
  destination: match_city,
  tier: isPaid ? 'paid' : 'free',
});
```

### Client-side 403 handling in `PlanningChat.tsx`

| Error code | Message shown |
|---|---|
| `phone_unverified` | "Please verify your phone number in your account settings to start planning trips." |
| `upgrade_required` | "You've used your 3 free trips. Upgrade to FanBuddy Pro for real flight and hotel options." + **Upgrade** button → POST `/api/stripe/checkout` |

---

## Stripe Subscription

### `app/api/stripe/checkout/route.ts`

Creates a Stripe Checkout session (monthly recurring subscription):
- Attaches `userId` (Clerk) as session metadata
- `success_url` → `/chat`
- `cancel_url` → `/chat`
- Returns the Checkout session URL; client redirects to it

### `app/api/stripe/webhook/route.ts`

Verify Stripe signature using `STRIPE_WEBHOOK_SECRET` on every request.

| Stripe Event | DB Action |
|---|---|
| `checkout.session.completed` | Set `plan = 'paid'`, save `stripe_customer_id` + `stripe_subscription_id` |
| `customer.subscription.deleted` | Set `plan = 'free'`, clear `stripe_subscription_id` |
| `customer.subscription.updated` | Reserved for future multi-tier support — no-op for now |

### Stripe product setup

One product, one monthly price, configured in the Stripe dashboard before launch. The price ID is stored in `STRIPE_PRICE_ID` env var.

---

## Paid-Tier Node Wiring

### New graph state field

```ts
// lib/langchain/graph.ts — GraphState
user_plan: Annotation<'free' | 'paid'>({
  reducer: (_, y) => y,
  default: () => 'free',
}),
```

Also exported from `lib/langchain/types.ts`.

### Passing plan into the graph

`route.ts` includes `user_plan` in the initial state override passed to `graph.stream()`:

```ts
const initialState = {
  messages: [new HumanMessage(message)],
  itinerary: null,
  validation_errors: [],
  attempt_count: 0,
  formatted: null,
  direct_reply: null,
  free_tier_links: null,
  activities: null,
  user_plan: user.plan,  // 'free' | 'paid'
};
```

### Graph topology

Replace the current unconditional `confirm_dates_node → generate_links_node` edge with a plan-based conditional:

```
confirm_dates_node
      │
      ├─► plan = 'free'  ──► generate_links_node ──► activities_node ──► END
      │
      └─► plan = 'paid'  ──► plan_travel_node ──► validator_node
                                    ▲                    │
                                    │    retry loop      │  (max 3 attempts, unchanged)
                                    └────────────────────┘
                                                         │
                                                   formatter_node ──► activities_node ──► END
```

`activities_node` is shared across both paths — it reads `state.itinerary.match` and `state.user_preferences.travel_dates`, which are populated by both flows.

**No changes to `plan_travel_node`, `validator_node`, or `formatter_node` implementations.**

### LangGraph checkpointer

Replace `MemorySaver` with `PostgresCheckpointer` (from `@langchain/langgraph-checkpoint-postgres`):

```ts
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';

const checkpointer = PostgresSaver.fromConnString(process.env.DATABASE_URL!);
await checkpointer.setup(); // run once on startup to create checkpoint tables
```

Conversation state now persists across server restarts and is tied to `thread_id`, which is stored in the `trips` table for future Hub page access.

---

## Environment Variables

```bash
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=

# Neon Postgres
DATABASE_URL=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_PRICE_ID=
```

---

## Files Changed or Created

| File | Change |
|---|---|
| `middleware.ts` | New — Clerk route protection |
| `lib/db/schema.ts` | New — Drizzle schema (`users`, `trips` tables) |
| `lib/db/index.ts` | New — Neon + Drizzle client |
| `lib/stripe.ts` | New — Stripe client singleton |
| `lib/langchain/graph.ts` | Add `user_plan` state field, add plan-based routing after `confirm_dates_node`, wire paid-tier nodes into compiled graph, replace `MemorySaver` with `PostgresSaver` |
| `lib/langchain/types.ts` | Export `user_plan` type |
| `app/api/chat/route.ts` | Add Clerk auth, phone/plan gate, trip count increment, `trips` table insert, pass `user_plan` to graph |
| `app/api/stripe/checkout/route.ts` | New — creates Stripe Checkout session |
| `app/api/stripe/webhook/route.ts` | New — handles `checkout.session.completed`, `customer.subscription.deleted` |
| `app/api/webhooks/clerk/route.ts` | New — syncs user on `user.created` / `user.updated` |
| `components/chat/PlanningChat.tsx` | Replace hardcoded avatar with `<UserButton />`, handle `phone_unverified` and `upgrade_required` 403 codes |

---

## Out of Scope

- Hub / trip history page (Spec 2)
- More teams beyond current ~20 supported clubs
- Ticket purchasing or real ticket price data
- Radar / match alert notifications
- Mobile itinerary sidebar panel
- Annual pricing or multiple Stripe tiers
- USD → EUR currency conversion fix in `plan_travel_node` (existing TODO)
