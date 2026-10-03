# Release handoff — SportsGang website refresh and next-update copy

**Status: NOT APPROVED FOR RELEASE.** This hands over a locally verified
website build and draft store copy. Nothing has been deployed, submitted or
published. The website describes the next app update, so publishing it has
the same gates as that update.

- Branch: `feat/run-golf-v2-web-refresh`
- Website code: `8cd4275` (implementation) + `016ba0b` (button fix)
- Mobile/API it describes: `ecd1e86` (under independent Codex review)
- Report: [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md) · Claims:
  [CLAIM_MATRIX.md](CLAIM_MATRIX.md) · Store copy:
  [APP_STORE_METADATA_V2_DRAFT.md](APP_STORE_METADATA_V2_DRAFT.md)

## 1. Run it locally

From the repository root of this worktree (no backend, simulator or Docker
needed):

```bash
npm run typecheck --workspace @protin/web
npm run build --workspace @protin/web
npm run preview --workspace @protin/web -- --host 127.0.0.1 --port 5187 --strictPort
# open http://127.0.0.1:5187/
```

`preview` serves the last `build`; rebuild after any change. For live editing
use `npm run dev --workspace @protin/web` (port 5173 from `vite.config.ts`).
The three commands in the block were run on 4 Oct 2026 with Node 26.7.0 and npm 11.19.0; `dev` was not run in this session.

## 2. Hosting: the first blocker

The public site `https://sportgang.netlify.app/` is **not** this app. It is the
static site in `apps/web/site/` on `origin/feature/sportgang-official-website`
(`ad072fc`, 5 May 2026; not merged anywhere): its four page titles match the
live pages exactly. Netlify's deployment settings are not in the repository.

That host also serves `/privacy/`, `/terms/` and `/support/`, which are:

- the URLs recorded for the app (`docs/release/APP_STORE_METADATA.md` §8,
  pinned into `EXPO_PUBLIC_*_URL` for EAS builds);
- the App Store record's seller URL host;
- the destinations of this website's footer and FAQ links.

**Deploying this Vite build over that Netlify site as-is would replace those
three pages with this single page and break the app's legal links.** Choose
one before any deployment:

1. Deploy this build somewhere else (new site or domain) and keep the
   Netlify site serving the legal pages; or
2. Merge the two: add the static `privacy/`, `terms/` and `support/`
   directories to `apps/web/public/` (Vite copies them to `dist/`), then
   check all three routes return 200 on a preview deploy before switching.

Also undecided: the production domain. `index.html` intentionally has no
`og:url`, `og:image`, `twitter:image` or canonical link; add them once the
domain and a 1200×630 share image exist.

## 3. Legal, support and brand gaps on the live pages

Observed on 4 Oct 2026 (`evidence/link-check.txt`). This website links to
these pages but does not change them; their content is out of this branch's
scope and any substantive policy change needs the operator and counsel.

| Gap | Where | Needed before the v2 update is promoted |
|---|---|---|
| Brand spelled "SportGang" | All four pages (titles, header, footer) | Use "SportsGang" (resolved spelling, metadata §12 R1) |
| "v1 · pre-launch" footer | Privacy, Terms, Support | The app is live; remove "pre-launch" |
| "Sports today: Gym Golf Tennis Running"; Support FAQ "v1 supports gym, golf, tennis, and running" | Footers, Support | Update to running and golf when the update ships |
| Home page: "Coming soon on the App Store … iOS first. Android to follow." plus Badminton in a mock-up | `/` | Replace or redirect; it contradicts the live listing and has no Android evidence |
| No support email address on any page | Support | Metadata §12 item 9: real `support@` mailbox on a domain the operator controls. **Do not add an address until it exists** |
| "Last updated May 2026" | Privacy, Terms | Re-review against v2 data use (sport preferences, group sessions) with counsel |
| Custom domain | — | Metadata §12 item 10 (optional) |

## 4. Gates owned by other work

1. **Codex verdict on R1–R7** (`ecd1e86`). Claims that depend on it are
   marked PENDING in the claim matrix: block consequences (R1), block from a
   partner profile (R4), time picker (R5) and time display (R6). If Codex
   does not accept a repair, remove or reword the matching sentences on the
   site (`SafetySection.tsx`, `Faq.tsx`) and in the What's New draft.
2. **R6 production timestamp provenance** (`docs/run-golf-v2/CONTRACTS.md`
   §9). Before the API that contains R6 is deployed, run the read-only SQL in
   §9 on the production database. If production history was written in
   `Australia/Sydney`, set `DB_NAIVE_TIMEZONE=Australia/Sydney` **before**
   the API restarts on the new code. Otherwise every existing chat and
   booking timestamp is shown 10–11 hours off. Not done here (no production
   access was used).
3. **The update itself.** The App Store shows version 1.0 (15 May 2026). Every
   v2 claim on the site waits for the update built from `ecd1e86` (or an
   accepted successor) to be live, or the site must stay unpublished. The
   visible "arrives with the next SportsGang update" note must be removed
   when it ships (claim A3).

## 5. Checks still needed outside this branch

- Physical iPhone: R5 time-wheel finger test, VoiceOver pass on Explore, chat,
  proposal and My Plans, and the in-app Privacy/Terms/Support tap test on the
  **signed** build (metadata §12 item 12; the 5 May pass was Expo Go).
- Signed production build and TestFlight run (metadata §12 item 11), Sign in
  with Apple and push delivery on device.
- New App Store screenshots from the reviewed build with safe demo data. The
  website uses illustrations only and makes no screenshot claims.
- Reviewer demo accounts (two, with fitting running or golf preferences) in
  App Store Connect only.
- Store category: the live record's genre is Health & Fitness; the v1
  metadata recommends Sports. Decide in App Store Connect.
- Website browser checks not run here (see IMPLEMENTATION_REPORT §5): Safari
  and Firefox, real devices, a real OS reduced-motion setting, real browser
  zoom, print, and no-JavaScript rendering.
- The favicon is resized from `apps/mobile/assets/icon.png`, which matches the
  live App Store icon but is listed as placeholder artwork (metadata §12
  item 3). Regenerate `apps/web/public/favicon.png` and
  `apple-touch-icon.png` if the app icon changes.

## 6. Ordered pre-release actions

1. Read the Codex verdict on R1–R7. Adjust PENDING claims if anything was not
   accepted.
2. Run the CONTRACTS §9 read-only SQL on production. Set `DB_NAIVE_TIMEZONE`
   if needed before deploying the API.
3. Finish the physical-device and signed-build checks in §5. Ship the update
   through App Store review.
4. Pick the website host/domain (§2, option 1 or 2) and fix the live legal
   page gaps (§3) with the operator and counsel.
5. Review the copy in `APP_STORE_METADATA_V2_DRAFT.md` against the submitted
   build. Paste it into App Store Connect only when the update is submitted.
6. When the update is live: remove the next-update note and FAQ answer
   (claim A3), add `og:url`/`og:image`/canonical, rebuild and deploy the
   website. Then re-run the link check.
