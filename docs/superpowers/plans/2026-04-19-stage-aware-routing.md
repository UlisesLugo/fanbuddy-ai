# Stage-Aware Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unconditional `router_node → list_matches_node` edge with a stage-aware conditional router that skips expensive API calls when work is already done and immediately ends the graph when the trip is complete.

**Architecture:** `router_node` now extracts a `conversation_stage` field (via the existing `withStructuredOutput` call — no extra LLM call) and optionally short-circuits with a `direct_reply` when `trip_complete`. A new conditional edge routes to the earliest node whose prerequisites aren't yet met, skipping all earlier nodes. `list_matches_node` adds a cache guard using the persisted `fixture_list` to skip `searchFixtures` on repeat turns.

**Tech Stack:** LangGraph `StateGraph`, Zod `withStructuredOutput`, Jest, TypeScript

---

## File Map

| File | What changes |
|------|-------------|
| `lib/langchain/types.ts` | Add and export `ConversationStage` type |
| `lib/langchain/graph.ts` | Add two state fields, update `RouterSchema` + `router_node`, replace unconditional edge, add cache guard in `list_matches_node`, set `trip_complete: true` in `generate_links_node` |
| `__tests__/lib/langchain/stage-routing.test.ts` | Unit tests for the `routeFromRouter` edge function (pure function, no LLM mocks) |

---

### Task 1: Export `ConversationStage` type

**Files:**
- Modify: `lib/langchain/types.ts`

- [ ] **Step 1: Add type after `ValidationStatus`**

In `lib/langchain/types.ts`, add after line 81 (`export type ValidationStatus = ...`):

```ts
export type ConversationStage =
  | 'collecting_team'
  | 'selecting_match'
  | 'collecting_preferences'
  | 'confirming_dates'
  | 'trip_complete';
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add lib/langchain/types.ts
git commit -m "feat: add ConversationStage type to types.ts"
```

---

### Task 2: Add `conversation_stage` and `trip_complete` to `GraphState`

**Files:**
- Modify: `lib/langchain/graph.ts`

- [ ] **Step 1: Add import for `ConversationStage`**

At the top of `lib/langchain/graph.ts`, in the existing import block from `./types`, add `ConversationStage`:

```ts
import type {
  ConversationStage,
  FixtureSummary,
  FormattedItinerary,
  FreeTierLinks,
  ItineraryData,
  RawFlightOption,
  RawHotelOption,
  RawMatchFixture,
  UserPreferences,
} from './types';
```

- [ ] **Step 2: Add two fields to `GraphState` annotation**

In `lib/langchain/graph.ts`, inside the `Annotation.Root({...})` block (after the `activities` field, around line 118), add:

```ts
  conversation_stage: Annotation<ConversationStage>({
    reducer: (_, y) => y,
    default: () => 'collecting_team' as ConversationStage,
  }),
  trip_complete: Annotation<boolean>({
    reducer: (_, y) => y,
    default: () => false,
  }),
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add lib/langchain/graph.ts
git commit -m "feat: add conversation_stage and trip_complete to GraphState"
```

---

### Task 3: Write failing tests for `routeFromRouter`

**Files:**
- Create: `__tests__/lib/langchain/stage-routing.test.ts`

The `routeFromRouter` function doesn't exist yet — these tests will fail until Task 4.

- [ ] **Step 1: Create the test file**

