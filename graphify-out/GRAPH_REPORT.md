# Graph Report - .  (2026-04-17)

## Corpus Check
- Corpus is ~26,833 words - fits in a single context window. You may not need a graph.

## Summary
- 139 nodes · 165 edges · 23 communities detected
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 23 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Agent Architecture & API Clients|Agent Architecture & API Clients]]
- [[_COMMUNITY_Duffel Integration Plan|Duffel Integration Plan]]
- [[_COMMUNITY_LangGraph Graph Definition|LangGraph Graph Definition]]
- [[_COMMUNITY_Free-Tier Node Helpers|Free-Tier Node Helpers]]
- [[_COMMUNITY_Football Data API Client|Football Data API Client]]
- [[_COMMUNITY_Flight & Hotel Search|Flight & Hotel Search]]
- [[_COMMUNITY_Chat UI Components|Chat UI Components]]
- [[_COMMUNITY_Flight Test Mocks|Flight Test Mocks]]
- [[_COMMUNITY_Hotel Test Mocks|Hotel Test Mocks]]
- [[_COMMUNITY_Football Data Tests|Football Data Tests]]
- [[_COMMUNITY_App Layout|App Layout]]
- [[_COMMUNITY_Home Page|Home Page]]
- [[_COMMUNITY_Chat Page|Chat Page]]
- [[_COMMUNITY_API Route Handler|API Route Handler]]
- [[_COMMUNITY_Marketing Landing|Marketing Landing]]
- [[_COMMUNITY_PostCSS Config|PostCSS Config]]
- [[_COMMUNITY_Next.js Config|Next.js Config]]
- [[_COMMUNITY_Next.js Env Types|Next.js Env Types]]
- [[_COMMUNITY_Tailwind Config|Tailwind Config]]
- [[_COMMUNITY_Jest Config|Jest Config]]
- [[_COMMUNITY_Free-Tier Tests|Free-Tier Tests]]
- [[_COMMUNITY_Shared Types|Shared Types]]
- [[_COMMUNITY_Landing Component|Landing Component]]

## God Nodes (most connected - your core abstractions)
1. `Agent Architecture Documentation` - 8 edges
2. `Graph Topology (router→search→plan→validator→formatter)` - 7 edges
3. `Agent Redesign Plan: Multi-Step Flow + Free Tier` - 7 edges
4. `geocodeVenue()` - 6 edges
5. `list_matches_node()` - 6 edges
6. `Plan: generate_links_node` - 6 edges
7. `searchFixtures()` - 5 edges
8. `search_matches_node()` - 5 edges
9. `plan_travel_node` - 5 edges
10. `Plan: Create lib/hotels.ts (Duffel Stays)` - 5 edges

## Surprising Connections (you probably didn't know these)
- `Graph Topology (router→search→plan→validator→formatter)` --semantically_similar_to--> `New Graph Topology (multi-step free-tier)`  [INFERRED] [semantically similar]
  CLAUDE.md → docs/superpowers/plans/2026-04-17-agent-redesign.md
- `FanBuddy AI (Next.js Project)` --references--> `Agent Architecture Documentation`  [EXTRACTED]
  README.md → CLAUDE.md
- `Error Contract: NO_HOTEL_AVAILABILITY Preserved` --references--> `plan_travel_node`  [EXTRACTED]
  docs/superpowers/specs/2026-04-16-liteapi-hotels-design.md → CLAUDE.md
- `Free vs. Paid Tier Architecture Decision` --references--> `plan_travel_node`  [EXTRACTED]
  docs/superpowers/specs/2026-04-17-agent-redesign-design.md → CLAUDE.md
- `New Graph Topology (multi-step free-tier)` --references--> `lib/langchain/graph.ts`  [INFERRED]
  docs/superpowers/plans/2026-04-17-agent-redesign.md → CLAUDE.md

## Hyperedges (group relationships)
- **Hotel Provider Migration Chain (Amadeus → Duffel → LiteAPI)** — plan_duffel_hotels_ts, plan_liteapi_hotels_ts_rewrite, claude_md_hotels_ts [INFERRED 0.90]
- **Free-Tier Link Generation Flow (generate_links_node + helpers + LinksBlock)** — plan_redesign_generate_links_node, plan_redesign_build_transport_url, plan_redesign_build_accommodation_url, plan_redesign_links_block, plan_redesign_free_tier_links [EXTRACTED 0.95]
- **Multi-Step Graph Nodes (list_matches → collect_preferences → confirm_dates → generate_links)** — plan_redesign_list_matches_node, plan_redesign_collect_preferences_node, plan_redesign_confirm_dates_node, plan_redesign_generate_links_node [EXTRACTED 0.97]

## Communities

### Community 0 - "Agent Architecture & API Clients"
Cohesion: 0.11
Nodes (23): Agent Architecture Documentation, Duffel API v2 Flight Search, lib/flights.ts, lib/football-data.ts, formatter_node, Graph Topology (router→search→plan→validator→formatter), lib/hotels.ts, LiteAPI v3 Hotel Search (+15 more)

