# FanBuddy Monetization Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Clerk auth with phone verification, Neon Postgres for trip tracking, Stripe subscriptions, and wire the existing paid-tier LangGraph nodes behind the paywall.

**Architecture:** Clerk middleware protects `/chat` and `/api/chat`. A pre-flight gate in `route.ts` checks phone verification and trip count before running the graph. The graph gains a `user_plan` state field that routes to either the existing free-tier nodes or the existing (but currently unwired) paid-tier nodes. Trip completion is detected from the stream and written to Postgres.

**Tech Stack:** `@clerk/nextjs`, `svix`, `@neondatabase/serverless`, `drizzle-orm`, `drizzle-kit`, `stripe`, `@langchain/langgraph-checkpoint-postgres`

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `middleware.ts` | Create | Clerk route protection |
| `lib/db/schema.ts` | Create | Drizzle schema — `users` + `trips` tables |
| `lib/db/index.ts` | Create | Neon + Drizzle client singleton |
| `drizzle.config.ts` | Create | Drizzle Kit config for schema push |
| `lib/stripe.ts` | Create | Stripe client singleton |
| `lib/api/chat-gate.ts` | Create | Pure gate function (phone + plan check) — testable in isolation |
| `app/api/webhooks/clerk/route.ts` | Create | Sync user on sign-up / phone verify |
| `app/api/stripe/checkout/route.ts` | Create | Create Stripe Checkout session |
| `app/api/stripe/webhook/route.ts` | Create | Handle subscription events |
| `lib/langchain/graph.ts` | Modify | Add `user_plan` state, plan-based routing after `confirm_dates_node`, wire paid nodes, replace `MemorySaver` with `PostgresSaver` |
| `lib/langchain/types.ts` | Modify | Export `user_plan` type |
| `app/api/chat/route.ts` | Modify | Auth gate, phone/plan check, `user_plan` in initialState, trip count increment + trips row insert |
| `components/chat/PlanningChat.tsx` | Modify | Replace hardcoded avatar with `<UserButton />`, handle `phone_unverified` / `upgrade_required` 403s |

---

## Task 1: Install Dependencies and Configure Environment

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `.env` and `.env.example`

- [ ] **Step 1: Install runtime dependencies**

```bash
npm install @clerk/nextjs svix @neondatabase/serverless drizzle-orm stripe @langchain/langgraph-checkpoint-postgres
```

Expected: all packages install without peer dependency errors.

- [ ] **Step 2: Install dev dependencies**

```bash
npm install --save-dev drizzle-kit
```

- [ ] **Step 3: Add env vars to `.env`**

