import { useAnimeReveal } from '@/hooks/useAnimeReveal';
import { Illustration, SectionIntro } from '../ui';
import { Check } from '../icons';

const POINTS = [
  {
    title: 'See where your paces overlap',
    body: 'Share the range you are comfortable at and a card shows exactly where it meets theirs, like “Pace ranges overlap at 5:45–6:15 /km”. Turn on Matching pace only to see just those runners.',
  },
  {
    title: 'Social running counts too',
    body: 'Prefer company to split times? Choose social running and skip the pace. Your profile says “Social — pace is flexible”.',
  },
  {
    title: 'No guessing',
    body: 'Not everyone shares a pace. When someone hasn’t, their card says “Hasn’t shared a pace range” instead of assuming one.',
  },
  {
    title: 'Group runs',
    body: 'Host a run with a time, a meeting point and a number of spots, or join one while spots are left.',
  },
];

// Axis: 5:00 to 7:00 /km, so each minute is 50% of the track.
const MIN = 300;
const SPAN = 120;
const pos = (sec: number) => `${((sec - MIN) / SPAN) * 100}%`;
const width = (from: number, to: number) => `${((to - from) / SPAN) * 100}%`;

function PaceRangePreview() {
  return (
    <div className="rounded-3xl border border-white/10 bg-forest-darkest/80 p-5 sm:p-6">
      <div className="flex items-baseline justify-between text-white">
        <p className="font-semibold">Pace ranges</p>
        <p className="text-xs text-white/70">min per km</p>
      </div>

      <div className="relative mt-5">
        {/* Overlap band between You (5:30–6:15) and Mia (5:45–6:30). */}
        <div
          className="absolute bottom-0 top-0 rounded-md bg-lime/15 ring-1 ring-lime/40"
          style={{ left: pos(345), width: width(345, 375) }}
        />
        <ul className="relative space-y-4">
          <li>
            <p className="text-sm font-semibold text-white">You</p>
            <div className="relative mt-1.5 h-3 rounded-full bg-white/10">
              <div className="absolute h-3 rounded-full bg-lime" style={{ left: pos(330), width: width(330, 375) }} />
            </div>
          </li>
          <li>
            <p className="text-sm font-semibold text-white">Mia</p>
            <div className="relative mt-1.5 h-3 rounded-full bg-white/10">
              <div className="absolute h-3 rounded-full bg-white" style={{ left: pos(345), width: width(345, 390) }} />
            </div>
          </li>
        </ul>
      </div>
      <div className="tabular relative mt-2 h-4 text-[11px] text-white/70">
        {[300, 330, 360, 390, 420].map((sec, i, all) => (
          <span
            key={sec}
            className={`absolute top-0 ${i === 0 ? '' : i === all.length - 1 ? '-translate-x-full' : '-translate-x-1/2'}`}
            style={{ left: pos(sec) }}
          >
            {`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`}
          </span>
        ))}
      </div>
      <p className="tabular mt-4 rounded-xl bg-white/5 px-3 py-2 text-sm text-white">
        <span className="font-semibold text-lime">Mia · </span>Pace ranges overlap at 5:45–6:15 /km
      </p>

      <ul className="mt-5 space-y-3 border-t border-white/10 pt-5 text-sm">
        <li className="flex items-center justify-between gap-3">
          <span className="font-semibold text-white">Sam</span>
          <span className="rounded-full border border-white/20 px-2.5 py-1 text-xs text-white/85">Social — pace is flexible</span>
        </li>
        <li className="flex items-center justify-between gap-3">
          <span className="font-semibold text-white">Jo</span>
          <span className="rounded-full border border-dashed border-white/25 px-2.5 py-1 text-xs text-white/75">
            Hasn’t shared a pace range
          </span>
        </li>
      </ul>
    </div>
  );
}

export function RunningSection() {
  const ref = useAnimeReveal<HTMLDivElement>({ childSelector: '[data-run]', stagger: 80 });

  return (
    <section id="running" aria-labelledby="running-title" className="on-dark relative overflow-hidden bg-forest-dark text-white">
      <div className="bg-lanes pointer-events-none absolute inset-0 opacity-50" aria-hidden="true" />
      <div ref={ref} className="relative mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:items-start lg:py-28 print:gap-8 print:py-10">
        <div>
          <div data-run>
            <SectionIntro id="running-title" eyebrow="Running" title="Run at your pace — or just for the company." dark>
              <p>
                Tell SportsGang the distances, times and group style you like, and either your comfortable pace or
                that you would rather keep it social. A card only claims a fit your stated preferences support, and
                says plainly when something is unknown.
              </p>
            </SectionIntro>
          </div>
          <ul className="mt-10 grid gap-6 sm:grid-cols-2">
            {POINTS.map((p) => (
              <li key={p.title} data-run className="print:break-inside-avoid">
                <p className="flex items-start gap-2 font-semibold text-white">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-lime" />
                  {p.title}
                </p>
                <p className="mt-2 leading-relaxed text-white/80">{p.body}</p>
              </li>
            ))}
          </ul>
          <p data-run className="mt-8 text-sm text-white/70">
            SportsGang doesn’t track your runs or record routes. It helps you find people and agree when and where to
            meet.
          </p>
        </div>

        <div data-run className="lg:pt-6">
          <Illustration
            label="Illustration of pace ranges: your range 5:30 to 6:15 per kilometre and Mia's 5:45 to 6:30 overlap at 5:45 to 6:15. Sam runs socially with a flexible pace. Jo hasn't shared a pace range. Example data."
            captionClassName="text-white/70"
          >
            <PaceRangePreview />
          </Illustration>
        </div>
      </div>
    </section>
  );
}
