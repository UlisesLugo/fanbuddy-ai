'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import AppShell from '@/components/shared/AppShell';

type ProfileData = {
  email: string;
  plan: 'free' | 'paid';
  home_city: string | null;
  favorite_team: { id: number; name: string } | null;
};

type TeamOption = { id: number; name: string };

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-zinc-200 ${className ?? ''}`} />;
}

function PlanBadge({ plan }: { plan: 'free' | 'paid' }) {
  if (plan === 'paid') {
    return (
      <span className="rounded-full bg-pitch-gradient px-3 py-1 text-xs font-bold text-white shadow">
        Pro
      </span>
    );
  }
  return (
    <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-500">
      Free
    </span>
  );
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>([]);
  const [pageStatus, setPageStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

  const [homeCity, setHomeCity] = useState('');
  const [teamId, setTeamId] = useState<number | ''>('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const origCityRef = useRef('');
  const origTeamIdRef = useRef<number | ''>('');

  const isDirty =
    homeCity !== origCityRef.current || teamId !== origTeamIdRef.current;

  const load = useCallback(async () => {
    setPageStatus('loading');
    try {
      const [profileRes, teamsRes] = await Promise.all([
        fetch('/api/profile'),
        fetch('/api/teams'),
      ]);
      if (!profileRes.ok || !teamsRes.ok) throw new Error('non-200');
      const profileData = (await profileRes.json()) as ProfileData;
      const teamsData = (await teamsRes.json()) as { teams: TeamOption[] };

      setProfile(profileData);
      setTeamOptions(teamsData.teams);
      const city = profileData.home_city ?? '';
      const tid = profileData.favorite_team?.id ?? '';
      setHomeCity(city);
      setTeamId(tid);
      origCityRef.current = city;
      origTeamIdRef.current = tid;
      setPageStatus('loaded');
    } catch {
      setPageStatus('error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          home_city: homeCity || null,
          favorite_team_id: teamId || null,
        }),
      });
      if (!res.ok) throw new Error('non-200');
      const updated = (await res.json()) as ProfileData;
      setProfile(updated);
      const city = updated.home_city ?? '';
      const tid = updated.favorite_team?.id ?? '';
      setHomeCity(city);
      setTeamId(tid);
      origCityRef.current = city;
      origTeamIdRef.current = tid;
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    }
  };

  if (pageStatus === 'loading') {
    return (
      <AppShell activePage="profile">
        <div className="mx-auto max-w-xl space-y-6 px-4 py-10 sm:px-8">
          <SkeletonBlock className="h-8 w-48" />
          <div className="glass-panel space-y-4 rounded-2xl p-6">
            <SkeletonBlock className="h-5 w-32" />
            <SkeletonBlock className="h-5 w-56" />
            <SkeletonBlock className="h-5 w-24" />
          </div>
          <div className="glass-panel space-y-4 rounded-2xl p-6">
            <SkeletonBlock className="h-5 w-32" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-28" />
          </div>
        </div>
      </AppShell>
    );
  }

  if (pageStatus === 'error') {
    return (
      <AppShell activePage="profile">
        <div className="mx-auto max-w-xl px-4 py-10 sm:px-8">
          <div className="glass-panel rounded-2xl p-6 text-center">
            <p className="mb-4 text-landing-on-surface/70">
              Failed to load profile. Please try again.
            </p>
            <button
              type="button"
              onClick={load}
              className="rounded-xl bg-landing-primary px-5 py-2 font-headline font-bold text-white transition-transform active:scale-95"
            >
              Retry
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell activePage="profile">
      <div className="mx-auto max-w-xl space-y-6 px-4 py-10 sm:px-8">
        <h1 className="font-headline text-2xl font-black tracking-tight text-landing-on-surface">
          Profile
        </h1>

        {/* Account Info */}
        <section className="glass-panel space-y-4 rounded-2xl p-6">
          <h2 className="font-headline text-sm font-bold uppercase tracking-wider text-landing-on-surface-variant">
            Account
          </h2>
          <div className="flex items-center justify-between">
            <span className="text-sm text-landing-on-surface/80">{profile!.email}</span>
            <PlanBadge plan={profile!.plan} />
          </div>
          <button
            type="button"
            disabled
            className="text-sm font-semibold text-landing-primary/60"
          >
            Manage subscription →
          </button>
        </section>

        {/* Preferences */}
        <section className="glass-panel space-y-5 rounded-2xl p-6">
          <h2 className="font-headline text-sm font-bold uppercase tracking-wider text-landing-on-surface-variant">
            Preferences
          </h2>

          <div className="space-y-1">
            <label
              htmlFor="home-city"
              className="block text-sm font-semibold text-landing-on-surface"
            >
              Home city
            </label>
            <input
              id="home-city"
              type="text"
              value={homeCity}
              onChange={(e) => { setHomeCity(e.target.value); setSaveStatus('idle'); }}
              placeholder="e.g. London"
              disabled={saveStatus === 'saving'}
              className="w-full rounded-xl border border-landing-outline-variant/30 bg-white px-4 py-2.5 text-sm text-landing-on-surface outline-none focus:border-landing-primary/60 focus:ring-2 focus:ring-landing-primary/20 disabled:opacity-50"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="favorite-team"
              className="block text-sm font-semibold text-landing-on-surface"
            >
              Favorite team
            </label>
            <select
              id="favorite-team"
              value={teamId}
              onChange={(e) => { setTeamId(e.target.value ? Number(e.target.value) : ''); setSaveStatus('idle'); }}
              disabled={saveStatus === 'saving'}
              className="w-full rounded-xl border border-landing-outline-variant/30 bg-white px-4 py-2.5 text-sm text-landing-on-surface outline-none focus:border-landing-primary/60 focus:ring-2 focus:ring-landing-primary/20 disabled:opacity-50"
            >
              <option value="">Select a team</option>
              {teamOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!isDirty || saveStatus === 'saving'}
              className="rounded-xl bg-pitch-gradient px-6 py-2.5 font-headline font-bold text-white shadow shadow-emerald-600/20 transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saveStatus === 'saving' ? 'Saving…' : 'Save'}
            </button>
            {saveStatus === 'saved' && (
              <span className="text-sm font-semibold text-emerald-600">Saved!</span>
            )}
            {saveStatus === 'error' && (
              <span className="text-sm font-semibold text-red-500">
                Failed to save. Try again.
              </span>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
