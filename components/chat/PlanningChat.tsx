'use client';

import {
  BarChart3,
  Bell,
  Bot,
  Check,
  ChevronRight,
  Compass,
  CreditCard,
  Crown,
  Hotel,
  Landmark,
  LayoutGrid,
  MapPin,
  Plane,
  PlaneTakeoff,
  Plus,
  Radar,
  Send,
  Settings,
  Shield,
  UtensilsCrossed,
} from 'lucide-react';
import { UserButton } from '@clerk/nextjs';
import Image from 'next/image';
import Link from 'next/link';
import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import type { ActivitiesData, ChatStreamEvent, FixtureSummary, FormattedItinerary, FreeTierLinks } from '@/lib/langchain/types';

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
  | { id: string; role: 'ai'; kind: 'cards'; time: string; itinerary: FormattedItinerary | null }
  | { id: string; role: 'ai'; kind: 'links'; time: string; body: string; links: FreeTierLinks }
  | { id: string; role: 'ai'; kind: 'fixtures'; time: string; body: string; fixtures: FixtureSummary[] }
  | { id: string; role: 'ai'; kind: 'upgrade'; time: string };

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: '1',
    role: 'ai',
    kind: 'text',
    time: formatMessageTime(new Date()),
    body: "Hi! I'm FanBuddy, your football travel assistant. Which team would you like to watch?",
  },
];

function renderMarkdown(text: string) {
  // Split on **bold** segments and render inline
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-landing-on-surface">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function AiAvatar() {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-landing-primary-container/30">
      <Bot className="size-5 text-landing-primary" strokeWidth={2} />
    </div>
  );
}

function formatDate(isoUtc: string) {
  try {
    return new Date(isoUtc).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return isoUtc;
  }
}

