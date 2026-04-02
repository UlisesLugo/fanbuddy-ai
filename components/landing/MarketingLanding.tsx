"use client";

import { Eye, EyeOff, HelpCircle, Radar } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { FormEvent, useState } from "react";

const STADIUM_IMAGE =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuDOmFIiyMb4R4woo6sfO1iwwMXUoOuczFb44i_Aw7C-xCZH1vnSE5jMAyfDi7Of7O3mQ6Em7nM_R0sOYL8-UYxcCxCuJbWq8WpJqtEwRZGlhDttH2PniDohsF8YZMJ3sKAFvqX_LjofsM4xLoZcHr1xu9-xB9TKAKJey3emcz2hHKOZb4eFh7IHrKRQ1_bKuqH8kX9igTZWXqewEZ4d_j-TVGQ0czI6Ml00xrh9FnowoZ1KdchZs4x-dkbkGDBuuZfA9cgTaN3Buk0";

const GOOGLE_LOGO =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuD7vO9rDGOaBi0Pyuqa-5gf6dpPK7Ja3d7hWHc1EQGkxpS4_RegrI5VhK8wD231AJR2DQtp2s_XDi62aD4Zzpqjy662gsmYW2GbLjbmOhI3rucoPmiF78vd6HgawzTZQF720NRV94OkNMH4iGtrQMDPdKEcvc3eoFIUz5dCu0XpsFYAZM4YNmCjv8mKw29fVDd9gD_vy3uQE4dr61I2Fal_RK4jlkq1rvMxEaWJwHTAMwIR2VUXaFCNkOykxZnuZNs8V7jLQMDtyew";

const APPLE_LOGO =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuAB1V5_3nOO_6T29lCRk1OjBJFoUDobP6Zm7OaJ-zBZSX_8ngdJexxGMprP77sz4gOE1p5qfNkFQZQrXSnrl9UE0O5ik2FMVhrseQ582lJc-_u9OyK0mY5Fjs9Jh63pgzRLGA37Ez4a9UIUoPahfT4JQJn_QQoWtZiSBRaEMs05ui0sdDQ_o_1fIyzt7EF530mGIezXjk2JppAK31mQxJ-J5_TNVdtK4BZuFD12z6cEg9LsGdt4jRU_pwLC0hjjIvJS2U9KeaRO8Es";