Add these lines (fill in real values from each service's dashboard):

```bash
# Clerk — https://dashboard.clerk.com → API Keys
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...

# Neon — https://console.neon.tech → Connection string
DATABASE_URL=postgresql://...

# Stripe — https://dashboard.stripe.com → Developers → API Keys
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_PRICE_ID=price_...
```

- [ ] **Step 4: Mirror new keys in `.env.example`** (values left blank)

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=
DATABASE_URL=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_PRICE_ID=
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore: install clerk, neon, drizzle, stripe, langgraph-postgres deps"
```

---

## Task 2: Database Schema

**Files:**
- Create: `lib/db/schema.ts`
- Create: `lib/db/index.ts`
- Create: `drizzle.config.ts`

- [ ] **Step 1: Write the schema**

Create `lib/db/schema.ts`:

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

export const users = pgTable('users', {
  id: varchar('id', { length: 255 }).primaryKey(), // Clerk userId
  email: varchar('email', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  phone_verified: boolean('phone_verified').notNull().default(false),
  plan: planEnum('plan').notNull().default('free'),
  trips_used: integer('trips_used').notNull().default(0),
  stripe_customer_id: varchar('stripe_customer_id', { length: 255 }),
  stripe_subscription_id: varchar('stripe_subscription_id', { length: 255 }),
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

- [ ] **Step 2: Write the database client**

Create `lib/db/index.ts`:

```ts
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

import * as schema from './schema';

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
```

- [ ] **Step 3: Write the Drizzle Kit config**

Create `drizzle.config.ts` at the project root:

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/db/schema.ts',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 4: Push schema to Neon**

```bash
npx drizzle-kit push
```

Expected output: `[✓] Changes applied` — the `users` and `trips` tables are created in your Neon database. If this is your first run it will also create the `plan` and `tier` enum types.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts lib/db/index.ts drizzle.config.ts
git commit -m "feat: add neon postgres schema (users, trips) with drizzle"
```

---

## Task 3: Gate Logic — Pure Function + Tests

This extracts the phone/plan gate into a testable pure function before wiring it into the API.

**Files:**
- Create: `lib/api/chat-gate.ts`
- Create: `lib/__tests__/chat-gate.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/chat-gate.test.ts`:

```ts
import { checkGate } from '../api/chat-gate';

describe('checkGate', () => {
  const base = { phone_verified: true, plan: 'free' as const, trips_used: 0 };

  it('blocks when phone is not verified', () => {
    expect(checkGate({ ...base, phone_verified: false })).toEqual({
      allowed: false,
      error: 'phone_unverified',
    });
  });

  it('allows free user with 0 trips used', () => {
    expect(checkGate(base)).toEqual({ allowed: true });
  });

  it('allows free user with 2 trips used', () => {
    expect(checkGate({ ...base, trips_used: 2 })).toEqual({ allowed: true });
  });

  it('blocks free user at 3 trips used', () => {
    expect(checkGate({ ...base, trips_used: 3 })).toEqual({
      allowed: false,
      error: 'upgrade_required',
    });
  });

  it('allows paid user even at 10 trips used', () => {
    expect(checkGate({ ...base, plan: 'paid', trips_used: 10 })).toEqual({
      allowed: true,
    });
  });

  it('phone check runs before trip limit check', () => {
    // unverified paid user is still blocked
    expect(checkGate({ phone_verified: false, plan: 'paid', trips_used: 0 })).toEqual({
      allowed: false,
      error: 'phone_unverified',
    });
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- --testPathPattern="chat-gate"
```

Expected: FAIL — `Cannot find module '../api/chat-gate'`

- [ ] **Step 3: Implement the gate function**

Create `lib/api/chat-gate.ts`:

```ts
export type GateError = 'phone_unverified' | 'upgrade_required';

export interface GateResult {
  allowed: boolean;
  error?: GateError;
}

export function checkGate(user: {
  phone_verified: boolean;
  plan: string;
  trips_used: number;
}): GateResult {
  if (!user.phone_verified) {
    return { allowed: false, error: 'phone_unverified' };
  }
  if (user.plan !== 'paid' && user.trips_used >= 3) {
    return { allowed: false, error: 'upgrade_required' };
  }
  return { allowed: true };
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- --testPathPattern="chat-gate"
```

Expected: PASS — 6 passing

- [ ] **Step 5: Commit**

```bash
git add lib/api/chat-gate.ts lib/__tests__/chat-gate.test.ts
git commit -m "feat: add chat gate logic with tests"
```

---

## Task 4: Clerk Middleware

**Files:**
- Create: `middleware.ts` (project root)

- [ ] **Step 1: Write the middleware**

Create `middleware.ts` at the project root (same level as `app/`):

```ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtected = createRouteMatcher([
  '/chat(.*)',
  '/api/chat(.*)',
  '/api/stripe/checkout(.*)',
]);

export default clerkMiddleware((auth, req) => {
  if (isProtected(req)) auth().protect();
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
```

- [ ] **Step 2: Wrap `app/layout.tsx` with `<ClerkProvider>`**

Open `app/layout.tsx`. Add the `ClerkProvider` import and wrap the `<html>` element:

```ts
// Add at top of imports
import { ClerkProvider } from '@clerk/nextjs';

// In the RootLayout function, wrap children:
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${inter.className} ${manrope.className}`}>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
```

> **Note:** Match the exact existing structure of `app/layout.tsx` — only add `<ClerkProvider>` as the outermost wrapper, preserve all existing className and font logic.

- [ ] **Step 3: Verify the app still starts**

```bash
npm run dev
```

Expected: Server starts at `http://localhost:3000` without errors. Visiting `http://localhost:3000` shows the marketing landing page. Visiting `http://localhost:3000/chat` redirects to Clerk's sign-in page.

- [ ] **Step 4: Commit**

```bash
git add middleware.ts app/layout.tsx
git commit -m "feat: add clerk middleware — protect /chat and /api/chat"
```

---

## Task 5: Clerk Webhook Handler (User Sync)

**Files:**
- Create: `app/api/webhooks/clerk/route.ts`

- [ ] **Step 1: Configure the webhook in Clerk dashboard**

