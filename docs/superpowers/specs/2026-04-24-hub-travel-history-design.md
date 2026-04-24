# FanBuddy MVP — Hub / Travel History Design Spec

**Date:** 2026-04-24  
**Status:** Approved  
**Scope:** Spec 2 of 2 — read-only travel history Hub page  
**Out of scope:** Conversation resumption, trip detail pages, search/filter, pagination, team logos

---

## Goal

Give authenticated users a `/hub` page where they can see all their past completed trips — a minimal read-only list with trip card summaries.

---

## Architecture Overview

```
Browser
  │
  └─► /hub (Client Component)
        │
        └─► GET /api/trips ──► Clerk middleware (auth gate)
                    │
                    └─► Neon Postgres — query trips WHERE user_id = userId
```

Navigation entry point: "My Trips" link in the `PlanningChat.tsx` left sidebar.

---

## API Route — `GET /api/trips`

**File:** `app/api/trips/route.ts`

**Auth:** Protected by Clerk middleware (see Middleware section). `auth()` called at handler start; returns 401 if no session.

**Query:** `SELECT * FROM trips WHERE user_id = $userId ORDER BY created_at DESC`

**Response shape:**

```ts
type TripRecord = {
  id: string;
  team: string;
  match_label: string;   // e.g. "Barcelona vs Real Madrid"
  match_date: string;    // ISO date "YYYY-MM-DD"
  destination: string;   // match city
  tier: 'free' | 'paid';
  created_at: string;    // ISO timestamp
};

// Response body
{ trips: TripRecord[] }
```

No pagination — MVP users won't accumulate enough trips to need it.

---

## Hub Page — `app/hub/page.tsx`

Client Component (`'use client'`). Fetches `/api/trips` on mount via `useEffect`.

### States

| State | UI |
|---|---|
| Loading | 3 skeleton card placeholders |
| Empty | "No trips yet. Head to chat to plan your first trip." + link to `/chat` |
| Error | "Failed to load trips. Please try again." + retry button |
| Loaded | List of trip cards |

### Trip Card

Each card displays:
- **Team name** (text)
- **Match label** — "Barcelona vs Real Madrid"
- **Match date** — formatted as "May 15, 2026"
- **Destination city**
- **Tier badge** — "Free" (grey) or "Pro" (green accent)

Styling uses `glass-panel` for the card container and `landing-*` Tailwind palette for colors. Typography: `font-headline` for team name, Inter for the rest.

### Empty & Error States

- Empty: centered message with a `<Link href="/chat">` CTA button
- Error: message with a `<button onClick={() => refetch()}>` retry

---

## Navigation

Add a "My Trips" `<Link href="/hub">` to the left sidebar in `components/chat/PlanningChat.tsx`. Placed below the FanBuddy logo, above the main chat area. Uses a `LayoutGrid` or `History` Lucide icon (already imported in the component).

---

## Middleware Update

`middleware.ts` — add `/api/trips(.*)` to the protected route matcher:

```ts
const isProtected = createRouteMatcher([
  '/chat(.*)',
  '/hub(.*)',
  '/api/chat(.*)',
  '/api/trips(.*)',
  '/api/stripe/checkout(.*)',
]);
```

---

## Error Handling

| Scenario | Handling |
|---|---|
| Network error on fetch | Error state in Hub page, retry button |
| Non-200 from `/api/trips` | Same error state |
| 401 (no session) | Clerk middleware redirects to sign-in before page renders |
| Empty trips array | Empty state (not an error) |

---

## File Change Manifest

| File | Change |
|---|---|
| `app/api/trips/route.ts` | New — GET handler, auth + DB query |
| `app/hub/page.tsx` | New — Client Component, trip list UI |
| `middleware.ts` | Add `/hub(.*)` and `/api/trips(.*)` to protected routes |
| `components/chat/PlanningChat.tsx` | Add "My Trips" nav link in sidebar |

**No schema changes.** `trips` table already has all required fields.  
**No new env vars.** Reuses Clerk + Neon setup from Spec 1.

---

## Out of Scope (Future)

- Resuming a past conversation thread
- Trip detail page / modal with full itinerary
- Search, filter, or sort controls
- Pagination
- Team logos / match images
