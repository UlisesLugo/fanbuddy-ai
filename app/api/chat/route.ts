import { auth } from '@clerk/nextjs/server';
import { HumanMessage } from '@langchain/core/messages';
import { eq } from 'drizzle-orm';
import { CallbackHandler } from 'langfuse-langchain';

import { checkGate } from '@/lib/api/chat-gate';
import { db } from '@/lib/db';
import { trips, users } from '@/lib/db/schema';
import { buildGraph } from '@/lib/langchain/graph';
import type {
  ActivitiesData,
  ChatApiRequest,
  ChatStreamEvent,
  FixtureSummary,
  FormattedItinerary,
  FreeTierLinks,
} from '@/lib/langchain/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Status message shown to the user after each node in the pipeline completes.
// Keys are node names; the message describes what's happening NEXT.
const NODE_STATUS: Record<string, string> = {
  router_node: 'Finding upcoming fixtures...',
  list_matches_node: 'Loaded fixtures...',
  collect_preferences_node: 'Got your preferences...',
  confirm_dates_node: 'Confirmed your dates...',
  generate_links_node: 'Building your trip links...',
  activities_node: 'Planning your activities...',
  plan_travel_node: 'Searching flights and hotels...',
  validator_node: 'Validating your itinerary...',
  formatter_node: 'Preparing your itinerary...',
};

export async function POST(request: Request) {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  // ── Load user + gate ──────────────────────────────────────────────────────────
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return Response.json({ error: 'user_not_found' }, { status: 404 });

  const gate = checkGate(user);
  if (!gate.allowed) {
    return Response.json({ error: gate.error }, { status: 403 });
  }

  const isPaid = user.plan === 'paid';

  // ── Parse body ────────────────────────────────────────────────────────────────
  const body = (await request.json()) as Partial<ChatApiRequest>;
  const { message, thread_id, user_preferences } = body;

  if (!message || !thread_id) {
    return Response.json(
      { reply: 'Missing required fields: message and thread_id.', itinerary: null },
      { status: 400 },
    );
  }

  // ── Langfuse (optional) ───────────────────────────────────────────────────────
  const langfuseEnabled =
    !!process.env.LANGFUSE_SECRET_KEY && !!process.env.LANGFUSE_PUBLIC_KEY;

  const langfuseHandler = langfuseEnabled
    ? new CallbackHandler({
        secretKey: process.env.LANGFUSE_SECRET_KEY,
        publicKey: process.env.LANGFUSE_PUBLIC_KEY,
        baseUrl: process.env.LANGFUSE_BASE_URL ?? 'https://cloud.langfuse.com',
      })
    : null;

  const encoder = new TextEncoder();

  const responseStream = new ReadableStream({
    async start(controller) {
      const send = (event: ChatStreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        const compiledGraph = await buildGraph();

        const config = {
          configurable: { thread_id },
          ...(langfuseHandler ? { callbacks: [langfuseHandler] } : {}),
        };

        send({ type: 'status', message: 'Analyzing your request...' });

        // Reset ephemeral state each call; messages, user_preferences, itinerary, and fixture_list
        // accumulate via checkpointer across turns within the same session.
        const initialState = {
          messages: [new HumanMessage(message)],
          validation_errors: [],
          attempt_count: 0,
          formatted: null,
          direct_reply: null,
          free_tier_links: null,
          wants_date_recommendation: false,
          user_plan: user.plan as 'free' | 'paid',
          ...(user_preferences ? { user_preferences } : {}),
        };

        const graphStream = await compiledGraph.stream(initialState, {
          ...config,
          streamMode: 'updates',
        });

        let directReply: string | null = null;
        let formatted: FormattedItinerary | null = null;
        let links: FreeTierLinks | null = null;
        let fixtures: FixtureSummary[] | null = null;
        let activities: ActivitiesData | null = null;
        let tripCompleted = false;

        for await (const chunk of graphStream) {
          const nodeName = Object.keys(chunk)[0] as string;
          const update = (chunk as Record<string, Record<string, unknown>>)[nodeName];

          if (update.direct_reply != null) directReply = update.direct_reply as string;
          if (update.formatted != null) {
            formatted = update.formatted as FormattedItinerary;
            tripCompleted = true;
          }
          if (update.free_tier_links != null) links = update.free_tier_links as FreeTierLinks;
          if (update.fixture_list != null) fixtures = update.fixture_list as FixtureSummary[];
          if (update.activities != null) activities = update.activities as ActivitiesData;
          if (update.trip_complete === true) tripCompleted = true;

          if (NODE_STATUS[nodeName]) {
            send({ type: 'status', message: NODE_STATUS[nodeName] });
          }
        }

        // ── Record completed trip ─────────────────────────────────────────────
        if (tripCompleted) {
          const fullState = await compiledGraph.getState({ configurable: { thread_id } });
          const stateValues = fullState.values as Record<string, unknown>;
          const match = (stateValues.itinerary as { match?: Record<string, string> } | null)?.match;
          const prefs = stateValues.user_preferences as { favorite_team?: string } | undefined;

          await db.insert(trips).values({
            user_id: userId,
            thread_id,
            team: prefs?.favorite_team ?? 'Unknown',
            match_label: match ? `${match.homeTeam} vs ${match.awayTeam}` : 'Unknown match',
            match_date: match?.kickoffUtc?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
            destination: match?.match_city ?? match?.venue ?? 'Unknown',
            tier: isPaid ? 'paid' : 'free',
          });

          if (!isPaid) {
            await db.update(users)
              .set({ trips_used: user.trips_used + 1 })
              .where(eq(users.id, userId));
          }
        }

        const reply =
          directReply ??
          formatted?.summary ??
          'I was unable to help. Please try again.';

        send({ type: 'done', reply, itinerary: formatted, links, fixtures, activities });
      } catch (err) {
        console.error('[api/chat] Graph invocation failed:', err);
        send({ type: 'error', message: 'Something went wrong. Please try again.' });
      } finally {
        await langfuseHandler?.flushAsync();
        controller.close();
      }
    },
  });

  return new Response(responseStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
