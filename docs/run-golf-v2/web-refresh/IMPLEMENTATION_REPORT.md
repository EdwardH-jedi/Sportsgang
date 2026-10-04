# Implementation report — SportsGang website refresh

**Outcome: implemented and locally verified; not deployed, not approved for
release.** The existing `apps/web` Vite/React/Tailwind/anime.js app now
presents SportsGang's running and golf experience for Sydney, links to the
live App Store listing, and says plainly that this experience arrives with
the next update.

## 1. Commits

| | SHA |
|---|---|
| Planning commit (start) | `0030072` |
| Base delivery | `cd567c8` |
| Mobile/API described by the site (under Codex review) | `ecd1e86` |
| Website implementation | `8cd4275` |
| Button fix (390 px) | `016ba0b` |
| Release documents | `158fb4c` |
| This report, evidence and TODO | the commit that adds this file (see `git log`) |

Branch `feat/run-golf-v2-web-refresh`, worktree
`.claude/worktrees/run-golf-v2-web-refresh`. Pushed normally; no force push,
no merge.

## 2. What changed

Every changed path is under `apps/web/` (excluding the untouched
`Protin Landing Page Design/` export) or `docs/run-golf-v2/web-refresh/`.
`package.json`, `package-lock.json` and `apps/web/package.json` are
byte-identical to the start.

**Page (`apps/web/src`)**

| Section | Content |
|---|---|
| Header (`SiteHeader.tsx`) | `sportsgang` wordmark in the app's style, anchor nav (Running, Golf, How it works, My Plans, FAQ), compact App Store button (hidden below 360 px), menu below 768 px with Escape-to-close and focus return |
| Hero (`Hero.tsx`) | "Sydney · Running & golf", "Find your pace. Find your people.", App Store button, "See how it works", next-update note, illustrated Explore card |
| Running (`RunningSection.tsx`) | Pace overlap, Matching pace only, social running, "Hasn't shared a pace range", group runs, "doesn't track your runs or record routes"; pace-range illustration |
| Golf (`GolfSection.tsx`) | Handicap situation, intents, similar level explained, learning only with consenting golfers, self-reported handicaps, group rounds of 2–4, no tee-time booking or coaching; golf card and group-round illustration |
| How it works (`HowItWorks.tsx`) | Five steps: preferences → show interest → chat when mutual → propose, confirm or decline → My Plans; group sessions without group chat |
| My Plans (`PlansPreview.tsx`) | Upcoming / Pending / Past explained; illustrated My Plans screen and a pending row |
| Safety (`SafetySection.tsx`) | Private interest, report or block, plans only confirmed by the other person, delete account |
| FAQ (`Faq.tsx`) | Ten `<details>` items, including availability, next update, sharing pace or handicap, verification, beginners, messaging, what the app doesn't do, safety, not a dating app, legal links |
| Final action and footer | App Store button with next-update note; footer links to Privacy, Terms, Support and the App Store; no email addresses |

Wording mirrors the app's own labels (claim-by-claim sources in
[CLAIM_MATRIX.md](CLAIM_MATRIX.md)). Illustrations are HTML/CSS with
synthetic names, exposed to assistive technology as one described image,
captioned "Illustration with example data, not a screenshot." Their "Show
interest" and "Pass" are not buttons.

**Removed:** Protin branding; the waitlist form and its `localStorage`
collector (`lib/waitlist.ts`); draft legal modals with invented
`@protin.app` inboxes (`Modal.tsx`, `content/legal.tsx`); gym, badminton and
tennis cards; rank badges; group-event content. The TODO asked to keep
unrendered legacy helpers unless cleanup was justified. These were deleted
because every one carried Protin branding, invented inboxes, unsupported
features or a data collector, and none is imported any more. They remain in
git history.

**Other:**

- `index.html`: SportsGang title, description, Open Graph and Twitter tags.
  No `og:url`, `og:image` or canonical (domain undecided). Adds a `js`
  class marker, a `noscript` fallback with the four links, and the favicon
  and Apple touch icon.
