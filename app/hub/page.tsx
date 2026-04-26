'use client';

import { AlertCircle, Calendar, LayoutGrid, MapPin } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import AppShell from '@/components/shared/AppShell';

type TripRecord = {
  id: string;
  team: string;
  match_label: string;
  match_date: string;
  destination: string;
  tier: 'free' | 'paid';
  created_at: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
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

function SkeletonCard() {
  return (
    <div className="glass-panel animate-pulse rounded-2xl p-5">
      <div className="mb-2 h-5 w-32 rounded bg-zinc-200" />
      <div className="mb-1 h-4 w-48 rounded bg-zinc-100" />
      <div className="h-4 w-24 rounded bg-zinc-100" />
    </div>
  );
}

export default function HubPage() {
  const [tripList, setTripList] = useState<TripRecord[]>([]);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

  const fetchTrips = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/trips');
      if (!res.ok) throw new Error('non-200');
      const data = (await res.json()) as { trips: TripRecord[] };
      setTripList(data.trips);
      setStatus('loaded');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void fetchTrips();
  }, [fetchTrips]);

  return (
    <AppShell activePage="hub">
      <div className="flex-1 overflow-y-auto px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center gap-3">
          <LayoutGrid className="size-7 text-emerald-600" strokeWidth={2} />
          <h1 className="font-headline text-3xl font-bold text-landing-on-surface">
            My Trips
          </h1>
        </div>

        {status === 'loading' && (
          <div className="flex flex-col gap-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <AlertCircle className="size-10 text-red-400" />
            <p className="text-landing-on-surface/70">
              Failed to load trips. Please try again.
            </p>
            <button
              type="button"
              onClick={() => void fetchTrips()}
              className="rounded-xl bg-emerald-600 px-5 py-2.5 font-headline font-semibold text-white transition hover:bg-emerald-700"
            >
              Retry
            </button>
          </div>
        )}

        {status === 'loaded' && tripList.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <LayoutGrid className="size-10 text-zinc-300" strokeWidth={2} />
            <p className="text-landing-on-surface/70">
              No trips yet. Plan your first trip!
            </p>
            <Link
              href="/chat"
              className="rounded-xl bg-pitch-gradient px-5 py-2.5 font-headline font-semibold text-white shadow-lg shadow-emerald-600/20 transition-transform active:scale-95"
            >
              Plan a Trip
            </Link>
          </div>
        )}

        {status === 'loaded' && tripList.length > 0 && (
          <div className="flex flex-col gap-4">
            {tripList.map((trip) => (
              <Link key={trip.id} href={`/hub/${trip.id}`} className="glass-panel block rounded-2xl p-5 transition-shadow hover:shadow-md">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-headline text-lg font-bold text-landing-on-surface">
                    {trip.team}
                  </span>
                  <TierBadge tier={trip.tier} />
                </div>
                <p className="mb-3 text-sm text-landing-on-surface/70">
                  {trip.match_label}
                </p>
                <div className="flex items-center gap-4 text-xs text-landing-on-surface/50">
                  <span className="flex items-center gap-1">
                    <Calendar className="size-3.5" />
                    {formatDate(trip.match_date)}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3.5" />
                    {trip.destination}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      </div>
    </AppShell>
  );
}
