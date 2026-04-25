import { GET } from '@/app/api/trips/route';

const mockAuth = jest.fn();
jest.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
}));

const mockOrderBy = jest.fn();
const mockWhere = jest.fn();
const mockFrom = jest.fn();
const mockSelect = jest.fn();
jest.mock('@/lib/db', () => ({
  db: { select: (...args: unknown[]) => mockSelect(...args) },
}));
jest.mock('drizzle-orm', () => ({
  eq: jest.fn(),
  desc: jest.fn(),
}));
jest.mock('@/lib/db/schema', () => ({
  trips: { user_id: 'user_id' },
}));

describe('GET /api/trips', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
  });

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const res = await GET({} as Request);
    expect(res.status).toBe(401);
  });

  it('returns trips array for authenticated user', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    const fakeRows = [
      {
        id: 'trip-1',
        team: 'Barcelona',
        match_label: 'Barcelona vs Real Madrid',
        match_date: '2026-05-15',
        destination: 'Barcelona',
        tier: 'paid',
        created_at: new Date('2026-04-01T10:00:00Z'),
      },
    ];
    mockOrderBy.mockResolvedValue(fakeRows);
    const res = await GET({} as Request);
    expect(res.status).toBe(200);
    const body = await res.json() as { trips: typeof fakeRows };
    expect(body.trips).toHaveLength(1);
    expect(body.trips[0].team).toBe('Barcelona');
    expect(body.trips[0].tier).toBe('paid');
    const { eq } = jest.requireMock('drizzle-orm') as { eq: jest.Mock };
    expect(eq).toHaveBeenCalledWith(expect.anything(), 'user_123');
  });

  it('returns empty array when user has no trips', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_456' });
    mockOrderBy.mockResolvedValue([]);
    const res = await GET({} as Request);
    expect(res.status).toBe(200);
    const body = await res.json() as { trips: unknown[] };
    expect(body.trips).toEqual([]);
  });

  it('returns 500 when DB throws', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockOrderBy.mockRejectedValue(new Error('connection timeout'));
    const res = await GET({} as Request);
    expect(res.status).toBe(500);
  });
});
