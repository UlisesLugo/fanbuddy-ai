// lib/langchain/activities.ts
import { z } from 'zod';
import type { RawMatchFixture } from './types';

// ─── Zod schema for structured LLM output ─────────────────────────────────────

const ActivityItemSchema = z.object({
  name: z.string(),
  category: z.enum(['football', 'culture', 'food', 'sightseeing']),
  description: z.string(),
  estimatedDuration: z.string(),
  tip: z.string().optional(),
});

const DayActivitiesSchema = z.object({
  day: z.enum(['arrival', 'match', 'departure']),
  date: z.string(),
  label: z.string(),
  activities: z.array(ActivityItemSchema),
});

export const ActivitiesDataSchema = z.object({
  city: z.string(),
  days: z.array(DayActivitiesSchema),
});

// ─── Pure helpers (exported for testing) ──────────────────────────────────────

export interface DayEntry {
  day: 'arrival' | 'match' | 'departure';
  date: string;
  availableHours: number;
}

/**
 * Derives which days need activity planning and how many hours are available.
 * Deduplicates arrival and match when checkIn === kickoffDate (budget tier).
 */
export function buildDayEntries(
  kickoffUtc: string,
  travelDates: { checkIn: string; checkOut: string },
): DayEntry[] {
  const kickoffDate = kickoffUtc.slice(0, 10);
  const { checkIn, checkOut } = travelDates;
  const entries: DayEntry[] = [];

  if (checkIn !== kickoffDate) {
    entries.push({ day: 'arrival', date: checkIn, availableHours: 6 });
  }

  entries.push({ day: 'match', date: kickoffDate, availableHours: 4 });

  if (checkOut !== kickoffDate) {
    entries.push({ day: 'departure', date: checkOut, availableHours: 3 });
  }

  return entries;
}

/**
 * Builds the prompt string for the activities LLM call.
 */
export function buildActivitiesPrompt(
  match: Pick<RawMatchFixture, 'homeTeam' | 'awayTeam' | 'kickoffUtc' | 'match_city' | 'venue'>,
  travelDates: { checkIn: string; checkOut: string },
): string {
  const city = match.match_city ?? match.venue;
  const entries = buildDayEntries(match.kickoffUtc, travelDates);

  const dayLines = entries
    .map((e) => {
      const d = new Date(e.date + 'T00:00:00Z');
      const dateStr = d.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      });
      return `- ${e.day} day (${dateStr}): ${e.availableHours} hours available`;
    })
    .join('\n');

  // Build day-specific instructions only for days that are present
  const hasArrival = entries.some((e) => e.day === 'arrival');
  const hasDeparture = entries.some((e) => e.day === 'departure');

  const dayInstructions = [
    'Prioritise football-themed activities on match day (pre-match atmosphere, fan zones, local sports bars near the stadium).',
    hasArrival ? 'On arrival day, favour relaxed, arrival-friendly options.' : '',
    hasDeparture ? 'On departure day, suggest morning activities close to transport links.' : '',
  ]
    .filter(Boolean)
    .join('\n');

  return `You are FanBuddy.AI. Generate day-by-day activity recommendations for a football fan visiting ${city} to watch ${match.homeTeam} vs ${match.awayTeam}.

Days and available time:
${dayLines}

For each day generate 4-5 activities that collectively fit within the available hours. Mix these categories: football (stadium tours, fan pubs, sports museums), culture (museums, art, history), food (restaurants, markets, local specialties), sightseeing (landmarks, viewpoints, neighbourhoods).

Requirements per activity:
- name: specific, real place or activity in ${city}
- category: one of football, culture, food, sightseeing
- description: one sentence
- estimatedDuration: realistic time (e.g. "2 hours", "45 minutes")
- tip: optional insider tip (short phrase)

${dayInstructions}
Ensure the total estimatedDuration for each day fits within its available hours.`;
}
