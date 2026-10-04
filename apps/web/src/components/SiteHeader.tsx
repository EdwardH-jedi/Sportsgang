import { useEffect, useRef, useState } from 'react';
import { AppStoreButton } from './ui';
import { Close, Menu } from './icons';

const NAV = [
  { href: '#running', label: 'Running' },
  { href: '#golf', label: 'Golf' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#my-plans', label: 'My Plans' },
  { href: '#faq', label: 'FAQ' },
];

export function Wordmark({ className = '' }: { className?: string }) {
  // The app's wordmark is set in type (apps/mobile AuthEntryScreen): lowercase,
  // bold, tight tracking, lime on deep green.
  return <span className={`font-bold lowercase tracking-[-0.045em] text-lime ${className}`}>sportsgang</span>;
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    const onResize = () => {
      if (window.matchMedia('(min-width: 768px)').matches) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  return (
    <header className="on-dark sticky top-0 z-40 border-b border-white/10 bg-forest-darkest/95 backdrop-blur supports-[backdrop-filter]:bg-forest-darkest/85">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <a href="#top" className="flex min-h-11 items-center rounded-md text-2xl leading-none" aria-label="SportsGang — back to top">
          <Wordmark />
        </a>

        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-white/85 transition hover:text-white"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          {/* Hidden on the narrowest phones, where the hero action sits right below. */}
          <span className="hidden min-[360px]:inline-flex">
            <AppStoreButton compact className="whitespace-nowrap" />
          </span>
          <button
            ref={toggleRef}
            type="button"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <Close className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
          </button>
        </div>
      </div>

      {open ? (
        <nav id="mobile-nav" aria-label="Primary" className="border-t border-white/10 px-4 pb-5 pt-2 md:hidden">
          <ul className="grid gap-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-12 items-center rounded-lg px-3 text-base font-medium text-white"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <AppStoreButton className="mt-3 w-full" />
        </nav>
      ) : null}
    </header>
  );
}
