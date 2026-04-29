import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { teams, users } from '@/lib/db/schema';

export const runtime = 'nodejs';

type ProfileResponse = {
  email: string;
  plan: 'free' | 'paid';
  home_city: string | null;
  favorite_team: { id: number; name: string } | null;
};

async function fetchProfile(userId: string): Promise<ProfileResponse | null> {
  const rows = await db
    .select({
      email: users.email,
      plan: users.plan,
      home_city: users.home_city,
      team_id: teams.id,
      team_name: teams.name,
    })
    .from(users)
    .leftJoin(teams, eq(users.favorite_team_id, teams.id))
    .where(eq(users.id, userId));

  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    email: row.email,
    plan: row.plan as 'free' | 'paid',
    home_city: row.home_city ?? null,
    favorite_team: row.team_id ? { id: row.team_id, name: row.team_name! } : null,
  };
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  try {
    const profile = await fetchProfile(userId);
    if (!profile) return new Response('Not found', { status: 404 });
    return Response.json(profile);
  } catch (err) {
    console.error('[profile] GET error', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  try {
    const raw = (await request.json()) as Record<string, unknown>;
    const body = {
      ...('home_city' in raw && {
        home_city: typeof raw.home_city === 'string' ? raw.home_city : null,
      }),
      ...('favorite_team_id' in raw && {
        favorite_team_id: typeof raw.favorite_team_id === 'number' ? raw.favorite_team_id : null,
      }),
    };

    if (body.favorite_team_id != null) {
      const teamRows = await db
        .select({ id: teams.id })
        .from(teams)
        .where(eq(teams.id, body.favorite_team_id));
      if (teamRows.length === 0) {
        return Response.json({ error: 'Invalid team ID' }, { status: 400 });
      }
    }

    const patch: { home_city?: string | null; favorite_team_id?: number | null } = {};
    if ('home_city' in body) patch.home_city = body.home_city ?? null;
    if ('favorite_team_id' in body) patch.favorite_team_id = body.favorite_team_id ?? null;

    if (Object.keys(patch).length > 0) {
      await db.update(users).set(patch).where(eq(users.id, userId));
    }

    const profile = await fetchProfile(userId);
    return Response.json(profile);
  } catch (err) {
    console.error('[profile] PATCH error', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}
