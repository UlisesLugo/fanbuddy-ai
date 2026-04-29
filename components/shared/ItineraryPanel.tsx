'use client';

import { BarChart3, Compass, Hotel, Plane, Trophy } from 'lucide-react';
import { useState } from 'react';

import type { ActivitiesData, DayActivities, FormattedItinerary } from '@/lib/langchain/types';

function formatDate(isoUtc: string) {
  try {
    return new Date(isoUtc).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return isoUtc;
  }
}

const CATEGORY_EMOJI: Record<string, string> = {
  football: '⚽',
  culture: '🏛️',
  food: '🍽️',
  sightseeing: '🗺️',
};

const CATEGORY_PILL: Record<string, string> = {
  football: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  culture: 'bg-violet-50 text-violet-700 ring-violet-200',
  food: 'bg-orange-50 text-orange-700 ring-orange-200',
  sightseeing: 'bg-sky-50 text-sky-700 ring-sky-200',
};

const DAY_TAB_ACCENT: Record<string, string> = {
  arrival: 'data-[active=true]:bg-emerald-500 data-[active=true]:text-white data-[active=true]:shadow-emerald-200',
  match: 'data-[active=true]:bg-amber-400 data-[active=true]:text-amber-950 data-[active=true]:shadow-amber-100',
  departure: 'data-[active=true]:bg-indigo-500 data-[active=true]:text-white data-[active=true]:shadow-indigo-200',
};