In the Clerk dashboard → Webhooks → Add endpoint:
- URL: `https://your-domain.com/api/webhooks/clerk` (use your deployed URL or ngrok for local)
- Events: check `user.created` and `user.updated`
- Copy the Signing Secret into `CLERK_WEBHOOK_SECRET` in `.env`

- [ ] **Step 2: Write the handler**

Create `app/api/webhooks/clerk/route.ts`:

```ts
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { Webhook } from 'svix';

import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';

export async function POST(req: Request) {
  const payload = await req.text();
  const headersList = headers();

  const svixHeaders = {
    'svix-id': headersList.get('svix-id') ?? '',
    'svix-timestamp': headersList.get('svix-timestamp') ?? '',
    'svix-signature': headersList.get('svix-signature') ?? '',
  };

  let event: { type: string; data: Record<string, unknown> };
  try {
    const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!);
    event = wh.verify(payload, svixHeaders) as typeof event;
  } catch {
    return new Response('Invalid signature', { status: 400 });
  }

  if (event.type === 'user.created') {
    const { id, email_addresses, phone_numbers } = event.data as {
      id: string;
      email_addresses: Array<{ email_address: string }>;
      phone_numbers: Array<{ phone_number: string; verification: { status: string } }>;
    };

    const email = email_addresses[0]?.email_address ?? '';
    const phoneEntry = phone_numbers?.[0];
    const phone = phoneEntry?.phone_number ?? null;
    const phone_verified = phoneEntry?.verification?.status === 'verified';

    await db.insert(users).values({
      id: id as string,
      email,
      phone,
      phone_verified,
    }).onConflictDoNothing();
  }

  if (event.type === 'user.updated') {
    const { id, email_addresses, phone_numbers } = event.data as {
      id: string;
      email_addresses: Array<{ email_address: string }>;
      phone_numbers: Array<{ phone_number: string; verification: { status: string } }>;
    };

    const email = email_addresses[0]?.email_address ?? '';
    const phoneEntry = phone_numbers?.[0];
    const phone = phoneEntry?.phone_number ?? null;
    const phone_verified = phoneEntry?.verification?.status === 'verified';

    await db.update(users)
      .set({ email, phone, phone_verified })
      .where(eq(users.id, id as string));
  }

  return new Response('OK', { status: 200 });
}
```

- [ ] **Step 3: Test with Clerk dashboard test event**

In the Clerk Webhooks dashboard, use "Send test event" for `user.created`. Check your Neon database for a new row in the `users` table:

```bash
# Verify via drizzle studio or psql:
npx drizzle-kit studio
# Navigate to the users table — confirm a test row was inserted
```

- [ ] **Step 4: Commit**

```bash
git add app/api/webhooks/clerk/route.ts
git commit -m "feat: add clerk webhook handler — sync users to postgres on signup/update"
```

---

## Task 6: Stripe Client and Checkout Endpoint

**Files:**
- Create: `lib/stripe.ts`
- Create: `app/api/stripe/checkout/route.ts`

- [ ] **Step 1: Write the Stripe client singleton**

Create `lib/stripe.ts`:

```ts
import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
});
```

- [ ] **Step 2: Write the checkout endpoint**

Create `app/api/stripe/checkout/route.ts`:

```ts
import { auth } from '@clerk/nextjs/server';

import { stripe } from '@/lib/stripe';

export async function POST() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: process.env.STRIPE_PRICE_ID!,
        quantity: 1,
      },
    ],
    metadata: { userId },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/chat`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/chat`,
  });

  return Response.json({ url: session.url });
}
```

> **Note:** Add `NEXT_PUBLIC_APP_URL=https://your-domain.com` to `.env` (and `.env.example`) for production. Omit it locally — the fallback `localhost:3000` is used.

- [ ] **Step 3: Add `NEXT_PUBLIC_APP_URL` to env files**

In `.env`:
```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

In `.env.example`:
```bash
NEXT_PUBLIC_APP_URL=
```

- [ ] **Step 4: Commit**

```bash
git add lib/stripe.ts app/api/stripe/checkout/route.ts .env.example
git commit -m "feat: add stripe client and checkout session endpoint"
```

---

## Task 7: Stripe Webhook Handler

**Files:**
- Create: `app/api/stripe/webhook/route.ts`

- [ ] **Step 1: Write the webhook handler**

Create `app/api/stripe/webhook/route.ts`:

```ts
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import type Stripe from 'stripe';

