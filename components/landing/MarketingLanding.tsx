'use client';

import { Eye, EyeOff, HelpCircle, Radar } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { FcGoogle } from 'react-icons/fc';
import { SiApple } from 'react-icons/si';

const STADIUM_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDOmFIiyMb4R4woo6sfO1iwwMXUoOuczFb44i_Aw7C-xCZH1vnSE5jMAyfDi7Of7O3mQ6Em7nM_R0sOYL8-UYxcCxCuJbWq8WpJqtEwRZGlhDttH2PniDohsF8YZMJ3sKAFvqX_LjofsM4xLoZcHr1xu9-xB9TKAKJey3emcz2hHKOZb4eFh7IHrKRQ1_bKuqH8kX9igTZWXqewEZ4d_j-TVGQ0czI6Ml00xrh9FnowoZ1KdchZs4x-dkbkGDBuuZfA9cgTaN3Buk0';

export function MarketingLanding() {
  const [showPassword, setShowPassword] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
  }

  return (
    <>
      <main className="flex min-h-dvh flex-col overflow-x-hidden lg:flex-row">
        {/* Left: hero */}
        <section className="relative flex min-h-[min(100dvh,520px)] w-full items-center bg-landing-inverse px-4 pb-28 pt-12 sm:min-h-[560px] sm:px-8 sm:pb-32 sm:pt-16 lg:min-h-dvh lg:w-[60%] lg:px-24 lg:py-0 lg:pb-0">
          <div className="absolute inset-0 z-0 overflow-hidden">
            <Image
              src={STADIUM_IMAGE}
              alt="Estadio de fútbol moderno"
              fill
              priority
              className="object-cover opacity-40 mix-blend-luminosity"
              sizes="(max-width: 1024px) 100vw, 60vw"
            />
            <div className="absolute inset-0 bg-gradient-to-tr from-landing-inverse via-landing-inverse/80 to-transparent" />
          </div>

          <div className="relative z-10 max-w-2xl">
            <div className="mb-6 inline-flex max-w-full items-center gap-2 rounded-full border border-landing-primary/20 bg-landing-primary/20 px-3 py-1.5 backdrop-blur-md sm:mb-8 sm:px-4 sm:py-2">
              <Radar
                className="size-4 text-landing-primary-container"
                strokeWidth={2}
              />
              <span className="text-[10px] font-bold uppercase tracking-widest text-landing-primary-container">
                AI-POWERED TRAVEL
              </span>
            </div>

            <h1 className="font-headline mb-4 text-balance text-3xl font-extrabold leading-[1.12] tracking-tighter text-landing-container-lowest sm:mb-6 sm:text-4xl md:text-5xl lg:text-7xl">
              Your football trip,{' '}
              <span className="text-pitch-gradient">optimized by AI</span>
            </h1>

            <p className="mb-8 max-w-lg text-pretty font-normal text-base leading-relaxed text-landing-container-highest/80 sm:mb-10 sm:text-lg lg:text-xl">
              FanBuddy.AI analyzes thousands of combinations to deliver the
              perfect itinerary: tickets, flights, and stays all in one place.
            </p>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm sm:p-6">
                <span className="font-headline mb-1 block text-2xl font-bold text-landing-primary-container sm:text-3xl">
                  500+
                </span>
                <span className="text-[10px] uppercase leading-tight tracking-wider text-landing-container-highest/60 sm:text-xs">
                  AVAILABLE STADIUMS
                </span>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm sm:p-6">
                <span className="font-headline mb-1 block text-2xl font-bold text-landing-primary-container sm:text-3xl">
                  2.4s
                </span>
                <span className="text-[10px] uppercase leading-tight tracking-wider text-landing-container-highest/60 sm:text-xs">
                  AI OPTIMIZATION
                </span>
              </div>
            </div>
          </div>

          <div className="absolute bottom-6 left-4 flex max-w-[calc(100vw-2rem)] items-center gap-3 opacity-50 sm:bottom-10 sm:left-8 sm:gap-4 lg:left-24">
            <div className="hidden h-0.5 w-8 shrink-0 bg-landing-primary-container sm:block sm:w-12" />
            <span className="text-[9px] uppercase leading-snug tracking-[0.2em] text-white sm:text-[10px] sm:tracking-[0.3em]">
              The Digital Pitch Experience
            </span>
          </div>
        </section>

        {/* Right: onboarding */}
        <section className="flex w-full flex-col justify-center bg-landing-surface px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-12 lg:w-[40%] lg:px-16 lg:pb-12">
          <div className="mx-auto w-full max-w-md min-w-0">
            <div className="mb-8 sm:mb-12">
              <h2 className="font-headline mb-1 text-xl font-black italic tracking-tighter text-landing-primary sm:mb-2 sm:text-2xl">
                FanBuddy.AI
              </h2>
              <h3 className="font-headline text-2xl font-bold tracking-tight text-landing-on-bg sm:text-3xl">
                Welcome to the team
              </h3>
              <p className="mt-2 text-landing-on-surface-variant">
                Create your account to start your next football adventure.
              </p>
            </div>

            <div className="mb-8 space-y-4">
              <button
                type="button"
                className="flex w-full items-center justify-center gap-3.5 rounded-xl border border-landing-outline-variant/10 bg-landing-container-lowest px-6 py-4 shadow-sm transition-all duration-200 hover:bg-landing-container"
              >
                <FcGoogle className="size-7 shrink-0 sm:size-8" aria-hidden />
                <span className="font-semibold text-landing-on-surface">
                  Continue with Google
                </span>
              </button>
              <button
                type="button"
                className="flex w-full items-center justify-center gap-3.5 rounded-xl bg-landing-inverse px-6 py-4 text-white shadow-sm transition-all duration-200 hover:bg-zinc-800"
              >
                <SiApple className="size-7 shrink-0 sm:size-8" aria-hidden />
                <span className="font-semibold text-white">
                  Continue with Apple
                </span>
              </button>
            </div>

            <div className="relative mb-8 flex items-center gap-2 py-4 sm:gap-0 sm:py-5">
              <div className="min-w-0 flex-1 border-t border-landing-outline-variant/20" />
              <span className="max-w-[46%] shrink-0 text-center text-[9px] uppercase leading-tight tracking-widest text-landing-on-surface-variant sm:max-w-none sm:text-[10px]">
                OR WITH EMAIL
              </span>
              <div className="min-w-0 flex-1 border-t border-landing-outline-variant/20" />
            </div>

            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="px-1 text-xs font-bold uppercase tracking-wider text-landing-on-surface-variant">
                  Email address
                </label>
                <input
                  type="email"
                  placeholder="your@email.com"
                  className="w-full rounded-xl border-0 bg-landing-container-low px-5 py-4 font-normal text-landing-on-surface outline-none transition-all placeholder:text-landing-outline focus:bg-landing-container-lowest focus:ring-2 focus:ring-landing-primary/20"
                  autoComplete="email"
                />
              </div>

              <div className="space-y-2">
                <div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
                  <label className="text-xs font-bold uppercase tracking-wider text-landing-on-surface-variant">
                    Password
                  </label>
                  <Link
                    href="#"
                    className="w-fit text-xs font-semibold text-landing-primary hover:underline sm:shrink-0"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="w-full rounded-xl border-0 bg-landing-container-low px-5 py-4 pr-12 font-normal text-landing-on-surface outline-none transition-all placeholder:text-landing-outline focus:bg-landing-container-lowest focus:ring-2 focus:ring-landing-primary/20"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-landing-on-surface-variant"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={
                      showPassword ? 'Hide password' : 'Show password'
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="size-5" />
                    ) : (
                      <Eye className="size-5" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="mt-4 w-full min-h-[3.25rem] rounded-xl bg-pitch-gradient py-4 font-headline text-base font-bold text-white shadow-lg shadow-landing-primary/20 transition-all duration-200 hover:scale-[1.02] active:scale-95 sm:py-5 sm:text-lg"
              >
                Create Account
              </button>
            </form>

            <p className="mt-10 text-center text-sm text-landing-on-surface-variant">
              Already have an account?{' '}
              <Link
                href="#"
                className="font-bold text-landing-primary hover:underline"
              >
                Log In
              </Link>
            </p>

            <div className="mt-auto pt-8 text-center sm:pt-12">
              <p className="text-[10px] font-normal uppercase leading-relaxed tracking-widest text-landing-outline">
                By joining, you agree to our <br />
                <Link href="#" className="underline">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link href="#" className="underline">
                  Privacy
                </Link>
              </p>
            </div>
          </div>
        </section>
      </main>

      <button
        type="button"
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-50 flex size-12 items-center justify-center rounded-full border border-landing-primary/10 bg-landing-container-lowest text-landing-primary shadow-2xl transition hover:scale-110 active:scale-90 sm:bottom-8 sm:right-8 sm:size-14 lg:hidden"
        aria-label="Help"
      >
        <HelpCircle className="size-6" strokeWidth={1.5} />
      </button>
    </>
  );
}
