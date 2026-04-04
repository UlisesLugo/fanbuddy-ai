# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server at http://localhost:3000
npm run build    # Production build
npm run lint     # ESLint via next lint
```

## Architecture

Next.js 14 App Router project. All routing lives under `app/`:

| Route | Component |
|-------|-----------|
| `/` | `components/landing/MarketingLanding.tsx` — split-panel marketing/signup page |
| `/chat` | `components/chat/PlanningChat.tsx` — AI chat UI with sidebar itinerary panel |

`PlanningChat` is a live AI chat backed by a LangGraph agent (see below). `MarketingLanding` is static.

## Agent architecture

The AI backend lives in `lib/langchain/` and is exposed via `app/api/chat/route.ts`.

### Files

| File | Purpose |
|------|---------|
| `lib/langchain/graph.ts` | LangGraph `StateGraph` definition — all nodes, edges, and the compiled graph |
| `lib/langchain/types.ts` | Shared TypeScript interfaces (safe to import in client components) |
| `app/api/chat/route.ts` | Next.js POST handler — runs the graph, streams SSE back to the client |

### Graph topology

```
START
  └─► router_node  ──── plan_trip / modify_plan ──► search_matches_node
                   └─── general_question ──────────► direct_answer_node ──► END

search_matches_node ──► plan_travel_node ──► validator_node
                                                  │
                              hard errors + attempts < 3 ──► plan_travel_node (retry)
                                                  │
                                             (pass / provisional)
                                                  │
                                           formatter_node ──► END
```

### Nodes

| Node | What it does |
|------|-------------|
| `router_node` | Classifies user intent (`plan_trip`, `modify_plan`, `general_question`) using `withStructuredOutput`. Routes to the planning pipeline or the direct-answer shortcut. |
| `direct_answer_node` | Handles general questions. Passes full conversation history to the LLM so it can answer in context. Adds the AI reply to `messages` for memory. |
| `search_matches_node` | Calls `search_matches` tool directly (no LLM routing). Populates `state.itinerary.match`. |
| `plan_travel_node` | Calls `search_flights` + `search_hotels` tools directly. Runs a deterministic budget check and downgrades the hotel via `downgrade_hotel` if the total exceeds €800. |
| `validator_node` | Pure TypeScript validation: arrival buffer ≥ 6 h before kickoff, departure buffer ≥ 4 h after match end, TV schedule confirmed. Writes errors to `state.validation_errors`. |
| `formatter_node` | Assembles `FormattedItinerary` from raw state in TypeScript. Calls the LLM **once** — only to generate the natural-language `summary` string. Adds the summary to `messages`. |

### State

```ts
{
  messages:          BaseMessage[]   // conversation history (user + AI replies only, no tool noise)
  itinerary:         ItineraryData   // raw match / flight / hotel data
  validation_errors: string[]
  user_preferences:  { origin_city, favorite_team }
  attempt_count:     number          // retry counter; resets to 0 each new user message
  formatted:         FormattedItinerary | null
  intent:            'plan_trip' | 'modify_plan' | 'general_question' | null
  direct_reply:      string | null
}
```

### Conversation memory

The graph is compiled with a `MemorySaver` checkpointer. Each browser session generates a `thread_id` (`crypto.randomUUID()`) that is sent with every request. The `messages` field uses a concat reducer, so conversation history accumulates across turns. All planning state fields (`itinerary`, `formatted`, etc.) use the overwrite reducer and are reset to `null`/`0` at the start of each new message.

### Streaming (SSE)

`route.ts` runs `graph.stream(..., { streamMode: 'updates' })` and returns a `text/event-stream` response. Three event types:

| Event | Shape | When |
|-------|-------|------|
| `status` | `{ type, message }` | After each node completes — describes what's happening next |
| `done` | `{ type, reply, itinerary }` | After the graph finishes |
| `error` | `{ type, message }` | On unhandled exception |

The client (`PlanningChat.tsx`) reads chunks line-by-line with a string buffer and updates the loading bubble message in real time.

### Observability

Langfuse tracing is enabled when `LANGFUSE_SECRET_KEY` and `LANGFUSE_PUBLIC_KEY` are set in `.env`. The handler is passed as a LangChain callback to `graph.stream()`.

### LLM calls per turn

| Flow | LLM calls |
|------|-----------|
| `plan_trip` | 2 — `router_node` (intent) + `formatter_node` (summary) |
| `general_question` | 2 — `router_node` (intent) + `direct_answer_node` (reply) |
| `plan_trip` with retry | 2 + 0 per retry (retries are pure tool calls) |

## Styling conventions

The project uses a custom Tailwind color palette namespaced under `landing-*` (e.g. `landing-primary`, `landing-surface`, `landing-container-low`). These are defined in `tailwind.config.ts` and should be used instead of raw hex or generic Tailwind colors for UI elements.

Key custom utilities (defined in `app/globals.css`):
- `bg-pitch-gradient` / `text-pitch-gradient` — green gradient (#006a35 → #6bfe9c) used for CTAs and accents
- `glass-panel` — frosted glass card style
- `no-scrollbar` — hides scrollbars while preserving scroll behavior

Typography uses two font families:
- Default body: Inter (via `inter.className` / `--font-inter`)
- Headlines: Manrope (via `font-headline` Tailwind class / `--font-headline`)
