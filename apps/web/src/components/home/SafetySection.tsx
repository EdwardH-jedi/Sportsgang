import { useAnimeReveal } from '@/hooks/useAnimeReveal';
import { SectionIntro } from '../ui';
import { Shield } from '../icons';

const ITEMS = [
  {
    title: 'Private interest',
    body: 'Showing interest is private. A chat opens only if you both show interest.',
  },
  {
    title: 'Report or block',
    body: 'From a chat or a profile. Once blocked, neither of you can message, propose a session or show interest, and you won’t see each other in Explore.',
  },
  {
    title: 'Plans you agreed',
    body: 'A 1:1 session only counts as confirmed when the other person confirms it. Until then it stays in Pending.',
  },
  {
    title: 'Leave any time',
    body: 'You can delete your account from your profile.',
  },
];

export function SafetySection() {
  const ref = useAnimeReveal<HTMLUListElement>({ childSelector: '[data-safe]', stagger: 80 });

  return (
    <section id="safety" aria-labelledby="safety-title" className="bg-panel">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <SectionIntro id="safety-title" eyebrow="Safety" title="Meet up on your terms." />
        <ul ref={ref} className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ITEMS.map((item) => (
            <li key={item.title} data-safe className="rounded-3xl border border-line bg-canvas p-6">
              <Shield className="h-6 w-6 text-forest" />
              <h3 className="mt-4 text-lg font-semibold text-ink">{item.title}</h3>
              <p className="mt-2 leading-relaxed text-ink-2">{item.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
