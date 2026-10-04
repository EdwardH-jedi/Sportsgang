import { useAnimeReveal } from '@/hooks/useAnimeReveal';
import { SectionIntro } from '../ui';

const STEPS = [
  {
    title: 'Set your preferences',
    body: 'Choose running, golf or both. Runners add a pace range or choose social running, plus distances and times. Golfers add their handicap situation, experience, holes and who they want to play with.',
  },
  {
    title: 'Show interest',
    body: 'Browse people whose preferences fit yours, with the reasons on every card. Interest is private.',
  },
  {
    title: 'Chat when it’s mutual',
    body: 'A chat opens only when you both show interest. That is where you work out the details.',
  },
  {
    title: 'Propose a session',
    body: 'Suggest a time and place from the chat. They confirm or decline, and until then it stays pending.',
  },
  {
    title: 'See it in My Plans',
    body: 'Confirmed sessions, pending proposals and the group runs and rounds you host or join, in Sydney time.',
  },
];

export function HowItWorks() {
  const ref = useAnimeReveal<HTMLOListElement>({ childSelector: '[data-step]', stagger: 90 });

  return (
    <section id="how-it-works" aria-labelledby="how-title" className="bg-panel">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <SectionIntro id="how-title" eyebrow="How it works" title="From a good fit to a plan you both agreed.">
          <p>Five clear steps. A chat needs you both, and a session needs a yes.</p>
        </SectionIntro>

        <ol ref={ref} className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 xl:gap-3">
          {STEPS.map((s, i) => (
            <li key={s.title} data-step className="relative rounded-3xl border border-line bg-canvas p-5 lg:p-6">
              <span className="tabular flex h-9 w-9 items-center justify-center rounded-full bg-forest text-sm font-bold text-white">
                {i + 1}
              </span>
              <h3 className="mt-4 text-lg font-semibold leading-snug text-ink">{s.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{s.body}</p>
            </li>
          ))}
        </ol>

        <p className="mt-8 max-w-3xl rounded-2xl border border-line bg-canvas px-5 py-4 text-ink-2">
          <span className="font-semibold text-ink">Prefer a group?</span> Join a run or round in Explore while spots are
          left, or host one. There is no group chat: the host sets the time, place and number of spots, and joining adds
          it to My Plans.
        </p>
      </div>
    </section>
  );
}
