import { HumanMessage } from '@langchain/core/messages';
import { CallbackHandler } from 'langfuse-langchain';

import { graph } from '@/lib/langchain/graph';
import type {
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
};

export async function POST(request: Request) {
  const langfuseEnabled =
    !!process.env.LANGFUSE_SECRET_KEY && !!process.env.LANGFUSE_PUBLIC_KEY;

  const langfuseHandler = langfuseEnabled
    ? new CallbackHandler({
        secretKey: process.env.LANGFUSE_SECRET_KEY,
        publicKey: process.env.LANGFUSE_PUBLIC_KEY,
        baseUrl: process.env.LANGFUSE_BASE_URL ?? 'https://cloud.langfuse.com',
      })
    : null;

  const body = (await request.json()) as Partial<ChatApiRequest>;
  const { message, thread_id } = body;

  if (!message || !thread_id) {
    return Response.json(
      { reply: 'Missing required fields: message and thread_id.', itinerary: null },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();

  const responseStream = new ReadableStream({
    async start(controller) {
      const send = (event: ChatStreamEvent) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      };

      try {
        const config = {
          configurable: { thread_id },
          ...(langfuseHandler ? { callbacks: [langfuseHandler] } : {}),
        };

        // Initial status before the graph starts
        send({ type: 'status', message: 'Analyzing your request...' });

        // Reset planning state each call; messages + user_preferences accumulate via checkpointer
        const initialState = {
          messages: [new HumanMessage(message)],
          itinerary: null,
          validation_errors: [],
          attempt_count: 0,
          formatted: null,
          direct_reply: null,
          free_tier_links: null,
          wants_date_recommendation: false,
        };

        const graphStream = await graph.stream(initialState, {
          ...config,
          streamMode: 'updates',
        });

        let directReply: string | null = null;
        let formatted: FormattedItinerary | null = null;
        let links: FreeTierLinks | null = null;
        let fixtures: FixtureSummary[] | null = null;

        for await (const chunk of graphStream) {
          const nodeName = Object.keys(chunk)[0] as string;
          const update = (chunk as Record<string, Record<string, unknown>>)[nodeName];

          // Capture final outputs
          if (update.direct_reply != null) {
            directReply = update.direct_reply as string;
          }
          if (update.formatted != null) {
            formatted = update.formatted as FormattedItinerary;
          }
          if (update.free_tier_links != null) {
            links = update.free_tier_links as FreeTierLinks;
          }
          if (update.fixture_list != null) {
            fixtures = update.fixture_list as FixtureSummary[];
          }

          // Emit status based on which node just finished
          if (NODE_STATUS[nodeName]) {
            send({ type: 'status', message: NODE_STATUS[nodeName] });
          }
        }

        const reply =
          directReply ??
          formatted?.summary ??
          'I was unable to help. Please try again.';

        send({ type: 'done', reply, itinerary: formatted, links, fixtures });
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
