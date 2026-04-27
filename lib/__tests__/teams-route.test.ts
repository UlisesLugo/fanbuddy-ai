import { GET } from '@/app/api/teams/route';

const mockAuth = jest.fn();
jest.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
}));

const mockOrderBy = jest.fn();
const mockFrom = jest.fn();
const mockSelect = jest.fn();
jest.mock('@/lib/db', () => ({
  db: { select: (...args: unknown[]) => mockSelect(...args) },
}));
jest.mock('drizzle-orm', () => ({ asc: jest.fn() }));
jest.mock('@/lib/db/schema', () => ({ teams: { name: 'name' } }));

describe('GET /api/teams', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ orderBy: mockOrderBy });
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns teams sorted by name', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockOrderBy.mockResolvedValue([
      { id: 57, name: 'Arsenal' },
      { id: 81, name: 'Barcelona' },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { teams: { id: number; name: string }[] };
    expect(body.teams).toHaveLength(2);
    expect(body.teams[0].name).toBe('Arsenal');
  });

  it('returns 500 on DB error', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockOrderBy.mockRejectedValue(new Error('db fail'));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
