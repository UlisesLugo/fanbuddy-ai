'use client';

import { AlertCircle, ArrowLeft, Bot } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import AppShell from '@/components/shared/AppShell';
import ItineraryPanel from '@/components/shared/ItineraryPanel';
import type { ActivitiesData, FormattedItinerary } from '@/lib/langchain/types';

type TripRecord = {
  id: string;
  team: string;
  match_label: string;
  match_date: string;
  destination: string;
  tier: 'free' | 'paid';
  thread_id: string;
  created_at: string;
};

type Message = { role: 'user' | 'ai'; content: string };

type TripDetailData = {
  trip: TripRecord;
  messages: Message[];
  itinerary: FormattedItinerary | null;
  activities: ActivitiesData | null;
};

function AiAvatar() {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-landing-primary-container/30">
      <Bot className="size-5 text-landing-primary" strokeWidth={2} />
    </div>
  );
}

function TierBadge({ tier }: { tier: 'free' | 'paid' }) {
  if (tier === 'paid') {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
        Pro
      </span>
    );
  }
  return (
    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-500">
      Free
    </span>
  );
}

function SkeletonPane() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-4">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-zinc-100" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-48 animate-pulse rounded bg-zinc-100" />
            <div className="h-4 w-64 animate-pulse rounded bg-zinc-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TripDetailPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<TripDetailData | null>(null);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error' | 'not-found'>('loading');

  const fetchTrip = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch(`/api/trips/${params.id}`);
      if (res.status === 404 || res.status === 403) {
        setStatus('not-found');
        return;
      }
      if (!res.ok) throw new Error('non-200');
      const json = (await res.json()) as TripDetailData;
      setData(json);
      setStatus('loaded');
    } catch {
      setStatus('error');
    }
  }, [params.id]);

  useEffect(() => {
    void fetchTrip();
  }, [fetchTrip]);

  return (
    <AppShell activePage="hub">
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center gap-3 border-b border-landing-outline-variant/10 px-8 py-5">
          <Link
            href="/hub"
            className="flex items-center gap-1.5 text-sm text-landing-on-surface-variant hover:text-landing-on-surface"
          >
            <ArrowLeft className="size-4" strokeWidth={2} />
            My Trips
          </Link>
          {data && (
            <>
              <span className="text-landing-outline-variant">/</span>
              <div>
                <h2 className="font-headline text-lg font-bold tracking-tight">
                  {data.trip.team} — {data.trip.match_label}
                </h2>
                <p className="text-[10px] uppercase tracking-wider text-landing-on-surface-variant">
                  {data.trip.destination} ·{' '}
                  {new Date(data.trip.match_date).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              </div>
              <div className="ml-auto">
                <TierBadge tier={data.trip.tier} />
              </div>
            </>
          )}
        </div>

        {status === 'loading' && (
          <div className="flex flex-1 overflow-hidden">
            <SkeletonPane />
            <div className="w-80 border-l border-landing-outline-variant/10 bg-landing-container-low">
              <SkeletonPane />
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <AlertCircle className="size-10 text-red-400" />
            <p className="text-landing-on-surface/70">Failed to load trip. Please try again.</p>
            <button
              type="button"
              onClick={() => void fetchTrip()}
              className="rounded-xl bg-emerald-600 px-5 py-2.5 font-headline font-semibold text-white transition hover:bg-emerald-700"
            >
              Retry
            </button>
          </div>
        )}

        {status === 'not-found' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <p className="text-landing-on-surface/70">Trip not found.</p>
            <Link
              href="/hub"
              className="rounded-xl bg-emerald-600 px-5 py-2.5 font-headline font-semibold text-white transition hover:bg-emerald-700"
            >
              Back to My Trips
            </Link>
          </div>
        )}

        {status === 'loaded' && data && (
          <div className="flex flex-1 overflow-hidden">
            {/* Conversation panel */}
            <section className="relative flex flex-1 flex-col bg-white">
              <div className="border-b border-landing-outline-variant/10 px-8 py-5">
                <h3 className="font-headline text-lg font-bold tracking-tight">Conversation</h3>
                <p className="text-[10px] uppercase tracking-wider text-landing-on-surface-variant">
                  Read-only
                </p>
              </div>
              <div className="no-scrollbar flex flex-1 flex-col space-y-8 overflow-y-auto p-8">
                {data.messages.length === 0 && (
                  <p className="text-sm text-landing-on-surface-variant">
                    Conversation not available for this trip.
                  </p>
                )}
                {data.messages.map((m, i) => {
                  if (m.role === 'user') {
                    return (
                      <div key={`user-${i}`} className="flex flex-col items-end space-y-3">
                        <div className="max-w-[80%] rounded-2xl rounded-tr-none bg-landing-primary px-5 py-4 text-[15px] leading-[1.65] text-white shadow-sm">
                          {m.content}
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={`ai-${i}`} className="flex max-w-[85%] gap-4">
                      <AiAvatar />
                      <div className="rounded-2xl rounded-tl-none bg-landing-container-low px-5 py-4 text-[15px] leading-[1.65] text-landing-on-surface/80">
                        {m.content}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Itinerary panel */}
            <aside className="hidden w-80 flex-col overflow-y-auto border-l border-landing-outline-variant/10 bg-landing-container-low p-8 lg:flex">
              <ItineraryPanel itinerary={data.itinerary} activities={data.activities} />
            </aside>
          </div>
        )}
      </div>
    </AppShell>
  );
}