export function MarketingLanding() {
  const [showPassword, setShowPassword] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
  }

  return (
    <>
      <main className="flex min-h-screen flex-col overflow-x-hidden lg:flex-row">
        {/* Left: hero */}
        <section className="relative flex min-h-[512px] w-full items-center bg-landing-inverse px-8 lg:min-h-screen lg:w-[60%] lg:px-24">
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
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-landing-primary/20 bg-landing-primary/20 px-4 py-2 backdrop-blur-md">
              <Radar
                className="size-4 text-landing-primary-container"
                strokeWidth={2}
              />
              <span className="text-[10px] font-bold uppercase tracking-widest text-landing-primary-container">
                AI-POWERED TRAVEL
              </span>
            </div>

            <h1 className="font-headline mb-6 text-balance text-5xl font-extrabold leading-[1.1] tracking-tighter text-landing-container-lowest lg:text-7xl">
              Your football trip,{" "}
              <span className="text-pitch-gradient">optimized by AI</span>
            </h1>

            <p className="mb-10 max-w-lg font-normal text-lg leading-relaxed text-landing-container-highest/80 lg:text-xl">
              FanBuddy.AI analyzes thousands of combinations to deliver the
              perfect itinerary: tickets, flights, and stays all in one place.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                <span className="font-headline mb-1 block text-3xl font-bold text-landing-primary-container">
                  500+
                </span>
                <span className="text-xs uppercase tracking-wider text-landing-container-highest/60">
                  AVAILABLE STADIUMS
                </span>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                <span className="font-headline mb-1 block text-3xl font-bold text-landing-primary-container">
                  2.4s
                </span>
                <span className="text-xs uppercase tracking-wider text-landing-container-highest/60">
                  AI OPTIMIZATION
                </span>
              </div>
            </div>
          </div>

          <div className="absolute bottom-10 left-10 flex items-center gap-4 opacity-50 lg:left-24">
            <div className="h-0.5 w-12 bg-landing-primary-container" />
            <span className="text-[10px] uppercase tracking-[0.3em] text-white">
              The Digital Pitch Experience
            </span>
          </div>
        </section>

        {/* Right: onboarding */}
        <section className="flex w-full flex-col justify-center bg-landing-surface px-8 py-12 lg:w-[40%] lg:px-16">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-12">
              <h2 className="font-headline mb-2 text-2xl font-black italic tracking-tighter text-landing-primary">
                FanBuddy.AI
              </h2>
              <h3 className="font-headline text-3xl font-bold tracking-tight text-landing-on-bg">
                Welcome to the team
              </h3>
              <p className="mt-2 text-landing-on-surface-variant">
                Create your account to start your next football adventure.
              </p>
            </div>

            <div className="mb-8 space-y-4">
              <button
                type="button"
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-landing-outline-variant/10 bg-landing-container-lowest px-6 py-4 shadow-sm transition-all duration-200 hover:bg-landing-container"
              >
                <Image
                  src={GOOGLE_LOGO}
                  alt="Google"
                  width={20}
                  height={20}
                  className="size-5"
                />
                <span className="font-semibold text-landing-on-surface">
                  Continue with Google
                </span>
              </button>
              <button
                type="button"
                className="flex w-full items-center justify-center gap-3 rounded-xl bg-landing-inverse px-6 py-4 shadow-sm transition-all duration-200 hover:bg-zinc-800"
              >
                <Image
                  src={APPLE_LOGO}
                  alt="Apple"
                  width={20}
                  height={20}
                  className="size-5 invert"
                />
                <span className="font-semibold text-white">
                  Continue with Apple
                </span>
              </button>
            </div>

            <div className="relative mb-8 flex items-center py-5">
              <div className="flex-grow border-t border-landing-outline-variant/20" />
              <span className="mx-4 shrink-0 text-[10px] uppercase tracking-widest text-landing-on-surface-variant">
                OR WITH YOUR EMAIL
              </span>
              <div className="flex-grow border-t border-landing-outline-variant/20" />
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
                <div className="flex items-center justify-between px-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-landing-on-surface-variant">
                    Password
                  </label>
                  <Link
                    href="#"
                    className="text-xs font-semibold text-landing-primary hover:underline"
                  >
                    Forgot your password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    className="w-full rounded-xl border-0 bg-landing-container-low px-5 py-4 pr-12 font-normal text-landing-on-surface outline-none transition-all placeholder:text-landing-outline focus:bg-landing-container-lowest focus:ring-2 focus:ring-landing-primary/20"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-landing-on-surface-variant"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
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
                className="mt-4 w-full rounded-xl bg-pitch-gradient py-5 font-headline text-lg font-bold text-white shadow-lg shadow-landing-primary/20 transition-all duration-200 hover:scale-[1.02] active:scale-95"
              >
                Create Account
              </button>
            </form>

            <p className="mt-10 text-center text-sm text-landing-on-surface-variant">
              Already have an account?{" "}
              <Link
                href="#"
                className="font-bold text-landing-primary hover:underline"
              >
                Log In
              </Link>
            </p>

            <div className="mt-auto pt-12 text-center">
              <p className="text-[10px] font-normal uppercase leading-relaxed tracking-widest text-landing-outline">
                By joining, you agree to our <br />
                <Link href="#" className="underline">
                  Terms of Service
                </Link>{" "}
                and{" "}
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
        className="fixed bottom-8 right-8 z-50 flex size-14 items-center justify-center rounded-full border border-landing-primary/10 bg-landing-container-lowest text-landing-primary shadow-2xl transition hover:scale-110 active:scale-90 lg:hidden"
        aria-label="Help"
      >
        <HelpCircle className="size-6" strokeWidth={1.5} />
      </button>
    </>
  );
}
