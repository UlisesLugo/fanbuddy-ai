import {
  buildTransportUrl,
  buildAccommodationUrl,
  recommendTravelDates,
  formatFixtureList,
  type FixtureSummary,
} from '@/lib/langchain/free-tier';

describe('buildTransportUrl', () => {
  it('builds google search URL with formatted dates', () => {
    const url = buildTransportUrl('Madrid', 'Barcelona', '2026-04-20', '2026-04-24');
    expect(url).toBe(
      'https://www.google.com/search?q=madrid+to+barcelona+apr+20+2026+to+apr+24+2026',
    );
  });

  it('handles multi-word city names', () => {
    const url = buildTransportUrl('New York', 'Los Angeles', '2026-05-01', '2026-05-03');
    expect(url).toBe(
      'https://www.google.com/search?q=new+york+to+los+angeles+may+1+2026+to+may+3+2026',
    );
  });

  it('lowercases city names', () => {
    const url = buildTransportUrl('LONDON', 'PARIS', '2026-06-10', '2026-06-12');
    expect(url).toContain('london+to+paris');
  });
});

describe('buildAccommodationUrl', () => {
  it('builds booking.com URL with match city and ISO dates', () => {
    const url = buildAccommodationUrl('Barcelona', '2026-04-22', '2026-04-24');
    expect(url).toBe(
      'https://www.booking.com/searchresults.en-gb.html?ss=Barcelona&checkin=2026-04-22&checkout=2026-04-24&group_adults=1&no_rooms=1',
    );
  });

  it('URL-encodes city names with spaces', () => {
    const url = buildAccommodationUrl('Los Angeles', '2026-05-01', '2026-05-03');
    expect(url).toContain('ss=Los%20Angeles');
  });
});

describe('recommendTravelDates', () => {
  const kickoff = '2026-04-20T20:00:00Z';

  it('luxury: arrives 2 days before, departs 2 days after', () => {
    const result = recommendTravelDates(kickoff, 'luxury');
    expect(result.checkIn).toBe('2026-04-18');
    expect(result.checkOut).toBe('2026-04-22');
  });

  it('value: arrives 1 day before, departs 1 day after', () => {
    const result = recommendTravelDates(kickoff, 'value');
    expect(result.checkIn).toBe('2026-04-19');
    expect(result.checkOut).toBe('2026-04-21');
  });

  it('budget: arrives day of kickoff, departs day after', () => {
    const result = recommendTravelDates(kickoff, 'budget');
    expect(result.checkIn).toBe('2026-04-20');
    expect(result.checkOut).toBe('2026-04-21');
  });

  it('handles kickoff near month boundary', () => {
    const result = recommendTravelDates('2026-05-01T19:00:00Z', 'luxury');
    expect(result.checkIn).toBe('2026-04-29');
    expect(result.checkOut).toBe('2026-05-03');
  });
});

describe('formatFixtureList', () => {
  const fixtures: FixtureSummary[] = [
    {
      homeTeam: 'Real Madrid',
      awayTeam: 'Barcelona',
      kickoffUtc: '2026-04-20T20:00:00Z',
      competition: 'La Liga',
      venue: 'Estadio Santiago Bernabéu',
    },
    {
      homeTeam: 'Real Madrid',
      awayTeam: 'Manchester City',
      kickoffUtc: '2026-04-28T19:00:00Z',
      competition: 'Champions League',
      venue: null,
    },
  ];

  it('numbers each fixture starting from 1', () => {
    const result = formatFixtureList(fixtures);
    expect(result).toContain('1. Real Madrid vs Barcelona');
    expect(result).toContain('2. Real Madrid vs Manchester City');
  });

  it('includes competition name', () => {
    const result = formatFixtureList(fixtures);
    expect(result).toContain('La Liga');
    expect(result).toContain('Champions League');
  });

  it('includes venue when present', () => {
    const result = formatFixtureList(fixtures);
    expect(result).toContain('Estadio Santiago Bernabéu');
  });

  it('omits venue section when null', () => {
    const result = formatFixtureList(fixtures);
    // Second fixture has no venue — should not show "(null)"
    const lines = result.split('\n');
    const secondLine = lines.find((l) => l.startsWith('2.'))!;
    expect(secondLine).not.toContain('null');
  });

  it('ends with a prompt to pick a number', () => {
    const result = formatFixtureList(fixtures);
    expect(result).toMatch(/reply with the number/i);
  });
});
