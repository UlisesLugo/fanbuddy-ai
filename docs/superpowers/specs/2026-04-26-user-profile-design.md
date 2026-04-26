# FanBuddy MVP — User Profile Design Spec

**Date:** 2026-04-26
**Status:** Approved
**Scope:** Spec 3 — User profile page with saved preferences and chat pre-seeding

---

## Goal

Give authenticated users a `/profile` page where they can view their account info (email, plan) and save a default home city and favorite team. Saved preferences pre-seed new chat sessions so the AI opens with a confirmation message instead of asking for both values from scratch. Each trip session remains independent — preferences are suggestions, not locked-in assumptions.

---

## Architecture Overview

```
Browser
  │
  ├─► /profile (Client Component)
  │       │
  │       ├─► GET /api/profile ──► Neon Postgres (users JOIN teams)
  │       ├─► GET /api/teams   ──► Neon Postgres (all teams, for dropdown)
  │       └─► PATCH /api/profile ──► Neon Postgres (update users row)
  │
  └─► /chat (PlanningChat.tsx)
          │
          ├─► GET /api/profile (on mount, fetch saved prefs)
          └─► POST /api/chat (first message includes prefill_preferences if prefs exist)
```

Navigation entry point: "Profile" tab in the `PlanningChat.tsx` left sidebar (renamed from "Subscription").

---

## Data Layer

### New table — `teams`

```ts
export const teams = pgTable('teams', {
  id: integer('id').primaryKey(),        // football-data.org team ID
  name: varchar('name', { length: 255 }).notNull(),
});
```

Seeded once from the existing `TEAM_ID_MAP` in `lib/football-data.ts` via a Drizzle migration seed script. No external API calls needed.

### `users` table — two new nullable columns

```ts
home_city:        varchar('home_city', { length: 255 }),
favorite_team_id: integer('favorite_team_id').references(() => teams.id),
```

Both columns are nullable. A user with no saved preferences gets a blank profile page; the chat behaves exactly as it does today.

---

## API Routes

### `GET /api/profile`

**File:** `app/api/profile/route.ts`

**Auth:** Clerk middleware + `auth()` at handler start. Returns 401 if no session.

Joins `users` and `teams` in a single Drizzle query and returns:

```ts
type ProfileResponse = {
  email: string;
  plan: 'free' | 'paid';
  home_city: string | null;
  favorite_team: { id: number; name: string } | null;
};
```

### `PATCH /api/profile`

**File:** `app/api/profile/route.ts` (same file, named export)

**Auth:** Same as GET.

**Request body:**

```ts
type ProfilePatchBody = {
  home_city?: string;
  favorite_team_id?: number | null;
};
```

Validates that `favorite_team_id`, if provided, exists in the `teams` table. Returns 400 if not found. Updates the `users` row and returns the updated `ProfileResponse`.

### `GET /api/teams`

**File:** `app/api/teams/route.ts`

**Auth:** Protected by Clerk middleware.

Returns all rows from the `teams` table sorted alphabetically by name. Used to populate the favorite team dropdown on the profile page.

```ts
type TeamsResponse = {
  teams: { id: number; name: string }[];
};
```

---

## Profile Page — `app/profile/page.tsx`

Client Component (`'use client'`). Fetches `GET /api/profile` and `GET /api/teams` in parallel on mount.

### Layout

Follows the same visual design as the Hub page: `glass-panel` cards, `landing-*` Tailwind palette, `bg-pitch-gradient` for accents, `font-headline` for section titles, Inter for body text.

Two section cards:

**Account Info** (read-only)
- Email address
- Plan badge — "Free" (grey) or "Pro" (`bg-pitch-gradient` green)
- "Manage subscription" link (placeholder `href="#"` — Stripe portal wired in a future spec)

**Preferences** (editable)
- **Home city** — free-form text input
- **Favorite team** — dropdown populated from `GET /api/teams`, sorted alphabetically; shows "Select a team" placeholder when unset
- **Save** button — calls `PATCH /api/profile`; disabled until at least one field has changed from the loaded values

