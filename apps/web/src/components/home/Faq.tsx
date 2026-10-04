import { useEffect, useRef } from 'react';
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

/**
 * Prints every answer from the same <details> elements: each item is opened
 * for printing, and the reader's own open/closed state is put back after.
 */
function usePrintAllAnswers(list: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = list.current;
    if (!root) return;
    const items = () => Array.from(root.querySelectorAll('details'));
    // The reader's state while printing; null when not printing.
    let saved: boolean[] | null = null;
    // Opened by `beforeprint`: then only `afterprint` restores, because the
    // print media query can stop matching while the print dialog is still open.
    let byPrintEvent = false;

    const openAll = (fromPrintEvent: boolean) => {
      byPrintEvent ||= fromPrintEvent;
      if (saved) return;
      const all = items();
      saved = all.map((d) => d.open);
      all.forEach((d) => {
        d.open = true;
      });
    };
    const restore = () => {
      if (!saved) return;
      const before = saved;
      saved = null;
      byPrintEvent = false;
      items().forEach((d, i) => {
        d.open = before[i] ?? false;
      });
    };

    const onBeforePrint = () => openAll(true);
    // Fallback for print paths that only switch the media query.
    const onPrintMedia = (e: MediaQueryListEvent) => {
      if (e.matches) openAll(false);
      else if (!byPrintEvent) restore();
    };
    const printMedia = typeof window.matchMedia === 'function' ? window.matchMedia('print') : null;

    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', restore);
    // addListener fallback for old Safari, as in useReducedMotion.
    if (printMedia?.addEventListener) printMedia.addEventListener('change', onPrintMedia);
    else printMedia?.addListener(onPrintMedia);
    return () => {
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', restore);
      if (printMedia?.removeEventListener) printMedia.removeEventListener('change', onPrintMedia);
      else printMedia?.removeListener(onPrintMedia);
      restore();
    };
  }, [list]);
}

export function Faq() {
  const listRef = useRef<HTMLDivElement | null>(null);
  usePrintAllAnswers(listRef);

  return (
    <section id="faq" aria-labelledby="faq-title" className="bg-canvas">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:py-28 print:gap-6 print:py-10">
        <SectionIntro id="faq-title" eyebrow="FAQ" title="Straight answers." />
        <div ref={listRef} className="divide-y divide-line border-y border-line">
          {FAQS.map((f) => (
            <details key={f.q} className="group print:break-inside-avoid">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-left text-lg font-semibold text-ink print:min-h-0 print:pb-1 print:pt-3 [&::-webkit-details-marker]:hidden">
                {f.q}
                <Plus className="h-5 w-5 flex-none text-forest transition-transform group-open:rotate-45 motion-reduce:transition-none print:hidden" />
              </summary>
              <div className="pb-5 pr-8 leading-relaxed text-ink-2 print:pb-3 print:pr-0">{f.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
