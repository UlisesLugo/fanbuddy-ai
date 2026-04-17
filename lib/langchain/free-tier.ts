// ─── Free-tier pure helpers ───────────────────────────────────────────────────
// These functions contain no side effects and can be unit tested directly.

// ── Fixture list formatter ────────────────────────────────────────────────────

export interface FixtureSummary {
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string;
  competition: string;
  venue: string | null;
}

/**
 * Format a numbered list of upcoming fixtures for display in chat.
 */
export function formatFixtureList(fixtures: FixtureSummary[]): string {
  const lines = fixtures.map((f, i) => {
    const date = new Date(f.kickoffUtc).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
    const venue = f.venue ? ` (${f.venue})` : '';
    return `${i + 1}. ${f.homeTeam} vs ${f.awayTeam} — ${date}, ${f.competition}${venue}`;
  });
  return (
    `Here are the next upcoming fixtures:\n\n${lines.join('\n')}\n\n` +
    `Reply with the number of the match you'd like to travel to!`
  );
}

// ── Date recommendation ───────────────────────────────────────────────────────

const TIER_OFFSETS: Record<'luxury' | 'value' | 'budget', { before: number; after: number }> = {
  luxury: { before: 2, after: 2 },
  value:  { before: 1, after: 1 },
  budget: { before: 0, after: 1 },
};

/**
 * Recommend check-in/check-out dates based on kickoff time and spending tier.
 * All arithmetic is done in UTC to avoid timezone drift.
 */
export function recommendTravelDates(
  kickoffUtc: string,
  tier: 'luxury' | 'value' | 'budget',
): { checkIn: string; checkOut: string } {
  const kickoff = new Date(kickoffUtc);
  // Normalise to midnight UTC on the kickoff date
  const kickoffDay = new Date(
    Date.UTC(kickoff.getUTCFullYear(), kickoff.getUTCMonth(), kickoff.getUTCDate()),
  );

  const { before, after } = TIER_OFFSETS[tier];

  const checkIn = new Date(kickoffDay);
  checkIn.setUTCDate(checkIn.getUTCDate() - before);

  const checkOut = new Date(kickoffDay);
  checkOut.setUTCDate(checkOut.getUTCDate() + after);

  return {
    checkIn: checkIn.toISOString().slice(0, 10),
    checkOut: checkOut.toISOString().slice(0, 10),
  };
}

// ── URL builders ──────────────────────────────────────────────────────────────

/**
 * Format a YYYY-MM-DD date string to "mmm+d+yyyy" (Google Flights style).
 * Example: "2026-04-20" → "apr+20+2026"
 */
function formatDateForGoogle(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toLowerCase();
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  return `${month}+${day}+${year}`;
}

/**
 * Build a Google search URL for flights.
 * Example: https://www.google.com/search?q=madrid+to+barcelona+apr+20+2026+to+apr+24+2026
 */
export function buildTransportUrl(
  originCity: string,
  matchCity: string,
  checkIn: string,
  checkOut: string,
): string {
  const origin = originCity.toLowerCase().replace(/\s+/g, '+');
  const dest = matchCity.toLowerCase().replace(/\s+/g, '+');
  const from = formatDateForGoogle(checkIn);
  const to = formatDateForGoogle(checkOut);
  return `https://www.google.com/search?q=${origin}+to+${dest}+${from}+to+${to}`;
}

/**
 * Build a Booking.com search URL for accommodation.
 * Example: https://www.booking.com/searchresults.en-gb.html?ss=Barcelona&checkin=2026-04-22&checkout=2026-04-24&group_adults=1&no_rooms=1
 */
export function buildAccommodationUrl(
  matchCity: string,
  checkIn: string,
  checkOut: string,
): string {
  const city = encodeURIComponent(matchCity);
  return (
    `https://www.booking.com/searchresults.en-gb.html` +
    `?ss=${city}&checkin=${checkIn}&checkout=${checkOut}&group_adults=1&no_rooms=1`
  );
}
