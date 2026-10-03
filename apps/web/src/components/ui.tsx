import { APP_STORE_URL } from '@/lib/links';
import { ArrowUpRight, Phone } from './icons';

/** The one primary action: the verified SportsGang App Store listing. */
export function AppStoreButton({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  return (
    <a
      href={APP_STORE_URL}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-lime px-6 py-2 text-center font-semibold leading-tight text-ink shadow-[0_8px_24px_-12px_rgba(13,42,27,0.6)] transition hover:bg-lime-pressed ${
        compact ? 'min-h-10 px-4 text-sm' : 'text-[15px] sm:text-base'
      } ${className}`}
    >
      <Phone className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
      {compact ? 'App Store' : 'Get SportsGang on the App Store'}
      <span className="sr-only"> (opens the App Store listing)</span>
    </a>
  );
}

/** The honest note that goes with every App Store action. */
export function NextUpdateNote({ className = '' }: { className?: string }) {
  return (
    <p className={`text-sm leading-relaxed ${className}`}>
      For iPhone. The running and golf experience on this page arrives with the next SportsGang update.
    </p>
  );
}

/**
 * Frame for an illustrated product preview. Exposed to assistive technology
 * as one image with a description; the visible caption says it is example
 * data, not a screenshot.
 */
export function Illustration({
  label,
  caption = 'Illustration with example data, not a screenshot.',
  className = '',
  captionClassName = 'text-ink-2',
  children,
}: {
  label: string;
  caption?: string;
  className?: string;
  captionClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <figure className={className}>
      <div role="img" aria-label={label}>
        <div aria-hidden="true">{children}</div>
      </div>
      <figcaption className={`mt-3 text-center text-xs ${captionClassName}`}>{caption}</figcaption>
    </figure>
  );
}

export function SectionIntro({
  eyebrow,
  title,
  children,
  id,
  dark = false,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
  id?: string;
  dark?: boolean;
}) {
  return (
    <div className="max-w-2xl">
      <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${dark ? 'text-lime' : 'text-forest'}`}>
        {eyebrow}
      </p>
      <h2
        id={id}
        className={`mt-3 text-3xl font-bold leading-[1.08] tracking-[-0.03em] sm:text-4xl lg:text-5xl ${
          dark ? 'text-white' : 'text-ink'
        }`}
      >
        {title}
      </h2>
      {children ? (
        <div className={`mt-5 text-lg leading-relaxed ${dark ? 'text-white/85' : 'text-ink-2'}`}>{children}</div>
      ) : null}
    </div>
  );
}

export function ExternalLink({ href, children, className = '' }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a href={href} className={`inline-flex items-center gap-1 ${className}`}>
      {children}
      <ArrowUpRight className="h-3.5 w-3.5" />
    </a>
  );
}
