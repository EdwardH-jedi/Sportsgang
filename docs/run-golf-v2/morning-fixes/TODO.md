# Morning repair cycle — Q01–Q09 (+ R6/C01 gate)

Status: IN_PROGRESS
Branch: `fix/run-golf-v2-morning-q01-q09` (worktree `.claude/worktrees/run-golf-v2-morning`)
Base: `d41efc2cbabed59f4b988e6177aa9354b9bdc3fd` — the review publication commit. Its
application code is byte-identical to the reviewed `ecd1e86` (the `ecd1e86..d41efc2`
diff touches only `docs/`); no newer repair branch existed on origin at start
(`git fetch --prune`, 4 Oct 2026 11:2x AEDT).
Spec: `docs/run-golf-v2/CODEX_OVERNIGHT_ACCEPTANCE_2026-10-04.md`,
`CODEX_OVERNIGHT_HANDOFF_2026-10-04.md`, `overnight-evidence-2026-10-04/`.

Statuses: TODO · IN_PROGRESS · PASS · NOT_RUN (with reason) · BLOCKED.

## Environment (isolated, private)

- PostgreSQL 16 `sg-morning-q01q09-pg` 127.0.0.1:55631, Redis 7
  `sg-morning-q01q09-redis` 127.0.0.1:56631, label `owner=claude-morning-q01q09`.
  Random credentials in a private env file outside the repo.
- Human QA stack (`sportsgang-qa-*`, 55470/56470) and other worktrees: not touched.

## Wave 1 — contact authority (API)

| ID | Implementation | Regression tests | Verification evidence | Limitations |
|---|---|---|---|---|
| Q01 WebSocket admission/delivery vs block | PASS — admission check→register and delivery check→broadcast run under the pair's FOR SHARE lock (`safety.lock_contact`); handshake accepted before the lock; per-socket send timeout (`routers/chat.py`, `services/chat.py`) | PASS — `tests_integration/test_contact_authority.py`: admission held→block waits→4003; block first→4003; delivery held→block waits→frame then closure; review two-barrier case | PASS — 13/13 new tests; on base `d41efc2` the three race tests fail ("no backend waited"); adapted review probe 94/0/0 | Single API process for sockets (CONTRACTS §8 topology limit) |
| Q02 fresh account state after pair lock | PASS — `_lock_pair` selects scalar `User.id, User.is_active` under the lock, never entities (`services/safety.py`) | PASS — same file, parametrized send/like/proposal: actor deactivated while waiting → 403, zero rows, next auth 401 | PASS — on base all three return 201/200 with a stored row | |
| Q03 proposal dispatch vs block (API + worker) | PASS — proposal push holds the pair lock check→token→provider→commit; per-event commit; PG `lock_timeout` 5 s (defer cycle); whole-provider deadline 10 s (`services/notifications.py`) | PASS — block-first (in-process + separate worker) → no invocation; dispatch-first (in-process + separate worker) → block waits, then completes; declined/cancelled still sent while blocked; lock-timeout leaves event pending | PASS — on base dispatch-first fails ("no backend waited"); other base runs error on the missing lock step | Recording provider only; no Expo/APNs call |

## Wave 2 — mobile request/callback ownership

| ID | Implementation | Regression tests | Verification evidence | Limitations |
|---|---|---|---|---|
| Q04 BookingDetailScreen binding epoch | TODO | TODO | TODO | |
| Q05 Explore store owner epoch + operation token | TODO | TODO | TODO | |
| Q06 PartnerDetailScreen confirmation expiry | TODO | TODO | TODO | |
| Q07 MatchesScreen owner/generation request path | TODO | TODO | TODO | |

## Wave 3 — environment and layout

| ID | Implementation | Regression tests | Verification evidence | Limitations |
|---|---|---|---|---|
| Q08 QA launcher TZ-invariant legacy start | PASS — legacy start compared as a UTC epoch: `proc_start_utc` asks `ps` with `TZ=UTC` and parses with `calendar.timegm`; naive `started_at` read as UTC; identity `lstart` strings unchanged (system zone), all other checks unchanged (`scripts/qa/qa.py`) | PASS — `test_legacy_start_time_check_ignores_the_callers_time_zone` (UTC, Sydney, Kiritimati, Los Angeles: adopt exact, refuse 1 h off and wrong pid); existing legacy test records start TZ-independently | PASS — Docker-free 14 pass/7 skip (host and `TZ=UTC`); Docker 21/21 host zone and 21/21 `TZ=UTC`; new test fails on base launcher; real pre-repair launcher API/Metro adopted with unchanged PIDs under `TZ=UTC` | Real adoption run's first `down` left the API running because Metro exited after the grace period (designed fail-closed); second `down` stopped it |
| Q09 composer time-picker header at max text size | TODO | TODO | TODO | Native proof needs a dedicated simulator |

## R6 / C01 — deployment gate (separate from Q01–Q09)

- [ ] Reproduce the overlap inputs 2026-04-04T15:30Z / 16:30Z on isolated PostgreSQL.
- [ ] Read-only production provenance procedure (prepared, not run: no production access).
- [ ] Proposal for exact future UTC audit instants; label legacy ambiguity. No row rewrite,
      no deployment-config change.

## Broad verification

- [ ] API pytest · [ ] PostgreSQL integration (UTC + Sydney DB default) · [ ] adapted R1 probe
- [ ] mobile Jest (CI-like) · [ ] mobile lint · [ ] typechecks · [ ] iOS bundle export
- [ ] QA launcher: Docker-free, Docker host zone, Docker `TZ=UTC`
- [ ] CI on the pushed head

## Delivery

- [ ] IMPLEMENTATION_REPORT.md · [ ] CODEX_REVIEW_HANDOFF.md · [ ] evidence/
- [ ] Commits per wave, pushed; remote head verified
