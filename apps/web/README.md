# @protin/web

The SportsGang marketing site: one page for Sydney runners and golfers that
explains the next app update and links to the App Store. Vite + React 18 +
Tailwind v4 + anime.js. `@protin/web` is the workspace's technical name;
**SportsGang** is the public brand.

The site is static. It calls no product API, collects no email addresses,
stores nothing in the browser and loads no analytics. The mobile app and API
(`apps/mobile`, `apps/api`) are not used by it.

## Commands

From the repository root (npm workspaces):

```bash
npm run typecheck --workspace @protin/web
npm run build --workspace @protin/web          # tsc --noEmit && vite build → apps/web/dist
npm run preview --workspace @protin/web -- --host 127.0.0.1 --port 5187 --strictPort
npm run dev --workspace @protin/web            # dev server, http://localhost:5173
npm run check:routes --workspace @protin/web   # legal routes in `vite preview` of dist (after build)
```

`preview` serves the last build, so run `build` first. Port 5187 is only a
suggestion that avoids the ports used by local QA stacks.

## Page structure

`src/App.tsx` renders, in order: skip link, `SiteHeader` (sticky, with a
menu below `md`), `Hero`, `RunningSection`, `GolfSection`, `HowItWorks`,
`PlansPreview` (My Plans), `SafetySection`, `Faq` (`<details>` items),
`FinalCTA` and `SiteFooter`. Shared pieces live in `src/components/ui.tsx`
(App Store button, next-update note, illustration frame, section intro) and
`src/components/icons.tsx` (inline SVG icons).

Product previews are illustrations built in HTML/CSS with example data. Each
is exposed to assistive technology as one described image and carries the
visible caption "Illustration with example data, not a screenshot." Their
wording mirrors the app's own labels (`apps/api/app/services/compatibility.py`,
`apps/mobile/src/hooks/usePlans.ts`); keep them in step if the app changes.

## Links

All outbound URLs are in `src/lib/links.ts`:

- App Store: `https://apps.apple.com/au/app/sportsgang/id6767027447`
- Privacy, Terms, Support: `https://sportgang.netlify.app/{privacy,terms,support}/`
  — the URLs recorded for the app in `docs/release/APP_STORE_METADATA.md` §8.

There are no email addresses on the site. See
`docs/run-golf-v2/web-refresh/RELEASE_HANDOFF.md` for what is still open
about those pages and the production domain.

## Motion

`useAnimeReveal` fades sections in once their top edge enters the viewport.
Content is never left hidden: nothing is hidden without JavaScript (the
`.js` class is set by an inline script in `index.html`), reduced motion
shows everything immediately without calling anime.js, print shows
everything, and a timeout reveals targets if an animation never finishes.

## Print

Printing `/` gives the content without the screen chrome. Print rules are
`print:` classes next to the markup plus one `@media print` block in
`src/styles/index.css`:

- The FAQ opens every item for printing (`beforeprint`, or the print media
  query) and puts back the reader's own open/closed state after
  (`afterprint`). Where the browser supports `::details-content`, closed
  answers also print without that script. There is no print-only copy.
- The header prints as a static wordmark bar, without navigation or buttons.
- Section spacing shrinks; cards, illustrations, FAQ items and section
  headings avoid page breaks (a block taller than a page still breaks).
- Dark sections keep their background (`print-color-adjust: exact`) so their
  light text stays readable with background graphics off.
- Footer and FAQ links print their destination after the link text. The hero
  and closing App Store buttons rely on the footer for the printed URL.

## Type checking note

The repository root hoists React 19 type packages for the mobile app, while
this app uses React 18. `lucide-react` resolved against the root types and
broke `tsc`, so the site uses its own inline SVG icons instead. The
dependency is still listed in `package.json` (the lockfile was deliberately
not touched in this change) and can be removed in a later cleanup.

## Reference: Figma Make draft

`apps/web/Protin Landing Page Design/` is the original Figma Make export, kept
as a read-only visual reference. It is excluded from the build, type-check and
Tailwind class scan (`vite.config.ts`, `tsconfig.json`, `source(none)` in
`src/styles/index.css`). Do not edit it.

## Deployment

Not deployed from this branch. Any static host can serve `apps/web/dist`
(build command `npm run build --workspace @protin/web`, Node 20).

Before deploying, read `docs/run-golf-v2/web-refresh/RELEASE_HANDOFF.md`.
The app's recorded legal URLs and the App Store record's seller URL point
to `/privacy/`, `/terms/` and `/support/` on `sportgang.netlify.app`. The
build carries those pages unchanged: `public/{privacy,terms,support}/index.html`
and `public/styles.css` are byte-for-byte copies of `apps/web/site/` on
`feature/sportgang-official-website` at `ad072fc` (the live pages minus the
comment Netlify injects), and CI compares them with `dist/`. Change them on
that branch first, then copy them here.

The host must redirect `/privacy`, `/terms` and `/support` to the
trailing-slash form and must never answer a legal path with the marketing
page. `vite preview` does this through a preview-only middleware in
`vite.config.ts`, checked in CI by `npm run check:routes`; that does not
configure any production host. See `hosting/netlify/README.md` (unreviewed,
not deployed) for the reference host and what other hosts must do.
