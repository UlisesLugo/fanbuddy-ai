import { auth } from '@clerk/nextjs/server';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { trips } from '@/lib/db/schema';
import { buildGraph } from '@/lib/langchain/graph';
import type { ActivitiesData, FormattedItinerary } from '@/lib/langchain/types';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const [trip] = await db
    .select()
    .from(trips)
    .where(eq(trips.id, params.id));

  if (!trip) return new Response('Not Found', { status: 404 });
  if (trip.user_id !== userId) return new Response('Forbidden', { status: 403 });

  try {
    const graph = await buildGraph();
    const state = await graph.getState({ configurable: { thread_id: trip.thread_id } });
    const stateValues = state.values as Record<string, unknown>;

    const rawMessages = (stateValues.messages ?? []) as unknown[];
    const messages = rawMessages
      .filter((m): m is HumanMessage | AIMessage => m instanceof HumanMessage || m instanceof AIMessage)
      .map((m) => ({
        role: m instanceof HumanMessage ? ('user' as const) : ('ai' as const),
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      }));

    const itinerary = (stateValues.formatted ?? null) as FormattedItinerary | null;
    const activities = (stateValues.activities ?? null) as ActivitiesData | null;

    return Response.json({ trip, messages, itinerary, activities });
  } catch (err) {
    console.error('[trips/[id]] getState error', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}
