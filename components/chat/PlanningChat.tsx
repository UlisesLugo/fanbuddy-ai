'use client';

import {
  BarChart3,
  Bell,
  Bot,
  ChevronRight,
  Compass,
  CreditCard,
  Crown,
  Hotel,
  Landmark,
  LayoutGrid,
  Plane,
  PlaneTakeoff,
  Plus,
  Radar,
  Send,
  Settings,
  Shield,
  UserCircle,
  UtensilsCrossed,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { Itinerary } from '@/lib/types/itinerary';
import { itinerarySchema } from '@/lib/types/itinerary';

const USER_AVATAR =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAY1f4voJura_4QT6uFG36VKeOxxEFTPgk9SIJG5SLiLz4mSlL3s__8iX1WLU-t-FzIC52OJtcokCWu1eIjvveVmXeImFiAKczjvtnIEHu14jY6kwwxDtHGTG19s4Jp9WLYwJ-pLN6oo5xKzyRWnV7-XHzF8EfYEES-dQ3-w1bTZUjfoy7-Hko3uGnK_8Z8du14k-ePf6VnsvtSDVdcTWU1eQJU1fb0VPFK7spKvqO7rWoyRzJeMVAsAlLgspk9UerYkBrJLI4x-Fg';

const MATCH_STADIUM_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDLTSh_KTfytXU6nYhtIQzOZRX8UCYUTpOTyNQ9BHMe7AAJJpxdfVWxIUGhwFKQWBDYp9KOVaOuT_j-MvAGtrdiLLu870p9jMAQupqYRYSe4XlHR9MUl-WwIQ_He4UEbnO-N1168OZrKEB8v_ydMSvLxrF4WXJUWY0-hIc906p8BdIs5GOyXuC0JyRjk9ebdgZEatVvf8cWEbSX-sYtVBXqFrbEahw4pvDZUlTnyoxzXpcmUk7usnaCHHtngIkGkX5qByauvBH8Wbs';

function formatMessageTime(d: Date) {
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function newId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now());
}

type ChatMessage =
  | { id: string; role: 'ai'; kind: 'text'; body: string; time: string }
  | { id: string; role: 'user'; body: string; time: string }
  | { id: string; role: 'ai'; kind: 'cards'; time: string };

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: '1',
    role: 'ai',
    kind: 'text',
    time: '',
    body: "Hi! I'm FanBuddy — tell me your home city and favorite club, and I'll run a mock trip plan (flights, stay, and kickoff buffers) through our AI engine.",
  },
];

function chatToApiMessages(chat: ChatMessage[]): {
  role: 'user' | 'assistant';
  content: string;
}[] {
  const out: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of chat) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.body });
    } else if (m.kind === 'text') {
      out.push({ role: 'assistant', content: m.body });
    }
  }
  return out;
}

function formatItineraryTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function AiAvatar() {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-landing-primary-container/30">
      <Bot className="size-5 text-landing-primary" strokeWidth={2} />
    </div>
  );
}

