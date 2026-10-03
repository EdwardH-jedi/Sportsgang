# SportsGang Run + Golf Web Refresh — Parallel Overnight TODO

Status: IMPLEMENTED_LOCALLY_VERIFIED — not deployed, not approved for release (see IMPLEMENTATION_REPORT.md)
Created: 4 October 2026 (Australia/Sydney)
Owner: Claude implementation
Branch: `feat/run-golf-v2-web-refresh`
Base delivery: `cd567c80af2f6d23fc9cbe4bd178507c37d85ae3`
Mobile/API code baseline: `ecd1e86047cdc4411905d43210bc07112bbcbf07`

## Purpose

While Codex independently reviews R1–R7, implement the existing marketing website's SportsGang running/golf refresh. Prepare next-update App Store copy and a release handoff. This task is not mobile/API implementation, independent acceptance, deployment, or App Store publication.

## Observed gaps

- `apps/web` is the actual Vite/React/Tailwind/anime.js application, workspace `@protin/web`.
- Its hero/footer/SEO still use Protin, although SportsGang is the chosen public brand.
- Its primary action is a browser-local waitlist claiming the app has not launched.
- It promotes gym, badminton, tennis, rankings, verified profiles and community ratings rather than the current running/golf focus.
- `docs/release/APP_STORE_METADATA.md` describes the earlier four-sport version and Events tab; the next update uses Explore, My Plans, Chats and Profile.
- Footer legal/contact material is explicitly draft and contains unconfirmed inboxes.
- The existing App Store app ID is 6767027447 in `apps/mobile/eas.json`. Public link/region availability still requires verification. Failed retrieval is not evidence that the app is unavailable.

## File ownership

Write only:
- `apps/web/**`, excluding the read-only `apps/web/Protin Landing Page Design/**` reference export.
- `docs/run-golf-v2/web-refresh/**`.

Read other paths for factual context, but do not edit:
- Mobile/API source, tests, native config, shared types or assets.
- Root package.json/package-lock.json, workflow files, infra/deployment config.
- `scripts/qa/**`, QA credentials/state or owner records.
- Existing review reports/evidence, contracts, root todo.md or legacy release documents.

Use a separate worktree, dependencies and local preview port. Do not operate any simulator, Docker/QA stack or backend service. No product API requests, waitlist collection, analytics, provider setup, remote writes or deployment.

## Wave 0 — Establish the isolated baseline

- [x] Inspect remote code/docs and identify a web-only parallel task.
- [x] Record immutable application and delivery baselines.
- [x] Fetch origin and create a dedicated worktree from this branch without disturbing Codex. — PASS (`.claude/worktrees/run-golf-v2-web-refresh`)
- [x] Inspect applicable instructions, actual web source, workspace scripts and lockfile. — PASS
- [x] Read mobile theme and v2 contracts/reports as references; record a factual claim matrix. — PASS (`CLAIM_MATRIX.md`)
- [x] Run baseline web typecheck/build; distinguish pre-existing failures. — PASS: baseline FAILED (exit 2, 19 × TS2786 from lucide-react vs root React 19 types), pre-existing; now exit 0 (`evidence/checks/`)
- [x] Record the installed tool/runtime versions and an unused preview port. — PASS (Node 26.7.0, npm 11.19.0, port 5187)

## Wave 1 — Implement the actual marketing page

- [x] Change public wordmark, headings, footer and SEO to SportsGang. Keep @protin/web and technical identifiers. — PASS
- [x] Use warm off-white #F5F4EE, dark-green #13291C/#1E5B3B, restrained lime #C5EE5B; keep accessible text contrast. — PASS (lime used as a fill or on dark green only)
- [x] Build a polished responsive hero with running/golf positioning and an honest iPhone CTA. — PASS
- [x] Give running and golf two substantive, differentiated sections. — PASS
- [x] Running copy: similar pace or explicitly social/flexible running; unknown pace stays unknown. — PASS
- [x] Golf copy: similar handicaps or beginners connecting with experienced people who welcome beginners; self-reported values are not verified. — PASS
- [x] Explain the real connect/chat/propose/confirm flow and My Plans, preserving mutual interest before chat. — PASS
- [x] Describe group sessions only to the extent supported by v2; never imply group chat or tee-time inventory. — PASS
- [x] Remove unsupported sport, ranking, identity verification, rating, exclusivity and fake social-proof claims from rendered surfaces. — PASS (`evidence/dist-term-scan.txt`)
- [x] Remove the fake waitlist and all submission side effects from the active page. Preserve unrendered legacy helpers unless cleanup is justified. — PASS; legacy helpers deleted with justification in IMPLEMENTATION_REPORT §2
- [x] Preserve useful animation with reduced-motion support and content visible on failure. — PASS (OS-level reduced motion NOT_RUN; script-emulated)
- [x] Make keyboard navigation, focus states, anchor offsets and touch targets usable. — PASS
- [x] Add a concise factual FAQ and working footer. — PASS

