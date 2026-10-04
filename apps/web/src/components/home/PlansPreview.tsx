import { useAnimeReveal } from '@/hooks/useAnimeReveal';
import { Illustration, SectionIntro } from '../ui';

type Row = { kind: string; title: string; when: string; where: string; status: string; tone: 'brand' | 'warn' };

const UPCOMING: Row[] = [
  {
    kind: '1:1 session',
    title: 'Running with Mia',
    when: 'Sat 10 Oct · 6:30 am – 7:30 am',
    where: 'Centennial Park',
    status: 'Confirmed',
    tone: 'brand',
  },
  { kind: 'Group run', title: 'Sunday 10 km', when: 'Sun 11 Oct · 7:00 am', where: 'Milsons Point', status: 'Joined', tone: 'brand' },
  { kind: 'Group round', title: 'Saturday 9 holes', when: 'Sat 17 Oct · 7:40 am', where: 'Moore Park', status: 'Hosting', tone: 'brand' },
];

const PENDING: Row = {
  kind: '1:1 session',
  title: 'Golf with Dan',
  when: 'Sun 18 Oct · 8:00 am – 10:30 am',
  where: 'Moore Park',
  status: 'Waiting for Dan',
  tone: 'warn',
};

function PlanRow({ row }: { row: Row }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-moss">{row.kind}</span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            row.tone === 'warn' ? 'bg-warn/10 text-warn' : 'bg-forest/10 text-forest'
          }`}
        >
          {row.status}
        </span>
      </div>
      <p className="mt-1.5 font-semibold text-ink">{row.title}</p>
      <p className="tabular text-sm font-medium text-ink">{row.when}</p>
      <p className="text-sm text-ink-2">{row.where}</p>
    </div>
  );
}

function PlansPhone() {
  return (
    <div className="mx-auto w-full max-w-[22rem] rounded-[2.4rem] border border-ink/10 bg-forest-darkest p-2.5 shadow-[0_40px_80px_-40px_rgba(13,42,27,0.7)]">
      <div className="rounded-[1.9rem] bg-canvas px-4 pb-5 pt-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-moss">Sydney time</p>
        <p className="text-2xl font-bold tracking-[-0.03em] text-ink">My Plans</p>
        <div className="mt-3 grid grid-cols-3 rounded-full bg-panel p-1 text-center text-xs font-semibold">
          <span className="rounded-full bg-white py-1.5 text-ink shadow-sm">Upcoming</span>
          <span className="py-1.5 text-ink-2">Pending (1)</span>
          <span className="py-1.5 text-ink-2">Past</span>
        </div>
        <div className="mt-4 space-y-3">
          {UPCOMING.map((r) => (
            <PlanRow key={r.title} row={r} />
          ))}
        </div>
      </div>
    </div>
  );
}

const NOTES = [
  { title: 'Upcoming', body: 'Confirmed 1:1 sessions, and the group runs and rounds you host or have joined.' },
  { title: 'Pending', body: 'Proposals still waiting on someone. They are never shown as confirmed.' },
  { title: 'Past', body: 'Completed, cancelled and declined plans, so your history stays out of the way.' },
];

export function PlansPreview() {
  const ref = useAnimeReveal<HTMLDivElement>({ childSelector: '[data-plan]', stagger: 90 });

  return (
    <section id="my-plans" aria-labelledby="plans-title" className="bg-canvas">
      <div ref={ref} className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-28">
        <div>
          <div data-plan>
            <SectionIntro id="plans-title" eyebrow="My Plans" title="Every plan in one place.">
              <p>
                One-to-one sessions and group runs and rounds sit together, in Sydney time, so you always know what is
                on and what is still waiting for an answer.
              </p>
            </SectionIntro>
          </div>
          <dl className="mt-10 space-y-5">
            {NOTES.map((n) => (
              <div key={n.title} data-plan className="border-l-2 border-forest pl-4">
                <dt className="font-semibold text-ink">{n.title}</dt>
                <dd className="mt-1 leading-relaxed text-ink-2">{n.body}</dd>
              </div>
            ))}
          </dl>
          <div data-plan className="mt-8 max-w-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-2">In Pending</p>
            <Illustration label="Illustration of a pending row: 1:1 session, Golf with Dan, Sunday 18 October 8:00 to 10:30 am at Moore Park, waiting for Dan. Example data.">
              <PlanRow row={PENDING} />
            </Illustration>
          </div>
        </div>

        <div data-plan>
          <Illustration label="Illustration of the My Plans screen in Sydney time, Upcoming tab: a confirmed 1:1 session, Running with Mia, Saturday 10 October 6:30 to 7:30 am at Centennial Park; a joined group run, Sunday 10 km, Sunday 11 October 7:00 am at Milsons Point; and a group round you are hosting, Saturday 9 holes, 17 October 7:40 am at Moore Park. Example data.">
            <PlansPhone />
          </Illustration>
        </div>
      </div>
    </section>
  );
}
