import { useAnimeReveal } from '@/hooks/useAnimeReveal';
import { AppStoreButton, NextUpdateNote } from '../ui';

export function FinalCTA() {
  const ref = useAnimeReveal<HTMLDivElement>();

  return (
    <section aria-labelledby="cta-title" className="bg-canvas px-4 pb-20 sm:px-6 lg:pb-28 print:pb-8">
      <div
        ref={ref}
        className="on-dark hero-glow relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] px-5 py-14 text-white sm:px-12 sm:py-16 lg:py-20 print:break-inside-avoid print:py-8"
      >
        <div className="bg-lanes pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
        <div className="relative max-w-2xl">
          <h2 id="cta-title" className="text-3xl font-bold leading-[1.08] tracking-[-0.03em] sm:text-5xl">
            Your next run or round, <span className="text-lime">with the right people.</span>
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-white/85">
            Set your preferences, show interest, and plan the session in chat. Everything you agree lands in My Plans.
          </p>
          <div className="mt-8">
            <AppStoreButton className="w-full sm:w-auto" />
          </div>
          <NextUpdateNote className="mt-4 text-white/75" />
        </div>
      </div>
    </section>
  );
}
