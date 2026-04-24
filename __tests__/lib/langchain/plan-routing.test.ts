import { END } from '@langchain/langgraph';

import { routeAfterDates, shouldRetryOrFinish } from '@/lib/langchain/graph';

describe('routeAfterDates', () => {
  const baseState = {
    direct_reply: null,
    user_plan: 'free' as const,
  };

  it('returns END when direct_reply is set', () => {
    expect(routeAfterDates({ ...baseState, direct_reply: 'some reply' })).toBe(END);
  });

  it('routes to generate_links_node for free plan', () => {
    expect(routeAfterDates(baseState)).toBe('generate_links_node');
  });

  it('routes to plan_travel_node for paid plan', () => {
    expect(routeAfterDates({ ...baseState, user_plan: 'paid' })).toBe('plan_travel_node');
  });
});

describe('shouldRetryOrFinish', () => {
  it('goes to formatter_node when no errors', () => {
    expect(shouldRetryOrFinish({ validation_errors: [], attempt_count: 1 })).toBe('formatter_node');
  });

  it('goes to formatter_node on PROVISIONAL-only errors', () => {
    expect(
      shouldRetryOrFinish({ validation_errors: ['TV schedule unconfirmed — marked PROVISIONAL'], attempt_count: 1 }),
    ).toBe('formatter_node');
  });

  it('retries on hard error with attempt_count < 3', () => {
    expect(
      shouldRetryOrFinish({ validation_errors: ['Flight arrives too late — buffer is 2.0h'], attempt_count: 1 }),
    ).toBe('plan_travel_node');
  });

  it('goes to formatter_node on hard error when attempt_count >= 3', () => {
    expect(
      shouldRetryOrFinish({ validation_errors: ['Flight arrives too late — buffer is 2.0h'], attempt_count: 3 }),
    ).toBe('formatter_node');
  });
});
