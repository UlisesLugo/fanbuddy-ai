// ─── football-data.org v4 API client ─────────────────────────────────────────

const BASE_URL = 'https://api.football-data.org/v4';

function getAuthHeaders(): Record<string, string> {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) throw new Error('FOOTBALL_DATA_API_KEY env var is not set');
  return { 'X-Auth-Token': key };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Fixture {
  id: number;
  utcDate: string; // ISO 8601 UTC
  status: string; // e.g. "TIMED", "SCHEDULED", "POSTPONED", "FINISHED"
  homeTeam: { id: number; name: string; shortName: string; tla: string };
  awayTeam: { id: number; name: string; shortName: string; tla: string };
  competition: { id: number; name: string; code: string };
  venue: string | null;
}

export interface GeocodedVenue {
  lat: number;
  lng: number;
  nearestAirportCode: string;
  city: string; // human-readable city name from Geoapify
}

// ─── Team name → football-data.org ID map ────────────────────────────────────
// Add entries as needed. Keys are lower-cased for case-insensitive lookup.

const TEAM_ID_MAP: Record<string, number> = {
  'real madrid': 86,
  'barcelona': 81,
  'fc barcelona': 81,
  'atletico madrid': 78,
  'atletico de madrid': 78,
  'manchester city': 65,
  'man city': 65,
  'manchester united': 66,
  'man utd': 66,
  'man united': 66,
  'liverpool': 64,
  'chelsea': 61,
  'arsenal': 57,
  'tottenham': 73,
  'tottenham hotspur': 73,
  'spurs': 73,
  'newcastle': 67,
  'newcastle united': 67,
  'aston villa': 58,
  'bayern munich': 5,
  'fc bayern': 5,
  'borussia dortmund': 4,
  'bvb': 4,
  'paris saint-germain': 524,
  'psg': 524,
  'juventus': 109,
  'inter milan': 108,
  'inter': 108,
  'ac milan': 98,
  'milan': 98,
  'napoli': 113,
  'roma': 100,
  'as roma': 100,
  'ajax': 678,
  'porto': 503,
  'benfica': 294,
  'sporting cp': 498,
  'celtic': 264,
  'rangers': 1107,
};

/** Resolve a human-readable team name to a football-data.org team ID. */
export function resolveTeamId(teamName: string): number | null {
  return TEAM_ID_MAP[teamName.toLowerCase().trim()] ?? null;
}

// ─── Telemetry ────────────────────────────────────────────────────────────────

/** Strip sensitive query params (apiKey, X-Auth-Token) from a URL for logging. */
function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.searchParams.has('apiKey')) u.searchParams.set('apiKey', '[redacted]');
    return u.toString();
  } catch {
    return url;
  }
}

function logApiCall(
  service: string,
  method: string,
  url: string,
  status: number | 'ERR',
  durationMs: number,
  attempt: number,
  extra?: Record<string, unknown>,
) {
  const tag = status === 'ERR' || status >= 400 ? '✗' : '✓';
  console.log(
    `[api] ${tag} ${service} ${method} ${redactUrl(url)} → ${status} (${durationMs}ms, attempt ${attempt + 1})`,
    extra ?? '',
  );
}

// ─── Exponential backoff fetch ────────────────────────────────────────────────