### States

| State | UI |
|---|---|
| Loading | Skeleton placeholders for both section cards |
| Loaded | Full form, Save button disabled until a field changes |
| Saving | Save button shows spinner, inputs disabled |
| Saved | Inline "Saved!" confirmation below the button, button re-enables |
| Error | Inline error message below the Save button, button re-enables |

---

## Chat Pre-seeding Flow

### `PlanningChat.tsx`

1. On mount, fetch `GET /api/profile` to retrieve `home_city` and `favorite_team`.
2. Store result in component state (`savedPrefs`).
3. If both `home_city` and `favorite_team` are non-null, immediately render a client-generated AI bubble in the chat UI (before the user types anything):

   > *"Planning a trip from [home_city] for [team name]? Type anything to confirm, or tell me something different."*

   This message is synthetic — it is never sent to the server and does not appear in conversation history.

4. When the user sends their first message, include `prefill_preferences` in the `/api/chat` request body:

```ts
prefill_preferences: {
  origin_city: savedPrefs.home_city,
  favorite_team: savedPrefs.favorite_team.name,
}
```

5. If either pref is missing, no bubble is shown and no `prefill_preferences` is sent — existing behavior unchanged.

### `app/api/chat/route.ts`

Accept optional `prefill_preferences` in the request body. If present, merge into the graph's initial state under `user_preferences` before calling `graph.stream()`. These values are injected as part of the initial graph state, not as user messages — they never appear in conversation history.

`router_node` receives them via the existing merge logic (null = keep prior, non-null = use this):

- User confirms ("yes", "let's go", etc.) → `router_node` extracts null for both fields → prefs stay as injected → planning proceeds normally.
- User redirects ("actually from Madrid for Barcelona") → `router_node` extracts new values → overwrites injected prefs → planning uses updated values.

No changes to graph nodes are required.

---

## Navigation

**`components/chat/PlanningChat.tsx`:**
- Rename existing "Subscription" sidebar tab → **"Profile"**
- Update `href` → `/profile`
- Keep the existing icon

**`middleware.ts`:** Add `/profile(.*)`, `/api/profile(.*)`, and `/api/teams(.*)` to the protected route matcher.

---

## Error Handling

| Scenario | Handling |
|---|---|
| `GET /api/profile` fails on profile page | Error state with retry button |
| `GET /api/teams` fails on profile page | Error state with retry button |
| `PATCH /api/profile` fails | Inline error below Save button; inputs remain editable |
| `favorite_team_id` not in `teams` table | 400 returned; profile page shows inline error |
| `GET /api/profile` fails in `PlanningChat` | `savedPrefs` stays null; chat starts as today, no pre-seeding |
| 401 (no session) | Clerk middleware redirects to sign-in |

---

## File Change Manifest

| File | Change |
|---|---|
| `lib/db/schema.ts` | Add `teams` table; add `home_city` and `favorite_team_id` to `users` |
| `drizzle/migrations/` | New migration: add teams table + seed + new users columns |
| `app/api/profile/route.ts` | New — GET and PATCH handlers |
| `app/api/teams/route.ts` | New — GET handler, returns all teams |
| `app/profile/page.tsx` | New — Client Component, profile UI |
| `app/api/chat/route.ts` | Accept optional `prefill_preferences` in request body |
| `components/chat/PlanningChat.tsx` | Fetch prefs on mount; inject into first chat request; rename sidebar tab |
| `middleware.ts` | Add `/profile(.*)`, `/api/profile(.*)`, `/api/teams(.*)` to protected matcher |

**No new env vars.** Reuses Clerk + Neon setup from prior specs.

---

## Out of Scope (Future)

- Multiple favorite teams
- Stripe customer portal link (placeholder only in this spec)
- Profile photo / avatar upload
- Account deletion
- Email change
