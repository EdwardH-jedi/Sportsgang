import { APP_STORE_URL, PRIVACY_URL, SUPPORT_URL, TERMS_URL } from '@/lib/links';
import { SectionIntro } from '../ui';
import { Plus } from '../icons';

const linkClass = 'font-semibold text-forest underline underline-offset-4 hover:text-ink';

const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: 'Where can I get SportsGang?',
    a: (
      <>
        SportsGang is an iPhone app on the{' '}
        <a href={APP_STORE_URL} className={linkClass}>
          App Store
        </a>
        . It is built for Sydney first, and times in the app are Sydney time.
      </>
    ),
  },
  {
    q: 'Is the running and golf experience already in the app?',
    a: 'It arrives with the next SportsGang update. The version on the App Store today is an earlier release that works differently, so features on this page such as pace ranges, golf partner preferences and My Plans come with that update.',
  },
  {
    q: 'Do I have to share my pace or my handicap?',
    a: 'No. Runners can choose social running instead of a pace range, and golfers can say they have no handicap. Cards say so plainly when something hasn’t been shared, instead of guessing.',
  },
  {
    q: 'Are handicaps verified?',
    a: 'No. Handicaps are self-reported and not verified, and an estimate is labelled as an estimate.',
  },
  {
    q: 'Will beginners be matched with experienced golfers?',
    a: 'Only with golfers who have said they are happy to play with beginners or are open to any level. Experienced golfers who haven’t said so are not shown to someone who wants to learn.',
  },
  {
    q: 'Can anyone message me?',
    a: 'No. A one-to-one chat opens only when you both show interest. Group runs and rounds don’t have a group chat; joining one adds it to My Plans.',
  },
  {
    q: 'Does SportsGang book tee times, track runs or offer coaching?',
    a: 'No. SportsGang doesn’t book courses or tee times, doesn’t track runs or record routes, and doesn’t provide coaching. It helps you find people and agree a time and place.',
  },
  {
    q: 'What if someone makes me uncomfortable?',
    a: 'Report or block them from a chat or their profile. Once blocked, neither of you can message, propose a session or show interest, and you won’t see each other in Explore.',
  },
  {
    q: 'Is this a dating app?',
    a: 'No. SportsGang is for finding people to run or play golf with, around a session you both agree on.',
  },
  {
    q: 'Where are the privacy policy, terms and support?',
    a: (
      <>
        Read the{' '}
        <a href={PRIVACY_URL} className={linkClass}>
          Privacy Policy
        </a>
        ,{' '}
        <a href={TERMS_URL} className={linkClass}>
          Terms of Service
        </a>{' '}
        and{' '}
        <a href={SUPPORT_URL} className={linkClass}>
          Support
        </a>{' '}
        pages.
      </>
    ),
  },
];

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="bg-canvas">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:py-28">
        <SectionIntro id="faq-title" eyebrow="FAQ" title="Straight answers." />
        <div className="divide-y divide-line border-y border-line">
          {FAQS.map((f) => (
            <details key={f.q} className="group">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-left text-lg font-semibold text-ink [&::-webkit-details-marker]:hidden">
                {f.q}
                <Plus className="h-5 w-5 flex-none text-forest transition-transform group-open:rotate-45 motion-reduce:transition-none" />
              </summary>
              <div className="pb-5 pr-8 leading-relaxed text-ink-2">{f.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
