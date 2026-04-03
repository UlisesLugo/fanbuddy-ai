import {
  AIMessage,
  BaseMessage,
  HumanMessage,
} from '@langchain/core/messages';
import { NextRequest } from 'next/server';

import { compile } from '@/lib/langchain/graph';
import type { UserPreferences } from '@/lib/langchain/graph';
import type { Itinerary } from '@/lib/types/itinerary';

export const runtime = 'nodejs';

type ClientMessage = { role: 'user' | 'assistant'; content: string };

function toLangChainMessages(msgs: ClientMessage[]): BaseMessage[] {
  return msgs.map((m) =>
    m.role === 'user'
      ? new HumanMessage(m.content)
      : new AIMessage(m.content),
  );
}

function serializeMessage(m: BaseMessage): { role: string; content: string } {
  const t = m.getType();
  const role =
    t === 'human' ? 'user' : t === 'ai' ? 'assistant' : t;
  const content =
    typeof m.content === 'string'
      ? m.content
      : JSON.stringify(m.content);
  return { role, content };
}

function safeJsonLine(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(obj)}\n`);
}

export async function POST(req: NextRequest) {
  let body: {
    messages?: ClientMessage[];
    user_preferences?: Partial<UserPreferences>;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(
      '[api/chat] ANTHROPIC_API_KEY is not set; graph uses deterministic mock tool paths only.',
    );
  }

  const userPreferences: UserPreferences = {
    originCity: body.user_preferences?.originCity ?? 'London',
    favoriteTeam: body.user_preferences?.favoriteTeam ?? 'Real Madrid',
  };

  const clientMsgs = body.messages ?? [];
  if (clientMsgs.length === 0 || clientMsgs[clientMsgs.length - 1]?.role !== 'user') {
    return new Response(
      JSON.stringify({
        error: 'messages must be non-empty and end with a user message',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const graph = compile();
  const input = {
    messages: toLangChainMessages(clientMsgs),
    itinerary: null as Itinerary | null,
    validation_errors: [] as string[],
    user_preferences: userPreferences,
    travel_revision_count: 0,
  };

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let lastState: typeof input | null = null;
        const iterable = await graph.stream(input, { streamMode: 'values' });
        for await (const chunk of iterable) {
          lastState = chunk as typeof input;
          const serializable = {
            messages:
              lastState.messages?.map((m) => serializeMessage(m)) ?? [],
            itinerary: lastState.itinerary,
            validation_errors: lastState.validation_errors ?? [],
            travel_revision_count: lastState.travel_revision_count ?? 0,
            user_preferences: lastState.user_preferences ?? userPreferences,
          };
          controller.enqueue(
            safeJsonLine({ type: 'state', data: serializable }),
          );
        }

        const donePayload = {
          type: 'done' as const,
          itinerary: lastState?.itinerary ?? null,
          validation_errors: lastState?.validation_errors ?? [],
          travel_revision_count: lastState?.travel_revision_count ?? 0,
          messages:
            lastState?.messages?.map((m) => serializeMessage(m)) ?? [],
        };
        controller.enqueue(safeJsonLine(donePayload));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Graph execution failed';
        controller.enqueue(
          safeJsonLine({ type: 'error', message }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
