# Web: legal routes and print (overnight 2026-10-05, W2-A/B/C)

- **Target:** a production preview (`vite preview` of `apps/web/dist`) that this run started on `http://127.0.0.1:5206/`.
  - Built from this worktree (`fix/run-golf-v2-overnight-2026-10-05`) with the changes below. The changes are uncommitted; the coordinator commits them.
  - Every browser and HTTP result here comes from the same final build (`assets/index-B4gTA2md.js`, `assets/index-C76m2eWz.css`).
- **Browser engine:** Google Chrome 154.0.8037.97, headless (new mode), driven over CDP from Node 20.20.2.
  - **No Safari, WebKit or Firefox engine was run.** Nothing here is Safari coverage.
- **Other tools:** curl 8.7.1 for the HTTP checks, and macOS PDFKit for PDF page count, text and page images.
- **Previews left alone:** 5196 and 5187 were not used or touched.
- **Status:** "PASS" is the implementer's own check, not an independent acceptance.

## What changed

| File | Change |
|---|---|
| `apps/web/vite.config.ts` | Adds middleware for `vite preview` only. GET/HEAD `/privacy`, `/terms`, `/support` get a 301 to the slash form with the query kept. `Location` is built from a constant, so it can't loop and can't be turned into an open redirect. Any other path under a legal route that has no file in the build gets a 404, never the marketing page. `vite dev` and production hosts are unchanged. |
| `apps/web/scripts/check-routes.mjs` (new) and `package.json` script `check:routes` | Dependency-free check. It starts `vite preview` on an ephemeral port against `dist/` and asserts status, `Location` and exact `public/` bytes for the requests listed below. It repeats the "not the marketing page" check on a copy of `dist/` with `privacy/index.html` removed, then lints `hosting/netlify/_redirects`. `--json` writes the observed responses. |
| `.github/workflows/ci.yml` (job `web` only) | Adds the step "Legal routes in the production preview" (`npm run check:routes -w @protin/web`) after the build. The existing steps are unchanged. |
| `apps/web/hosting/netlify/_redirects`, `README.md` (new) | The Netlify route artifact. It is unreviewed, not deployed, and outside `public/`, so it does not ship. The rule set is intentionally empty; see "Netlify artifact" below. The README also says what any other host must do. |
| `apps/web/src/components/home/Faq.tsx` | Before printing (`beforeprint`, or a `matchMedia('print')` change), it saves each `<details>` item's `open` state and opens them all. After printing (`afterprint`) it restores exactly that state. When `beforeprint` started it, only `afterprint` restores. The answers print from the same DOM, with no print-only copy. The + icon is hidden in print. |
| `apps/web/src/styles/index.css` | Adds a `@media print` block. Dark sections (`.on-dark`) use `print-color-adjust: exact`. Shadows are removed. `details::details-content { content-visibility: visible }` lets closed answers print even without the script. The footer and FAQ links print their URL. |
| `SiteHeader`, `SiteFooter`, `ui.tsx`, `Hero`, `RunningSection`, `GolfSection`, `HowItWorks`, `PlansPreview`, `SafetySection`, `FinalCTA` | `print:` classes only. The header becomes static and keeps the wordmark, without nav or buttons. Section padding is tighter. `break-inside: avoid` is set on cards, figures, FAQ items and section intros. The hero is a block in print, because as a grid Chrome moved the whole hero to page 2. Screen classes are unchanged. |
| `apps/web/README.md` | Adds the `check:routes` command and a Print section, and replaces the stale note about trailing slashes on the host. |

## Results