```ts
import { END } from '@langchain/langgraph';
import { routeFromRouter } from '@/lib/langchain/graph';

// Minimal state shape — only fields the edge function reads
const baseState = {
  trip_complete: false,
  conversation_stage: 'collecting_team' as const,
  direct_reply: null,
};

describe('routeFromRouter', () => {
  it('returns END when trip_complete is true', () => {
    expect(routeFromRouter({ ...baseState, trip_complete: true })).toBe(END);
  });

  it('routes collecting_team to list_matches_node', () => {
    expect(
      routeFromRouter({ ...baseState, conversation_stage: 'collecting_team' }),
    ).toBe('list_matches_node');
  });

  it('routes selecting_match to list_matches_node', () => {
    expect(
      routeFromRouter({ ...baseState, conversation_stage: 'selecting_match' }),
    ).toBe('list_matches_node');
  });

  it('routes collecting_preferences to collect_preferences_node', () => {
    expect(
      routeFromRouter({ ...baseState, conversation_stage: 'collecting_preferences' }),
    ).toBe('collect_preferences_node');
  });

  it('routes confirming_dates to confirm_dates_node', () => {
    expect(
      routeFromRouter({ ...baseState, conversation_stage: 'confirming_dates' }),
    ).toBe('confirm_dates_node');
  });

  it('falls back to list_matches_node for unknown stage', () => {
    expect(
      routeFromRouter({ ...baseState, conversation_stage: 'trip_complete' as 'collecting_team' }),
    ).toBe(END);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- __tests__/lib/langchain/stage-routing.test.ts
```

Expected: FAIL — `routeFromRouter` is not exported from `@/lib/langchain/graph`

- [ ] **Step 3: Commit failing tests**

```bash
git add __tests__/lib/langchain/stage-routing.test.ts
git commit -m "test: add failing tests for routeFromRouter edge function"
```

---

### Task 4: Implement `routeFromRouter` and wire the conditional edge

**Files:**
- Modify: `lib/langchain/graph.ts`

- [ ] **Step 1: Extract and export `routeFromRouter` function**

In `lib/langchain/graph.ts`, add this function after the `afterDirectReply` function (around line 922):

```ts
export function routeFromRouter(
  state: Pick<State, 'trip_complete' | 'conversation_stage'>,
): string | typeof END {
  if (state.trip_complete) return END;
  switch (state.conversation_stage) {
    case 'collecting_team':
    case 'selecting_match':
      return 'list_matches_node';
    case 'collecting_preferences':
      return 'collect_preferences_node';
    case 'confirming_dates':
      return 'confirm_dates_node';
    default:
      return 'list_matches_node';
  }
}
```

- [ ] **Step 2: Replace unconditional edge with conditional edge**

In the graph assembly block, replace:

```ts
  .addEdge('router_node', 'list_matches_node')
```

with:

```ts
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
```

- [ ] **Step 3: Run tests to verify they pass**

```bash
npm test -- __tests__/lib/langchain/stage-routing.test.ts
```

Expected: PASS — all 6 tests green

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add lib/langchain/graph.ts
git commit -m "feat: wire stage-aware conditional edge after router_node"
```

---

### Task 5: Update `RouterSchema` and `router_node` prompt

**Files:**
- Modify: `lib/langchain/graph.ts`

- [ ] **Step 1: Add `conversation_stage` to `RouterSchema`**

In `lib/langchain/graph.ts`, inside the `RouterSchema` z.object definition, add after the `wants_date_recommendation` field:

```ts
  conversation_stage: z
    .enum([
      'collecting_team',
      'selecting_match',
      'collecting_preferences',
      'confirming_dates',
      'trip_complete',
    ])
    .describe(
      'Stage of the trip-planning conversation based on what is already known. ' +
      'Use collecting_team if favorite_team is unknown. ' +
      'Use selecting_match if team is known and fixtures are loaded but no match is selected. ' +
      'Use collecting_preferences if match is selected but origin_city or spending_tier is missing. ' +
      'Use confirming_dates if match and preferences are known but travel_dates is missing. ' +
      'Use trip_complete if trip_complete context value is true.',
    ),
