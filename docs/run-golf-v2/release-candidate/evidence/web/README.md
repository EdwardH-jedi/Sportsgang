# Web release-candidate verification: SportsGang marketing site

- Target: production preview (`vite preview` of `apps/web/dist`) at `http://127.0.0.1:5196/`. The preview was not restarted or rebuilt; no source file was edited.
- Run: 4–5 Oct 2026 (AEDT).
- Engine for every browser check unless stated otherwise: **Google Chrome 154.0.8037.97, headless (new mode)**, driven over the Chrome DevTools Protocol from a Node 20 script (`ws`). Viewports were set with CDP `Emulation.setDeviceMetricsOverride` (320 and 390 use mobile emulation at DPR 2; 768 and 1440 use desktop at DPR 1). Keys and clicks were real CDP input events (`Input.dispatchKeyEvent` / `Input.dispatchMouseEvent`), with focus emulation on.
- **No Safari or WebKit engine was run** (see check 9). Nothing here is Safari coverage.

## Results

| # | Check | Width / scope | Result | Engine, real vs emulated | Evidence |
|---|---|---|---|---|---|
| 1 | Layout | 320×640 | **FAIL** (D1) | Chrome 154 headless, mobile emulation | `layout-320.json`, `first-screen-320.jpg` |
| 1 | Layout | 390×844 | PASS | Chrome 154 headless, mobile emulation | `layout-390.json`, `first-screen-390.jpg` |
| 1 | Layout | 768×1024 | PASS | Chrome 154 headless | `layout-768.json`, `first-screen-768.jpg` |
| 1 | Layout | 1440×900 | PASS | Chrome 154 headless | `layout-1440.json`, `first-screen-1440.jpg` |
| 2 | Keyboard: full Tab order, focus indicator, skip link, FAQ | 1440 | PASS (FAQ: no aria-expanded attribute in the DOM; the expanded state was checked in the accessibility tree) | Chrome 154 headless, CDP key events | `keyboard-1440.json`, `focus-skip-link-1440.jpg` |
| 2 | Keyboard with the menu open: menu button Enter/Space/Escape, Tab into menu, FAQ | 390 | PASS (FAQ: no aria-expanded attribute in the DOM; the expanded state was checked in the accessibility tree) | Chrome 154 headless, mobile emulation | `keyboard-390.json`, `menu-open-390.jpg` |
| 3 | Narrow menu: opens, links go to the right anchor, menu closes | 390 and 320 | PASS | Chrome 154 headless, real mouse clicks + Enter | `anchors.json` (`w390`, `w320menu`), `keyboard-390.json` |
| 4 | Anchor positions: heading below sticky header and inside viewport | 1440 | PASS | Chrome 154 headless, real clicks, smooth scroll | `anchors.json` (`w1440`) |
| 4 | Anchor positions | 390 | PASS | Chrome 154 headless, via the menu | `anchors.json` (`w390`) |
| 5 | Zoom 200 % using Cmd+= in the user's Chrome (claude-in-chrome) | — | NOT_RUN | Extension reported "Browser extension is not connected"; its key tool also rejects page-zoom shortcuts | `zoom.json` (`claudeInChrome`) |
| 5 | Zoom 200 %: **real Chrome page zoom**, set through the profile preference `partition.default_zoom_level` (not the keyboard shortcut) | 1440×900 window → 720×406 CSS px, devicePixelRatio 2 | PASS | Chrome 154 headless, throwaway profile | `zoom.json` (`realZoom`), `zoom-200-real-1440.jpg`, `zoom-200-real-1440-menu-open.jpg` |
| 5 | Zoom 200 %, **emulated** | 720×450 CSS px @ DPR 2 | PASS | Chrome 154 headless, device-metrics emulation | `zoom.json` (`emulatedZoom`) |
| 5+ | Extra, beyond the 200 % brief: 300 % / 400 %, **emulated** | 480×300 @3x, 320×256 @4x | **FAIL** (D2) | Chrome 154 headless, device-metrics emulation | `zoom.json` (`extraHigherZoomEmulated`), `zoom-400-emulated-320x256-menu-open.jpg` |
| 6 | Reduced motion: no content left at opacity 0 or translated | 1440, 390 | PASS | Chrome 154 headless; `prefers-reduced-motion: reduce` **emulated** with `Emulation.setEmulatedMedia` | `reduced-motion.json`, `reduced-motion-390-golf-60ms.jpg` |
| 7 | JavaScript disabled, `/` (`<noscript>` fallback) | 390, 1440 | PASS (D3 noted) | Chrome 154 headless, `Emulation.setScriptExecutionDisabled` | `no-js.json`, `nojs-home-390.jpg`, `nojs-home-1440.jpg` |
| 7 | JavaScript disabled, `/privacy/`, `/terms/`, `/support/` | 390, full page | PASS | same | `no-js.json`, `nojs-{privacy,terms,support}-390-full.jpg` |
| 8 | Print `/` to PDF | US Letter | PASS (D4, D5 noted) | Chrome 154 `--headless=new --print-to-pdf`; PDF read with macOS PDFKit; page 1 also in Chrome's PDFium viewer | `print.json`, `print-home-pdfkit-p01-p02.jpg`, `print-home-pdfkit-p07-p08.jpg`, `print-home-pdfkit-p09-p10.jpg`, `print-home-pdfium-p01.jpg` (PDF itself 1,082,927 bytes, not kept) |
| 8 | Print `/privacy/` to PDF | US Letter | PASS | same | `print.json`, `print-privacy.pdf` (740,665 bytes, 7 pages) |
| 9 | Safari | — | **NOT_RUN** | `safaridriver` (Safari 26.5): session refused because Remote Automation is off | `safari.json` |
| 10 | Page hrefs (App Store, Privacy, Terms, Support) | DOM at 1440 and the 390 menu | PASS | Chrome 154 headless | `routes.json` (`pageHrefChecks`) |
| 10 | Routes `/privacy/`, `/terms/`, `/support/`, `/styles.css` → 200, byte-identical to `dist` | preview | PASS | curl 8.7.1 | `routes.json` (`localRoutes`) |
| 10 | External links resolve (GET, follows redirects) | App Store + 3 netlify pages | PASS (all 200, no redirect) | curl 8.7.1 | `routes.json` (`externalLinks`) |
| 10 | `/privacy` (no trailing slash) on this preview | preview | Recorded: **200 with the SPA `index.html`** (the marketing page), not the policy and not a redirect; same for `/terms` and `/support` | curl | `routes.json` |

