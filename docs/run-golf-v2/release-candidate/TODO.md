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
| A11Y-1 | Booking composer screen heading at max text size (no mid-word wrap), related clipped controls | TODO |
| A11Y-2 | Native default + max text on a dedicated simulator; time selection → form → HTTP → DB | TODO |

## Wave 3 — website

| ID | Item | Status |
|---|---|---|
| WEB-1 | Integrate `97990d9` (inspect diff; record merge commit) | TODO |
| WEB-2 | GitHub Actions web job (locked install, typecheck, production build) | TODO |
| WEB-3 | Static `/privacy/`, `/terms/`, `/support/` preserved in the build from the official site branch; verified on the production preview | TODO |
| WEB-4 | Upcoming-update wording in title/description/OG/Twitter | TODO |
| WEB-5 | CLAIM_MATRIX updated with the Codex verdict and candidate code | TODO |
| WEB-6 | Browser checks: 320/390/768/1440, full keyboard, menu, FAQ, anchors, real zoom, reduced motion, no-JS, print, Safari | TODO |

## Wave 4 — verification and home testing

| ID | Item | Status |
|---|---|---|
| V-1 | API unit, Ruff, PostgreSQL/Redis integration (UTC + Sydney default), adapted probes | TODO |
| V-2 | Mobile Jest, lint, typecheck, review mobile probes, iOS bundle | TODO |
| V-3 | Launcher: Docker-free/Docker, caller TZ variants | TODO |
| V-4 | Web typecheck/build/preview checks | TODO |
| QA-1 | Fresh candidate QA session (own project/ports/home), API/Metro + web preview healthy, identity verified | TODO |
| QA-2 | HUMAN_QA.md checklist | TODO |
| R6 | Remains separate: existing provenance procedure and proposal; NOT_RUN | NOT_RUN |

## Delivery

TODO.md · IMPLEMENTATION_REPORT.md · CODEX_REVIEW_HANDOFF.md · HUMAN_QA.md · CANDIDATE.json ·
evidence/ · pushed branch · CI (including the new web job).