```

- [ ] **Step 2: Update `router_node` prompt to include state context**

In `lib/langchain/graph.ts`, inside `router_node`, replace the `structured.invoke(...)` call string with one that passes current state as context. The full updated `router_node` function body (from the `const result = await structured.invoke(...)` call onwards):

```ts
  const stateContext = `
Current session state (use this to classify conversation_stage):
- favorite_team: ${state.user_preferences.favorite_team || 'UNKNOWN'}
- fixture_list loaded: ${state.fixture_list?.length ? `yes (${state.fixture_list.length} fixtures)` : 'no'}
- selected_match_id: ${state.user_preferences.selected_match_id ?? 'UNKNOWN'}
- origin_city: ${state.user_preferences.origin_city || 'UNKNOWN'}
- spending_tier: ${state.user_preferences.spending_tier ?? 'UNKNOWN'}
- travel_dates: ${state.user_preferences.travel_dates ? `${state.user_preferences.travel_dates.checkIn} to ${state.user_preferences.travel_dates.checkOut}` : 'UNKNOWN'}
- trip_complete: ${state.trip_complete}
`;

  const result = await structured.invoke(
    `You are an information extractor for FanBuddy.AI, a football trip planning app.
${contextLine}
${stateContext}
Extract the following from the user's message if present:
- origin_city: the city the user is travelling FROM. Null if not mentioned. Use the conversation context to resolve ambiguity — if the assistant just asked for the origin city and the user replied with a place name (even one that shares a name with a football club), treat it as origin_city.
- favorite_team: the football club the user wants to watch. Null if not mentioned. Only extract this if the user is clearly referring to a team, not answering a question about where they live or travel from.
- selected_match_id: a 1-based index if the user picks a match from a numbered list (e.g. "match 2" → "2"). Null if not mentioned.
- spending_tier: "luxury", "value", or "budget" if the user expresses a spending preference. Null if not mentioned.
- travel_dates: { checkIn, checkOut } in YYYY-MM-DD format if the user provides specific travel dates. Null if not mentioned.
- wants_date_recommendation: true ONLY if the user explicitly asks you to recommend dates or says "you decide". false otherwise.
- conversation_stage: classify using the session state provided above.

User message: "${lastMessage.content}"`,
  );
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Run existing tests to ensure nothing broke**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add lib/langchain/graph.ts
git commit -m "feat: add conversation_stage to RouterSchema and extend router_node prompt"
```

---

### Task 6: Short-circuit `router_node` on `trip_complete`

**Files:**
- Modify: `lib/langchain/graph.ts`

- [ ] **Step 1: Add `TRIP_COMPLETE_MSG` constant**

In `lib/langchain/graph.ts`, add a constant near the top after the model definition (around line 48):

```ts
const TRIP_COMPLETE_MSG =
  'Your trip is already planned! Refresh the page to start planning a new one.';