| # | Check | Width / scope | Result | Engine + version | Real vs emulated | Evidence |
|---|---|---|---|---|---|---|
| 1 | Preview routes: `/`, `/privacy`, `/privacy/`, `/terms`, `/terms/`, `/support`, `/support/`, `/privacy?x=1`, `/privacy/?x=1`, `/privacy/index.html`, `/{page}/no-such-file`, `/styles.css`, plus HEAD and `Accept: */*` | HTTP | **PASS** (28/28) | Node 20.20.2 `node:http` → Vite 6.4.2 preview | real HTTP | `routes-check.json` |
| 2 | The check catches the defect: no hook gives 14 FAILs; bad `_redirects` rules give 3 FAILs | HTTP / file | **PASS** (detected) | same | real | `routes-check-negative.json` |
| 3 | Same routes plus every asset linked from `/` and the legal pages: status, `Location`, sha256, byte-identical to `dist/` | HTTP | **PASS** | curl 8.7.1 | real HTTP | `routes-preview-curl.json` |
| 4 | Browser, JavaScript **disabled**: `/privacy`, `/terms`, `/support`, `/privacy?x=1` → 301 → legal page; text equals `public/`; `styles.css` 200. Slash forms. `/` `<noscript>` block and its 4 links | 390 | **PASS** | Chrome 154.0.8037.97 headless | real redirects; scripts off via CDP `Emulation.setScriptExecutionDisabled` | `browser-routes-nojs.json`, `nojs-home-390.jpg`, `nojs-privacy-from-no-slash-390.jpg` |
| 5 | Browser, JavaScript on: same redirects reach the legal pages; `/` renders | 1440 | **PASS** | same | real | `browser-routes-nojs.json` (`jsOn`) |
| 6 | Netlify artifact lint (0 rules; no legal-route rule; no forced catch-all; not in `public/` or `dist/`) | file | **PASS** | `check-routes.mjs` | static check, Netlify not used | `routes-check.json` |
| 7 | Reference host today (read-only, redirects not followed) | `sportgang.netlify.app` | recorded: `/privacy` → 301 `/privacy/`, `?x=1` kept; `/terms`, `/support` the same; slash forms 200 | curl 8.7.1 | real, but serves the separate official-website build, not this one | `routes-netlify-observed.json` |
| 8 | Print `/`, all FAQ items closed, A4, background graphics **off** (dialog default) | A4 | **PASS**: 10 pages, all 10 answers and the 4 link URLs present, no split card, no blank or clipped page | Chrome 154 CDP `Page.printToPDF` | real print pipeline (it fires `beforeprint` and `afterprint`) | `print.json`, `print-home-a4-faq-closed.pdf` (821 KB), `print-a4-pages-01-05.jpg`, `print-a4-pages-06-10.jpg`, `print-a4-page-08-faq.jpg` |
| 9 | Print with items 2, 5 and 9 opened by real clicks: answers printed, then exactly `[F,T,F,F,T,F,F,F,T,F]` restored | A4 | **PASS** | same | real | `print.json` (`pdfs.open-2-5-9-a4`; PDF 820 KB, not kept, same page text as #8) |
| 10 | Print with background graphics on (A4, US Letter) | A4, Letter | **PASS**: 10 pages each | same | real | `print.json`, `print-letter-backgrounds-pages-06-10.jpg` (PDFs 931 KB / 924 KB, not kept) |
| 11 | Scripted print flows, state restored exactly: dispatched `beforeprint`/`afterprint`; emulated print media on/off; `beforeprint`+media(print)+media(screen)+`afterprint` in both orders; Enter still toggles afterwards | 1440 | **PASS** (11/11) | same | events dispatched in page; print media **emulated** (`Emulation.setEmulatedMedia`) | `print.json` (`printEventFlows`, `flowChecks`) |
| 12 | CSS-only fallback: a closed `<details>` not managed by the script shows its content under print media (`checkVisibility()`) | 1440 | **PASS** | same | emulated print media | `print.json` (`cssOnlyFallback`) |
| 13 | Layout: no horizontal overflow, nothing past the viewport, no text overlap; page heights identical to the previous run (11562 / 10639 / 8505 / 6904 px) | 320, 390, 768, 1440 | **PASS** | same | emulated viewports (320/390 mobile @2x) | `layout-{320,390,768,1440}.json`, `first-screen-*.jpg` |
| 14 | Keyboard: full Tab order is identical to the previous run (25 stops at 1440; 27 at 390 with the menu open). Every stop has a visible focus ring. Skip link works. Menu opens with Enter/Space and closes with Escape. FAQ toggles with Enter/Space (accessibility-tree `expanded`) | 1440, 390 | **PASS** | same | real CDP key events, emulated viewport | `keyboard-1440.json`, `keyboard-390.json`, `focus-skip-link-1440.jpg`, `menu-open-390.jpg` |
| 15 | Anchors: nav (1440, 768) and menu (390, 320) links land with the heading below the sticky header; menu closes | 1440, 768, 390, 320 | **PASS** | same | real clicks/Enter, emulated viewport | `anchors.json` |
| 16 | Zoom 200 %, **real** Chrome page zoom (throwaway profile, `partition.default_zoom_level`); window 1440×900 → 720×406 CSS px @2 | 1440 | **PASS** | same | real zoom | `zoom.json` (`realZoom`), `zoom-200-real-1440*.jpg` |
| 17 | Zoom 200 / 300 / 400 % **emulated**: menu items fully visible when Tabbed to; Escape returns focus; FAQ via menu | 720×450, 480×300, 320×256 | **PASS** | same | emulated device metrics | `zoom.json` (`emulatedZoom`, `higherZoomEmulated`), `zoom-400-emulated-320x256-menu-open.jpg` |
| 18 | Reduced motion: no faded or moved text after jumping to each section; `scroll-behavior: auto` | 1440, 390 | **PASS** | same | **emulated** `prefers-reduced-motion: reduce` | `reduced-motion.json`, `reduced-motion-390-golf-60ms.jpg` |
| 19 | Safari | — | **NOT_RUN** | Safari 26.5 installed (version read from Info.plist; not launched) | — | Remote Automation is off; not enabled by this task. `safaridriver` and Safari were not started. |
| 20 | Firefox, Chrome CLI `--print-to-pdf` | — | **NOT_RUN** | — | — | Firefox is not installed. The CLI was not needed: `Page.printToPDF` uses the same print pipeline and also fires the print events. |

## Netlify artifact: why the rule set is empty

The task suggested `_redirects` rules such as `/privacy /privacy/ 301`. That rule was not added:

- **Netlify docs (Redirect options, trailing slash):** rules match a path "regardless of whether or not they contain a trailing slash", and a rule redirecting a path to its own slash variant "will cause an infinite redirect".
- **Shadowing:** a rule does not apply where a file matches the path, unless the rule is forced with `!`.
- **Effect of the suggested rule:**
  - While `privacy/index.html` exists, it does nothing.
  - If the file is missing, or the rule is forced, it loops.
- **Reference host:** it already sends the right 301 with the query kept (#7).

`_redirects` therefore documents this and forbids a forced SPA catch-all (which would replace the legal pages). `check-routes.mjs` enforces both rules (#2, #6).

Not verified: whether a new Netlify site, or a settings change, keeps the 301. `hosting/netlify/README.md` gives the curl commands to re-check after a deploy. The preview hook does not configure any production host.

## Print notes

- **Pages:** 10 on A4 and 10 on US Letter.
- **Remaining empty space (no blank pages):**
  - A4 page 1: the lower ~45 % is the dark hero background, because the partner-card illustration is kept whole on page 2.
  - A4 page 6: the lower ~25 % is empty, because the My Plans phone illustration is kept whole on page 7.
  - A4 page 10: holds only the footer.
- **No clipped text:** every visible print-media text node of `/` is in the PDF text.
- **One PDFKit artefact:** PDFKit returns the words of "You can delete your account from your profile." out of order. The sentence is on the rendered page 8.
- **Dark sections print their background** even with background graphics off. That uses ink, but it keeps white and lime text readable. In a first A4 run of this work without that rule, Chrome printed the hero and running text light grey on white.
- **Hero and closing App Store buttons** don't print their URL. The footer prints it, and so does the first FAQ answer.

## Other observations (unchanged, not defects of this change)

- **App Store label at 320 px:** the hero and closing App Store labels are two balanced lines (`text-balance`, accepted in `a515b00`). The layout rule used for #13 now flags a label only when it wraps to more than 2 lines; the earlier run's rule flagged any wrap.

- **`/favicon.ico`:** opening a legal page requests it, and it returns 404 on the preview. The legal pages declare no icon, and their bytes must not change.
- **Type checking:** `apps/web/tsconfig.json` includes only `src/`, so `npm run typecheck` does not cover `vite.config.ts`. It was type-checked separately (`tsc --noEmit --strict --types node vite.config.ts`, exit 0). `npm run typecheck -w @protin/web` and `npm run build -w @protin/web` pass. `dist/{privacy,terms,support}/index.html` and `dist/styles.css` are byte-identical to `public/` (`cmp`).
- **Harness flake:** one run of the emulated 300/400 % script exited without output (Node exit 13, an unsettled await in the harness). The rerun completed, and its results are recorded.