## Wave 2 — Links, assets and factual boundaries

- [x] Verify the App Store URL belongs to this app using public primary evidence or existing authoritative project links. — PASS (`evidence/link-check.txt`)
- [x] If verification is unavailable, record the blocker and use an honest non-download fallback rather than href="#" or a fake success state. — N/A: verification succeeded; no `href="#"` on the page
- [x] Do not create Android-download, coaching, GPS tracking, instant invitation or payment claims. — PASS
- [x] Keep legal/contact content draft unless an existing verified public endpoint is available. Do not fabricate inboxes or rewrite substantive legal policy. — PASS: links to the existing public pages; their gaps are listed in RELEASE_HANDOFF §3
- [x] Use existing reusable assets or original CSS/SVG visuals; no new logo design or stock-photo dependencies. — PASS (favicon resized from the existing app icon)
- [x] Use actual current v2 screenshots only when provenance is clear and private fixture/account details are safe; otherwise use clearly illustrative UI with no false product claims. — PASS: illustrations only, captioned
- [x] Prepare truthful title/description/Open Graph content; leave unknown production domain/canonical URLs unresolved. — PASS (meta tags describe v2 without the next-update note: CLAIM_MATRIX A6)
- [x] Record that the new v2 claims are for a future update until the reviewed app/build actually ships. — PASS (visible note, FAQ, CLAIM_MATRIX)

## Wave 3 — Next-update release copy

- [x] Create `APP_STORE_METADATA_V2_DRAFT.md` here, preserving the old canonical draft. — PASS
- [x] Draft one recommended subtitle, promotional text, description, keywords, What's New, and reviewer-flow outline. — PASS
- [x] Count fields against the limits recorded in the existing metadata; report counts without claiming submission approval. — PASS (description/What's New 4,000 limit is Apple's, not recorded in the existing file — noted)
- [x] Create `CLAIM_MATRIX.md`: public claim, exact source reference, verified/implemented/pending status, and publication condition. — PASS
- [x] Create `RELEASE_HANDOFF.md`: web preview, App Store URL, legal/contact gaps, R6 production provenance gate, physical-device checks, and Codex verdict dependency. — PASS
- [x] Keep all credentials, real reviewer accounts, secrets and private URLs out of drafts. — PASS

## Wave 4 — Browser verification and delivery

- [x] Run `npm run typecheck --workspace @protin/web` and `npm run build --workspace @protin/web`. — PASS (exit 0 both)
- [x] Inspect the actual running page at 390x844, 768x1024, and 1440x900. — PASS (Chrome emulation; real devices NOT_RUN)
- [x] Check keyboard access, 200% zoom, reduced motion, long copy, footer dialogs and link behavior. — PASS (zoom and reduced motion emulated; the footer has no dialogs any more)
- [x] Check rendered copy and SEO for stale branding/unsupported claims, console errors, broken assets and horizontal overflow. — PASS
- [x] Check network activity: no application API, email collection, analytics or QA requests. — PASS
- [x] Save browser evidence in this directory; label unavailable browser checks NOT_RUN. — PASS (`evidence/`, IMPLEMENTATION_REPORT §5)
- [x] Confirm every changed path is owned, no root lockfile/dependency churn, and no Codex artifacts changed. — PASS
- [x] Commit focused changes, push normally to this branch and verify remote SHA. — PASS (remote SHA recorded in the final hand-off message; `git ls-remote origin feat/run-golf-v2-web-refresh`)
- [x] Write `IMPLEMENTATION_REPORT.md` with exact source, checks, screenshots, preview commands, gaps and morning actions. — PASS
- [x] Update this TODO using PASS/BLOCKED/NOT_RUN honestly. Leave a tested web-only preview command. — PASS (preview on 127.0.0.1:5187)

## Completion gate

The website is implemented in the existing app, locally reviewable, truthfully branded and product-aligned, checked on mobile/desktop, and pushed with evidence. Remaining App Store/link/legal/production/device prerequisites are explicit. Do not merge main, deploy, publish, trigger paid builds, or modify the app under Codex review.

## Not run / still open (4 Oct 2026)

- NOT_RUN: Safari, Firefox, physical devices, OS reduced-motion setting, real
  browser zoom, print, no-JavaScript rendering, VoiceOver, full Tab order
  past the first FAQ item (IMPLEMENTATION_REPORT §5).
- BLOCKED (outside this branch): deployment host/domain decision and the
  Netlify legal-page collision; live legal page gaps; Codex verdict on
  R1–R7; R6 production timezone check; signed-build and physical-device
  checks (RELEASE_HANDOFF §2–§5).
