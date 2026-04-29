'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronDown, MapPin, Shield, Loader2 } from 'lucide-react';
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
      <span className="rounded-full border border-white/40 bg-white/20 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm">
        ✦ Pro
      </span>
    );
  }
  return (
    <span className="rounded-full border border-landing-container-highest bg-white/80 px-3 py-1 text-xs font-bold text-landing-on-surface-variant">
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
        <div className="mx-auto max-w-lg px-4 py-8 sm:px-6">
          <SkeletonBlock className="mb-7 h-8 w-36" />
          <div className="mb-5 overflow-hidden rounded-2xl">
            <SkeletonBlock className="h-24 w-full rounded-none" />
            <div className="glass-panel space-y-3 px-6 pb-6 pt-12 rounded-b-2xl">
              <SkeletonBlock className="mx-auto h-5 w-48" />
              <SkeletonBlock className="mx-auto h-5 w-24" />
            </div>
          </div>
          <div className="glass-panel space-y-4 rounded-2xl p-6">
            <SkeletonBlock className="h-4 w-28" />
            <SkeletonBlock className="h-11 w-full" />
            <SkeletonBlock className="h-4 w-28" />
            <SkeletonBlock className="h-11 w-full" />
            <SkeletonBlock className="h-11 w-32" />
          </div>
        </div>
      </AppShell>
    );
  }

  if (pageStatus === 'error') {
    return (
      <AppShell activePage="profile">
        <div className="mx-auto max-w-lg px-4 py-8 sm:px-6">
          <div className="glass-panel rounded-2xl p-8 text-center">
            <div className="mb-3 flex justify-center">
              <AlertCircle className="size-10 text-landing-outline" strokeWidth={1.5} />
            </div>
            <p className="mb-5 text-sm text-landing-on-surface/70">
              Failed to load your profile. Please try again.
            </p>
            <button
              type="button"
              onClick={load}
              className="rounded-xl bg-pitch-gradient px-6 py-2.5 font-headline font-bold text-white shadow shadow-emerald-600/20 transition-transform active:scale-95"
            >
              Retry
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  const avatarLetter = profile!.email.charAt(0).toUpperCase();

  return (
    <AppShell activePage="profile">
      <div className="min-h-full overflow-y-auto">
        <div className="mx-auto max-w-lg px-4 py-8 sm:px-6">

          <h1 className="mb-7 font-headline text-3xl font-black tracking-tight text-landing-on-surface">
            Your Profile
          </h1>

          {/* Membership card */}
          <div className="mb-5 overflow-hidden rounded-2xl shadow-xl shadow-emerald-900/10">
            {/* Gradient header */}
            <div className="bg-pitch-gradient px-6 pb-10 pt-5">
              <div className="flex items-center justify-between">
                <span className="font-headline text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">
                  FanBuddy Member
                </span>
                <PlanBadge plan={profile!.plan} />
              </div>
            </div>

            {/* Card body — avatar overlaps gradient */}
            <div className="glass-panel border-0 px-6 pb-6">
              <div className="-mt-10 flex flex-col items-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full border-[3px] border-white bg-gradient-to-br from-emerald-500 to-emerald-800 shadow-lg shadow-emerald-900/25">
                  <span className="font-headline text-3xl font-black text-white">
                    {avatarLetter}
                  </span>
                </div>
                <p className="mt-3 text-sm font-semibold text-landing-on-surface">
                  {profile!.email}
                </p>
                {profile!.plan === 'paid' && (
                  <p className="mt-0.5 text-xs font-medium text-landing-primary">
                    Pro member
                  </p>
                )}
              </div>

              <div className="mt-5 border-t border-landing-container pt-4">
                <button
                  type="button"
                  disabled
                  className="text-sm font-semibold text-landing-primary/50 transition-colors hover:text-landing-primary/70"
                >
                  Manage subscription →
                </button>
              </div>
            </div>
          </div>

          {/* Preferences card */}
          <div className="glass-panel rounded-2xl p-6 shadow-lg shadow-slate-900/5">
            <h2 className="mb-5 font-headline text-[10px] font-bold uppercase tracking-[0.2em] text-landing-on-surface-variant">
              Preferences
            </h2>

            {/* Home city */}
            <div className="mb-4 space-y-1.5">
              <label
                htmlFor="home-city"
                className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-landing-on-surface-variant"
              >
                <MapPin className="size-3.5 shrink-0" strokeWidth={2.5} />
                Home city
              </label>
              <input
                id="home-city"
                type="text"
                value={homeCity}
                onChange={(e) => { setHomeCity(e.target.value); setSaveStatus('idle'); }}
                placeholder="e.g. London"
                disabled={saveStatus === 'saving'}
                className="w-full rounded-xl border border-landing-container-highest bg-white px-4 py-3 text-sm font-medium text-landing-on-surface placeholder:text-landing-outline-variant outline-none transition-all focus:border-landing-primary/50 focus:ring-2 focus:ring-landing-primary/15 disabled:opacity-50"
              />
            </div>

            {/* Favorite team */}
            <div className="mb-6 space-y-1.5">
              <label
                htmlFor="favorite-team"
                className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-landing-on-surface-variant"
              >
                <Shield className="size-3.5 shrink-0" strokeWidth={2.5} />
                Favorite team
              </label>
              <div className="relative">
                <select
                  id="favorite-team"
                  value={teamId}
                  onChange={(e) => { setTeamId(e.target.value ? Number(e.target.value) : ''); setSaveStatus('idle'); }}
                  disabled={saveStatus === 'saving'}
                  className="w-full appearance-none rounded-xl border border-landing-container-highest bg-white px-4 py-3 pr-10 text-sm font-medium text-landing-on-surface outline-none transition-all focus:border-landing-primary/50 focus:ring-2 focus:ring-landing-primary/15 disabled:opacity-50"
                >
                  <option value="">Select a team</option>
                  {teamOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-landing-outline-variant"
                  strokeWidth={2}
                />
              </div>
            </div>

            {/* Save row */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={!isDirty || saveStatus === 'saving'}
                className="flex items-center gap-2 rounded-xl bg-pitch-gradient px-6 py-2.5 font-headline font-bold text-white shadow shadow-emerald-600/20 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saveStatus === 'saving' ? (
                  <>
                    <Loader2 className="size-4 animate-spin" strokeWidth={2.5} />
                    Saving…
                  </>
                ) : (
                  'Save changes'
                )}
              </button>

              {saveStatus === 'saved' && (
                <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
                  <Check className="size-4" strokeWidth={2.5} />
                  Saved
                </span>
              )}
              {saveStatus === 'error' && (
                <span className="flex items-center gap-1.5 text-sm font-semibold text-red-500">
                  <AlertCircle className="size-4" strokeWidth={2.5} />
                  Failed to save
                </span>
              )}
            </div>
          </div>

        </div>
      </div>
    </AppShell>
  );
}