- `public/favicon.png` and `apple-touch-icon.png` are resized from
  `apps/mobile/assets/icon.png`. That icon matches the App Store listing's
  artwork (compared against Apple's public 100 px icon).
- `styles/index.css`: palette tokens from the app theme (`#F5F4EE`,
  `#13291C`, `#1E5B3B`, `#C5EE5B` and supporting greens), focus rings,
  4 rem anchor offset, CSS-only lane and contour backgrounds.
- `hooks/useAnimeReveal.ts`: the reveal now starts when a container's top
  edge enters the viewport. The old 18% threshold could never be reached
  by sections taller than about 5.5 viewports, for example at 200% zoom.
  A timeout also reveals content if an animation never finishes.
- `components/icons.tsx`: inline SVG icons replace `lucide-react`. This
  removes the cause of the pre-existing typecheck and build failure.
  `lucide-react` is still listed in `apps/web/package.json`, unused,
  because changing dependencies would touch the lockfile.
- `src/lib/links.ts`: the four public URLs, with how each was checked.
- `README.md`: rewritten for the SportsGang site.

## 3. Build and typecheck

| Check | Before (`0030072`) | After (`016ba0b`) |
|---|---|---|
| `npm run typecheck --workspace @protin/web` | FAIL, exit 2: 19 × TS2786, all `lucide-react` vs root React 19 types (pre-existing) | PASS, exit 0 |
| `npm run build --workspace @protin/web` | FAIL, exit 2 (same errors) | PASS, exit 0: JS 196.52 kB (63.10 kB gzip), CSS 30.59 kB |

Logs: `evidence/checks/`. Dependencies were installed in this worktree with
`npm ci` (lockfile unchanged). Node 26.7.0, npm 11.19.0. The repository's
CI uses Node 20 and has **no job that builds or checks `apps/web`**, so a
CI result on this branch says nothing about the site.

## 4. Browser verification (Chrome DevTools, production build)

| Check | Result | Evidence |
|---|---|---|
| 390×844, 768×1024, 1440×900: horizontal overflow | PASS — document width equals viewport; no element outside it | `layout-*.json`, `screenshots/*-full.jpeg` |
| Clipped headings / wrapped buttons | PASS — no clipped text; all pill buttons single-line at the three sizes. At 320 px the two long App Store buttons wrap to two centred lines (56 px) | `layout-*.json`, `layout-320x640.json` |
| Touch targets ≥ 44 px | PASS — only inline text links in FAQ answers are smaller (inline-link exception) | `layout-*.json` |
| Cards and layout | PASS on review of every full-page capture; three issues found and fixed during review (step cards too narrow at 768, closing button wrapping at 390, header crowding at 320) | `screenshots/` |
| Keyboard | PASS — skip link first, then logo, nav, App Store buttons, "See how it works", first FAQ item, each with a visible focus ring; FAQ opens/closes with Enter; menu closes with Escape and returns focus | `keyboard-tab-order-1440x900.json`, `menu-and-anchors-390x844.json`, focus screenshots |
| Anchors and sticky header | PASS — every menu and in-page anchor lands its section at the header's bottom edge (64 px) | `menu-and-anchors-390x844.json` |
| 200% zoom | PASS (emulated as a 720×450 CSS viewport at 2×; header uses 14% of the height) | `layout-zoom200-720x450.json`, `screenshots/zoom200-*.png` |
| Reduced motion | PASS (script-emulated `matchMedia`; content fully visible without scrolling) | `reduced-motion-script-emulated.json` |
| Animation failure | PASS — with `requestAnimationFrame` disabled, all content appears within 3.5 s | `animation-failure-fail-open.json` |
| Content visible after reveal | PASS — 0 transparent text elements, 0 hidden reveal targets at every size | `layout-*.json` |
| Footer and dialogs | PASS — footer links work; the page has no dialogs, forms or inputs; one button (menu) | `faq-and-controls-1440x900.json` |
| Console errors and broken assets | PASS — no console messages; all 4 requests succeed (favicon included) | `console-and-network-1440x900.txt` |
| Network | PASS — only `127.0.0.1:5187`; no API, email collection, analytics, QA services or third-party prefetch; nothing stored in the browser | `console-and-network-1440x900.txt` |
| Rendered copy and SEO | PASS — built output has no Protin, waitlist, gym/badminton/tennis, rank, rating, testimonial, Android, "coming soon" or email addresses; "verified" appears only as "not verified" | `dist-term-scan.txt` |
| Primary action and external links | PASS — 4 external URLs, all 200 with the expected titles; App Store page is this app (`id6767027447`, "SportsGang") | `link-check.txt`, `faq-and-controls-1440x900.json` |
| Accessibility tree | PASS on review — one h1, labelled regions, described illustrations | `accessibility-tree-390x844.txt` |

Screenshots (all from the `016ba0b` build; index in [evidence/README.md](evidence/README.md)):

- `docs/run-golf-v2/web-refresh/evidence/screenshots/1440x900-faq-open-keyboard.png`
- `docs/run-golf-v2/web-refresh/evidence/screenshots/1440x900-first-screen.jpeg`
- `docs/run-golf-v2/web-refresh/evidence/screenshots/1440x900-focus-1-skip-link.jpeg`
- `docs/run-golf-v2/web-refresh/evidence/screenshots/1440x900-focus-3-nav-running.jpeg`
- `docs/run-golf-v2/web-refresh/evidence/screenshots/1440x900-focus-9-hero-app-store.jpeg`
- `docs/run-golf-v2/web-refresh/evidence/screenshots/1440x900-full.jpeg`
- `docs/run-golf-v2/web-refresh/evidence/screenshots/320x640-first-screen.png`
- `docs/run-golf-v2/web-refresh/evidence/screenshots/390x844-first-screen.png`
- `docs/run-golf-v2/web-refresh/evidence/screenshots/390x844-full.jpeg`
- `docs/run-golf-v2/web-refresh/evidence/screenshots/390x844-menu-open.png`
- `docs/run-golf-v2/web-refresh/evidence/screenshots/768x1024-first-screen.jpeg`
- `docs/run-golf-v2/web-refresh/evidence/screenshots/768x1024-full.jpeg`
- `docs/run-golf-v2/web-refresh/evidence/screenshots/zoom200-1440x900-first-screen.png`

## 5. Not run

- **NOT_RUN** Safari, Firefox, and any physical phone or tablet (Chrome
  device emulation only).
- **NOT_RUN** The operating system's reduced-motion setting. The CSS
  `prefers-reduced-motion` rules (reveal fallback, smooth scroll) were not
  exercised; only the JavaScript path was.
- **NOT_RUN** Real browser zoom (viewport emulation only).
- **NOT_RUN** Print preview and no-JavaScript rendering. Both are handled in
  code (`@media print` override; `noscript` block) but were not viewed.
- **NOT_RUN** Tab presses beyond the first FAQ item. The rest follows DOM
  order, and no element sets a positive `tabindex`.
- **NOT_RUN** Screen reader (VoiceOver) pass.
- **NOT_RUN** `npm run dev` (only `build` + `preview` were run).

## 6. Link verification

Checked from this machine on 4 Oct 2026 Sydney time with public GET requests
(`evidence/link-check.txt`). App Store Connect, Apple accounts and private
credentials were not used.

- `https://apps.apple.com/au/app/sportsgang/id6767027447`: 200, "SportsGang
  App - App Store". The iTunes lookup gives `SportsGang`, bundle
  `com.edh1223.protin` (as in `app.config.js`), **version 1.0 released
  15 May 2026**, free, genre Health & Fitness, seller URL
  `https://sportgang.netlify.app/`.
- `https://sportgang.netlify.app/privacy/`, `/terms/`, `/support/`: 200. They
  have gaps (SportGang spelling, v1 sports, "pre-launch", no support
  mailbox); see [RELEASE_HANDOFF.md](RELEASE_HANDOFF.md) §3.
- Prerequisite before deploying: the Netlify host collision in
  RELEASE_HANDOFF §2.

## 7. Preview

```bash
cd .claude/worktrees/run-golf-v2-web-refresh
npm run build --workspace @protin/web
npm run preview --workspace @protin/web -- --host 127.0.0.1 --port 5187 --strictPort
```

Open `http://127.0.0.1:5187/`. Left running after this session: `vite preview`,
pid 14978, listening on 127.0.0.1:5187 and serving `apps/web/dist` built
from `016ba0b`. It was started by this Claude session (background task
`bzbzfekqu`) and uses no backend, simulator or Docker. Stop it with
`kill 14978` (check `lsof -nP -iTCP:5187 -sTCP:LISTEN` first). A rebuild
replaces `dist/` and the running preview serves the new files on reload.

## 8. Morning review

1. Open `http://127.0.0.1:5187/` (or run §7). Read the page on a phone-width
   window and on desktop.
2. Check the copy against [CLAIM_MATRIX.md](CLAIM_MATRIX.md), especially the
   PENDING rows tied to Codex's R1/R4/R5/R6 verdict.
3. Choose a subtitle and review the store copy in
   [APP_STORE_METADATA_V2_DRAFT.md](APP_STORE_METADATA_V2_DRAFT.md).
4. Decide the website host and domain (RELEASE_HANDOFF §2) before anyone
   deploys this build.
5. Follow RELEASE_HANDOFF §6 for the release order.

## 9. Isolation

- No file under `apps/mobile/`, `apps/api/`, `packages/`, `scripts/qa/`,
  `.github/`, infrastructure or deployment config changed. No existing
  review, evidence, contract, release document or root `todo.md` changed.
  `git diff --name-only 0030072..HEAD` lists only `apps/web/**` and
  `docs/run-golf-v2/web-refresh/**`.
- `apps/web/Protin Landing Page Design/` untouched.
- No simulator, Docker project, QA stack, backend service or QA owner record
  was used. The only local process started was the `vite preview` above, on
  a port not used by the QA stacks (8130/8144/8190/8194 were in use by
  other processes and were not touched).
- Codex's review branch and worktree were not touched; nothing was merged.
- No deployment, App Store Connect access, message sending, waitlist
  backend or paid build.
