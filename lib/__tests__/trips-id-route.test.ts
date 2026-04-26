// Mock @langchain/core/messages so instanceof checks work in the route handler
class MockHumanMessage {
  content: string;
  constructor(content: string) { this.content = content; }
}
class MockAIMessage {
  content: string;
  constructor(content: string) { this.content = content; }
}
jest.mock('@langchain/core/messages', () => ({
  HumanMessage: MockHumanMessage,
  AIMessage: MockAIMessage,
}));

import { GET } from '@/app/api/trips/[id]/route';

const mockAuth = jest.fn();
jest.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
}));

const mockWhere = jest.fn();
const mockFrom = jest.fn();
const mockSelect = jest.fn();
jest.mock('@/lib/db', () => ({
  db: { select: (...args: unknown[]) => mockSelect(...args) },
}));
jest.mock('drizzle-orm', () => ({ eq: jest.fn() }));
jest.mock('@/lib/db/schema', () => ({
  trips: { id: 'id', user_id: 'user_id' },
}));

const mockGetState = jest.fn();
jest.mock('@/lib/langchain/graph', () => ({
  buildGraph: jest.fn(),
}));

import { buildGraph } from '@/lib/langchain/graph';
const mockBuildGraph = buildGraph as jest.Mock;

const fakeTrip = {
  id: 'trip-123',
  user_id: 'user_abc',
  thread_id: 'thread-xyz',
  team: 'Arsenal',
  match_label: 'Arsenal vs Chelsea',
  match_date: '2025-03-15',
  destination: 'London',
  tier: 'paid',
  created_at: new Date('2025-01-01T00:00:00Z'),
};

const fakeItinerary = {
  match: { venue: 'Emirates', kickoffUtc: '2025-03-15T15:00:00Z', homeTeam: 'Arsenal', awayTeam: 'Chelsea', league: 'PL', matchday: '28', ticketPriceEur: 85, tvConfirmed: true },
  flight: {
    outbound: { origin: 'MAD', destination: 'LHR', departureUtc: '2025-03-14T07:30:00Z', arrivalUtc: '2025-03-14T09:30:00Z', airline: 'Iberia', direct: true, priceEur: 155 },
    inbound: { origin: 'LHR', destination: 'MAD', departureUtc: '2025-03-16T18:00:00Z', arrivalUtc: '2025-03-16T21:00:00Z', airline: 'Iberia', direct: true, priceEur: 155 },
    totalPriceEur: 310,
  },
  hotel: { name: 'Premier Inn', city: 'London', checkIn: '2025-03-14', checkOut: '2025-03-16', nights: 2, pricePerNightEur: 85, totalEur: 170, wasDowngraded: false },
  cost: { flightsEur: 310, matchTicketEur: 85, stayEur: 170, totalEur: 565 },
  validationStatus: 'OK' as const,
  validationNotes: [],
  summary: 'Your Arsenal trip is ready!',
};

function makeRequest(id: string) {
  return { params: { id } } as unknown as Parameters<typeof GET>[1];
}

describe('GET /api/trips/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockBuildGraph.mockResolvedValue({ getState: mockGetState });
  });

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const res = await GET({} as Request, makeRequest('trip-123'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when trip does not exist', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_abc' });
    mockWhere.mockResolvedValue([]);
    const res = await GET({} as Request, makeRequest('trip-999'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when trip belongs to a different user', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_other' });
    mockWhere.mockResolvedValue([fakeTrip]);
    const res = await GET({} as Request, makeRequest('trip-123'));
    expect(res.status).toBe(403);
  });

  it('returns 500 when getState throws', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_abc' });
    mockWhere.mockResolvedValue([fakeTrip]);
    mockGetState.mockRejectedValue(new Error('DB connection lost'));
    const res = await GET({} as Request, makeRequest('trip-123'));
    expect(res.status).toBe(500);
  });

  it('returns trip, serialized messages, itinerary, and activities on success', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_abc' });
    mockWhere.mockResolvedValue([fakeTrip]);

    const { HumanMessage, AIMessage } = jest.requireMock('@langchain/core/messages') as {
      HumanMessage: typeof MockHumanMessage;
      AIMessage: typeof MockAIMessage;
    };

    mockGetState.mockResolvedValue({
      values: {
        messages: [
          new HumanMessage('I want to watch Arsenal'),
          new AIMessage('Which city are you travelling from?'),
          new HumanMessage('Madrid'),
          new AIMessage('Here is your trip!'),
        ],
        formatted: fakeItinerary,
        activities: null,
      },
    });

    const res = await GET({} as Request, makeRequest('trip-123'));
    expect(res.status).toBe(200);

    const body = await res.json() as {
      trip: typeof fakeTrip;
      messages: { role: string; content: string }[];
      itinerary: typeof fakeItinerary;
      activities: null;
    };

    expect(body.trip.id).toBe('trip-123');
    expect(body.messages).toEqual([
      { role: 'user', content: 'I want to watch Arsenal' },
      { role: 'ai', content: 'Which city are you travelling from?' },
      { role: 'user', content: 'Madrid' },
      { role: 'ai', content: 'Here is your trip!' },
    ]);
    expect(body.itinerary?.cost.totalEur).toBe(565);
    expect(body.activities).toBeNull();

    expect(mockGetState).toHaveBeenCalledWith({ configurable: { thread_id: 'thread-xyz' } });
  });
});
