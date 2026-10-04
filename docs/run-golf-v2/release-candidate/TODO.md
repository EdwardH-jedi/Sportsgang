# Release candidate — 4 October 2026

Status: IN_PROGRESS
Branch: `chore/run-golf-v2-release-candidate-2026-10-04` (worktree `.claude/worktrees/run-golf-v2-rc`)

## Inputs (verified on origin after `git fetch --prune`, 22:5x AEDT)

| Input | SHA | Use |
|---|---|---|
| Morning candidate delivery (base) | `8b34bca78adc028423defbfb2caca8f4cc2d8a0a` | branch start |
| Morning application source | `c46f4146aa1c46dd8d8d1700d69581ff90a7b5d4` | reviewed code |
| Codex morning acceptance publication | `ce62aacff5dc88efd394abb240dc0a3d0bc3c76d` (`review/run-golf-v2-morning-acceptance-2026-10-04`) | findings MA-A/B/C; docs only (`git diff --name-only 8b34bca ce62aac` is all `docs/`); not merged |
| Website delivery | `97990d9773669ae6f0ad813f4246f37353ec558d` (`feat/run-golf-v2-web-refresh`) | Wave 3 integration |

Codex verdict (VERDICT.json): Q01–Q09 PASS; code NEEDS_FIXES for MA-C, MA-B, MA-A (all P2,
reproduced); release NOT_READY (R6 provenance, single-API topology, device/release gates).
Reviewed delivery = `8b34bca` (matches the base). No newer implementation on origin.

Statuses: TODO · IN_PROGRESS · PASS · NOT_RUN (reason) · BLOCKED.

## Wave 1 — review findings and API time consistency

| ID | Item | Status |
|---|---|---|
| MA-C | Atomic per-event notification ownership; two processors and worker/internal overlap invoke the provider once; fresh state; claim/lock order documented; provider-success/DB-failure ambiguity documented | DONE — committed claim (`delivery_unconfirmed`), `test_notification_ownership.py` 11/11; baseline 8b34bca 9 fail / 2 controls pass |
| MA-B | Room-wide broadcast deadline independent of socket count; cancel+await sends before authority release; every closure attempted under a bound despite failure/hang/cancellation | DONE — 5 s room deadline, 1 s concurrent closes owned by the manager; `test_socket_deadline.py` 7/7; baseline 8b34bca 5 fail / 2 controls pass |
| MA-A | One database clock for first join/leave/rejoin, read after the event row lock; ±120 s host skew; real lock-wait ordering; row reuse/capacity preserved | DONE — `_membership_time` (`clock_timestamp()` after the lock); `test_event_clock.py` 4/4 + capacity 11/11 + unit; baseline 8b34bca fails both skews; `now()` mutation fails both lock-wait cases |
| W1-DOC | CONTRACTS §8 (and event timestamps) updated by one owner | DONE — CONTRACTS §5 participant lifecycle, §8 bounds, ownership states, lock order |

## Wave 2 — mobile accessibility finish

| ID | Item | Status |
|---|---|---|
| A11Y-1 | Booking composer screen heading at max text size (no mid-word wrap), related clipped controls | DONE — `bcecdc8` title/arrow capped at 1.4× (ScreenHeader scale), `e80b369` Back box line height + Send label padding; chat-screen max-size issues recorded, not changed (outside scope) |
| A11Y-2 | Native default + max text on a dedicated simulator; time selection → form → HTTP → DB | DONE — new iPhone 16e sim; Q09 frames identical; 11:30–12:30 AEDT = 00:30Z–01:30Z in API and PostgreSQL (`evidence/native/`); VoiceOver/physical NOT_RUN |

## Wave 3 — website

| ID | Item | Status |
|---|---|---|
| WEB-1 | Integrate `97990d9` (inspect diff; record merge commit) | DONE — merge `410ec8d` (only `apps/web/**`, `docs/run-golf-v2/web-refresh/**`; no lockfile/design export) |
| WEB-2 | GitHub Actions web job (locked install, typecheck, production build) | DONE — `e70a946`; job "Website typecheck and build" green in run 37202969762 |
| WEB-3 | Static `/privacy/`, `/terms/`, `/support/` preserved in the build from the official site branch; verified on the production preview | DONE — byte copies of `ad072fc`; `/privacy/` `/terms/` `/support/` 200 with identical bytes on `vite preview`; no-slash paths fall back to home (host must redirect) |
| WEB-4 | Upcoming-update wording in title/description/OG/Twitter | DONE — `e70a946` (and the no-script note) |
| WEB-5 | CLAIM_MATRIX updated with the Codex verdict and candidate code | DONE — verdict `ce62aac` recorded (NEEDS_FIXES / Q01–Q09 PASS / NOT_READY); A5, A6 updated; E1, E2, E7 stay PENDING |
| WEB-6 | Browser checks: 320/390/768/1440, full keyboard, menu, FAQ, anchors, real zoom, reduced motion, no-JS, print, Safari | DONE — Chrome 154 headless; D1–D3 fixed in `a515b00` and re-checked; real 200 % zoom via profile setting (Cmd+= tool unavailable); Safari NOT_RUN (Remote Automation off) |

## Wave 4 — verification and home testing

| ID | Item | Status |
|---|---|---|
| V-1 | API unit, Ruff, PostgreSQL/Redis integration (UTC + Sydney default), adapted probes | DONE — 773; clean; 64 + 64; R1 adapted 94 PASS; reviewer follow-ups 11 pass / 2 adapted |
| V-2 | Mobile Jest, lint, typecheck, review mobile probes, iOS bundle | DONE — 968 (UTC and Sydney); clean; 16/16; export OK |
| V-3 | Launcher: Docker-free/Docker, caller TZ variants | DONE — 14 + 7 skips ×2; 21/21 ×2 |
| V-4 | Web typecheck/build/preview checks | DONE — at `a515b00`; legal routes byte-identical |
| QA-1 | Fresh candidate QA session (own project/ports/home), API/Metro + web preview healthy, identity verified | DONE — `sg-rc-20261004-qa` API 8163 / Metro 8263 from `a515b00`, fresh fixtures; preview 5196 (detached) |
| QA-2 | HUMAN_QA.md checklist | DONE |
| R6 | Remains separate: existing provenance procedure and proposal; NOT_RUN | NOT_RUN |

## Delivery

TODO.md · IMPLEMENTATION_REPORT.md · CODEX_REVIEW_HANDOFF.md · HUMAN_QA.md · CANDIDATE.json ·
evidence/ · pushed branch · CI (including the new web job).
