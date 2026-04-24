import { END } from '@langchain/langgraph';
import { routeFromRouter } from '@/lib/langchain/graph';

// Minimal state shape — only fields the edge function reads
const baseState = {
  trip_complete: false,
  conversation_stage: 'collecting_team' as const,
  direct_reply: null,
};

describe('routeFromRouter', () => {
  it('returns END when trip_complete is true', () => {
    expect(routeFromRouter({ ...baseState, trip_complete: true })).toBe(END);
  });

  it('routes collecting_team to list_matches_node', () => {
    expect(
      routeFromRouter({ ...baseState, conversation_stage: 'collecting_team' }),
    ).toBe('list_matches_node');
  });

  it('routes selecting_match to list_matches_node', () => {
    expect(
      routeFromRouter({ ...baseState, conversation_stage: 'selecting_match' }),
    ).toBe('list_matches_node');
  });

  it('routes collecting_preferences to collect_preferences_node', () => {
    expect(
      routeFromRouter({ ...baseState, conversation_stage: 'collecting_preferences' }),
    ).toBe('collect_preferences_node');
  });

  it('routes confirming_dates to confirm_dates_node', () => {
    expect(
      routeFromRouter({ ...baseState, conversation_stage: 'confirming_dates' }),
    ).toBe('confirm_dates_node');
  });

  it('routes trip_complete stage to END', () => {
    expect(
      routeFromRouter({ ...baseState, conversation_stage: 'trip_complete' as 'collecting_team' }),
    ).toBe(END);
  });
});
