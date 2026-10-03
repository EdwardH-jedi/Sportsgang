# Website refresh evidence — 4 October 2026 (Sydney)

Evidence for [IMPLEMENTATION_REPORT.md](../IMPLEMENTATION_REPORT.md). Unless a
file says otherwise, it was produced against the production build of
`apps/web` at commit `016ba0b` (assets `index-BhGo18TO.js`,
`index-C-cld3IO.css`), served by `vite preview` at `http://127.0.0.1:5187/`
and driven by Chrome DevTools (MCP) in an isolated browser context with
device emulation. Times in tool output are UTC; 17:00 UTC on 3 Oct is
04:00 on 4 Oct in Sydney.

No credentials, accounts, QA state or private URLs are included. All
screenshots show the page as rendered; the product images inside it are the
site's own illustrations, each captioned "Illustration with example data,
not a screenshot."

| Path | What it shows |
|---|---|
| `checks/baseline-typecheck.log`, `checks/baseline-build.log` | Before any change (`0030072`): typecheck and build failed (exit 2) with 19 TS2786 errors, all from `lucide-react` icons typed against the root React 19 `@types/react` |
| `checks/typecheck-final.log`, `checks/build-final.log` | Final: both exit 0 (Node 26.7.0, npm 11.19.0) |
| `layout-390x844.json`, `layout-768x1024.json`, `layout-1440x900.json` | Per viewport, after scrolling through the page: document width vs viewport (horizontal overflow), elements outside the viewport, interactive targets under 44 px, pill-button sizes (wrapping), text still transparent after reveal, remaining hidden reveal targets, headings |
| `layout-320x640.json` | Extra narrow-phone check (not one of the three required sizes) |
| `layout-zoom200-720x450.json` | 200% zoom of a 1440×900 window, emulated as a 720×450 CSS-pixel viewport at 2× (not real browser zoom) |
| `menu-and-anchors-390x844.json` | Mobile menu: Escape closes it and returns focus to the toggle; each menu link closes the menu and lands its section at the header's bottom edge; skip link, logo and "See how it works" jumps |
| `keyboard-tab-order-1440x900.json` | Real Tab presses from page load through the first FAQ item, with `:focus-visible` on each stop |
| `faq-and-controls-1440x900.json` | FAQ items open and close with Enter; the page has 0 forms, 0 dialogs, 1 button (menu toggle), 0 `href="#"` links, exactly 4 external URLs, no `target` attributes |
| `reduced-motion-script-emulated.json` | Reduced motion via a `matchMedia` override before load: all 134 text elements visible without scrolling. The CSS media feature itself was not emulated |
| `animation-failure-fail-open.json` | `requestAnimationFrame` disabled before load so anime.js never runs: every hidden block appears within 3.5 s via the safety timeout |
| `console-and-network-1440x900.txt` | Full-page load with every FAQ opened: 4 requests, all to `127.0.0.1:5187`; no console messages; no storage or cookies |
| `dist-term-scan.txt` | Built output scanned for stale branding, removed features, contact addresses, storage, tracking and QA/API hosts, with every hit shown in context |
| `link-check.txt` | App Store page, iTunes lookup and the Netlify Privacy/Terms/Support/home pages: status, title and relevant text (public GET requests only) |
| `accessibility-tree-390x844.txt` | DevTools accessibility snapshot: one h1, labelled regions, illustrations exposed as single described images |
| `screenshots/390x844-full.jpeg`, `768x1024-full.jpeg`, `1440x900-full.jpeg` | Full-page captures at 1× (JPEG quality 80) after all reveals completed |
| `screenshots/*-first-screen.png` / `.jpeg` | First screen at 390×844, 768×1024, 1440×900, 320×640 and 200% zoom (the 768 and 1440 captures were converted from PNG to JPEG quality 85 to keep the repository small) |
| `screenshots/390x844-menu-open.png` | Mobile menu open |
| `screenshots/1440x900-focus-1-skip-link.jpeg`, `-focus-3-nav-running.jpeg`, `-focus-9-hero-app-store.jpeg` | Keyboard focus rings: skip link, header link, hero App Store button |
| `screenshots/1440x900-faq-open-keyboard.png` | FAQ item opened with Enter, focus ring on the summary |

Full-page captures are 1× because Chrome repeated the top of the page in a
2× capture taller than its 16,384-pixel limit; that discarded attempt is not
included.