function LinksBlock({
  time,
  body,
  links,
}: {
  time: string;
  body: string;
  links: FreeTierLinks;
}) {
  return (
    <div className="flex max-w-[90%] gap-4">
      <AiAvatar />
      <div className="flex-1 space-y-4">
        <div className="rounded-2xl rounded-tl-none bg-landing-container-low px-5 py-4 text-[15px] leading-[1.65] text-landing-on-surface/80">
          {renderMarkdown(body)}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <a
            href={links.transportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl bg-landing-primary px-5 py-3 text-sm font-bold text-white shadow-md transition-transform hover:opacity-90 active:scale-95"
          >
            <Plane className="size-4 shrink-0" strokeWidth={2} />
            Search Transport
          </a>
          <a
            href={links.accommodationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl border border-landing-primary px-5 py-3 text-sm font-bold text-landing-primary transition-transform hover:bg-landing-primary/5 active:scale-95"
          >
            <Hotel className="size-4 shrink-0" strokeWidth={2} />
            Search Accommodation
          </a>
        </div>
        <span className="ml-1 text-[10px] text-landing-on-surface-variant/60">{time}</span>
      </div>
    </div>
  );
}

function FixtureCardsBlock({
  time,
  body,
  fixtures,
  onSelect,
}: {
  time: string;
  body: string;
  fixtures: FixtureSummary[];
  onSelect: (n: number) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  function handleSelect(n: number) {
    setSelected(n);
    onSelect(n);
  }

  return (
    <div className="flex max-w-[90%] gap-4">
      <AiAvatar />
      <div className="flex-1 space-y-4">
        <div className="rounded-2xl rounded-tl-none bg-landing-container-low p-4 leading-relaxed text-landing-on-surface">
          Here are the next upcoming fixtures — tap a match to plan your trip:
        </div>
        <div className="flex flex-col gap-3">
          {fixtures.map((f, i) => {
            const parsed = new Date(f.kickoffUtc);
            const dateStr = isNaN(parsed.getTime())
              ? f.kickoffUtc
              : parsed.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
            const timeStr = isNaN(parsed.getTime())
              ? ''
              : parsed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
            const isSelected = selected === i + 1;
            const isDimmed = selected !== null && !isSelected;
            return (
              <button
                key={i}
                type="button"
                disabled={selected !== null}
                onClick={() => handleSelect(i + 1)}
                className={[
                  'group relative flex items-center gap-4 rounded-2xl border px-4 py-3.5 text-left shadow-sm transition-all duration-200',
                  isSelected
                    ? 'border-landing-primary bg-landing-primary/5 shadow-md'
                    : isDimmed
                      ? 'border-landing-outline-variant/10 bg-white/50 opacity-40'
                      : 'border-landing-outline-variant/15 bg-white hover:border-landing-primary/30 hover:shadow-md active:scale-[0.98]',
                ].join(' ')}
              >
                <span className={[
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-headline text-sm font-black transition-colors',
                  isSelected
                    ? 'bg-landing-primary text-white'
                    : 'bg-landing-primary/10 text-landing-primary group-hover:bg-landing-primary group-hover:text-white',
                ].join(' ')}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-bold text-landing-on-surface">
                    {f.homeTeam} <span className="font-normal text-landing-on-surface-variant">vs</span> {f.awayTeam}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-landing-primary/70">
                      {f.competition}
                    </span>
                    {f.venue && (
                      <>
                        <span className="text-landing-outline-variant/40">·</span>
                        <span className="truncate text-[10px] text-landing-on-surface-variant">{f.venue}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-semibold text-landing-on-surface">{dateStr}</p>
                  {timeStr && <p className="text-[10px] text-landing-on-surface-variant">{timeStr} UTC</p>}
                </div>
                {isSelected
                  ? <Check className="size-4 shrink-0 text-landing-primary" strokeWidth={2.5} />
                  : <ChevronRight className="size-4 shrink-0 text-landing-on-surface-variant/40 transition-colors group-hover:text-landing-primary" strokeWidth={2} />
                }
              </button>
            );
          })}
        </div>
        <span className="ml-1 text-[10px] text-landing-on-surface-variant/60">{time}</span>
      </div>
    </div>
  );
}

function RichCardsBlock({
  time,
  itinerary,
}: {
  time: string;
  itinerary: FormattedItinerary;
}) {
  const homeTeam = itinerary.match.homeTeam;
  const awayTeam = itinerary.match.awayTeam;
  const league = itinerary.match.league;
  const matchday = itinerary.match.matchday;
  const ticketPrice = itinerary.match.ticketPriceEur;
  const isProvisional = itinerary.validationStatus === 'PROVISIONAL';

  const outbound = itinerary.flight.outbound;
  const inbound = itinerary.flight.inbound;
  const flightLabel = `${outbound.origin} → ${outbound.destination}`;
  const airline = outbound.airline;
  const direct = outbound.direct;
  const flightDates = `${formatDate(outbound.departureUtc)} – ${formatDate(inbound.departureUtc)}`;
  const flightTotal = itinerary.flight.totalPriceEur;

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
            <div className="absolute bottom-3 left-4 flex items-center gap-2 text-white">
              <p className="text-[10px] uppercase tracking-widest opacity-80">
                {league} • {matchday}
              </p>
              {isProvisional && (
                <span className="rounded-full bg-amber-400/90 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-900">
                  PROVISIONAL
                </span>
              )}
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
                <p className="text-[10px] font-bold">{homeTeam}</p>
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
                <p className="text-[10px] font-bold">{awayTeam}</p>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-landing-outline-variant/15 pt-4">
              <div>
                <p className="text-xs text-landing-on-surface-variant">
                  Starting from
                </p>
                <p className="font-headline text-lg font-extrabold text-landing-primary">
                  {ticketPrice} EUR
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
                <h4 className="text-sm font-bold">{flightLabel}</h4>
                <p className="text-[10px] text-landing-on-surface-variant">
                  {direct ? 'Direct' : 'Connecting'} • {airline}
                </p>
              </div>
            </div>
            <span className="rounded-full bg-landing-primary-container/30 px-2 py-1 text-[10px] font-bold uppercase tracking-tighter text-landing-primary">
              Best Value
            </span>
          </div>
          <div className="flex items-end justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium">{flightDates}</p>
              <p className="font-headline text-lg font-black">{flightTotal} EUR</p>
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

const CATEGORY_EMOJI: Record<string, string> = {
  football: '⚽',
  culture: '🏛️',
  food: '🍽️',
  sightseeing: '🗺️',
};

const DAY_DOT_COLOR: Record<string, string> = {
  arrival: 'bg-emerald-500',
  match: 'bg-amber-400',
  departure: 'bg-indigo-500',
};

const CATEGORY_BADGE_COLOR: Record<string, string> = {
  football: 'text-emerald-600',
  culture: 'text-violet-600',
  food: 'text-orange-500',
  sightseeing: 'text-sky-600',
};

function sumDurationMinutes(durations: string[]): number {
  return durations.reduce((sum, d) => {
    const m = d.match(/(\d+(?:\.\d+)?)\s*(hour|hr|minute|min)/i);
    if (!m) return sum;
    const val = parseFloat(m[1]);
    return sum + (m[2].toLowerCase().startsWith('h') ? val * 60 : val);
  }, 0);
}

function formatTotalHours(minutes: number): string {
  const h = minutes / 60;
  return h < 1 ? `${Math.round(minutes)}m` : `~${h % 1 === 0 ? h : h.toFixed(1)}h`;
}

function ActivitiesAccordion({ activities }: { activities: ActivitiesData }) {
  const defaultOpen =
    activities.days.find((d) => d.day === 'arrival')?.day ??
    activities.days[0]?.day ??
    '';
  const [openDay, setOpenDay] = useState<string>(defaultOpen);

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center gap-2">
        <MapPin className="size-4 text-landing-primary" strokeWidth={2} />
        <h4 className="text-xs font-bold uppercase tracking-wider text-landing-on-surface-variant">
          Activities
        </h4>
      </div>
      <div className="flex flex-col gap-2">
        {activities.days.map((d) => {
          const isOpen = openDay === d.day;
          const totalMins = sumDurationMinutes(d.activities.map((a) => a.estimatedDuration));
          return (
            <div
              key={d.day}
              className="overflow-hidden rounded-xl border border-landing-outline-variant/15"
            >
              <button
                type="button"
                onClick={() => setOpenDay(isOpen ? '' : d.day)}
                className="flex w-full items-center justify-between bg-white px-3 py-2.5 text-left"
              >
                <div className="flex items-center gap-2">
                  <div className={`h-1.5 w-1.5 rounded-full ${DAY_DOT_COLOR[d.day] ?? 'bg-zinc-400'}`} />
                  <span className="text-[11px] font-bold text-landing-on-surface">{d.label}</span>
                </div>
                <span className="text-[10px] text-landing-on-surface-variant">
                  {d.activities.length} items · {formatTotalHours(totalMins)}
                </span>
              </button>
              {isOpen && (
                <div className="border-t border-landing-outline-variant/10 bg-landing-container-lowest px-3 py-2">
                  {d.activities.map((a, i) => (
                    <div
                      key={a.name}
                      className={`flex gap-2 py-2 ${i < d.activities.length - 1 ? 'border-b border-landing-outline-variant/10' : ''}`}
                    >
                      <span className="shrink-0 text-sm">
                        {CATEGORY_EMOJI[a.category] ?? '📍'}
                      </span>
                      <div>
                        <div className="flex items-baseline gap-2">
                          <p className="text-[11px] font-semibold text-landing-on-surface">{a.name}</p>
                          {a.recommendedTime && (
                            <span className="text-[9px] text-landing-on-surface-variant/80">{a.recommendedTime}</span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[10px] text-landing-on-surface-variant">
                          {a.description}
                        </p>
                        {a.tip && (
                          <p className="mt-0.5 text-[10px] italic text-landing-on-surface-variant/70">
                            {a.tip}
                          </p>
                        )}
                        <span className={`mt-1 inline-block text-[9px] font-semibold ${CATEGORY_BADGE_COLOR[a.category] ?? 'text-emerald-600'}`}>
                          {a.estimatedDuration}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
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
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('FanBuddy is planning your trip...');
  const [currentItinerary, setCurrentItinerary] = useState<FormattedItinerary | null>(null);
  const [currentActivities, setCurrentActivities] = useState<ActivitiesData | null>(null);
  // Stable thread_id for this session — enables conversation memory across messages
  const [threadId] = useState(() => crypto.randomUUID());
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const skipInitialScrollRef = useRef(true);

  useLayoutEffect(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    if (skipInitialScrollRef.current) {
      skipInitialScrollRef.current = false;
      return;
    }
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [items, isLoading]);

  const pushUserMessage = useCallback((text: string) => {
    setItems((prev) => [
      ...prev,
      {
        id: newId(),
        role: 'user',
        body: text,
        time: formatMessageTime(new Date()),
      },
    ]);
  }, []);

  const pushAiText = useCallback((body: string) => {
    setItems((prev) => [
      ...prev,
      {
        id: newId(),
        role: 'ai',
        kind: 'text',
        body,
        time: formatMessageTime(new Date()),
      },
    ]);
  }, []);

  const pushAiCards = useCallback((itinerary: FormattedItinerary) => {
    setItems((prev) => [
      ...prev,
      {
        id: newId(),
        role: 'ai',
        kind: 'cards',
        time: formatMessageTime(new Date()),
        itinerary,
      },
    ]);
  }, []);

  const pushAiLinks = useCallback((body: string, links: FreeTierLinks) => {
    setItems((prev) => [
      ...prev,
      {
        id: newId(),
        role: 'ai',
        kind: 'links',
        body,
        time: formatMessageTime(new Date()),
        links,
      },
    ]);
  }, []);

  const pushAiFixtures = useCallback((body: string, fixtures: FixtureSummary[]) => {
    setItems((prev) => [
      ...prev,
      {
        id: newId(),
        role: 'ai',
        kind: 'fixtures',
        body,
        time: formatMessageTime(new Date()),
        fixtures,
      },
    ]);
  }, []);

  const pushUpgradePrompt = useCallback(() => {
    setItems((prev) => [
      ...prev,
      {
        id: newId(),
        role: 'ai' as const,
        kind: 'upgrade' as const,
        time: formatMessageTime(new Date()),
      },
    ]);
  }, []);

  const handleSendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      pushUserMessage(trimmed);
      setIsLoading(true);
      setLoadingMessage('Connecting...');

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            thread_id: threadId,
          }),
        });

        if (!res.ok) {
          if (res.status === 403) {
            const { error } = await res.json() as { error: string };
            if (error === 'phone_unverified') {
              pushAiText(
                'Please verify your phone number in your account settings to start planning trips.',
              );
            } else if (error === 'upgrade_required') {
              pushUpgradePrompt();
            } else {
              pushAiText('Access denied. Please try again.');
            }
            return;
          }
          throw new Error(`HTTP ${res.status}`);
        }
        if (!res.body) throw new Error('No response body');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          // Keep the last (potentially incomplete) line in the buffer
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6)) as ChatStreamEvent;

              if (event.type === 'status') {
                setLoadingMessage(event.message);
              } else if (event.type === 'done') {
                if (event.fixtures && event.fixtures.length > 0) {
                  pushAiFixtures(event.reply, event.fixtures);
                } else if (event.links) {
                  pushAiLinks(event.reply, event.links);
                } else {
                  pushAiText(event.reply);
                }
                if (event.itinerary) {
                  pushAiCards(event.itinerary);
                  setCurrentItinerary(event.itinerary);
                }
                if (event.activities) {
                  setCurrentActivities(event.activities);
                }
              } else if (event.type === 'error') {
                pushAiText(event.message);
              }
            } catch {
              // Ignore malformed SSE lines
            }
          }
        }
      } catch {
        pushAiText('Could not reach FanBuddy. Please check your connection and try again.');
      } finally {
        setIsLoading(false);
        setLoadingMessage('FanBuddy is planning your trip...');
      }
    },
    [isLoading, threadId, pushUserMessage, pushAiText, pushAiCards, pushAiLinks, pushAiFixtures, pushUpgradePrompt],
  );

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    handleSendMessage(draft);
    setDraft('');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(draft);
      setDraft('');
    }
  }

  return (
    <div className="min-h-screen bg-landing-surface text-landing-on-surface">
      <header className="fixed top-0 z-50 flex h-16 w-full items-center justify-between bg-[#f6f6f6]/70 px-6 backdrop-blur-xl md:hidden">
        <h1 className="font-headline text-2xl font-black italic tracking-tighter text-emerald-600">
          FanBuddy.AI
        </h1>
        <div className="flex gap-4">
          <UserButton
            appearance={{
              elements: {
                avatarBox: 'h-6 w-6 rounded-full',
              },
            }}
          />
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
              href="/hub"
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
          <div className="mt-auto px-4 pb-8 space-y-3">
            <button
              type="button"
              onClick={async () => {
                const res = await fetch('/api/stripe/checkout', { method: 'POST' });
                const { url } = await res.json() as { url: string };
                window.location.href = url;
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-600/30 bg-emerald-50 py-3 font-headline font-bold text-emerald-700 transition-all hover:bg-emerald-100 active:scale-95"
            >
              <Crown className="size-4 shrink-0" strokeWidth={2} />
              Upgrade to Pro
            </button>
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
                    {currentItinerary
                      ? `Trip Planner: ${currentItinerary.flight.outbound.destination}`
                      : 'Trip Planner'}
                  </h2>
                  <p className="text-[10px] uppercase tracking-wider text-landing-on-surface-variant">
                    AI Assistant Online
                  </p>
                </div>
                <div className="flex -space-x-2">
                  <UserButton
                    appearance={{
                      elements: {
                        avatarBox: 'h-8 w-8 rounded-full border-2 border-white',
                      },
                    }}
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
                        <div className="max-w-[80%] rounded-2xl rounded-tr-none bg-landing-primary px-5 py-4 text-[15px] leading-[1.65] text-white shadow-sm">
                          {m.body}
                        </div>
                        <span className="mr-1 text-[10px] text-landing-on-surface-variant/60">
                          {m.time}
                        </span>
                      </div>
                    );
                  }
                  if (m.kind === 'text') {
                    return (
                      <div key={m.id} className="flex max-w-[85%] gap-4">
                        <AiAvatar />
                        <div className="space-y-2">
                          <div className="rounded-2xl rounded-tl-none bg-landing-container-low px-5 py-4 text-[15px] leading-[1.65] text-landing-on-surface/80">
                            {renderMarkdown(m.body)}
                          </div>
                          <span className="ml-1 text-[10px] text-landing-on-surface-variant/50">
                            {m.time}
                          </span>
                        </div>
                      </div>
                    );
                  }
                  if (m.role === 'ai' && m.kind === 'fixtures') {
                    return (
                      <FixtureCardsBlock
                        key={m.id}
                        time={m.time}
                        body={m.body}
                        fixtures={m.fixtures}
                        onSelect={(n) => handleSendMessage(String(n))}
                      />
                    );
                  }
                  if (m.role === 'ai' && m.kind === 'links') {
                    return (
                      <LinksBlock
                        key={m.id}
                        time={m.time}
                        body={m.body}
                        links={m.links}
                      />
                    );
                  }
                  if (m.role === 'ai' && m.kind === 'upgrade') {
                    return (
                      <div key={m.id} className="flex max-w-[90%] gap-4">
                        <AiAvatar />
                        <div className="flex-1 space-y-4">
                          <div className="rounded-2xl rounded-tl-none bg-landing-container-low px-5 py-4 text-[15px] leading-[1.65] text-landing-on-surface/80">
                            You&apos;ve used your 3 free trips. Upgrade to{' '}
                            <strong className="font-semibold text-landing-on-surface">FanBuddy Pro</strong>{' '}
                            for real flight and hotel options with no limits.
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              const res = await fetch('/api/stripe/checkout', { method: 'POST' });
                              const { url } = await res.json() as { url: string };
                              window.location.href = url;
                            }}
                            className="flex items-center gap-2 rounded-xl bg-pitch-gradient px-5 py-3 text-sm font-bold text-white shadow-md transition-transform hover:opacity-90 active:scale-95"
                          >
                            <Crown className="size-4 shrink-0" strokeWidth={2} />
                            Upgrade to Pro
                          </button>
                          <span className="ml-1 text-[10px] text-landing-on-surface-variant/60">{m.time}</span>
                        </div>
                      </div>
                    );
                  }
                  if (!m.itinerary) return null;
                  return (
                    <RichCardsBlock
                      key={m.id}
                      time={m.time}
                      itinerary={m.itinerary}
                    />
                  );
                })}

                {isLoading && (
                  <div className="flex max-w-[85%] gap-4">
                    <AiAvatar />
                    <div className="rounded-2xl rounded-tl-none bg-landing-container-low px-5 py-4 text-sm text-landing-on-surface-variant animate-pulse">
                      {loadingMessage}
                    </div>
                  </div>
                )}
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
                          disabled={isLoading}
                          onClick={() => handleSendMessage(c.text)}
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
                        disabled={isLoading}
                        className="w-full rounded-2xl border-none bg-landing-container-low py-4 pl-6 pr-16 text-sm text-landing-on-surface placeholder:text-landing-on-surface-variant/70 focus:outline-none focus:ring-2 focus:ring-landing-primary/20 disabled:opacity-50"
                        placeholder="e.g. I'm from Berlin and want to watch Barcelona"
                        type="text"
                        autoComplete="off"
                        aria-label="Message"
                      />
                      <button
                        type="submit"
                        disabled={isLoading || !draft.trim()}
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

              {!currentItinerary && !currentActivities ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-landing-container-highest">
                    <Compass className="size-7 text-landing-on-surface-variant/40" strokeWidth={1.5} />
                  </div>
                  <p className="text-sm font-semibold text-landing-on-surface-variant">No trip planned yet</p>
                  <p className="text-xs text-landing-on-surface-variant/60">
                    Your itinerary will appear here once FanBuddy plans your trip.
                  </p>
                </div>
              ) : (
                <div className="no-scrollbar flex flex-1 flex-col overflow-y-auto">
                  {currentItinerary && (
                    <>
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
                              {currentItinerary.flight.outbound.origin} → {currentItinerary.flight.outbound.destination}
                            </p>
                            <p className="mt-0.5 text-[10px] text-landing-on-surface-variant">
                              {formatDate(currentItinerary.flight.outbound.departureUtc)}, {currentItinerary.flight.outbound.airline}
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
                          <div>
                            <h4 className="text-xs font-bold uppercase tracking-wider">
                              Accommodation
                            </h4>
                            <p className="mt-1 text-sm font-semibold">{currentItinerary.hotel.name}</p>
                            <p className="mt-0.5 text-[10px] text-landing-on-surface-variant">
                              {currentItinerary.hotel.nights} Nights •{' '}
                              {currentItinerary.hotel.wasDowngraded ? 'Downgraded' : 'Suggested'}
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
                          <div>
                            <h4 className="text-xs font-bold uppercase tracking-wider">
                              Main Event
                            </h4>
                            <p className="mt-1 text-sm font-semibold">{currentItinerary.match.venue}</p>
                            <p className="mt-0.5 text-[10px] text-landing-on-surface-variant">
                              Kickoff: {formatDate(currentItinerary.match.kickoffUtc)}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="mt-6 rounded-2xl border border-landing-outline-variant/5 bg-white p-6 shadow-sm">
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
                            <span className="text-landing-on-surface-variant">Flights</span>
                            <span className="font-medium">{currentItinerary.cost.flightsEur} EUR</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-landing-on-surface-variant">Match Tickets</span>
                            <span className="font-medium">{currentItinerary.cost.matchTicketEur} EUR</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-landing-on-surface-variant">Stay (Avg)</span>
                            <span className="font-medium">{currentItinerary.cost.stayEur} EUR</span>
                          </div>
                        </div>
                        <div className="flex items-end justify-between border-t border-landing-outline-variant/10 pt-4">
                          <div>
                            <p className="text-[10px] text-landing-on-surface-variant">TOTAL</p>
                            <p className="font-headline text-2xl font-black text-landing-on-surface">
                              {currentItinerary.cost.totalEur} EUR
                            </p>
                          </div>
                          <div className="rounded-lg bg-landing-primary p-1 text-landing-primary-container">
                            <CreditCard className="size-5" strokeWidth={2} />
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                  {currentActivities && (
                    <ActivitiesAccordion activities={currentActivities} />
                  )}
                </div>
              )}
            </aside>
          </div>
        </main>
      </div>

      <nav
        className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around border-t border-landing-outline-variant/15 bg-white/80 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_40px_rgba(45,47,47,0.06)] backdrop-blur-md md:hidden"
        aria-label="Mobile"
      >
        <Link
          href="/hub"
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
