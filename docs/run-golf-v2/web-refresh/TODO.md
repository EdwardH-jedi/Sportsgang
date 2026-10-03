# SportsGang Run + Golf Web Refresh — Parallel Overnight TODO

Status: READY_FOR_CLAUDE_IMPLEMENTATION
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
- [ ] Fetch origin and create a dedicated worktree from this branch without disturbing Codex.
- [ ] Inspect applicable instructions, actual web source, workspace scripts and lockfile.
- [ ] Read mobile theme and v2 contracts/reports as references; record a factual claim matrix.
- [ ] Run baseline web typecheck/build; distinguish pre-existing failures.
- [ ] Record the installed tool/runtime versions and an unused preview port.

## Wave 1 — Implement the actual marketing page

- [ ] Change public wordmark, headings, footer and SEO to SportsGang. Keep @protin/web and technical identifiers.
- [ ] Use warm off-white #F5F4EE, dark-green #13291C/#1E5B3B, restrained lime #C5EE5B; keep accessible text contrast.
- [ ] Build a polished responsive hero with running/golf positioning and an honest iPhone CTA.
- [ ] Give running and golf two substantive, differentiated sections.
- [ ] Running copy: similar pace or explicitly social/flexible running; unknown pace stays unknown.
- [ ] Golf copy: similar handicaps or beginners connecting with experienced people who welcome beginners; self-reported values are not verified.
- [ ] Explain the real connect/chat/propose/confirm flow and My Plans, preserving mutual interest before chat.
- [ ] Describe group sessions only to the extent supported by v2; never imply group chat or tee-time inventory.
- [ ] Remove unsupported sport, ranking, identity verification, rating, exclusivity and fake social-proof claims from rendered surfaces.
- [ ] Remove the fake waitlist and all submission side effects from the active page. Preserve unrendered legacy helpers unless cleanup is justified.
- [ ] Preserve useful animation with reduced-motion support and content visible on failure.
- [ ] Make keyboard navigation, focus states, anchor offsets and touch targets usable.
- [ ] Add a concise factual FAQ and working footer.

## Wave 2 — Links, assets and factual boundaries

- [ ] Verify the App Store URL belongs to this app using public primary evidence or existing authoritative project links.
- [ ] If verification is unavailable, record the blocker and use an honest non-download fallback rather than href="#" or a fake success state.
- [ ] Do not create Android-download, coaching, GPS tracking, instant invitation or payment claims.
- [ ] Keep legal/contact content draft unless an existing verified public endpoint is available. Do not fabricate inboxes or rewrite substantive legal policy.
- [ ] Use existing reusable assets or original CSS/SVG visuals; no new logo design or stock-photo dependencies.
- [ ] Use actual current v2 screenshots only when provenance is clear and private fixture/account details are safe; otherwise use clearly illustrative UI with no false product claims.
- [ ] Prepare truthful title/description/Open Graph content; leave unknown production domain/canonical URLs unresolved.
- [ ] Record that the new v2 claims are for a future update until the reviewed app/build actually ships.

## Wave 3 — Next-update release copy

- [ ] Create `APP_STORE_METADATA_V2_DRAFT.md` here, preserving the old canonical draft.
- [ ] Draft one recommended subtitle, promotional text, description, keywords, What's New, and reviewer-flow outline.
- [ ] Count fields against the limits recorded in the existing metadata; report counts without claiming submission approval.
- [ ] Create `CLAIM_MATRIX.md`: public claim, exact source reference, verified/implemented/pending status, and publication condition.
- [ ] Create `RELEASE_HANDOFF.md`: web preview, App Store URL, legal/contact gaps, R6 production provenance gate, physical-device checks, and Codex verdict dependency.
- [ ] Keep all credentials, real reviewer accounts, secrets and private URLs out of drafts.

## Wave 4 — Browser verification and delivery

- [ ] Run `npm run typecheck --workspace @protin/web` and `npm run build --workspace @protin/web`.
- [ ] Inspect the actual running page at 390x844, 768x1024, and 1440x900.
- [ ] Check keyboard access, 200% zoom, reduced motion, long copy, footer dialogs and link behavior.
- [ ] Check rendered copy and SEO for stale branding/unsupported claims, console errors, broken assets and horizontal overflow.
- [ ] Check network activity: no application API, email collection, analytics or QA requests.
- [ ] Save browser evidence in this directory; label unavailable browser checks NOT_RUN.
- [ ] Confirm every changed path is owned, no root lockfile/dependency churn, and no Codex artifacts changed.
- [ ] Commit focused changes, push normally to this branch and verify remote SHA.
- [ ] Write `IMPLEMENTATION_REPORT.md` with exact source, checks, screenshots, preview commands, gaps and morning actions.
- [ ] Update this TODO using PASS/BLOCKED/NOT_RUN honestly. Leave a tested web-only preview command.

## Completion gate

The website is implemented in the existing app, locally reviewable, truthfully branded and product-aligned, checked on mobile/desktop, and pushed with evidence. Remaining App Store/link/legal/production/device prerequisites are explicit. Do not merge main, deploy, publish, trigger paid builds, or modify the app under Codex review.
