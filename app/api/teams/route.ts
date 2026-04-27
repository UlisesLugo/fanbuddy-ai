import { auth } from '@clerk/nextjs/server';
import { asc } from 'drizzle-orm';

import { db } from '@/lib/db';
import { teams } from '@/lib/db/schema';

export const runtime = 'nodejs';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  try {
    const rows = await db.select().from(teams).orderBy(asc(teams.name));
    return Response.json({ teams: rows });
  } catch (err) {
    console.error('[teams] DB error', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}
