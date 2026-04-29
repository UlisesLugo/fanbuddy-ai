import { GET, PATCH } from '@/app/api/profile/route';

const mockAuth = jest.fn();
jest.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn(),
}));
jest.mock('@/lib/db/schema', () => ({
  users: { id: 'id', email: 'email', plan: 'plan', home_city: 'home_city', favorite_team_id: 'favorite_team_id' },
  teams: { id: 'id', name: 'name' },
}));

const mockSelect = jest.fn();
const mockUpdateWhere = jest.fn();
const mockSet = jest.fn();
const mockUpdate = jest.fn();

jest.mock('@/lib/db', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

function mockSelectChain(resolveValue: unknown[]) {
  mockSelect.mockReturnValueOnce({
    from: () => ({
      leftJoin: () => ({ where: jest.fn().mockResolvedValue(resolveValue) }),
      where: jest.fn().mockResolvedValue(resolveValue),
    }),
  });
}

const profileRow = {
  email: 'fan@example.com',
  plan: 'free',
  home_city: 'London',
  team_id: 57,
  team_name: 'Arsenal',
};

describe('GET /api/profile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockResolvedValue(undefined);
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns profile with team when user has preferences', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockSelectChain([profileRow]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      email: string;
      plan: string;
      home_city: string;
      favorite_team: { id: number; name: string };
    };
    expect(body.email).toBe('fan@example.com');
    expect(body.home_city).toBe('London');
    expect(body.favorite_team).toEqual({ id: 57, name: 'Arsenal' });
  });

  it('returns profile with null team when no team set', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockSelectChain([{ ...profileRow, team_id: null, team_name: null }]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { favorite_team: null };
    expect(body.favorite_team).toBeNull();
  });

  it('returns 404 when user row not found', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockSelectChain([]);
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it('returns 500 on DB error', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockSelect.mockReturnValueOnce({
      from: () => ({ leftJoin: () => ({ where: jest.fn().mockRejectedValue(new Error('db fail')) }) }),
    });
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe('PATCH /api/profile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockResolvedValue(undefined);
  });

  const mockReq = (body: object) =>
    ({ json: () => Promise.resolve(body) }) as unknown as Request;

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const res = await PATCH(mockReq({ home_city: 'Madrid' }));
    expect(res.status).toBe(401);
  });

  it('updates home_city and returns updated profile', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    // Profile fetch after update
    mockSelectChain([{ ...profileRow, home_city: 'Madrid', team_id: null, team_name: null }]);
    const res = await PATCH(mockReq({ home_city: 'Madrid' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { home_city: string };
    expect(body.home_city).toBe('Madrid');
    expect(mockUpdateWhere).toHaveBeenCalled();
  });

  it('returns 400 when favorite_team_id does not exist in teams table', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    // Team validation returns empty
    mockSelect.mockReturnValueOnce({
      from: () => ({ where: jest.fn().mockResolvedValue([]) }),
    });
    const res = await PATCH(mockReq({ favorite_team_id: 9999 }));
    expect(res.status).toBe(400);
  });

  it('updates favorite_team_id after validating team exists', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    // Team validation returns team
    mockSelect.mockReturnValueOnce({
      from: () => ({ where: jest.fn().mockResolvedValue([{ id: 57 }]) }),
    });
    // Profile fetch after update
    mockSelectChain([profileRow]);
    const res = await PATCH(mockReq({ favorite_team_id: 57 }));
    expect(res.status).toBe(200);
    expect(mockUpdateWhere).toHaveBeenCalled();
  });

  it('returns 500 on DB error during fetchProfile', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockSelect.mockReturnValueOnce({
      from: () => ({ leftJoin: () => ({ where: jest.fn().mockRejectedValue(new Error('db fail')) }) }),
    });
    const res = await PATCH(mockReq({ home_city: 'London' }));
    expect(res.status).toBe(500);
  });

  it('returns 500 on DB error during update', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockUpdate.mockImplementationOnce(() => { throw new Error('update fail'); });
    const res = await PATCH(mockReq({ home_city: 'London' }));
    expect(res.status).toBe(500);
  });
});