async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  maxRetries = 3,
  service = 'external',
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      const delayMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
      console.log(`[api] ↻ ${service} retry ${attempt}/${maxRetries - 1} — waiting ${delayMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const t0 = Date.now();
    try {
      const response = await fetch(url, { headers });
      const durationMs = Date.now() - t0;

      logApiCall(service, 'GET', url, response.status, durationMs, attempt);

      if (response.status === 429) {
        lastError = new Error(`Rate limited (429) on attempt ${attempt + 1}`);
        continue; // retry
      }

      return response;
    } catch (err) {
      const durationMs = Date.now() - t0;
      lastError = err instanceof Error ? err : new Error(String(err));
      logApiCall(service, 'GET', url, 'ERR', durationMs, attempt, { error: lastError.message });
    }
  }

  throw lastError ?? new Error(`Failed to fetch ${url} after ${maxRetries} retries`);
}

// ─── searchFixtures ───────────────────────────────────────────────────────────

/**
 * Fetch upcoming fixtures for a team within a date range.
 * Filters out POSTPONED matches and returns only TIMED/SCHEDULED ones.
 */
export async function searchFixtures(
  teamId: number,
  dateFrom: string,
  dateTo: string,
): Promise<Fixture[]> {
  const params = new URLSearchParams({
    dateFrom,
    dateTo,
    status: 'TIMED,SCHEDULED',
  });
  const url = `${BASE_URL}/teams/${teamId}/matches?${params}`;

  const response = await fetchWithRetry(url, getAuthHeaders(), 3, 'football-data.org');

  if (!response.ok) {
    throw new Error(
      `football-data.org API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as { matches: Fixture[] };
  const matches = data.matches ?? [];

  const postponed = matches.filter((m) => m.status === 'POSTPONED');
  if (postponed.length > 0) {
    console.warn(
      `[api] ⚠ football-data.org filtered out ${postponed.length} POSTPONED fixture(s):`,
      postponed.map((m) => m.id),
    );
  }

  console.log(`[api] football-data.org returned ${matches.length - postponed.length} fixture(s) for team ${teamId}`);
  return matches.filter((m) => m.status !== 'POSTPONED');
}

// ─── toFanBuddyStatus ─────────────────────────────────────────────────────────

/** Map football-data.org status to FanBuddy confirmation status. */
export function toFanBuddyStatus(apiStatus: string): 'CONFIRMED' | 'PROVISIONAL' {
  return apiStatus === 'TIMED' ? 'CONFIRMED' : 'PROVISIONAL';
}

// ─── geocodeVenue ─────────────────────────────────────────────────────────────

// Approximate IATA codes for cities/countries. Used as a fallback when
// a stadium is not in the explicit map below.
const CITY_AIRPORT_MAP: Record<string, string> = {
  madrid: 'MAD',
  barcelona: 'BCN',
  london: 'LHR',
  manchester: 'MAN',
  liverpool: 'LPL',
  munich: 'MUC',
  münchen: 'MUC',
  dortmund: 'DTM',
  paris: 'CDG',
  milan: 'MXP',
  rome: 'FCO',
  roma: 'FCO',
  amsterdam: 'AMS',
  porto: 'OPO',
  lisbon: 'LIS',
  naples: 'NAP',
  glasgow: 'GLA',
  edinburgh: 'EDI',
};

function nearestAirportFromCity(city: string): string {
  const lower = city.toLowerCase();
  for (const [key, iata] of Object.entries(CITY_AIRPORT_MAP)) {
    if (lower.includes(key)) return iata;
  }
  return 'UNKNOWN';
}

/**
 * Geocode a venue name using the Geoapify geocoding API.
 * Returns lat/lng and the nearest major airport IATA code.
 */
export async function geocodeVenue(venueName: string): Promise<GeocodedVenue | null> {
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) {
    console.warn('[football-data] GEOAPIFY_API_KEY not set — skipping geocoding');
    return null;
  }

  const params = new URLSearchParams({ text: venueName, apiKey });
  const url = `https://api.geoapify.com/v1/geocode/search?${params}`;

  try {
    const response = await fetchWithRetry(url, {}, 3, 'geoapify');
    if (!response.ok) {
      console.warn(`[api] ✗ geoapify geocode failed: ${response.status}`);
      return null;
    }

    type GeoapifyResult = {
      features?: Array<{
        geometry: { coordinates: [number, number] };
        properties: { city?: string; county?: string; country?: string };
      }>;
    };
    const data = (await response.json()) as GeoapifyResult;
    const feature = data.features?.[0];
    if (!feature) return null;

    const [lng, lat] = feature.geometry.coordinates;
    const cityHint =
      feature.properties.city ??
      feature.properties.county ??
      feature.properties.country ??
      venueName;

    return {
      lat,
      lng,
      nearestAirportCode: nearestAirportFromCity(cityHint),
      city: feature.properties.city ?? feature.properties.county ?? feature.properties.country ?? venueName,
    };
  } catch (err) {
    console.warn('[football-data] geocodeVenue failed:', err);
    return null;
  }
}
