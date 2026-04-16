# Duffel API Integration — Design Spec

**Date:** 2026-04-16  
**Branch:** claude-hotels-api-integration  
**Status:** Approved

## Summary

Replace the Amadeus SDK flight and hotel integrations with the Duffel REST API (v2). Adopt provider-agnostic file names (`flights.ts`, `hotels.ts`). Hotel search switches from IATA city code to lat/lng coordinates (already available in state from the venue geocoding step).

---

## Files Deleted

| File | Reason |
|------|--------|
| `lib/amadeus-flights.ts` | Replaced by `lib/flights.ts` |
| `lib/amadeus-hotels.ts` | Replaced by `lib/hotels.ts` |
| `lib/amadeus.d.ts` | Amadeus SDK type declarations, no longer needed |
| `lib/__tests__/amadeus-flights.test.ts` | Replaced by `lib/__tests__/flights.test.ts` |
| `lib/__tests__/amadeus-hotels.test.ts` | Replaced by `lib/__tests__/hotels.test.ts` |

## Files Created

| File | Purpose |
|------|---------|
| `lib/flights.ts` | Duffel flight search; exports `FlightOption`, `FlightLeg`, `FlightSearchParams`, `searchRoundTrip` |
| `lib/hotels.ts` | Duffel Stays search; exports `HotelOption`, `HotelSearchParams`, `searchHotels` |
| `lib/__tests__/flights.test.ts` | Mocks `fetch`; same behavioral coverage as Amadeus flight tests |
| `lib/__tests__/hotels.test.ts` | Mocks `fetch`; same behavioral coverage as Amadeus hotel tests |

## Files Modified

| File | Change |
|------|--------|
| `lib/langchain/graph.ts` | Update imports to `./flights` / `./hotels`; update `plan_travel_node` hotel callsite to pass `lat`/`lng` instead of `destinationIata` |
| `.env.example` | Replace `AMADEUS_API_KEY`, `AMADEUS_API_SECRET`, `AMADEUS_HOSTNAME` with `DUFFEL_ACCESS_TOKEN` |
| `package.json` | Remove `amadeus` dependency |

---

## API Interaction

### Flights (`lib/flights.ts`)

**Auth:** `Authorization: Bearer ${DUFFEL_ACCESS_TOKEN}`, `Duffel-Version: v2`  
**Auth helper:** `getDuffelHeaders()` — lazy check, throws if `DUFFEL_ACCESS_TOKEN` is unset.

**2-step flow:**

1. `POST /air/offer_requests`
   ```json
   {
     "data": {
       "slices": [
         { "origin": "<originIata>", "destination": "<destinationIata>", "departure_date": "<YYYY-MM-DD>" },
         { "origin": "<destinationIata>", "destination": "<originIata>", "departure_date": "<YYYY-MM-DD>" }
       ],
       "passengers": [{ "type": "adult" }],
       "cabin_class": "economy",
       "return_offers": false
     }
   }
   ```
   Returns `data.id` → `offer_request_id`.

2. `GET /air/offers?offer_request_id=<id>&sort=total_amount&limit=<maxResults>`  
   Returns paginated offers.

**Mapping to `FlightOption`:**
- `id` ← `offer.id`
- `outbound` / `inbound` ← `offer.slices[0]` / `offer.slices[1]`, built via `buildLeg()`
- `totalPriceUSD` ← `parseFloat(offer.total_amount)` (currency may vary by route)
- `currency` ← `offer.total_currency`
- `validatingCarrier` ← `offer.owner.iata_code`
- `seatsRemaining` ← `offer.available_services` count or `null`

`buildLeg()` maps `slice.segments[0].departing_at` → `departureUtc` (normalized to UTC ISO 8601), `slice.segments[-1].arriving_at` → `arrivalUtc`, duration from segment sum, stops from `segments.length - 1`.

**Errors:** Throws `NO_FLIGHTS_AVAILABLE` when the offers list is empty.

---

### Hotels (`lib/hotels.ts`)

**Auth:** Same `getDuffelHeaders()` helper.

**Single-step flow:**

`POST /stays/search`
```json
{
  "data": {
    "check_in_date": "<YYYY-MM-DD>",
    "check_out_date": "<YYYY-MM-DD>",
    "rooms": 1,
    "guests": [{ "type": "adult" }],
    "location": {
      "geographic_coordinates": {
        "latitude": <lat>,
        "longitude": <lng>,
        "radius": 5,
        "radius_unit": "km"
      }
    }
  }
}
```

**Mapping to `HotelOption`:**
- `id` ← `property.id`
- `name` ← `property.name`
- `starRating` ← `property.rating` (integer 1–5; defaults to 3 if absent)
- `totalPriceUSD` ← `parseFloat(rate.total_amount)`
- `pricePerNight` ← `totalPriceUSD / nights`
- `currency` ← `rate.total_currency`
- `cancellable` ← `rate.cancellation_policy.refundable` (boolean)
- `amenities` ← `property.amenities` (string array)
- `latitude` / `longitude` ← `property.location.geographic_coordinates.latitude/longitude`
- `distanceFromVenueKm` ← `null` (not available directly from Duffel)

**`HotelSearchParams` change:**  
`destinationIata: string` is **removed**. Replaced with `lat: number` and `lng: number`.

**Errors:** Throws `NO_HOTEL_AVAILABILITY` when the search returns no results.

---

## `plan_travel_node` Changes

The only logic change in `graph.ts` is the hotel callsite:

**Before:**
```ts
hotelResults = await searchHotels({
  destinationIata,
  checkInDate: departureDateStr,
  checkOutDate: returnDateStr,
  adults: 1,
  minStarRating: 3,
});
```

**After:**
```ts
hotelResults = await searchHotels({
  lat: match.lat ?? 0,
  lng: match.lng ?? 0,
  checkInDate: departureDateStr,
  checkOutDate: returnDateStr,
  adults: 1,
  minStarRating: 3,
});
```

If `match.lat` / `match.lng` are absent (geocoding failed), the search will likely return no results → `NO_HOTEL_AVAILABILITY` error path, same behavior as before.

---

## Test Strategy

Both test files mock `global.fetch` via `jest.spyOn(global, 'fetch')`.

**`flights.test.ts` cases:**
1. `searchRoundTrip` returns `FlightOption[]` sorted cheapest first
2. Normalises departure/arrival times to UTC ISO 8601
3. Returns empty array when no offers available
4. Passes correct params to Duffel offer request
5. Maps `seatsRemaining` to `null` when field is absent
6–9. `shouldRetryOrFinish` cursor logic (moved unchanged from Amadeus test)

**`hotels.test.ts` cases:**
1. Returns `HotelOption[]` sorted by starRating DESC then totalPriceUSD ASC
2. Filters out hotels below `minStarRating`
3. Calculates `pricePerNight` correctly
4. Defaults `starRating` to 3 when rating field is absent
5. Sets `cancellable=true` when `refundable` is true
6. Sets `cancellable=false` when `refundable` is false
7. Throws `NO_HOTEL_AVAILABILITY` when search returns empty
8. Respects `maxResults` cap

---

## Environment Variables

**Removed:**
- `AMADEUS_API_KEY`
- `AMADEUS_API_SECRET`
- `AMADEUS_HOSTNAME`

**Added:**
- `DUFFEL_ACCESS_TOKEN` — Bearer token from the Duffel dashboard (test tokens start with `duffel_test_`)

---

## Dependencies

- **Removed:** `amadeus@^11.0.0`
- **Added:** none (uses native `fetch`, available in Node 18+ / Next.js 14)
