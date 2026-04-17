# Hotel API Migration: Duffel → LiteAPI

**Date:** 2026-04-16  
**Status:** Approved  
**Scope:** `lib/hotels.ts` only — `graph.ts` and all consumers are untouched

---

## Overview

Replace the Duffel Stays API with LiteAPI for hotel search. The public contract
(`HotelOption`, `HotelSearchParams`, `searchHotels`) is unchanged so the rest of
the codebase requires no modification.

---

## Architecture

### Approach

Drop-in replacement: rewrite the internals of `lib/hotels.ts` while keeping the
exported types and function signature identical.

### Two-step LiteAPI flow

Duffel's single `POST /stays/search` is replaced by two sequential LiteAPI calls:

1. **`GET https://api.liteapi.travel/v3.0/data/hotels`**  
   Fetches up to 20 hotels within a 5 km radius of the venue coordinates.  
   Returns: hotel IDs, names, star ratings, coordinates, distance from search point.

2. **`POST https://api.liteapi.travel/v3.0/rates`**  
   Accepts the hotel IDs from step 1 plus check-in/out dates and guest count.  
   Returns: available rates per hotel (lowest rate, currency, cancellation policy).

Hotels returned from step 1 with no matching rate in step 2 are dropped.

### Authentication

| Before | After |
|--------|-------|
| `Authorization: Bearer $DUFFEL_ACCESS_TOKEN` | `X-API-Key: $LITEAPI_API_KEY` |

---

## Data Mapping

### Step 1 request params

| LiteAPI param | Value |
|---|---|
| `latitude` | `params.lat` |
| `longitude` | `params.lng` |
| `radius` | `5` (km) |
| `limit` | `20` |

### Step 2 request body

```json
{
  "hotelIds": ["<id1>", "<id2>", "..."],
  "occupancies": [{ "adults": <params.adults> }],
  "checkin": "<params.checkInDate>",
  "checkout": "<params.checkOutDate>",
  "currency": "EUR"
}
```

### HotelOption mapping

| `HotelOption` field | LiteAPI source |
|---|---|
| `id` | hotel `id` from step 1 |
| `name` | hotel `name` from step 1 |
| `starRating` | `starRating` from step 1; default `3` if absent/null |
| `totalPriceUSD` | lowest rate total amount (field name kept for interface compat) |
| `currency` | rate currency (EUR when requested) |
| `pricePerNight` | `totalPriceUSD / nights` |
| `checkInDate` | `params.checkInDate` |
| `checkOutDate` | `params.checkOutDate` |
| `nights` | calculated from check-in/out (existing helper) |
| `distanceFromVenueKm` | `distance` from step 1 response (was always `null` with Duffel); update interface type from `null` to `number \| null` |
| `amenities` | empty array `[]` (not returned by rates endpoint; acceptable) |
| `cancellable` | derived from rate cancellation policy |
| `latitude` | hotel `location.latitude` from step 1 |
| `longitude` | hotel `location.longitude` from step 1 |

---

## Filtering & Sorting

Unchanged from the Duffel implementation:

1. Drop hotels where `starRating < params.minStarRating` (default 3)
2. Sort: `starRating DESC`, then `totalPriceUSD ASC`
3. Return `params.maxResults` (default 20) top results

---

## Error Handling

The existing error contract is preserved: all failure paths throw
`new Error('NO_HOTEL_AVAILABILITY')` so `plan_travel_node`'s catch block in
`graph.ts` continues to work without changes.

| Condition | Behaviour |
|---|---|
| Step 1 HTTP error | throw `NO_HOTEL_AVAILABILITY` |
| Step 1 returns 0 hotels | throw `NO_HOTEL_AVAILABILITY` |
| Step 2 HTTP error | throw `NO_HOTEL_AVAILABILITY` |
| Step 2 returns 0 hotels with rates | throw `NO_HOTEL_AVAILABILITY` |
| All hotels filtered out by star rating | throw `NO_HOTEL_AVAILABILITY` |

---

## Observability

Console telemetry follows the existing pattern in `lib/hotels.ts`:

```
[api] ✓ liteapi GET /data/hotels → 200 (142ms)
[api] ✓ liteapi POST /rates → 200 (380ms)
```

---

## Out of Scope

- Booking flow (prebook / book) — future work
- Currency conversion — the existing TODO comment in `graph.ts` is preserved
- Retry / exponential backoff — not added in this iteration (Duffel also had none)