### Community 1 - "Duffel Integration Plan"
Cohesion: 0.11
Nodes (22): Plan: Delete Amadeus Files, FlightOption Interface (Duffel), Plan: Create lib/flights.ts (Duffel), Duffel Integration Plan: Replace Amadeus with Duffel, HotelOption Interface (Duffel), Plan: Create lib/hotels.ts (Duffel Stays), searchHotels Function (Duffel Stays), searchRoundTrip Function (Duffel) (+14 more)

### Community 2 - "LangGraph Graph Definition"
Cohesion: 0.14
Nodes (19): lib/langchain/graph.ts, MemorySaver Checkpointer, buildAccommodationUrl Helper, buildTransportUrl Helper, Plan: collect_preferences_node, Plan: confirm_dates_node, formatFixtureList Helper, Plan: Create lib/langchain/free-tier.ts (+11 more)

### Community 3 - "Free-Tier Node Helpers"
Cohesion: 0.2
Nodes (7): buildAccommodationUrl(), buildTransportUrl(), formatDateForGoogle(), formatFixtureList(), recommendTravelDates(), confirm_dates_node(), generate_links_node()

### Community 4 - "Football Data API Client"
Cohesion: 0.35
Nodes (11): fetchWithRetry(), geocodeVenue(), getAuthHeaders(), logApiCall(), nearestAirportFromCity(), redactUrl(), resolveTeamId(), searchFixtures() (+3 more)

### Community 5 - "Flight & Hotel Search"
Cohesion: 0.29
Nodes (8): buildLeg(), getDuffelHeaders(), parseDurationMinutes(), searchRoundTrip(), plan_travel_node(), calculateNights(), getLiteApiHeaders(), searchHotels()

### Community 6 - "Chat UI Components"
Cohesion: 0.29
Nodes (0): 

### Community 7 - "Flight Test Mocks"
Cohesion: 0.5
Nodes (2): makeRawOffer(), makeSegment()

### Community 8 - "Hotel Test Mocks"
Cohesion: 0.5
Nodes (0): 

### Community 9 - "Football Data Tests"
Cohesion: 0.5
Nodes (0): 

### Community 10 - "App Layout"
Cohesion: 1.0
Nodes (0): 

### Community 11 - "Home Page"
Cohesion: 1.0
Nodes (0): 

### Community 12 - "Chat Page"
Cohesion: 1.0
Nodes (0): 

### Community 13 - "API Route Handler"
Cohesion: 1.0
Nodes (0): 

### Community 14 - "Marketing Landing"
Cohesion: 1.0
Nodes (0): 

### Community 15 - "PostCSS Config"
Cohesion: 1.0
Nodes (0): 

### Community 16 - "Next.js Config"
Cohesion: 1.0
Nodes (0): 

### Community 17 - "Next.js Env Types"
Cohesion: 1.0
Nodes (0): 

### Community 18 - "Tailwind Config"
Cohesion: 1.0
Nodes (0): 

### Community 19 - "Jest Config"
Cohesion: 1.0
Nodes (0): 

### Community 20 - "Free-Tier Tests"
Cohesion: 1.0
Nodes (0): 

### Community 21 - "Shared Types"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "Landing Component"
Cohesion: 1.0
Nodes (1): components/landing/MarketingLanding.tsx

## Knowledge Gaps
- **23 isolated node(s):** `FanBuddy AI (Next.js Project)`, `router_node`, `formatter_node`, `components/landing/MarketingLanding.tsx`, `LiteAPI v3 Hotel Search` (+18 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `App Layout`** (2 nodes): `layout.tsx`, `RootLayout()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Home Page`** (2 nodes): `page.tsx`, `Home()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Chat Page`** (2 nodes): `page.tsx`, `ChatPage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `API Route Handler`** (2 nodes): `route.ts`, `POST()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Marketing Landing`** (2 nodes): `MarketingLanding.tsx`, `handleSubmit()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `PostCSS Config`** (1 nodes): `postcss.config.mjs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Next.js Config`** (1 nodes): `next.config.mjs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Next.js Env Types`** (1 nodes): `next-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Tailwind Config`** (1 nodes): `tailwind.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Jest Config`** (1 nodes): `jest.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Free-Tier Tests`** (1 nodes): `free-tier.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Shared Types`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Landing Component`** (1 nodes): `components/landing/MarketingLanding.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `plan_travel_node()` connect `Flight & Hotel Search` to `Free-Tier Node Helpers`, `Football Data API Client`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Why does `Graph Topology (router→search→plan→validator→formatter)` connect `Agent Architecture & API Clients` to `LangGraph Graph Definition`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `geocodeVenue()` (e.g. with `list_matches_node()` and `search_matches_node()`) actually correct?**
  _`geocodeVenue()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `list_matches_node()` (e.g. with `resolveTeamId()` and `searchFixtures()`) actually correct?**
  _`list_matches_node()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `FanBuddy AI (Next.js Project)`, `router_node`, `formatter_node` to the rest of the system?**
  _23 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Agent Architecture & API Clients` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._
- **Should `Duffel Integration Plan` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._