function ActivitiesSection({ activities }: { activities: ActivitiesData }) {
  const [activeDay, setActiveDay] = useState<string>(activities.days[0]?.day ?? '');
  const day: DayActivities | undefined = activities.days.find((d) => d.day === activeDay);

  return (
    <div>
      <div className="mb-5 flex items-center gap-2">
        <p className="font-headline text-xs font-bold uppercase tracking-widest text-landing-on-surface-variant">
          Activities · {activities.city}
        </p>
      </div>

      {/* Day tabs */}
      <div className="mb-5 flex gap-2">
        {activities.days.map((d) => (
          <button
            key={d.day}
            type="button"
            data-active={activeDay === d.day}
            onClick={() => setActiveDay(d.day)}
            className={[
              'flex-1 rounded-xl px-3 py-2 text-left transition-all shadow-sm',
              DAY_TAB_ACCENT[d.day] ?? 'data-[active=true]:bg-landing-primary data-[active=true]:text-white',
              activeDay === d.day
                ? 'shadow-md'
                : 'bg-landing-container-low text-landing-on-surface-variant hover:bg-landing-container',
            ].join(' ')}
          >
            <p className="text-[11px] font-bold tracking-wide leading-tight">{d.label}</p>
            {d.date && (
              <p className={[
                'text-[9px] mt-0.5 font-medium',
                activeDay === d.day ? 'opacity-80' : 'text-landing-on-surface-variant/60',
              ].join(' ')}>
                {new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </p>
            )}
          </button>
        ))}
      </div>

      {/* Activity cards */}
      {day && (
        <div className="flex flex-col gap-2.5">
          {day.activities.map((a) => (
            <div
              key={a.name}
              className="flex gap-3 rounded-xl border border-landing-outline-variant/10 bg-white p-4 shadow-sm"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-landing-container-low text-lg">
                {CATEGORY_EMOJI[a.category] ?? '📍'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold leading-tight text-landing-on-surface">{a.name}</p>
                  <span
                    className={[
                      'mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1',
                      CATEGORY_PILL[a.category] ?? 'bg-zinc-100 text-zinc-600 ring-zinc-200',
                    ].join(' ')}
                  >
                    {a.estimatedDuration}
                  </span>
                </div>
                {a.recommendedTime && (
                  <p className="mt-0.5 text-[10px] font-medium text-landing-primary/70">{a.recommendedTime}</p>
                )}
                <p className="mt-1 text-[11px] leading-snug text-landing-on-surface-variant">{a.description}</p>
                {a.tip && (
                  <p className="mt-1.5 text-[10px] italic text-landing-on-surface/50">{a.tip}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LogisticsStrip({ itinerary }: { itinerary: FormattedItinerary }) {
  const { flight, hotel, match } = itinerary;
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="rounded-xl border border-landing-outline-variant/10 bg-white p-4 shadow-sm">
        <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-landing-primary/10">
          <Plane className="size-3.5 text-landing-primary" strokeWidth={2} />
        </div>
        <p className="text-[9px] font-bold uppercase tracking-wider text-landing-on-surface-variant">Flight</p>
        <p className="mt-1 text-[11px] font-bold text-landing-on-surface leading-tight">
          {flight.outbound.origin} → {flight.outbound.destination}
        </p>
        <p className="mt-0.5 text-[10px] text-landing-on-surface-variant">
          {formatDate(flight.outbound.departureUtc)} – {formatDate(flight.inbound.departureUtc)}
        </p>
        <p className="text-[10px] text-landing-on-surface-variant">{flight.outbound.airline}</p>
        <p className="mt-2 font-headline text-sm font-black text-landing-primary">{flight.totalPriceEur} EUR</p>
      </div>

      <div className="rounded-xl border border-landing-outline-variant/10 bg-white p-4 shadow-sm">
        <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-landing-primary/10">
          <Hotel className="size-3.5 text-landing-primary" strokeWidth={2} />
        </div>
        <p className="text-[9px] font-bold uppercase tracking-wider text-landing-on-surface-variant">Hotel</p>
        <p className="mt-1 text-[11px] font-bold text-landing-on-surface leading-tight">{hotel.name}</p>
        <p className="mt-0.5 text-[10px] text-landing-on-surface-variant">
          {formatDate(hotel.checkIn)} – {formatDate(hotel.checkOut)}
        </p>
        <p className="text-[10px] text-landing-on-surface-variant">{hotel.nights} nights</p>
        <p className="mt-2 font-headline text-sm font-black text-landing-primary">{hotel.totalEur} EUR</p>
      </div>

      <div className="rounded-xl border border-landing-outline-variant/10 bg-white p-4 shadow-sm">
        <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100">
          <Trophy className="size-3.5 text-amber-600" strokeWidth={2} />
        </div>
        <p className="text-[9px] font-bold uppercase tracking-wider text-landing-on-surface-variant">Match</p>
        <p className="mt-1 text-[11px] font-bold text-landing-on-surface leading-tight">
          {match.homeTeam} vs {match.awayTeam}
        </p>
        <p className="mt-0.5 text-[10px] text-landing-on-surface-variant">
          {formatDate(match.kickoffUtc)} · {new Date(match.kickoffUtc).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC
        </p>
        <p className="text-[10px] text-landing-on-surface-variant">{match.venue}</p>
        <p className="mt-2 font-headline text-sm font-black text-amber-600">{match.ticketPriceEur} EUR</p>
      </div>
    </div>
  );
}

function CostCard({ itinerary }: { itinerary: FormattedItinerary }) {
  const { cost } = itinerary;
  return (
    <div className="rounded-2xl border border-landing-outline-variant/5 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-landing-on-surface-variant">
          Estimated Cost
        </h4>
        <BarChart3 className="size-4 text-landing-primary" strokeWidth={2} />
      </div>
      <div className="flex gap-6">
        <div className="flex-1 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-landing-on-surface-variant">Flights</span>
            <span className="font-medium">{cost.flightsEur} EUR</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-landing-on-surface-variant">Tickets</span>
            <span className="font-medium">{cost.matchTicketEur} EUR</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-landing-on-surface-variant">Stay</span>
            <span className="font-medium">{cost.stayEur} EUR</span>
          </div>
        </div>
        <div className="flex flex-col items-end justify-end border-l border-landing-outline-variant/10 pl-6">
          <p className="text-[9px] font-bold uppercase tracking-wider text-landing-on-surface-variant">Total</p>
          <p className="font-headline text-2xl font-black text-landing-on-surface">{cost.totalEur}</p>
          <p className="text-[10px] text-landing-on-surface-variant">EUR</p>
        </div>
      </div>
    </div>
  );
}

interface ItineraryPanelProps {
  itinerary: FormattedItinerary | null;
  activities: ActivitiesData | null;
}

export default function ItineraryPanel({ itinerary, activities }: ItineraryPanelProps) {
  const hasContent = itinerary || activities;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-6 flex items-center gap-3">
        <h3 className="font-headline text-lg font-bold tracking-tight">Live Itinerary</h3>
        {itinerary && (
          <span className="rounded-full bg-landing-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-landing-primary">
            {itinerary.flight.outbound.destination}
          </span>
        )}
      </div>

      {!hasContent ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-landing-container">
            <Compass className="size-9 text-landing-on-surface-variant/30" strokeWidth={1.5} />
          </div>
          <div className="max-w-xs">
            <p className="text-base font-semibold text-landing-on-surface-variant">No trip planned yet</p>
            <p className="mt-1.5 text-sm leading-relaxed text-landing-on-surface-variant/60">
              Chat with FanBuddy to plan your perfect football trip. Your itinerary will appear here.
            </p>
          </div>
        </div>
      ) : (
        <div className="no-scrollbar flex flex-1 flex-col gap-6 overflow-y-auto">
          {activities && <ActivitiesSection activities={activities} />}
          {itinerary && <LogisticsStrip itinerary={itinerary} />}
          {itinerary && <CostCard itinerary={itinerary} />}
        </div>
      )}
    </div>
  );
}
