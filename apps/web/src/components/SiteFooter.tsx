import { APP_STORE_URL, PRIVACY_URL, SUPPORT_URL, TERMS_URL } from '@/lib/links';
import { Wordmark } from './SiteHeader';
import { ExternalLink } from './ui';

const LINKS = [
  { href: PRIVACY_URL, label: 'Privacy' },
  { href: TERMS_URL, label: 'Terms' },
  { href: SUPPORT_URL, label: 'Support' },
  { href: APP_STORE_URL, label: 'App Store' },
];

/**
 * Privacy, Terms and Support go to the URLs recorded for the app
 * (docs/release/APP_STORE_METADATA.md §8); this site does not carry its own
 * policy text or contact addresses.
 */
export function SiteFooter() {
  return (
    <footer className="on-dark bg-forest-darkest text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 md:flex-row md:items-end md:justify-between print:break-inside-avoid print:gap-4 print:py-6">
        <div>
          <Wordmark className="text-3xl" />
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/75">
            Running and golf partners in Sydney. Show interest, chat, and plan the session.
          </p>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-2 gap-y-1">
            {LINKS.map((link) => (
              <li key={link.label}>
                <ExternalLink
                  href={link.href}
                  className="min-h-11 rounded-md px-2 text-sm font-medium text-white/85 transition hover:text-white"
                >
                  {link.label}
                </ExternalLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-white/65 sm:px-6">
          © {new Date().getFullYear()} SportsGang.
        </p>
      </div>
    </footer>
  );
}
