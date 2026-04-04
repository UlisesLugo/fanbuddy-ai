import { HumanMessage } from '@langchain/core/messages';
import { CallbackHandler } from 'langfuse-langchain';

import { graph } from '@/lib/langchain/graph';
import type {
  ChatApiRequest,
  ChatStreamEvent,
  FormattedItinerary,
} from '@/lib/langchain/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Status message shown to the user after each node in the pipeline completes.
// Keys are node names; the message describes what's happening NEXT.
const NODE_STATUS: Record<string, string> = {
  router_node: '', // dynamic — set based on resolved intent below
  search_matches_node: 'Planning your travel...',
  plan_travel_node: 'Validating your itinerary...',
  validator_node: 'Finalizing your trip...',
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
  const { message, thread_id, user_preferences } = body;

  if (
    !message ||
    !thread_id ||
    !user_preferences?.origin_city ||
    !user_preferences?.favorite_team
  ) {
    return Response.json(
      {
        reply: 'Missing required fields: message, thread_id, and user_preferences.',
        itinerary: null,
      },
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

        // Reset planning state each call; messages accumulate via reducer
        const initialState = {
          messages: [new HumanMessage(message)],
          user_preferences,
          itinerary: null,
          validation_errors: [],
          attempt_count: 0,
          formatted: null,
          intent: null,
          direct_reply: null,
        };

        const graphStream = await graph.stream(initialState, {
          ...config,
          streamMode: 'updates',
        });

        let directReply: string | null = null;
        let formatted: FormattedItinerary | null = null;

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

          // Emit status based on which node just finished
          if (nodeName === 'router_node') {
            const intent = update.intent as string;
            if (intent === 'plan_trip' || intent === 'modify_plan') {
              send({ type: 'status', message: 'Searching for upcoming fixtures...' });
            } else {
              send({ type: 'status', message: 'Thinking...' });
            }
          } else if (NODE_STATUS[nodeName]) {
            send({ type: 'status', message: NODE_STATUS[nodeName] });
          }
        }

        const reply =
          directReply ??
          formatted?.summary ??
          'I was unable to help. Please try again.';

        send({ type: 'done', reply, itinerary: formatted });
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