## Defects

**D1: App Store button label wraps at 320 px (layout, FAIL).**
- Reproduce: open `/` at a 320×640 viewport (mobile emulation).
- Hero button (`#top a[href*="apps.apple.com"]`): "Get SportsGang on the App Store" sits on **2 lines** (box 288×53.5 px; 48 px tall at other widths).
- Final CTA button: also **2 lines** (248×53.5 px).
- At 390, 768 and 1440 both labels are on one line (358/328.6/318 px wide, 48 px tall).
- The header's compact "App Store" button is hidden below 360 px by design (`min-[360px]:inline-flex`).
- See `first-screen-320.jpg` and `layout-320.json → appStoreControls`.

**D2: open mobile menu can't fit or scroll at high zoom (extra emulated check, beyond the requested 200 %).**
- Cause: the menu is rendered inside the `sticky top-0` header. With the menu open the header is 410–416 px tall, and it stays pinned while the page scrolls.
- Reproduce at 480×300 CSS px (300 % of 1440×900): open the menu and Tab to its last item ("Get SportsGang on the App Store").
  - The focused item is at top 341, bottom 389, but `innerHeight` is 300, so it is entirely off-screen. `scrollIntoView` and page scrolling don't reveal it.
  - "FAQ" (281–329) is cut off as well.
