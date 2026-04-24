// lib/__tests__/activities.test.ts
import { buildActivitiesPrompt, buildDayEntries } from '../langchain/activities';

describe('buildDayEntries', () => {
  const kickoffUtc = '2026-04-20T18:00:00Z';

  it('returns 3 entries for a standard 3-day trip', () => {
    const result = buildDayEntries(kickoffUtc, { checkIn: '2026-04-19', checkOut: '2026-04-21' });
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ day: 'arrival', date: '2026-04-19', availableHours: 6 });
    expect(result[1]).toEqual({ day: 'match', date: '2026-04-20', availableHours: 4 });
    expect(result[2]).toEqual({ day: 'departure', date: '2026-04-21', availableHours: 3 });
  });

  it('omits arrival when checkIn equals kickoff date (budget tier)', () => {
    const result = buildDayEntries(kickoffUtc, { checkIn: '2026-04-20', checkOut: '2026-04-21' });
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ day: 'match', date: '2026-04-20', availableHours: 4 });
    expect(result[1]).toEqual({ day: 'departure', date: '2026-04-21', availableHours: 3 });
  });

  it('omits departure when checkOut equals kickoff date', () => {
    const result = buildDayEntries(kickoffUtc, { checkIn: '2026-04-19', checkOut: '2026-04-20' });
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ day: 'arrival', date: '2026-04-19', availableHours: 6 });
    expect(result[1]).toEqual({ day: 'match', date: '2026-04-20', availableHours: 4 });
  });

  it('returns only match day when checkIn and checkOut both equal kickoff date', () => {
    const result = buildDayEntries(kickoffUtc, { checkIn: '2026-04-20', checkOut: '2026-04-20' });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ day: 'match', date: '2026-04-20', availableHours: 4 });
  });
});

describe('buildActivitiesPrompt', () => {
  const match = {
    homeTeam: 'FC Barcelona',
    awayTeam: 'Real Madrid',
    kickoffUtc: '2026-04-20T18:00:00Z',
    match_city: 'Barcelona',
    venue: 'Camp Nou',
  };

  it('includes city, home team, and away team', () => {
    const prompt = buildActivitiesPrompt(match, { checkIn: '2026-04-19', checkOut: '2026-04-21' });
    expect(prompt).toContain('Barcelona');
    expect(prompt).toContain('FC Barcelona');
    expect(prompt).toContain('Real Madrid');
  });

  it('falls back to venue when match_city is undefined', () => {
    const matchNoCity = { ...match, match_city: undefined };
    const prompt = buildActivitiesPrompt(matchNoCity, { checkIn: '2026-04-19', checkOut: '2026-04-21' });
    expect(prompt).toContain('Camp Nou');
  });

  it('includes all 3 day labels for a standard trip', () => {
    const prompt = buildActivitiesPrompt(match, { checkIn: '2026-04-19', checkOut: '2026-04-21' });
    expect(prompt).toContain('arrival day');
    expect(prompt).toContain('match day');
    expect(prompt).toContain('departure day');
  });

  it('excludes arrival day when checkIn equals kickoff date', () => {
    const prompt = buildActivitiesPrompt(match, { checkIn: '2026-04-20', checkOut: '2026-04-21' });
    expect(prompt).not.toContain('arrival day');
    expect(prompt).toContain('match day');
    expect(prompt).toContain('departure day');
  });
});
