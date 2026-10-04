import { useAnimeReveal } from '@/hooks/useAnimeReveal';
import { Illustration, SectionIntro } from '../ui';
import { Check } from '../icons';

const INTENTS = ['Similar level', 'Learn from experienced golfers', 'Happy to play with beginners', 'Any level'];

const POINTS = [
  {
    title: 'Similar level, explained',
    body: 'Two handicaps are compared within the gap you choose. Without two handicaps to compare, the card says it matched on experience instead.',
  },
  {
    title: 'Learning, with consent',
    body: 'If you want to learn, you see more experienced golfers only when they have said they are happy to play with beginners or open to any level. Not every experienced golfer has.',
  },
  {
    title: 'Honest about handicaps',
    body: 'Handicaps are self-reported, not verified, and an estimate is labelled as one. You can also play with no handicap at all.',
  },
  {
    title: 'Group rounds',
    body: 'Host a round for two to four golfers with a course and tee time, or join one while spots are left. The host says whether the tee time is secured or still being booked.',
  },
];

function GolfCardPreview() {
  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      <div className="rounded-3xl border border-line bg-white p-5 shadow-[0_24px_48px_-32px_rgba(13,42,27,0.45)]">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-forest text-sm font-bold text-white">
            D
          </span>
          <div>
            <p className="font-semibold">Dan</p>
            <p className="text-xs text-ink-2">Moore Park · Golf</p>
          </div>
          <span className="ml-auto rounded-full bg-forest/10 px-2.5 py-1 text-xs font-semibold text-forest">
            Fits both ways
          </span>
        </div>
        <ul className="mt-4 space-y-1.5 text-[13px] leading-snug">
          {[
            'More experienced than you (plays regularly vs new to golf)',
            'Welcomes beginners',
            'Both prefer 9 holes',
          ].map((t) => (
            <li key={t} className="flex gap-2">
              <Check className="mt-0.5 h-3.5 w-3.5 flex-none text-forest" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 rounded-xl bg-panel px-3 py-2 text-xs text-ink-2">Their handicap is an estimate</p>
      </div>

      <div className="rounded-3xl border border-line bg-white p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-forest">Group round</p>
          <p className="text-xs text-ink-2">4 golfers · 2 spots left</p>
        </div>
        <p className="mt-2 font-semibold">Saturday 9 holes</p>
        <p className="text-sm text-ink-2">Sat 17 Oct · 7:40 am</p>
        <p className="mt-3 inline-block rounded-full border border-line px-2.5 py-1 text-xs text-ink-2">Planning to book</p>
      </div>
    </div>
  );
}

export function GolfSection() {
  const ref = useAnimeReveal<HTMLDivElement>({ childSelector: '[data-golf]', stagger: 80 });

  return (
    <section id="golf" aria-labelledby="golf-title" className="bg-contours relative bg-canvas">
      <div ref={ref} className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:items-start lg:py-28 print:gap-8 print:py-10">
        <div className="lg:order-2">
          <div data-golf>
            <SectionIntro id="golf-title" eyebrow="Golf" title="Golfers who suit your game.">
              <p>
                Add your handicap situation — an official handicap, your own estimate, or none — with your experience,
                9 or 18 holes, and the golfers you want to play with.
              </p>
            </SectionIntro>
          </div>
          <ul data-golf className="mt-6 flex flex-wrap gap-2" aria-label="Who you can choose to play with">
            {INTENTS.map((i) => (
              <li key={i} className="rounded-full border border-forest/25 bg-white px-3 py-1.5 text-sm font-medium text-forest">
                {i}
              </li>
            ))}
          </ul>
          <ul className="mt-10 grid gap-6 sm:grid-cols-2">
            {POINTS.map((p) => (
              <li key={p.title} data-golf className="print:break-inside-avoid">
                <p className="flex items-start gap-2 font-semibold text-ink">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-forest" />
                  {p.title}
                </p>
                <p className="mt-2 leading-relaxed text-ink-2">{p.body}</p>
              </li>
            ))}
          </ul>
          <p data-golf className="mt-8 text-sm text-ink-2">
            SportsGang doesn’t book courses or tee times, and doesn’t offer coaching. It helps you find golfers and agree
            when to play.
          </p>
        </div>

        <div data-golf className="lg:order-1 lg:pt-6">
          <Illustration label="Illustration of a golf partner card for Dan: Fits both ways; more experienced than you, plays regularly versus new to golf; welcomes beginners; both prefer 9 holes; their handicap is an estimate. Below it, a Saturday 9-hole group round on 17 October at 7:40 am for 4 golfers with 2 spots left, tee time planning to book. Example data.">
            <GolfCardPreview />
          </Illustration>
        </div>
      </div>
    </section>
  );
}