- At 320×256 (400 % of 1280×1024), "My Plans" is partly hidden and "FAQ" and "App Store" are fully hidden.
- The items become visible only once the document bottom pushes the sticky header up (scrollY 9,994 or 11,656).
- At real 200 % zoom the open menu is 410 px against a 406 px viewport. Only bottom padding is cut, and all 6 items are fully visible, so the requested 200 % check passes.

**D3: no-JS fallback links look like plain text (minor).**
- With scripts disabled, the four `<noscript>` links are styled exactly like the paragraph text: `rgb(19,41,28)`, `text-decoration: none`, weight 400.
- Cause: Tailwind preflight is loaded and resets `a { color: inherit; text-decoration: inherit }`.
- Reproduce: open `/` with JavaScript disabled. See `nojs-home-390.jpg` and `no-js.json → noscriptLinkStyling`.

**D4: FAQ answers are not printed (print only, minor).** The 10 answers live in closed `<details>`, so the printout of `/` has only the questions (PDF page 9).

**D5: cards split across printed pages (print only, minor).**
- Page 7 of `/` ends with the Safety card title "Plans you agreed". Its body ("A 1:1 session only counts as confirmed…") is pushed to page 8, which holds only that paragraph.
- The hero partner-card illustration is also split across pages 1–2.
- No `break-inside: avoid` is set on the cards.
- No text line is cut mid-line.

## Observations (not counted as defects)

- **Nav targets.** The nav has Running, Golf, How it works, My Plans and FAQ. There is **no Safety link**: `section#safety` exists but nothing links to it.

- **Anchor numbers.** The header is 65 px tall (`h-16` plus a 1 px border) and `scroll-padding-top` is 64 px, so every target section's top lands about 1 px under the header (63.5–64.3). Headings stay well clear:

  | Width | Heading top | Heading bottom | Clearance below header bottom (65) | Viewport height |
  |---|---|---|---|---|
  | 1440 | 203.6–204.2 | ≤ 307.7 | ~139 px | 900 |
  | 390 | 171.5–172.3 | ≤ 237 | ~107 px | 844 |
  | 320 | 171.6–172.2 | ≤ 237 | ~107 px | 640 |

  - The wordmark (`#top`, clicked from scrollY 3000) lands with the heading at 187.6.
  - The skip link moves focus to `main#main` (hash `#main`). The next Tab goes to the hero App Store button.
  - The menu was closed after every menu-link click, including keyboard Enter.

- **Focus indicators.**
  - Every one of the 25 stops at 1440 and the 27 stops at 390 (menu open) had a `:focus-visible` outline: 3 px solid with a 3 px offset.
  - Colour is lime `#c5ee5b` on dark areas (11.55:1 on header/footer, 6.03:1 on hero/CTA gradient) and forest `#1e5b3b` on light areas (7.29:1).
  - The skip link shows as a lime pill over the header and partly covers the wordmark at 1440.
  - The skip target `main#main` (`tabIndex=-1`, `outline-none`) shows no ring when the skip link focuses it. That is by design: it is a programmatic target, not a Tab stop, and it is not counted in the Tab order.

- **Focus with the menu open at 390.**
  - Focus can Tab out of the open menu into the page while the menu stays open (it takes up 410 of 844 px).
  - At steps 19 (FAQ "Does SportsGang book tee times…") and 23 (final CTA button), the focused element's top sits exactly at the header bottom (410). The top ~6 px of its outline is under the header.
  - The element itself is never covered: the centre-point check passed for every stop.

- **FAQ semantics.**
  - The FAQ is native `<details>/<summary>` with **no `aria-expanded` attribute in the DOM**.
  - Chrome's accessibility tree reports role `DisclosureTriangle` with `expanded` false → true → false → true → false through Enter, Enter, Space, Space, for all 10 items at both widths. Focus stays on the summary.
  - When open, the answer links (App Store, Privacy Policy, Terms of Service, Support) are reachable by Tab.

