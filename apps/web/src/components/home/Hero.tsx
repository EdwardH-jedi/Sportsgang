import { useAnimeReveal } from '@/hooks/useAnimeReveal';
import { AppStoreButton, Illustration, NextUpdateNote } from '../ui';
import { ArrowRight, Check } from '../icons';

function PartnerCardPreview() {
  // Mirrors the app's partner card: tier, reasons, and the two actions.
  return (
    <div className="mx-auto w-full max-w-[20.5rem] rounded-[2.4rem] border border-white/15 bg-forest-darkest p-2.5 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.6)]">
      <div className="rounded-[1.9rem] bg-canvas px-4 pb-5 pt-4 text-ink">
        <div className="flex items-center justify-between text-[11px] font-semibold text-ink-2">
          <span>Explore</span>
          <span className="rounded-full bg-panel px-2 py-0.5">Sydney</span>
        </div>
        <div className="mt-3 grid grid-cols-2 rounded-full bg-panel p-1 text-center text-xs font-semibold">
          <span className="rounded-full bg-white py-1.5 shadow-sm">Running</span>
          <span className="py-1.5 text-ink-2">Golf</span>
        </div>
        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-forest text-sm font-bold text-white">
              M
            </span>
            <div>
              <p className="font-semibold">Mia</p>
              <p className="text-xs text-ink-2">Paddington · Running</p>
            </div>
          </div>
          <span className="mt-3 inline-block rounded-full bg-forest/10 px-2.5 py-1 text-xs font-semibold text-forest">
            Fits both ways
          </span>
          <ul className="mt-3 space-y-1.5 text-[13px] leading-snug">
            {['Pace ranges overlap at 5:45–6:15 /km', 'Both like 5 km and 10 km', 'Both prefer mornings'].map((t) => (
              <li key={t} className="flex gap-2">
                <Check className="mt-0.5 h-3.5 w-3.5 flex-none text-forest" />
                <span className="tabular">{t}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm font-semibold">
            <div className="rounded-full border border-line py-2 text-center text-forest">Pass</div>
            <div className="rounded-full bg-lime py-2 text-center text-ink">Show interest</div>
          </div>
        </div>
        <p className="mt-3 text-center text-[11px] text-ink-2">Interest is private. A chat opens if you both show interest.</p>
      </div>
    </div>
  );
}

export function Hero() {
  const ref = useAnimeReveal<HTMLDivElement>({ childSelector: '[data-hero]', stagger: 110 });

  return (
    <section id="top" aria-labelledby="hero-title" className="on-dark hero-glow relative overflow-hidden text-white">
      <div className="bg-lanes pointer-events-none absolute inset-x-0 bottom-0 h-40 opacity-60" aria-hidden="true" />
      <div
        ref={ref}
        className="relative mx-auto grid max-w-6xl gap-14 px-4 pb-20 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-10 lg:pb-28"
      >
        <div>
          <p
            data-hero
            className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/85"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-lime" aria-hidden="true" />
            Sydney · Running &amp; golf
          </p>
          <h1
            id="hero-title"
            data-hero
            className="mt-6 text-[2.75rem] font-bold leading-[1.02] tracking-[-0.045em] sm:text-6xl lg:text-7xl"
          >
            Find your pace.
            <span className="block text-lime">Find your people.</span>
          </h1>
          <p data-hero className="mt-6 max-w-xl text-lg leading-relaxed text-white/85 sm:text-xl">
            SportsGang helps Sydney runners and golfers find people who suit their pace or their game — then agree a
            time in chat and keep every plan in one place.
          </p>
          <div data-hero className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <AppStoreButton />
            <a
              href="#how-it-works"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/35 px-6 font-semibold text-white transition hover:border-white hover:bg-white/5"
            >
              See how it works
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
          <div data-hero>
            <NextUpdateNote className="mt-4 max-w-lg text-white/75" />
          </div>
        </div>

        <div data-hero>
          <Illustration
            label="Illustration of a SportsGang partner card for a runner named Mia: Fits both ways; pace ranges overlap at 5:45 to 6:15 per kilometre; both like 5 and 10 kilometres; both prefer mornings; Pass and Show interest actions. Example data."
            captionClassName="text-white/70"
          >
            <PartnerCardPreview />
          </Illustration>
        </div>
      </div>
    </section>
  );
}