```

- [ ] **Step 2: Update `router_node` return value to handle `trip_complete`**

In `lib/langchain/graph.ts`, replace the `return { ... }` at the end of `router_node` with:

```ts
  const stage = result.conversation_stage;
  const isComplete = stage === 'trip_complete';

  return {
    user_preferences: {
      origin_city: result.origin_city ?? state.user_preferences.origin_city,
      favorite_team: result.favorite_team ?? state.user_preferences.favorite_team,
      selected_match_id: result.selected_match_id ?? state.user_preferences.selected_match_id ?? null,
      travel_dates: result.travel_dates ?? state.user_preferences.travel_dates ?? null,
      spending_tier: result.spending_tier ?? state.user_preferences.spending_tier ?? null,
    },
    wants_date_recommendation: result.wants_date_recommendation,
    conversation_stage: stage,
    trip_complete: isComplete,
    ...(isComplete ? { direct_reply: TRIP_COMPLETE_MSG, messages: [new AIMessage(TRIP_COMPLETE_MSG)] } : {}),
  };
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add lib/langchain/graph.ts
git commit -m "feat: short-circuit router_node with direct_reply when trip_complete"
```

---

### Task 7: Set `trip_complete: true` in `generate_links_node`

**Files:**
- Modify: `lib/langchain/graph.ts`

`generate_links_node` is the final node in the happy path. It must set `trip_complete: true` so the checkpointer persists this and future turns short-circuit.

- [ ] **Step 1: Add `trip_complete: true` to `generate_links_node` return**

In `lib/langchain/graph.ts`, inside `generate_links_node`, find the return statement (around line 421) and add `trip_complete: true` and `conversation_stage: 'trip_complete'`:

```ts
  return {
    free_tier_links: links,
    direct_reply: reply,
    messages: [new AIMessage(reply)],
    trip_complete: true,
    conversation_stage: 'trip_complete' as ConversationStage,
  };
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add lib/langchain/graph.ts
git commit -m "feat: set trip_complete in generate_links_node to persist session state"
```

---

### Task 8: Add fixture cache guard in `list_matches_node`

**Files:**
- Modify: `lib/langchain/graph.ts`

When `conversation_stage === 'selecting_match'`, `state.fixture_list` is already populated. Skip the `searchFixtures` API call and resolve the fixture from the cached list.

- [ ] **Step 1: Replace fixture fetching logic with cache-aware version**

In `lib/langchain/graph.ts`, inside `list_matches_node`, find the `searchFixtures` call block and replace it with the cache-aware version.

Find this block (around line 230):

```ts
  let fixtures;
  try {
    fixtures = await searchFixtures(teamId, dateFrom, dateTo);
  } catch (err) {
    console.error('[list_matches_node] football-data.org call failed:', err);
    const reply = 'I had trouble fetching fixtures right now. Please try again in a moment.';
    return { direct_reply: reply, messages: [new AIMessage(reply)] };
  }
```

Replace with:

```ts
  let fixtures: Array<{ id: number; homeTeam: { name: string }; awayTeam: { name: string }; utcDate: string; competition: { name: string }; venue: string | null; status: string }>;

  if (state.fixture_list?.length) {
    // Use cached fixture list — skip searchFixtures API call
    fixtures = state.fixture_list.map((s, i) => ({
      id: i + 1,
      homeTeam: { name: s.homeTeam },
      awayTeam: { name: s.awayTeam },
      utcDate: s.kickoffUtc,
      competition: { name: s.competition },
      venue: s.venue,
      status: 'TIMED',
    }));
  } else {
    try {
      fixtures = await searchFixtures(teamId, dateFrom, dateTo);
    } catch (err) {
      console.error('[list_matches_node] football-data.org call failed:', err);
      const reply = 'I had trouble fetching fixtures right now. Please try again in a moment.';
      return { direct_reply: reply, messages: [new AIMessage(reply)] };
    }
  }
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add lib/langchain/graph.ts
git commit -m "feat: add fixture cache guard in list_matches_node to skip redundant API calls"
```

---

### Task 9: Manual end-to-end verification

No automated test can verify LLM-dependent routing — verify these scenarios manually in the browser at `http://localhost:3000`.

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify happy path (no duplicate calls)**

Open browser DevTools → Network tab. Filter by `/api/chat`.

Run this conversation:
1. "I want to watch Barcelona" → should see fixture list
2. "from London" → should see fixture list again (NO `searchFixtures` in server logs)
3. "match 2" → should resolve match (geocodeVenue called once)
4. "budget" → should ask for dates
5. "recommend dates" → should generate trip links

In server terminal, confirm:
- `searchFixtures` logged only **once** (turn 1)
- `geocodeVenue` logged only **once** (turn 3)

- [ ] **Step 3: Verify trip_complete short-circuit**

After step 5 above, send a follow-up message: "thanks!"

Expected: immediate reply "Your trip is already planned! Refresh the page to start planning a new one." — no football-data or geocoding logs in terminal.

- [ ] **Step 4: Verify stage routing skips nodes**

Open a new session (new thread_id = refresh page). Run:
1. "I want to watch Real Madrid from Madrid" → fixture list (first message, both team + city provided)
2. "match 1" → match resolved

Confirm server logs show the stage progressing correctly and `searchFixtures` called only once.
