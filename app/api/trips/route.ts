import { auth } from '@clerk/nextjs/server';
import { desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { trips } from '@/lib/db/schema';

export const runtime = 'nodejs';

export async function GET(_request: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  try {
    const rows = await db
      .select()
      .from(trips)
      .where(eq(trips.user_id, userId))
      .orderBy(desc(trips.created_at));

    return Response.json({ trips: rows });
  } catch (err) {
    console.error('[trips] DB error', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}
