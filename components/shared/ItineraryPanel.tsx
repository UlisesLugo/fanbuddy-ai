'use client';

import { BarChart3, Compass, CreditCard, Hotel, Landmark, MapPin, Plane } from 'lucide-react';
import { useState } from 'react';

import type { ActivitiesData, FormattedItinerary } from '@/lib/langchain/types';

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
            <div key={d.day} className="overflow-hidden rounded-xl border border-landing-outline-variant/15">
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
                      <span className="shrink-0 text-sm">{CATEGORY_EMOJI[a.category] ?? '📍'}</span>
                      <div>
                        <div className="flex items-baseline gap-2">
                          <p className="text-[11px] font-semibold text-landing-on-surface">{a.name}</p>
                          {a.recommendedTime && (
                            <span className="text-[9px] text-landing-on-surface-variant/80">{a.recommendedTime}</span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[10px] text-landing-on-surface-variant">{a.description}</p>
                        {a.tip && (
                          <p className="mt-0.5 text-[10px] italic text-landing-on-surface-variant/70">{a.tip}</p>
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

interface ItineraryPanelProps {
  itinerary: FormattedItinerary | null;
  activities: ActivitiesData | null;
}

export default function ItineraryPanel({ itinerary, activities }: ItineraryPanelProps) {
  return (
    <>
      <h3 className="mb-8 font-headline text-lg font-bold tracking-tight">Live Itinerary</h3>
      {!itinerary && !activities ? (
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
          {itinerary && (
            <>
              <div className="relative space-y-10">
                <div className="absolute bottom-2 left-[11px] top-2 w-0.5 bg-landing-outline-variant/20" />
                <div className="relative flex gap-4">
                  <div className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-landing-primary">
                    <Plane className="size-3.5 text-white" strokeWidth={2} fill="currentColor" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-landing-primary">
                      Flight Outbound
                    </h4>
                    <p className="mt-1 text-sm font-semibold">
                      {itinerary.flight.outbound.origin} → {itinerary.flight.outbound.destination}
                    </p>
                    <p className="mt-0.5 text-[10px] text-landing-on-surface-variant">
                      {formatDate(itinerary.flight.outbound.departureUtc)}, {itinerary.flight.outbound.airline}
                    </p>
                  </div>
                </div>
                <div className="relative flex gap-4">
                  <div className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-landing-outline-variant/30 bg-landing-container-highest">
                    <Hotel className="size-3.5 text-landing-on-surface-variant" strokeWidth={2} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider">Accommodation</h4>
                    <p className="mt-1 text-sm font-semibold">{itinerary.hotel.name}</p>
                    <p className="mt-0.5 text-[10px] text-landing-on-surface-variant">
                      {itinerary.hotel.nights} Nights •{' '}
                      {itinerary.hotel.wasDowngraded ? 'Downgraded' : 'Suggested'}
                    </p>
                  </div>
                </div>
                <div className="relative flex gap-4">
                  <div className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-landing-outline-variant/30 bg-landing-container-highest">
                    <Landmark className="size-3.5 text-landing-on-surface-variant" strokeWidth={2} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider">Main Event</h4>
                    <p className="mt-1 text-sm font-semibold">{itinerary.match.venue}</p>
                    <p className="mt-0.5 text-[10px] text-landing-on-surface-variant">
                      Kickoff: {formatDate(itinerary.match.kickoffUtc)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-6 rounded-2xl border border-landing-outline-variant/5 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h4 className="text-xs font-bold text-landing-on-surface-variant">ESTIMATED COST</h4>
                  <BarChart3 className="size-4 text-landing-primary" strokeWidth={2} />
                </div>
                <div className="mb-6 space-y-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-landing-on-surface-variant">Flights</span>
                    <span className="font-medium">{itinerary.cost.flightsEur} EUR</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-landing-on-surface-variant">Match Tickets</span>
                    <span className="font-medium">{itinerary.cost.matchTicketEur} EUR</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-landing-on-surface-variant">Stay (Avg)</span>
                    <span className="font-medium">{itinerary.cost.stayEur} EUR</span>
                  </div>
                </div>
                <div className="flex items-end justify-between border-t border-landing-outline-variant/10 pt-4">
                  <div>
                    <p className="text-[10px] text-landing-on-surface-variant">TOTAL</p>
                    <p className="font-headline text-2xl font-black text-landing-on-surface">
                      {itinerary.cost.totalEur} EUR
                    </p>
                  </div>
                  <div className="rounded-lg bg-landing-primary p-1 text-landing-primary-container">
                    <CreditCard className="size-5" strokeWidth={2} />
                  </div>
                </div>
              </div>
            </>
          )}
          {activities && <ActivitiesAccordion activities={activities} />}
        </div>
      )}
    </>
  );
}