import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { stripe } from '@/lib/stripe';

export async function POST(req: Request) {
  const payload = await req.text();
  const sig = headers().get('stripe-signature') ?? '';

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return new Response('Invalid signature', { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    if (!userId) return new Response('Missing userId in metadata', { status: 400 });

    await db.update(users)
      .set({
        plan: 'paid',
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: session.subscription as string,
      })
      .where(eq(users.id, userId));
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription;

    await db.update(users)
      .set({
        plan: 'free',
        stripe_subscription_id: null,
      })
      .where(eq(users.stripe_subscription_id, subscription.id));
  }

  return new Response('OK', { status: 200 });
}
```

- [ ] **Step 2: Register the webhook in Stripe dashboard**

Stripe Dashboard → Developers → Webhooks → Add endpoint:
- URL: `https://your-domain.com/api/stripe/webhook`
- Events: `checkout.session.completed`, `customer.subscription.deleted`
- Copy the Signing Secret into `STRIPE_WEBHOOK_SECRET` in `.env`

For local testing, use Stripe CLI:
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

- [ ] **Step 3: Test with Stripe CLI**

```bash
stripe trigger checkout.session.completed
```

Expected: `200 OK` response in the Stripe CLI output. Check Neon `users` table — the test user should have `plan = 'paid'`.

- [ ] **Step 4: Commit**

```bash
git add app/api/stripe/webhook/route.ts
git commit -m "feat: add stripe webhook handler — sync subscription status to postgres"
```

---

## Task 8: Graph — user_plan State, Paid-Tier Routing, PostgresSaver

**Files:**
- Modify: `lib/langchain/types.ts`
- Modify: `lib/langchain/graph.ts`
- Create: `__tests__/lib/langchain/plan-routing.test.ts`

- [ ] **Step 1: Export user_plan type from `lib/langchain/types.ts`**

Open `lib/langchain/types.ts`. Add after the `ConversationStage` type:

```ts
export type UserPlan = 'free' | 'paid';
```

- [ ] **Step 2: Write failing tests for the new routing functions**

Create `__tests__/lib/langchain/plan-routing.test.ts`:

```ts
import { END } from '@langchain/langgraph';

import { routeAfterDates, shouldRetryOrFinish } from '@/lib/langchain/graph';

describe('routeAfterDates', () => {
  const baseState = {
    direct_reply: null,
    user_plan: 'free' as const,
  };

  it('returns END when direct_reply is set', () => {
    expect(routeAfterDates({ ...baseState, direct_reply: 'some reply' })).toBe(END);
  });

  it('routes to generate_links_node for free plan', () => {
    expect(routeAfterDates(baseState)).toBe('generate_links_node');
  });

  it('routes to plan_travel_node for paid plan', () => {
    expect(routeAfterDates({ ...baseState, user_plan: 'paid' })).toBe('plan_travel_node');
  });
});

describe('shouldRetryOrFinish', () => {
  it('goes to formatter_node when no errors', () => {
    expect(shouldRetryOrFinish({ validation_errors: [], attempt_count: 1 })).toBe('formatter_node');
  });

  it('goes to formatter_node on PROVISIONAL-only errors', () => {
    expect(
      shouldRetryOrFinish({ validation_errors: ['TV schedule unconfirmed — marked PROVISIONAL'], attempt_count: 1 }),
    ).toBe('formatter_node');
  });

  it('retries on hard error with attempt_count < 3', () => {
    expect(
      shouldRetryOrFinish({ validation_errors: ['Flight arrives too late — buffer is 2.0h'], attempt_count: 1 }),
    ).toBe('plan_travel_node');
  });

  it('goes to formatter_node on hard error when attempt_count >= 3', () => {
    expect(
      shouldRetryOrFinish({ validation_errors: ['Flight arrives too late — buffer is 2.0h'], attempt_count: 3 }),
    ).toBe('formatter_node');
  });
});
```

- [ ] **Step 3: Run tests — verify they fail**

```bash
npm test -- --testPathPattern="plan-routing"
```

Expected: FAIL — `routeAfterDates is not exported from graph`

- [ ] **Step 4: Add `user_plan` to GraphState in `lib/langchain/graph.ts`**

Open `lib/langchain/graph.ts`. In the `GraphState` block (around line 56), add after the `trip_complete` annotation:

```ts
  user_plan: Annotation<'free' | 'paid'>({
    reducer: (_, y) => y,
    default: () => 'free',
  }),
```

Also add the import at the top with the other type imports:
```ts
import type {
  // ... existing imports ...
  UserPlan,
} from './types';
```

Update the `State` usage to include `user_plan` in type-checked state parameters throughout the file where needed.

- [ ] **Step 5: Add and export `routeAfterDates` function in `lib/langchain/graph.ts`**

Add this function after the existing `routeFromRouter` export (around line 990):

```ts
export function routeAfterDates(
  state: Pick<State, 'direct_reply' | 'user_plan'>,
): string | typeof END {
  if (state.direct_reply) return END;
  return state.user_plan === 'paid' ? 'plan_travel_node' : 'generate_links_node';
}
```

- [ ] **Step 6: Add and export `shouldRetryOrFinish` function in `lib/langchain/graph.ts`**

Add this function after `routeAfterDates`:

```ts
export function shouldRetryOrFinish(
  state: Pick<State, 'validation_errors' | 'attempt_count'>,
): string {
  const hardErrors = state.validation_errors.filter((e) => !e.includes('PROVISIONAL'));
  if (hardErrors.length > 0 && state.attempt_count < 3) {
    return 'plan_travel_node';
  }
  return 'formatter_node';
}
```

- [ ] **Step 7: Run tests — verify they pass**

```bash
npm test -- --testPathPattern="plan-routing"
```

Expected: PASS — 7 passing

- [ ] **Step 8: Replace `MemorySaver` with `PostgresSaver` in `lib/langchain/graph.ts`**

At the top of `lib/langchain/graph.ts`, update the `@langchain/langgraph` import and add the `PostgresSaver` import:

```ts
// Before:
import { Annotation, END, MemorySaver, START, StateGraph } from '@langchain/langgraph';

// After:
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
```

Then replace the checkpointer setup at the bottom of the file (the `const checkpointer = new MemorySaver()` line):

```ts
// Remove:
// const checkpointer = new MemorySaver();

// Add — lazy init: setup() runs once per process, compile() caches the result:
const checkpointer = PostgresSaver.fromConnString(process.env.DATABASE_URL!);
let _compiledGraph: Awaited<ReturnType<typeof _graph.compile>> | null = null;

async function buildGraph() {
  if (!_compiledGraph) {
    await checkpointer.setup(); // idempotent — CREATE TABLE IF NOT EXISTS
    _compiledGraph = _graph.compile({ checkpointer });
  }
  return _compiledGraph;
}
```

> **Note:** Rename the local `const graph = new StateGraph(...)` declaration to `const _graph = new StateGraph(...)` to avoid shadowing the exported `buildGraph` return value. Update all internal references accordingly — only the graph assembly block uses this name.

- [ ] **Step 9: Wire the paid-tier nodes into the compiled graph**

Replace the entire Graph Assembly section (lines starting with `const graph = new StateGraph...` to `.compile({ checkpointer })`):

```ts
const graph = new StateGraph(GraphState)
  .addNode('router_node', router_node)
  .addNode('list_matches_node', list_matches_node)
  .addNode('collect_preferences_node', collect_preferences_node)
  .addNode('confirm_dates_node', confirm_dates_node)
  .addNode('generate_links_node', generate_links_node)
  .addNode('activities_node', activities_node)
  // Paid-tier nodes (previously unwired):
  .addNode('plan_travel_node', plan_travel_node)
  .addNode('validator_node', validator_node)
  .addNode('formatter_node', formatter_node)
  .addEdge(START, 'router_node')
  .addConditionalEdges(
    'router_node',
    routeFromRouter,
    {
      list_matches_node: 'list_matches_node',
      collect_preferences_node: 'collect_preferences_node',
      confirm_dates_node: 'confirm_dates_node',
      [END]: END,
    },
  )
  .addConditionalEdges(
    'list_matches_node',
    (state) => afterDirectReply(state, 'collect_preferences_node'),
    { collect_preferences_node: 'collect_preferences_node', [END]: END },
  )
  .addConditionalEdges(
    'collect_preferences_node',
    (state) => afterDirectReply(state, 'confirm_dates_node'),
    { confirm_dates_node: 'confirm_dates_node', [END]: END },
  )
  // Plan-based fork: free → links, paid → plan_travel
  .addConditionalEdges(
    'confirm_dates_node',
    routeAfterDates,
    {
      generate_links_node: 'generate_links_node',
      plan_travel_node: 'plan_travel_node',
      [END]: END,
    },
  )
  // Free-tier path
  .addEdge('generate_links_node', 'activities_node')
  // Paid-tier path
  .addConditionalEdges(
    'validator_node',
    shouldRetryOrFinish,
    {
      plan_travel_node: 'plan_travel_node',
      formatter_node: 'formatter_node',
    },
  )
  .addEdge('plan_travel_node', 'validator_node')
  .addEdge('formatter_node', 'activities_node')
  // Shared exit
  .addEdge('activities_node', END);

```ts
// Remove: export { graph };
export { buildGraph };
export type { State as GraphStateType };
```

> **Important:** The graph is no longer compiled at module load. It's compiled lazily and cached on the first call to `buildGraph()`.

- [ ] **Step 10: Run all tests**

```bash
npm test
```

Expected: All existing tests still pass. `plan-routing` tests pass.

- [ ] **Step 12: Commit**

```bash
git add lib/langchain/graph.ts lib/langchain/types.ts __tests__/lib/langchain/plan-routing.test.ts
git commit -m "feat: wire paid-tier nodes into graph, add plan-based routing, replace MemorySaver with PostgresSaver"
```

---

## Task 9: Chat API — Auth Gate, Trip Counting, user_plan

**Files:**
- Modify: `app/api/chat/route.ts`

- [ ] **Step 1: Update imports and NODE_STATUS**

In the `NODE_STATUS` map at the top of `app/api/chat/route.ts`, add three entries for the paid-tier nodes:

```ts
const NODE_STATUS: Record<string, string> = {
  router_node: 'Finding upcoming fixtures...',
  list_matches_node: 'Loaded fixtures...',
  collect_preferences_node: 'Got your preferences...',
  confirm_dates_node: 'Confirmed your dates...',
  generate_links_node: 'Building your trip links...',
  activities_node: 'Planning your activities...',
  // Paid-tier nodes:
  plan_travel_node: 'Searching flights and hotels...',
  validator_node: 'Validating your itinerary...',
  formatter_node: 'Preparing your itinerary...',
};
```

Then replace the existing imports at the top of `app/api/chat/route.ts` with:

```ts
import { auth } from '@clerk/nextjs/server';
import { HumanMessage } from '@langchain/core/messages';
import { eq } from 'drizzle-orm';
import { CallbackHandler } from 'langfuse-langchain';

import { checkGate } from '@/lib/api/chat-gate';
import { db } from '@/lib/db';
import { trips, users } from '@/lib/db/schema';
import { buildGraph } from '@/lib/langchain/graph';
import type {
  ActivitiesData,
  ChatApiRequest,
  ChatStreamEvent,
  FixtureSummary,
  FormattedItinerary,
  FreeTierLinks,
} from '@/lib/langchain/types';
```

- [ ] **Step 2: Replace the POST handler**

Replace the entire `POST` function with:

```ts
export async function POST(request: Request) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  // ── Load user + run gate ───────────────────────────────────────────────────
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return Response.json({ error: 'user_not_found' }, { status: 404 });

  const gate = checkGate(user);
  if (!gate.allowed) {
    return Response.json({ error: gate.error }, { status: 403 });
  }

  const isPaid = user.plan === 'paid';

  // ── Parse body ─────────────────────────────────────────────────────────────
  const body = (await request.json()) as Partial<ChatApiRequest>;
  const { message, thread_id } = body;

  if (!message || !thread_id) {
    return Response.json(
      { reply: 'Missing required fields: message and thread_id.', itinerary: null },
      { status: 400 },
    );
  }

  // ── Langfuse (optional) ────────────────────────────────────────────────────
  const langfuseEnabled =
    !!process.env.LANGFUSE_SECRET_KEY && !!process.env.LANGFUSE_PUBLIC_KEY;

  const langfuseHandler = langfuseEnabled
    ? new CallbackHandler({
        secretKey: process.env.LANGFUSE_SECRET_KEY,
        publicKey: process.env.LANGFUSE_PUBLIC_KEY,
        baseUrl: process.env.LANGFUSE_BASE_URL ?? 'https://cloud.langfuse.com',
      })
    : null;

  const encoder = new TextEncoder();

  const responseStream = new ReadableStream({
    async start(controller) {
      const send = (event: ChatStreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        const compiledGraph = await buildGraph();

        const config = {
          configurable: { thread_id },
          ...(langfuseHandler ? { callbacks: [langfuseHandler] } : {}),
        };

        send({ type: 'status', message: 'Analyzing your request...' });

        const initialState = {
          messages: [new HumanMessage(message)],
          validation_errors: [],
          attempt_count: 0,
          formatted: null,
          direct_reply: null,
          free_tier_links: null,
          wants_date_recommendation: false,
          user_plan: user.plan as 'free' | 'paid',
        };

        const graphStream = await compiledGraph.stream(initialState, {
          ...config,
          streamMode: 'updates',
        });

        let directReply: string | null = null;
        let formatted: FormattedItinerary | null = null;
        let links: FreeTierLinks | null = null;
        let fixtures: FixtureSummary[] | null = null;
        let activities: ActivitiesData | null = null;
        let tripCompleted = false;

        for await (const chunk of graphStream) {
          const nodeName = Object.keys(chunk)[0] as string;
          const update = (chunk as Record<string, Record<string, unknown>>)[nodeName];

          if (update.direct_reply != null) directReply = update.direct_reply as string;
          if (update.formatted != null) {
            formatted = update.formatted as FormattedItinerary;
            tripCompleted = true; // paid-tier trip complete
          }
          if (update.free_tier_links != null) links = update.free_tier_links as FreeTierLinks;
          if (update.fixture_list != null) fixtures = update.fixture_list as FixtureSummary[];
          if (update.activities != null) activities = update.activities as ActivitiesData;
          if (update.trip_complete === true) tripCompleted = true; // free-tier trip complete

          if (NODE_STATUS[nodeName]) {
            send({ type: 'status', message: NODE_STATUS[nodeName] });
          }
        }

        // ── Record completed trip ────────────────────────────────────────────
        if (tripCompleted) {
          const fullState = await compiledGraph.getState({ configurable: { thread_id } });
          const match = (fullState.values as Record<string, unknown> & { itinerary?: { match?: Record<string, string> } }).itinerary?.match;
          const prefs = (fullState.values as Record<string, unknown> & { user_preferences?: { favorite_team?: string } }).user_preferences;

          await db.insert(trips).values({
            user_id: userId,
            thread_id,
            team: prefs?.favorite_team ?? 'Unknown',
            match_label: match ? `${match.homeTeam} vs ${match.awayTeam}` : 'Unknown match',
            match_date: match?.kickoffUtc?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
            destination: match?.match_city ?? match?.venue ?? 'Unknown',
            tier: isPaid ? 'paid' : 'free',
          });

          if (!isPaid) {
            await db.update(users)
              .set({ trips_used: user.trips_used + 1 })
              .where(eq(users.id, userId));
          }
        }

        const reply =
          directReply ??
          formatted?.summary ??
          'I was unable to help. Please try again.';

        send({ type: 'done', reply, itinerary: formatted, links, fixtures, activities });
      } catch (err) {
        console.error('[api/chat] Graph invocation failed:', err);
        send({ type: 'error', message: 'Something went wrong. Please try again.' });
      } finally {
        await langfuseHandler?.flushAsync();
        controller.close();
      }
    },
  });

  return new Response(responseStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
```

- [ ] **Step 3: Verify the app starts without TypeScript errors**

```bash
npm run build
```

Expected: Build completes with no type errors. Warnings about `any` types are acceptable; errors are not.

- [ ] **Step 4: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat: add auth gate, trip counting, and user_plan to chat API"
```

---

## Task 10: UI — UserButton and 403 Error Handling

**Files:**
- Modify: `components/chat/PlanningChat.tsx`

- [ ] **Step 1: Replace the hardcoded avatar with `<UserButton />`**

Open `components/chat/PlanningChat.tsx`.

Add the Clerk import at the top:
```ts
import { UserButton } from '@clerk/nextjs';
```

Remove the `USER_AVATAR` constant (line ~40):
```ts
// Remove this line:
const USER_AVATAR = 'https://lh3.googleusercontent.com/...';
```

In the chat header (around line 776), replace the `<Image>` avatar with the Clerk `<UserButton />`:
```tsx
// Remove:
<Image
  src={USER_AVATAR}
  alt="User avatar"
  width={32}
  height={32}
  className="h-8 w-8 rounded-full border-2 border-white object-cover"
/>

// Replace with:
<UserButton
  appearance={{
    elements: {
      avatarBox: 'h-8 w-8 rounded-full border-2 border-white',
    },
  }}
/>
```

Also remove the mobile header avatar button (lines ~692-699) — replace with `<UserButton />` using the same appearance config.

- [ ] **Step 2: Add 403 error handling in `handleSendMessage`**

In `handleSendMessage`, the `res.ok` check currently throws a generic error. Replace it with:

```ts
if (!res.ok) {
  if (res.status === 403) {
    const { error } = await res.json() as { error: string };
    if (error === 'phone_unverified') {
      pushAiText(
        'Please verify your phone number in your account settings to start planning trips.',
      );
    } else if (error === 'upgrade_required') {
      pushUpgradePrompt();
    } else {
      pushAiText('Access denied. Please try again.');
    }
    return;
  }
  throw new Error(`HTTP ${res.status}`);
}
```

- [ ] **Step 3: Add `pushUpgradePrompt` to the component**

Add this callback alongside the other `push*` callbacks:

```ts
const pushUpgradePrompt = useCallback(() => {
  setItems((prev) => [
    ...prev,
    {
      id: newId(),
      role: 'ai' as const,
      kind: 'upgrade' as const,
      time: formatMessageTime(new Date()),
    },
  ]);
}, []);
```

- [ ] **Step 4: Add the `upgrade` message kind to `ChatMessage` type**

In the `ChatMessage` type union, add:

```ts
| { id: string; role: 'ai'; kind: 'upgrade'; time: string }
```

- [ ] **Step 5: Render the upgrade prompt in the message list**

In the `items.map` block, add a handler for `kind === 'upgrade'`:

```tsx
if (m.role === 'ai' && m.kind === 'upgrade') {
  return (
    <div key={m.id} className="flex max-w-[90%] gap-4">
      <AiAvatar />
      <div className="flex-1 space-y-4">
        <div className="rounded-2xl rounded-tl-none bg-landing-container-low px-5 py-4 text-[15px] leading-[1.65] text-landing-on-surface/80">
          You&apos;ve used your 3 free trips. Upgrade to{' '}
          <strong className="font-semibold text-landing-on-surface">FanBuddy Pro</strong>{' '}
          for real flight and hotel options with no limits.
        </div>
        <button
          type="button"
          onClick={async () => {
            const res = await fetch('/api/stripe/checkout', { method: 'POST' });
            const { url } = await res.json() as { url: string };
            window.location.href = url;
          }}
          className="flex items-center gap-2 rounded-xl bg-pitch-gradient px-5 py-3 text-sm font-bold text-white shadow-md transition-transform hover:opacity-90 active:scale-95"
        >
          <Crown className="size-4 shrink-0" strokeWidth={2} />
          Upgrade to Pro
        </button>
        <span className="ml-1 text-[10px] text-landing-on-surface-variant/60">{m.time}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify the UI renders without errors**

```bash
npm run dev
```

Open `http://localhost:3000`. Sign in via Clerk. Go to `/chat` — confirm the Clerk `UserButton` appears in the header. Send a message — confirm the conversation works.

- [ ] **Step 7: Run lint**

```bash
npm run lint
```

Expected: No errors. Fix any reported issues before committing.

- [ ] **Step 8: Run all tests**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add components/chat/PlanningChat.tsx
git commit -m "feat: add clerk UserButton and upgrade prompt to chat UI"
```

---

## Final Verification

- [ ] **Sign-up flow:** Create a new account via Clerk. Verify the user appears in the Neon `users` table. Verify phone verification is required.
- [ ] **Free trip count:** Plan 3 trips as a free user. On the 4th attempt, confirm the upgrade prompt appears.
- [ ] **Stripe checkout:** Click Upgrade → confirm redirect to Stripe Checkout. Complete payment with test card `4242 4242 4242 4242`. Confirm the user's `plan` in Neon updates to `paid`.
- [ ] **Paid-tier flow:** As a paid user, plan a trip. Confirm the response includes a real `FormattedItinerary` with flight and hotel data (not just Google Flights links).
- [ ] **Trip history:** After completing trips, confirm rows appear in the `trips` table with correct `team`, `match_label`, `destination`, and `tier` values.
- [ ] **Conversation persistence:** Complete a trip. Restart the dev server. Send a follow-up message in the same session. Confirm the conversation history is preserved (PostgresSaver working).

- [ ] **Final commit**

```bash
git add -A
git commit -m "feat: complete monetization core — clerk auth, neon, stripe, paid-tier wiring"
```
