# Stage-Aware Routing: Eliminating Redundant API Calls

**Date:** 2026-04-19  
**Branch:** claude-full-itinerary  
**Problem:** On every user message the full graph re-executes from `router_node → list_matches_node`, causing `searchFixtures` (and `geocodeVenue`) to fire on every turn — even when fixture data is already cached. After trip links are generated, follow-up messages also re-trigger the full pipeline.

---

## Goal

Skip expensive API nodes when their work is already done, and immediately end the graph when the trip is complete.

---

## State Changes

Add two fields to `GraphState` in `lib/langchain/graph.ts`:

```ts
conversation_stage: Annotation<ConversationStage>({
  reducer: (_, y) => y,
  default: () => 'collecting_team',
})

trip_complete: Annotation<boolean>({
  reducer: (_, y) => y,
  default: () => false,
})
```

Where `ConversationStage` is:

```ts
type ConversationStage =
  | 'collecting_team'
  | 'selecting_match'
  | 'collecting_preferences'
  | 'confirming_dates'
  | 'trip_complete'
```

Both fields persist via the `MemorySaver` checkpointer and are **not reset** in `route.ts`'s `initialState`.

---

## `router_node` Changes

### Schema addition

`RouterSchema` gains one new field:

```ts
conversation_stage: z.enum([
  'collecting_team',
  'selecting_match',
  'collecting_preferences',
  'confirming_dates',
  'trip_complete',
]).describe(`
  Stage classification based on what data is already known:
  - collecting_team: favorite_team is unknown
  - selecting_match: team known, fixture_list exists but no match selected yet
  - collecting_preferences: match selected, but origin_city or spending_tier missing
  - confirming_dates: match + preferences known, travel_dates missing
  - trip_complete: free_tier_links have been generated this session
`)
```

### Prompt context

The LLM prompt passes in current state values as context so it can classify accurately:

- `favorite_team` (known/unknown)
- `fixture_list` length (0 or N)
- `selected_match_id` (known/unknown)
- `origin_city` (known/unknown)
- `spending_tier` (known/unknown)
- `travel_dates` (known/unknown)
- `trip_complete` (true/false)

### `trip_complete` short-circuit

If the extracted `conversation_stage` is `'trip_complete'`, `router_node` sets `direct_reply` inline:

```
"Your trip is already planned! Refresh the page to start planning a new one."
```

And returns `{ conversation_stage: 'trip_complete', trip_complete: true, direct_reply }`.

No downstream nodes run. No extra LLM call.

### Return value

```ts
return {
  user_preferences: { ...mergedPreferences },
  wants_date_recommendation: result.wants_date_recommendation,
  conversation_stage: result.conversation_stage,
  trip_complete: result.conversation_stage === 'trip_complete',
  ...(result.conversation_stage === 'trip_complete' ? { direct_reply: TRIP_COMPLETE_MSG } : {}),
}
```

---

## Graph Topology

### New conditional edge after `router_node`

Replace the current unconditional `router_node → list_matches_node` edge with:

```ts
.addConditionalEdges(
  'router_node',
  (state) => {
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
  },
  {
    list_matches_node: 'list_matches_node',
    collect_preferences_node: 'collect_preferences_node',
    confirm_dates_node: 'confirm_dates_node',
    [END]: END,
  },
)
```

All downstream `afterDirectReply` conditional edges remain unchanged.

---

## `list_matches_node` Cache Guard

When `conversation_stage === 'selecting_match'`, `state.fixture_list` is already populated from the prior turn. `list_matches_node` skips the `searchFixtures` API call and resolves the match index directly from the cached list.

```ts
// Before: always calls searchFixtures
const fixtures = await searchFixtures(teamId, dateFrom, dateTo);

// After: use cache when available
const fixtures = state.fixture_list?.length
  ? state.fixture_list.map(/* convert FixtureSummary back to fixture shape */)
  : await searchFixtures(teamId, dateFrom, dateTo);
```

`geocodeVenue` still runs exactly once — when the user selects a match index. After that, the stage advances to `collecting_preferences` and `list_matches_node` is never reached again for this session.

**Note:** `FixtureSummary` in state already contains `homeTeam`, `awayTeam`, `kickoffUtc`, `competition`, and `venue` — enough to reconstruct the needed fields without re-fetching.

---

## `route.ts` Changes

`trip_complete` and `conversation_stage` must **not** appear in `initialState` (so they persist via checkpointer). No other changes to `route.ts`.

Current already-omitted persisted fields: `fixture_list`, `activities`, `user_preferences`.  
Add to that: `conversation_stage`, `trip_complete`.

---

## API Call Reduction (Before vs After)

| Scenario | Before | After |
|----------|--------|-------|
| Turn 2 (user provides origin city, no match yet) | `searchFixtures` | skipped (stage = `collecting_preferences` or `selecting_match` with cache) |
| Turn 3 (user picks match) | `searchFixtures` + `geocodeVenue` | `geocodeVenue` only (fixture_list cached) |
| Follow-up after trip complete | full pipeline | immediate `direct_reply` → END |

---

## Files Changed

| File | Change |
|------|--------|
| `lib/langchain/graph.ts` | Add `ConversationStage` type, two new state fields, update `RouterSchema`, update `router_node`, replace unconditional edge, add cache guard in `list_matches_node` |
| `lib/langchain/types.ts` | Export `ConversationStage` type |
| `app/api/chat/route.ts` | No changes needed |