- **Print rendering.**
  - In macOS PDFKit/Preview, blurred box-shadows show as dark or grey rectangles (header and hero App Store buttons, phone illustrations, golf card). Chrome's PDFium viewer renders the same PDF cleanly (`print-home-pdfium-p01.jpg`).
  - At Letter width (~739 CSS px) the header prints in its < 768 px layout, with the menu icon.

- **Reduced motion.**
  - With the emulated `reduce`, 0 text elements were faded or translated 60 ms after jumping to each section. `scroll-behavior` resolved to `auto`, and no `data-reveal` attribute was left.
  - Without emulation, the same scan caught 28, 29, 15, 37 and 8 animating text elements, which shows the scan detects motion. After scrolling, 0 elements were left hidden.

- **Legal-page routes.**
  - `/privacy/` makes the browser request `/favicon.ico`, which returns **404** on the preview. The legal pages don't declare an icon, and `dist` has only `favicon.png`.
  - The live `https://sportgang.netlify.app/{privacy,terms,support}/` differ from the local copies only by a 3-line HTML comment the host injects. `styles.css` is byte-identical.

- **Cosmetic.**
  - In the hero illustration at 768 and 1440, "Pace ranges overlap at 5:45–6:15 /km" wraps so that "/km" sits alone on its own line.
  - At 320×640 the hero "next update" note is below the first screen (bottom 699.6 px).

- **Console.** No console errors or warnings on `/` at any width.

## Tool notes

- Chrome 154 CLI `--dump-dom` and `--screenshot` produced no output (0 bytes, no file) when combined with `--blink-settings=scriptEnabled=false`. The no-JS DOM and screenshots therefore come from CDP (`Emulation.setScriptExecutionDisabled`, `DOM.getOuterHTML`). The page-side check `document.documentElement.classList.contains('js') === false` confirms scripts did not run.
- The brief asked for PDF pages to be viewed with the Read tool. That was not possible because the Read tool has no PDF renderer here (`pdftoppm` is not installed). Pages were rendered to JPEG with macOS PDFKit (JXA), viewed, and page 1 of `/` was cross-checked in Chrome's PDFium viewer. Page count and text also come from PDFKit.
- The `--print-to-pdf` CLI processes did not exit after writing their PDFs and were killed. The PDFs are complete.
- **The safaridriver `POST /session` attempt itself launched Safari.app** (process start 00:12:16 AEDT), even though the session was refused. That process was terminated straight away. No Safari setting was changed and no sudo was used.
- Real zoom was applied in a throwaway headless profile, so no zoom level was changed in the user's Chrome. No tab was opened in the user's Chrome.

## Follow-up after the fixes (`a515b00`)

The results above were recorded against the build of `e70a946` and are kept
unchanged. D1–D3 were then fixed in `a515b00` and re-checked on the rebuilt
production preview (same port; engine Google Chrome 154.0.8037.97 headless,
emulated viewports; `recheck-after-a515b00.json`):

| Defect | Change | Re-check |
|---|---|---|
| D1 App Store label at 320 px | `text-balance` on the full label | 320 px: two balanced lines, "Get SportsGang / on the App Store" (`after-a515b00-hero-320.jpg`); 390, 768, 1440: one line (48 px tall); no horizontal overflow at any width |
| D2 open menu at high zoom | the open menu scrolls within the viewport (`max-h-[calc(100dvh-4rem)] overflow-y-auto`) | at 320×256 (400 %) and 480×300 (300 %), every menu item including the App Store button lies inside the viewport when focused; at 720×450 the menu fits unscrolled |
| D3 no-JS links | underline and weight 600 on the four `<noscript>` links | with scripts disabled: all four are underlined, weight 600 |

D4 and D5 (print only) are unchanged and remain notes. Safari remains NOT_RUN.
The Safari process launched by the `safaridriver` attempt was started by that
attempt (00:12:16 AEDT) and stopped by the verifier; it was not a pre-existing
user session.
