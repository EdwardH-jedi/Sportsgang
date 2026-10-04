# Morning repair cycle — Q01–Q09 (+ R6/C01 gate)

Status: DELIVERED FOR INDEPENDENT REVIEW — Q01–Q09 PASS locally; R6/C01 gate open (production provenance NOT_RUN)
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
| Q04 BookingDetailScreen binding epoch | PASS — each account/booking binding gets a new epoch; loaded booking, error, busy state and duplicate guard are tagged with it; preflight requires mounted + same epoch; success/error/finally only in that epoch; no-show dialog uses the same preflight (`BookingDetailScreen.tsx`) | PASS — `BookingDetailScreen.test.tsx` "binding epochs (review Q04)": 4 review probes + 2 controls + 5 new (account A→B→A success/failure, dialog across account A→B→A, same-epoch no-show posts once, old transition neither blocks nor releases new) | PASS — Jest; the new tests fail on the original source except retention controls | Jest only; no native run |
| Q05 Explore store owner epoch + operation token | PASS — module `ownerEpoch` bumped on owner change and reset; like/pass/block capture it; unique action token, only the holder releases `actingOn`; `hydrateFocus` checks the epoch; nullable/false stale results and feed-generation invalidation kept (`stores/explore.ts`) | PASS — `exploreStore.test.ts` "owner epochs and action ownership (review Q05)": 3 probes + 1 control + both operation orders, pre-logout action, stale focus read | PASS — Jest | |
| Q06 PartnerDetailScreen confirmation expiry | PASS — screen snapshots the owner epoch with the card; each Block dialog has a token expired by blur, route change, unmount and use; confirm requires same token, mounted, focused and same epoch before any request; like/pass refuse an earlier-epoch card (`PartnerDetailScreen.tsx`) | PASS — `PartnerDetailScreen.test.tsx` "block confirmation expiry (review Q06)": probe + control + A→B→A, unmount, blur (stays expired after refocus), covered screen, route change, one-shot, failed-block retry | PASS — Jest | Retained-component replacement, not a normal-logout path (logout resets the root stack) |
| Q07 MatchesScreen owner/generation request path | PASS — one `load('load'\|'pull'\|'focus')` path; newest request wins, unmount ignored; list/error tagged with an account epoch (owner change hides previous cards in the same render and reloads); success clears the error; first focus still skipped (`MatchesScreen.tsx`) | PASS — `MatchesScreen.test.tsx` "request ordering and owner (review Q07)": 3 probes + 1 control + 5 new (A→B→A, focus vs newer pull, superseded pull spinner, pull failure + Try again, focus replacing pending first load) | PASS — Jest 966/966 (64 suites, 0 skipped); lint 0 warnings; typechecks pass | Retained-screen owner replacement documented separately from normal logout (root reset unmounts Main) |

## Wave 3 — environment and layout

| ID | Implementation | Regression tests | Verification evidence | Limitations |
|---|---|---|---|---|
| Q08 QA launcher TZ-invariant legacy start | PASS — legacy start compared as a UTC epoch: `proc_start_utc` asks `ps` with `TZ=UTC` and parses with `calendar.timegm`; naive `started_at` read as UTC; identity `lstart` strings unchanged (system zone), all other checks unchanged (`scripts/qa/qa.py`) | PASS — `test_legacy_start_time_check_ignores_the_callers_time_zone` (UTC, Sydney, Kiritimati, Los Angeles: adopt exact, refuse 1 h off and wrong pid); existing legacy test records start TZ-independently | PASS — Docker-free 14 pass/7 skip (host and `TZ=UTC`); Docker 21/21 host zone and 21/21 `TZ=UTC`; new test fails on base launcher; real pre-repair launcher API/Metro adopted with unchanged PIDs under `TZ=UTC` | Real adoption run's first `down` left the API running because Metro exited after the grace period (designed fail-closed); second `down` stopped it |
| Q09 composer time-picker header at max text size | PASS — picker header wraps (`flexWrap`, title `flexShrink: 1`), Done keeps its whole label with `minHeight/minWidth 44` and right-aligns on its own row; sheet cap 70%→90% and centred, padded hint so the scaled footer stays on screen; no font cap added (`BookingComposerScreen.tsx`) | PASS — `BookingComposerScreen.test.tsx` style-contract test (layout proof is native) | PASS — new iPhone 16e simulator (390×844, iOS 26.3): at `accessibility-extra-extra-extra-large` Done x=215 w=151 (right edge 366) h=79.7 for start and end pickers; default size x=310.7 w=55.3 h=44; 15→30 and 45→30 settle on :30 at both sizes; swipe settles on a row; close/reopen keeps the time; form 11:30–12:30 = HTTP `00:30Z`–`01:30Z` = PostgreSQL `00:30+00`/`01:30+00` | Simulator, not a physical device; VoiceOver not run; the composer's own screen title breaks mid-word at max text size (outside the picker; not changed) |

## R6 / C01 — deployment gate (separate from Q01–Q09)

- [x] Reproduce the overlap inputs 2026-04-04T15:30Z / 16:30Z on isolated PostgreSQL — PASS
      (UTC exact; Sydney collapses 16:30Z onto 15:30Z; PostgreSQL resolves the ambiguous wall
      time to the later instant, the API to the earlier) — `R6_C01_DEPLOYMENT_GATE.md` §2.
- [x] Read-only production provenance procedure — prepared (§3); **NOT_RUN** (no production access).
- [x] Proposal for exact future UTC audit instants (§4: keep UTC; or a reviewed `timestamptz`
      migration with an explicit ambiguity policy); legacy ambiguity labelled. No row rewrite,
      no deployment-config change.

## Broad verification

- [x] API pytest 772 passed · [x] integration 42/42 UTC and 42/42 Sydney default (Sydney attempt 1: 2 clock-skew failures, explained in the report) · [x] adapted R1 probe 94/0/0
- [x] mobile Jest 967/967 · [x] review mobile probes 16/16 · [x] mobile lint 0 warnings · [x] typechecks · [x] iOS bundle export
- [x] QA launcher: Docker-free 14/7 skip and Docker 21/21, host zone and `TZ=UTC`; real legacy adoption under `TZ=UTC`
- [x] CI: run 37166797458 on `3f5ad41` 8/8; delivery-head run reported in the final message
- NOT_RUN: physical iPhone, VoiceOver, Android, signed native build, real provider push, production.

## Delivery

- [x] IMPLEMENTATION_REPORT.md · [x] CODEX_REVIEW_HANDOFF.md · [x] R6_C01_DEPLOYMENT_GATE.md · [x] evidence/
- [x] Commits per wave (`20049db`, `55cebf8`, `3f5ad41`, `c46f414`, `3721d58`, docs), pushed; remote head verified in the final message
