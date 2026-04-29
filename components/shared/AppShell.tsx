'use client';

import { Compass, Crown, LayoutGrid, Plus, Settings } from 'lucide-react';
import { UserButton } from '@clerk/nextjs';
import Link from 'next/link';

interface AppShellProps {
  children: React.ReactNode;
  activePage?: 'hub' | 'chat' | 'profile';
}

const navBase =
  'mx-2 my-1 flex items-center gap-3 rounded-lg px-4 py-3 font-headline text-sm font-semibold transition-all duration-300';
const navInactive = 'text-zinc-600 hover:bg-zinc-200/50';
const navActive = 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20';

export default function AppShell({ children, activePage = 'chat' }: AppShellProps) {
  return (
    <div className="min-h-screen bg-landing-surface text-landing-on-surface">
      {/* Mobile header */}
      <header className="fixed top-0 z-50 flex h-16 w-full items-center justify-between bg-[#f6f6f6]/70 px-6 backdrop-blur-xl md:hidden">
        <h1 className="font-headline text-2xl font-black italic tracking-tighter text-emerald-600">
          FanBuddy.AI
        </h1>
        <div className="flex gap-4">
          <UserButton
            appearance={{
              elements: { avatarBox: 'h-6 w-6 rounded-full' },
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
        {/* Desktop sidebar */}
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
              className={`${navBase} ${activePage === 'hub' ? navActive : navInactive}`}
            >
              <LayoutGrid className="size-5 shrink-0" strokeWidth={2} />
              Hub
            </Link>
            <Link
              href="/chat"
              className={`${navBase} ${activePage === 'chat' ? navActive : navInactive}`}
            >
              <Compass className="size-5 shrink-0" strokeWidth={2} />
              Voyage Mode
            </Link>
            <Link
              href="/profile"
              className={`${navBase} ${activePage === 'profile' ? navActive : navInactive}`}
            >
              <Crown className="size-5 shrink-0" strokeWidth={2} />
              Profile
            </Link>
          </nav>
          <div className="mt-auto space-y-3 px-4 pb-8">
            <button
              type="button"
              onClick={async () => {
                const res = await fetch('/api/stripe/checkout', { method: 'POST' });
                const { url } = (await res.json()) as { url: string };
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

        {/* Main content slot */}
        <main className="relative flex flex-1 flex-col md:ml-64">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav
        className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around border-t border-landing-outline-variant/15 bg-white/80 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_40px_rgba(45,47,47,0.06)] backdrop-blur-md md:hidden"
        aria-label="Mobile"
      >
        <Link
          href="/hub"
          className={`flex flex-col items-center justify-center p-2 ${activePage === 'hub' ? 'text-emerald-700' : 'text-landing-on-surface/50'}`}
        >
          <LayoutGrid className="size-6" strokeWidth={2} />
          <span className="mt-1 text-[10px] font-bold uppercase tracking-widest">Hub</span>
        </Link>
        <Link
          href="/chat"
          className={`flex flex-col items-center justify-center rounded-xl p-2 px-4 ${activePage === 'chat' ? 'bg-emerald-100 text-emerald-700' : 'text-landing-on-surface/50'}`}
        >
          <Compass
            className="size-6"
            strokeWidth={2}
            fill={activePage === 'chat' ? 'currentColor' : 'none'}
          />
          <span className="mt-1 text-[10px] font-bold uppercase tracking-widest">Voyage</span>
        </Link>
        <Link
          href="/profile"
          className={`flex flex-col items-center justify-center p-2 ${activePage === 'profile' ? 'text-emerald-700' : 'text-landing-on-surface/50'}`}
        >
          <Crown className="size-6" strokeWidth={2} />
          <span className="mt-1 text-[10px] font-bold uppercase tracking-widest">Profile</span>
        </Link>
      </nav>
    </div>
  );
}