function RichCardsBlock({ time }: { time: string }) {
  return (
    <div className="flex max-w-[90%] gap-4">
      <AiAvatar />
      <div className="flex-1 space-y-4">
        <div className="rounded-2xl rounded-tl-none bg-landing-container-low p-4 text-landing-on-surface">
          Great choice. Here is the highlight fixture for your trip:
        </div>
        <div className="glass-panel max-w-sm overflow-hidden rounded-2xl p-0 shadow-sm">
          <div className="relative h-24">
            <Image
              src={MATCH_STADIUM_IMAGE}
              alt="Estadio iluminado por la noche con aficionados"
              fill
              className="object-cover"
              sizes="320px"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-landing-on-surface/80 to-transparent" />
            <div className="absolute bottom-3 left-4 text-white">
              <p className="text-[10px] uppercase tracking-widest opacity-80">
                La Liga • Matchday 32
              </p>
            </div>
          </div>
          <div className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-center">
                <div className="mx-auto mb-1 flex h-10 w-10 items-center justify-center">
                  <Shield
                    className="size-8 text-landing-on-surface"
                    strokeWidth={2}
                  />
                </div>
                <p className="text-[10px] font-bold">REAL MADRID</p>
              </div>
              <div className="font-headline font-bold text-landing-on-surface-variant">
                VS
              </div>
              <div className="text-center">
                <div className="mx-auto mb-1 flex h-10 w-10 items-center justify-center">
                  <Shield
                    className="size-8 text-landing-on-surface"
                    strokeWidth={2}
                  />
                </div>
                <p className="text-[10px] font-bold">BARCELONA</p>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-landing-outline-variant/15 pt-4">
              <div>
                <p className="text-xs text-landing-on-surface-variant">
                  Starting from
                </p>
                <p className="font-headline text-lg font-extrabold text-landing-primary">
                  245 EUR
                </p>
              </div>
              <button
                type="button"
                className="flex items-center gap-2 rounded-lg bg-landing-on-surface px-4 py-2 text-xs font-bold text-white transition-transform active:scale-95"
              >
                Add to Trip <Plus className="size-4" strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>
        <div className="max-w-sm rounded-2xl border border-landing-outline-variant/10 bg-landing-container-lowest p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-landing-surface p-2">
                <PlaneTakeoff
                  className="size-5 text-landing-primary"
                  strokeWidth={2}
                />
              </div>
              <div>
                <h4 className="text-sm font-bold">London to Madrid</h4>
                <p className="text-[10px] text-landing-on-surface-variant">
                  Direct • British Airways
                </p>
              </div>
            </div>
            <span className="rounded-full bg-landing-primary-container/30 px-2 py-1 text-[10px] font-bold uppercase tracking-tighter text-landing-primary">
              Best Value
            </span>
          </div>
          <div className="flex items-end justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium">Apr 21 - Apr 24</p>
              <p className="font-headline text-lg font-black">120 EUR</p>
            </div>
            <button
              type="button"
              className="flex items-center gap-1 text-xs font-bold text-landing-primary hover:underline"
            >
              Select Flight <ChevronRight className="size-4" strokeWidth={2} />
            </button>
          </div>
        </div>
        <span className="ml-1 text-[10px] text-landing-on-surface-variant/60">
          {time}
        </span>
      </div>
    </div>
  );
}

const QUICK_CHIPS: { label: string; text: string; icon: typeof Plane }[] = [
  { label: 'Find Flights', text: 'Find flights for my trip.', icon: Plane },
  {
    label: 'Best Hotels',
    text: 'Show me the best hotels near the stadium.',
    icon: Hotel,
  },
  {
    label: 'Ticket Alert',
    text: 'Set up a ticket alert for this match.',
    icon: Bell,
  },
  {
    label: 'Local Eats',
    text: 'Recommend local restaurants near the ground.',
    icon: UtensilsCrossed,
  },
];

export function PlanningChat() {
  const [items, setItems] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [draft, setDraft] = useState('');
  const [liveItinerary, setLiveItinerary] = useState<Itinerary | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const skipInitialScrollRef = useRef(true);

  const userPreferences = useMemo(
    () => ({ originCity: 'London', favoriteTeam: 'Real Madrid' }),
    [],
  );

  useLayoutEffect(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    if (skipInitialScrollRef.current) {
      skipInitialScrollRef.current = false;
      return;
    }
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [items]);

  const runPlanningGraph = useCallback(
    async (conversation: ChatMessage[]) => {
      const messages = chatToApiMessages(conversation);
      if (
        messages.length === 0 ||
        messages[messages.length - 1]?.role !== 'user'
      ) {
        return;
      }
      setChatBusy(true);
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages,
            user_preferences: userPreferences,
          }),
        });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText || `HTTP ${res.status}`);
        }
        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');
        const decoder = new TextDecoder();
        let buffer = '';
        let lastAssistantContent: string | null = null;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.trim()) continue;
            const evt = JSON.parse(line) as
              | { type: 'state'; data: { itinerary?: unknown } }
              | {
                  type: 'done';
                  itinerary: unknown;
                  messages?: { role: string; content: string }[];
                }
              | { type: 'error'; message: string };
            if (evt.type === 'state' && evt.data?.itinerary) {
              const parsed = itinerarySchema.safeParse(evt.data.itinerary);
              if (parsed.success) setLiveItinerary(parsed.data);
            }
            if (evt.type === 'done') {
              if (evt.itinerary) {
                const parsed = itinerarySchema.safeParse(evt.itinerary);
                if (parsed.success) setLiveItinerary(parsed.data);
              }
              const lastAi = [...(evt.messages ?? [])]
                .reverse()
                .find((m) => m.role === 'assistant');
              if (lastAi?.content) lastAssistantContent = lastAi.content;
            }
            if (evt.type === 'error') {
              throw new Error(evt.message);
            }
          }
        }
        const summary =
          lastAssistantContent?.split('\n\n')[0]?.trim() ??
          'Trip planner finished.';
        setItems((prev) => [
          ...prev,
          {
            id: newId(),
            role: 'ai',
            kind: 'text',
            time: formatMessageTime(new Date()),
            body: summary,
          },
        ]);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Something went wrong.';
        setItems((prev) => [
          ...prev,
          {
            id: newId(),
            role: 'ai',
            kind: 'text',
            time: formatMessageTime(new Date()),
            body: `Sorry — ${msg}`,
          },
        ]);
      } finally {
        setChatBusy(false);
      }
    },
    [userPreferences],
  );

  const sendChipAndPlan = useCallback(
    (text: string) => {
      if (chatBusy) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      const nextConversation: ChatMessage[] = [
        ...items,
        {
          id: newId(),
          role: 'user',
          body: trimmed,
          time: formatMessageTime(new Date()),
        },
      ];
      setItems(nextConversation);
      void runPlanningGraph(nextConversation);
    },
    [items, chatBusy, runPlanningGraph],
  );

  function shortTripLabel(it: Itinerary | null) {
    if (!it) return 'Madrid';
    const v = it.main_event.venue.toLowerCase();
    if (v.includes('bernabéu') || v.includes('bernabeu')) return 'Madrid';
    if (v.includes('emirates')) return 'London';
    if (v.includes('camp nou')) return 'Barcelona';
    return it.main_event.venue;
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || chatBusy) return;
    const nextConversation: ChatMessage[] = [
      ...items,
      {
        id: newId(),
        role: 'user',
        body: trimmed,
        time: formatMessageTime(new Date()),
      },
    ];
    setItems(nextConversation);
    setDraft('');
    void runPlanningGraph(nextConversation);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const trimmed = draft.trim();
      if (!trimmed || chatBusy) return;
      const nextConversation: ChatMessage[] = [
        ...items,
        {
          id: newId(),
          role: 'user',
          body: trimmed,
          time: formatMessageTime(new Date()),
        },
      ];
      setItems(nextConversation);
      setDraft('');
      void runPlanningGraph(nextConversation);
    }
  }

  return (
    <div className="min-h-screen bg-landing-surface text-landing-on-surface">
      <header className="fixed top-0 z-50 flex h-16 w-full items-center justify-between bg-[#f6f6f6]/70 px-6 backdrop-blur-xl md:hidden">
        <h1 className="font-headline text-2xl font-black italic tracking-tighter text-emerald-600">
          FanBuddy.AI
        </h1>
        <div className="flex gap-4">
          <button
            type="button"
            className="text-landing-on-surface-variant"
            aria-label="Account"
          >
            <UserCircle className="size-6" strokeWidth={2} />
          </button>
          <button
            type="button"
            className="text-landing-on-surface-variant"
            aria-label="Settings"
          >
            <Settings className="size-6" strokeWidth={2} />
          </button>
        </div>
      </header>

      <div className="flex h-screen overflow-hidden pt-16 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pt-0 md:pb-0">
        <aside className="fixed left-0 top-0 z-50 hidden h-screen w-64 flex-col border-r border-zinc-100 bg-zinc-50 md:flex">
          <div className="mb-8 px-4 py-6 font-headline text-xl font-black italic tracking-tighter text-emerald-600">
            FanBuddy.AI
          </div>
          <div className="-mt-6 mb-8 px-6">
            <p className="text-xs font-medium tracking-wide text-zinc-500">
              The Digital Pitch
            </p>
          </div>
          <nav className="flex flex-col gap-2" aria-label="Main">
            <Link
              href="/"
              className="mx-2 my-1 flex items-center gap-3 rounded-lg px-4 py-3 font-headline text-sm font-semibold text-zinc-600 transition-all duration-300 hover:bg-zinc-200/50"
            >
              <LayoutGrid className="size-5 shrink-0" strokeWidth={2} />
              Hub
            </Link>
            <a
              href="#"
              className="mx-2 my-1 flex items-center gap-3 rounded-lg px-4 py-3 font-headline text-sm font-semibold text-zinc-600 transition-all duration-300 hover:bg-zinc-200/50"
            >
              <Radar className="size-5 shrink-0" strokeWidth={2} />
              Radar
            </a>
            <Link
              href="/chat"
              className="mx-2 my-1 flex items-center gap-3 rounded-lg bg-emerald-600 px-4 py-3 font-headline text-sm font-semibold text-white shadow-lg shadow-emerald-600/20"
            >
              <Compass className="size-5 shrink-0" strokeWidth={2} />
              Voyage Mode
            </Link>
            <a
              href="#"
              className="mx-2 my-1 flex items-center gap-3 rounded-lg px-4 py-3 font-headline text-sm font-semibold text-zinc-600 transition-all duration-300 hover:bg-zinc-200/50"
            >
              <Crown className="size-5 shrink-0" strokeWidth={2} />
              Subscription
            </a>
          </nav>
          <div className="mt-auto px-4 pb-8">
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-pitch-gradient py-3 font-headline font-bold text-white shadow-lg shadow-emerald-600/20 transition-transform active:scale-95"
            >
              <Plus className="size-5" strokeWidth={2} />
              New Trip
            </button>
          </div>
        </aside>

        <main className="relative flex flex-1 flex-col md:ml-64">
          <div className="flex flex-1 overflow-hidden">
            <section className="relative flex flex-1 flex-col bg-white">
              <div className="flex items-center justify-between border-b border-landing-outline-variant/10 px-4 py-5 sm:px-8 sm:py-6">
                <div>
                  <h2 className="font-headline text-lg font-bold tracking-tight sm:text-xl">
                    Trip Planner: {shortTripLabel(liveItinerary)}
                  </h2>
                  <p className="text-[10px] uppercase tracking-wider text-landing-on-surface-variant">
                    {chatBusy ? 'Planning…' : 'AI Assistant Online'}
                  </p>
                </div>
                <div className="flex -space-x-2">
                  <Image
                    src={USER_AVATAR}
                    alt="User avatar"
                    width={32}
                    height={32}
                    className="h-8 w-8 rounded-full border-2 border-white object-cover"
                  />
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-landing-primary-container">
                    <Bot
                      className="size-4 text-landing-primary"
                      strokeWidth={2}
                    />
                  </div>
                </div>
              </div>

              <div
                ref={scrollAreaRef}
                className="no-scrollbar flex flex-1 flex-col space-y-8 overflow-y-auto p-4 sm:p-8"
              >
                {items.map((m) => {
                  if (m.role === 'user') {
                    return (
                      <div
                        key={m.id}
                        className="flex flex-col items-end space-y-3"
                      >
                        <div className="max-w-[80%] rounded-2xl rounded-tr-none bg-landing-primary p-4 text-white shadow-sm">
                          {m.body}
                        </div>
                        {m.time ? (
                          <span className="mr-1 text-[10px] text-landing-on-surface-variant/60">
                            {m.time}
                          </span>
                        ) : null}
                      </div>
                    );
                  }
                  if (m.kind === 'text') {
                    return (
                      <div key={m.id} className="flex max-w-[85%] gap-4">
                        <AiAvatar />
                        <div className="space-y-3">
                          <div className="rounded-2xl rounded-tl-none bg-landing-container-low p-4 leading-relaxed text-landing-on-surface">
                            {m.body}
                          </div>
                          {m.time ? (
                            <span className="ml-1 text-[10px] text-landing-on-surface-variant/60">
                              {m.time}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  }
                  return <RichCardsBlock key={m.id} time={m.time} />;
                })}
              </div>

              <div className="bg-white p-4 sm:p-6">
                <div className="mx-auto max-w-4xl space-y-4">
                  <div className="no-scrollbar flex gap-2 overflow-x-auto pb-2">
                    {QUICK_CHIPS.map((c) => {
                      const Icon = c.icon;
                      return (
                        <button
                          key={c.label}
                          type="button"
                          onClick={() => sendChipAndPlan(c.text)}
                          disabled={chatBusy}
                          className="flex shrink-0 items-center gap-2 rounded-full bg-landing-container-low px-4 py-2 text-xs font-medium text-landing-on-surface-variant transition-colors hover:bg-landing-container disabled:opacity-50"
                        >
                          <Icon className="size-4 shrink-0" strokeWidth={2} />
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                  <form onSubmit={handleSubmit}>
                    <div className="relative flex items-center">
                      <input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="w-full rounded-2xl border-none bg-landing-container-low py-4 pl-6 pr-16 text-sm text-landing-on-surface placeholder:text-landing-on-surface-variant/70 focus:outline-none focus:ring-2 focus:ring-landing-primary/20 disabled:opacity-60"
                        placeholder="Ask FanBuddy anything about your trip..."
                        type="text"
                        autoComplete="off"
                        aria-label="Message"
                        disabled={chatBusy}
                      />
                      <button
                        type="submit"
                        disabled={chatBusy}
                        className="absolute right-3 rounded-xl bg-pitch-gradient p-2 text-white shadow-md transition-all hover:opacity-90 active:scale-90 disabled:opacity-50"
                        aria-label="Send"
                      >
                        <Send className="size-5" strokeWidth={2} />
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </section>

            <aside
              className="hidden w-80 flex-col border-l border-landing-outline-variant/10 bg-landing-container-low p-8 lg:flex"
              aria-label="Live itinerary"
            >
              <h3 className="mb-8 font-headline text-lg font-bold tracking-tight">
                Live Itinerary
              </h3>
              {liveItinerary?.planning_failed ? (
                <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                  Provisional plan — validation:{' '}
                  {(liveItinerary.validation_errors ?? []).join(' · ') ||
                    'see chat'}
                </p>
              ) : null}
              <div className="relative space-y-10">
                <div className="absolute bottom-2 left-[11px] top-2 w-0.5 bg-landing-outline-variant/20" />
                <div className="relative flex gap-4">
                  <div className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-landing-primary">
                    <Plane
                      className="size-3.5 text-white"
                      strokeWidth={2}
                      fill="currentColor"
                    />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-landing-primary">
                      Flight Outbound
                    </h4>
                    <p className="mt-1 text-sm font-semibold">
                      {liveItinerary?.flight_outbound.label ?? '—'}
                    </p>
                    <p className="mt-0.5 text-[10px] text-landing-on-surface-variant">
                      {liveItinerary
                        ? formatItineraryTime(
                            liveItinerary.flight_outbound.depart_iso,
                          )
                        : 'Send a message to plan'}
                    </p>
                  </div>
                </div>
                <div className="relative flex gap-4">
                  <div className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-landing-outline-variant/30 bg-landing-container-highest">
                    <Hotel
                      className="size-3.5 text-landing-on-surface-variant"
                      strokeWidth={2}
                    />
                  </div>
                  <div className={liveItinerary ? '' : 'opacity-60'}>
                    <h4 className="text-xs font-bold uppercase tracking-wider">
                      Accommodation
                    </h4>
                    <p className="mt-1 text-sm font-semibold">
                      {liveItinerary?.accommodation.name ?? '—'}
                    </p>
                    <p className="mt-0.5 text-[10px] text-landing-on-surface-variant">
                      {liveItinerary
                        ? `${liveItinerary.accommodation.nights} Nights • ${liveItinerary.accommodation.status_label}`
                        : '—'}
                    </p>
                  </div>
                </div>
                <div className="relative flex gap-4">
                  <div className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-landing-outline-variant/30 bg-landing-container-highest">
                    <Landmark
                      className="size-3.5 text-landing-on-surface-variant"
                      strokeWidth={2}
                    />
                  </div>
                  <div className={liveItinerary ? '' : 'opacity-60'}>
                    <h4 className="text-xs font-bold uppercase tracking-wider">
                      Main Event
                    </h4>
                    <p className="mt-1 text-sm font-semibold">
                      {liveItinerary?.main_event.venue ?? '—'}
                    </p>
                    <p className="mt-0.5 text-[10px] text-landing-on-surface-variant">
                      {liveItinerary
                        ? `Kickoff: ${formatItineraryTime(liveItinerary.main_event.kickoff_iso)} · ${liveItinerary.status}`
                        : '—'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-auto rounded-2xl border border-landing-outline-variant/5 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h4 className="text-xs font-bold text-landing-on-surface-variant">
                    ESTIMATED COST
                  </h4>
                  <BarChart3
                    className="size-4 text-landing-primary"
                    strokeWidth={2}
                  />
                </div>
                <div className="mb-6 space-y-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-landing-on-surface-variant">
                      Flights
                    </span>
                    <span className="font-medium">
                      {liveItinerary
                        ? `${liveItinerary.costs.flights_eur} EUR`
                        : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-landing-on-surface-variant">
                      Match Tickets
                    </span>
                    <span className="font-medium">
                      {liveItinerary
                        ? `${liveItinerary.costs.match_tickets_eur} EUR`
                        : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-landing-on-surface-variant">
                      Stay (Avg)
                    </span>
                    <span className="font-medium">
                      {liveItinerary
                        ? `${liveItinerary.costs.stay_eur} EUR`
                        : '—'}
                    </span>
                  </div>
                </div>
                <div className="flex items-end justify-between border-t border-landing-outline-variant/10 pt-4">
                  <div>
                    <p className="text-[10px] text-landing-on-surface-variant">
                      TOTAL
                    </p>
                    <p className="font-headline text-2xl font-black text-landing-on-surface">
                      {liveItinerary
                        ? `${liveItinerary.costs.total_eur} EUR`
                        : '—'}
                    </p>
                  </div>
                  <div className="rounded-lg bg-landing-primary p-1 text-landing-primary-container">
                    <CreditCard className="size-5" strokeWidth={2} />
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </main>
      </div>

      <nav
        className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around border-t border-landing-outline-variant/15 bg-white/80 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_40px_rgba(45,47,47,0.06)] backdrop-blur-md md:hidden"
        aria-label="Mobile"
      >
        <Link
          href="/"
          className="flex flex-col items-center justify-center p-2 text-landing-on-surface/50"
        >
          <LayoutGrid className="size-6" strokeWidth={2} />
          <span className="mt-1 text-[10px] font-bold uppercase tracking-widest">
            Hub
          </span>
        </Link>
        <a
          href="#"
          className="flex flex-col items-center justify-center p-2 text-landing-on-surface/50"
        >
          <Radar className="size-6" strokeWidth={2} />
          <span className="mt-1 text-[10px] font-bold uppercase tracking-widest">
            Radar
          </span>
        </a>
        <Link
          href="/chat"
          className="flex flex-col items-center justify-center rounded-xl bg-emerald-100 p-2 px-4 text-emerald-700"
        >
          <Compass className="size-6" strokeWidth={2} fill="currentColor" />
          <span className="mt-1 text-[10px] font-bold uppercase tracking-widest">
            Voyage
          </span>
        </Link>
        <a
          href="#"
          className="flex flex-col items-center justify-center p-2 text-landing-on-surface/50"
        >
          <Crown className="size-6" strokeWidth={2} />
          <span className="mt-1 text-[10px] font-bold uppercase tracking-widest">
            Plans
          </span>
        </a>
      </nav>
    </div>
  );
}
