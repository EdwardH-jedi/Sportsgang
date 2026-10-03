# R1–R7 implementation report — 3–4 October 2026

Implementer: Claude. This is implementation verification, **not independent
acceptance**; the acceptance decision belongs to the next Codex review.
Evidence: [r1-r7-evidence/](r1-r7-evidence/README.md). The independent review
([CODEX_REVIEW_AFTER_FIXES.md](CODEX_REVIEW_AFTER_FIXES.md)), its handoff and
`independent-evidence/` are unchanged.

## Baseline and SHAs

| | |
| --- | --- |
| Repository | `https://github.com/EdwardH-jedi/Sportsgang` |
| Review artifact commit | `60a264c9180103da18d0aa6aac794840381fd3be` (tip of `origin/chore/run-golf-v2-home-test-ready`; no newer commits at start) |
| Reviewed application source | `b530e7f3e726b9e830e52259f0ae699725090f5f` |
| Repair branch / worktree | `fix/run-golf-v2-independent-review-r1-r7`, created from `60a264c` in `.claude/worktrees/run-golf-v2-r1-r7` |
| Final application SHA | **`ecd1e86`** (last code/test change; the report/evidence commit follows it) |

Baseline in the repair worktree before any edit: API 752 passed, mobile 878
in 62 suites, lint/format/typechecks clean, 0 skipped.
`feat/run-first-ui`, the other worktrees, and the untracked files in the main
checkout were not touched; nothing was stashed, reset, cleaned or
cherry-picked.

Commits (oldest first): `977216d` R1 · `9884a71` R2 · `5e52573` R3 · `eb15191`
R4 · `2eda444` R5 · `334f5be` R2 follow-up (status) · `1f0ddf8` R6 · `ab5c95e`
R7 · `1aaa262` R1 follow-up (Chats focus refresh) · `ecd1e86` test-zone fix
for CI (R6/R7 tests).

## Status matrix

| | Defect | Status | Evidence of the fix |
| --- | --- | --- | --- |
| R1 | Blocking left messages, matches, proposals and sockets open | **Fixed** (server authoritative) | SQLite matrix both directions; real PG lock order, burst and **live uvicorn WebSocket**; adapted reviewer probe now 403 everywhere; native block/unblock on 17e |
| R2 | QA stop/down trusted pid + port substring; shared project across worktrees | **Fixed**; adoption of the running human stack **not yet performed** (by design — see below) | 20/20 launcher tests incl. disposable Compose lifecycle; adapted reviewer probe refuses; read-only dry run shows the human stack is adoptable only from its own worktree |
| R3 | Late Booking Detail response showed A while Cancel targeted B | **Fixed** | 12 binding tests asserting visible partner + request URL |
| R4 | Block raced feed loads and like/pass | **Fixed** | 7 store + 7 screen race tests; native block from detail |
| R5 | Native wheel tap committed a different minute | **Fixed on simulator** (native trace before/after); **physical-iPhone finger test pending** | Native traces/screenshots, 9 unit rules, stored proposal bounds |
| R6 | Audit timestamps had no zone on the wire | **Contract implemented; legacy production provenance unverified** — not claimed fully resolved | Unit + real PG with UTC and Sydney database defaults; mobile under a Sydney device; native preview/blocked date |
| R7 | Retry hid the stale-data notice before recovery | **Fixed** | 5 retry tests; native held retry against a black-hole port |

The original F1–F8 fixes still pass (see "F1–F8 rechecks").

## Changed behavior and API contracts

### R1 — bilateral contact restriction ([CONTRACTS.md §8](CONTRACTS.md))

`app/services/safety.py` defines one restriction: a block in either
direction, or an inactive/missing account. Denials are **403** with the single
detail **"You can't contact this person."** (direction-neutral) and write
nothing (no message, action, match, booking, notification, rank row).

- Denied: `POST`/`GET /matches/{id}/messages`; the match leaves `GET /matches`
  and its `total`; `POST /discovery/actions` (like/pass/save; unknown target
  404); `POST /bookings`; `POST /bookings/{id}/confirm`; `POST /challenges`
  and `/accept`.
- WebSocket: admission now matches HTTP auth (missing/inactive user → close
  **1008**; non-participant or restricted → **4003**); a successful block
  closes the pair's open sockets; every push re-checks the restriction, so a
  message committed just before a block is stored but not pushed. A queued
  `proposal_received` push is not delivered after a block.
- **History**: messages are retained unchanged but **hidden from both** while
  blocked (the model's documented intent) and readable again after unblock.
  **Commitments**: existing bookings stay readable to both (list, detail, My
  Plans, partner name) and can be declined, cancelled (with its
  notification), completed or marked no-show; reminders for bookings that
  stay confirmed still go. Reporting a blocked person works. Deletion is
  unchanged (hard delete, cascades).
- Races: contact writes lock the pair's `users` rows `FOR SHARE` in id order
  before reading `blocks`; block/unblock lock `FOR NO KEY UPDATE`. A write
  waiting on a block re-reads and writes nothing (proven on PG by holding the
  lock from a second connection for send, like and proposal); a block waits
  for an in-flight contact write.
- Client: Chats now refreshes on focus (its focus refetch had never run), so
  a chat blocked from the chat screen leaves the list; refusals surface the
  server text.

### R2 — QA ownership ([HOME_TEST_RUNBOOK.md](HOME_TEST_RUNBOOK.md) "Stack ownership")

Design: **one canonical shared owner** for `sportsgang-qa`, plus explicitly
isolated instances via `QA_PROJECT` + ports in `.qa/config.env`.

- Owner record `~/.sportsgang-qa/<project>.json` (worktree + config
  fingerprint derived from the DB password; no secrets), claimed with
  `O_EXCL`; per-project `flock` for every stack-changing command.
  `up/seed/stop-api/restart/down/reset` refuse from another worktree or a
  regenerated config.
- Existing containers without a record are adopted only if created from this
  worktree's compose file with this config's DB password; a volume with no
  containers and no record is refused. `compose.qa.yml` no longer names the
  shared project, so a bare `docker compose -f` cannot target it.
- Process identity before any signal: pid, process group (must be its own),
  `lstart`, full `ps -ww` command line and resolved cwd, captured after
  readiness (Metro retitles itself). Mismatch → never signalled;
  `down/restart/stop-api/reset` refuse and change nothing. Previous-launcher
  records are upgraded only when pgid, cwd, launched command (`npx` →
  `npm exec`) and start time (±5 s) all match. Escalation to SIGKILL only for
  the same verified group.
- Failed `up` cleans up only what that run started (any exception), never the
  volume, and reports cleanup failures without escalating.
- `status` shows ownership, verified identity, the recorded start SHA and
  whether `apps/api` / `apps/mobile`+`packages` changed since (neither
  process reloads: uvicorn has no `--reload`, Metro runs with `CI=1`, which
  disables its watcher — the earlier "serves live" wording was wrong).

### R3 — Booking Detail binding

Results, errors and transitions are tagged with `(account, booking id)` plus a
request generation and render only while that binding is current; a route or
account change clears the old booking immediately. Late success/rejection,
late transitions, transitions after unmount, a confirmation dialog opened for
an earlier binding, and payloads for another id are dropped; a double tap
sends one transition. The mutation always targets the booking shown.

### R4 — store-owned block

`stores/explore.ts` owns `blockPartner`; like, pass and block share the
synchronous `actingOn` guard (refused actions send nothing; feed loads no
longer release the guard). A successful block bumps the feed generation
(first and next pages requested before it are dropped), removes the card,
re-requests an interrupted first page and unsticks "more". Results after an
account change are reported stale; Partner Detail navigates only while
mounted and focused. `recordAction` now resolves `null` when refused/stale.

### R5 — native wheel

Native trace of the unfixed wheel (iPhone 17e): `press index=2` started an
animated `scrollTo(88)`, the parent re-render's selected-effect issued a
second, non-animated `scrollTo(88)` (and the `contentOffset` prop changed),
the running animation carried the view one more row (88→132, smooth
samples), and its `momentumEnd y=132` was taken as a selection → 45. The fix:
one position authority (`scrollToRow` only, position recorded before
`onChange`), constant initial `contentOffset`, and every programmatic scroll's
end — animated or not; iOS reports both as momentum ends, found natively when
the end picker reseeds its draft — only confirms its target; other rows'
ends (replaced scrolls) are ignored; user drags select where they settle
(including a release exactly on a row). Row text is capped at 1.6× so digits
are no longer clipped at accessibility sizes. F5's Sydney/UTC conversion,
duration validation and DST policy are untouched.

### R6 — audit instants ([CONTRACTS.md §9](CONTRACTS.md))

- Nine `timestamp without time zone` audit columns (listed in §9, confirmed
  in `information_schema`) are unchanged — no column or row migration.
- Future writes: API and Alembic sessions pin `TimeZone` to
  `DB_NAIVE_TIMEZONE` (default `UTC`, validated at startup; UTC needs no zone
  database). Verified on a database whose default zone is `Australia/Sydney`.
- Wire: one `AuditInstant` type serializes every audit field (HTTP and the
  WebSocket frame) as `…Z`, reading naive values in `DB_NAIVE_TIMEZONE`;
  appointment bounds stay under §7.
- Mobile: `parseInstant` reads timestamps as instants (an offset-free value
  from an older API is UTC, never device-local); chat previews, blocked dates
  and the chat timeline (instant, then messages before proposals, then id)
  use it.

### R7 — retry freshness

A retry marks the source `retrying` and keeps its error; only a successful
reload (an empty one included) clears it; a refresh supersedes a pending
retry. The notice stays with a disabled "Retrying…" action (announced busy);
sources already being retried or loading more are not re-requested; the
first-load "Try again" ignores taps while trying. Paging and wording are
unchanged.

## Timestamp provenance assumptions (R6)

- Repository evidence for UTC: local, CI and staging use `postgres:16-alpine`
  without a `TZ`/`timezone` override (server default `UTC`, source
  `configuration file` on the disposable DB); no code, migration or
  deployment file sets a session/database zone.
- **Unverified**: production is Fly managed Postgres (`fly postgres create`,
  region `syd`); its historical `TimeZone` was not inspected (no remote
  access, no remote writes). Reading existing production rows as UTC is an
  assumption.
- Verification plan (read-only SQL in CONTRACTS.md §9): `SHOW timezone`,
  `pg_settings` source, `pg_db_role_setting`, and a per-month probe comparing
  each proposal's naive `bookings.created_at` with its notification's aware
  `scheduled_at` written in the same request (offset 0 h = UTC). Tested on the
  disposable databases: it separates UTC-pinned writes (0) from Sydney-session
  writes (+10).
- Decision rules: all UTC → keep default; one other zone throughout → set
  `DB_NAIVE_TIMEZONE`; mixed/unknown → keep UTC for new writes and only then
  consider the documented reversible `timestamptz` migration, tested on a copy.
- **Consequence if the assumption is wrong**: under the default every legacy
  audit value is sent as UTC. If production history was written under
  Sydney, those values show 10–11 h off on every device (Sydney phones, which
  previously read offset-free values as device-local and happened to be
  right, get worse) until `DB_NAIVE_TIMEZONE=Australia/Sydney` is set.
  **Deployment rule: run the read-only verification before deploying R6 and
  set `DB_NAIVE_TIMEZONE` to match before the API restarts on it.**
- Tools that bypass the API (psql, `apps/api/scripts/*` seeders) do not get the
  pin.

## Commands and results (final code)

| Check | Result |
| --- | --- |
| `uv run --frozen ruff check .` / `ruff format --check .` (apps/api) | All checks passed / 146 files already formatted |
| `uv run --frozen pytest -q` | **772 passed, 0 skipped** (baseline 752; +14 R1, +6 R6) |
| `alembic upgrade head` on fresh empty DBs (UTC default; Sydney default) | 0016 (head) both |
| `pytest tests_integration -q -rs` on those DBs | **29 passed, 0 skipped** each (baseline 22; +4 R1, +3 R6) |
| R6 integration with `DB_NAIVE_TIMEZONE`/`TZ` = UTC/UTC, UTC on Sydney DB, Sydney/Sydney on Sydney DB | 3/3 each |
| `npm run lint --workspace @protin/mobile` | 0 warnings |
| mobile and shared-types typecheck | pass |
| `npm run test:ci --workspace @protin/mobile -- --runInBand --watchman=false` | **929 passed, 64 suites, 0 skipped** (baseline 878/62); also 929/64 under Node 20 + `TZ=UTC` with workers and in-band |
| `APP_ENV=local EXPO_NO_TELEMETRY=1 npx --no-install expo export --platform ios` | Hermes 4.41 MB, 1,418 modules (JS bundle only) |
| `QA_TEST_DOCKER=1 python3 -m unittest scripts/qa/test_qa.py` | **20/20**; without Docker 13 pass + 7 Docker-only skipped (that is what the new CI job runs) |
| `fix-evidence/probe_findings.py` (TZ=UTC; TZ=Australia/Sydney) | 7/7 PASS each |
| `fix-evidence/verify_populated_upgrade.py` | 9/9 PASS |
| Adapted reviewer probes | R1/R6: all contact 403, controls pass, `…Z`; R2: refused, child survives |

Disposable services only: `sg-r1r7-verify` (PG 55491 / Redis 56491, tmpfs),
`sg-r1r7-probe` (55453 / 56453, tmpfs, for the guarded fix-evidence scripts),
`qa-test-*` projects created and removed by the launcher tests, and the
isolated launcher instance `sportsgang-qa-r1r7` (8131/8191/55471/56471) used
for native work. All were removed afterwards.

CI: runs for `977216d`, `9884a71`, `eb15191`, `334f5be` passed. `1f0ddf8`,
`ab5c95e` and `1aaa262` failed `test-mobile` (4 tests): the R6 tests changed
`process.env.TZ` inside Jest, which does not change the worker's zone on a UTC
runner, and an existing My Plans test pressed Retry outside `act` and had only
passed because R7 cleared the notice synchronously. `ecd1e86` fixes both
(`jest.sydney-env.js`; the press is flushed in `act`, assertions unchanged)
and was reproduced locally under Node 20 + `TZ=UTC`. **CI run 37131294040 on
`ecd1e86` passed all 8 jobs** (lint, test, typecheck, lint-mobile,
test-mobile, PostgreSQL and Redis integration, QA launcher ownership,
docker-build). The documentation-only commit after it is reported in the
delivery message.

## Native evidence (iPhone 17e simulator, iOS 26, Expo Go)

A separate simulator was booted for this work; the human's iPhone 16e and
17 Pro were never touched. **Simulator evidence only — no physical device.**

- **R5** reproduced on the unfixed wheel (45→tap 30→15; 15→tap 30→45; 00→tap
  30→45; Done committed 9:45) with native callback traces; after the fix:
  both reviewer cases, every minute and several hour taps, overlapping taps,
  flick, slow and held drags, Done/reopen, auto-shifted end time, and
  `accessibility-extra-large` (taps correct; digits clipped before the cap,
  legible after). A 7:30–8:30 proposal entered with the wheel stored
  `2026-10-04T20:30Z–21:30Z` (07:30–08:30 AEDT).
- **R1** block from chat: both accounts get 403 on send/read/propose (HTTP via
  the isolated API), both match lists empty, Chats empty, Blocked users lists
  the person; unblock restores the chat and its history. Live WebSocket
  close/reconnect/inactive behavior is covered by the uvicorn integration
  test, not natively.
- **R4** block from partner detail returns to a feed without the card.
- **R6** the seeded message previews "Oct 3" (was "1:51 PM"); blocked date
  "Oct 4, 2026" for a block at 14:37Z Oct 3.
- **R7** (transport failures): API stopped → refresh shows "Couldn't refresh
  your plans…"; Retry held by a black-hole listener keeps the notice with
  "Retrying…"; after the 15 s client timeout the notice stays; API restored →
  Retry clears it.
- **F1/F2/F5** natively: join → leave → rejoin (spots 5→4→5→4); My Plans keeps
  the confirmed booking in Upcoming with 55+55 history in Past; booking detail
  and the composer show Sydney times.

## F1–F8 rechecks

- F1: real-PG integration (aware `joined_at`, join/leave/rejoin, races) and
  probe 7/7 under both zones; native rejoin.
- F2: `test_my_plans_segments` (>50 bookings and events) passes; native Past
  with 55+55 history.
- F3: golf consent tests and probe counterexample pass.
- F4/F6: preference invalidation and strict-pace store tests pass (not
  repeated natively).
- F5: booking-time tests, probe offset checks, native proposal bounds.
- F7: sport-label tests pass (Running shown natively).
- F8: session sync tests pass; native join/leave counts refresh in detail.

## Remaining blockers and gaps

1. **R6 legacy provenance**: production's historical `TimeZone` must be
   verified with the read-only plan before R6 can be called fully resolved.
2. **R2 adoption of the human stack** has not been run: it requires the
   repaired launcher in the home-test worktree. The live stack still runs the
   pre-repair code (start SHA 4894f6f, worktree at 60a264c).
3. **R5 physical iPhone** finger test not performed (no device); simulator
   taps were AXe HID taps (simulator-style and `--tap-style physical`).
4. Not verified: VoiceOver speech/focus, Android, software-keyboard overlap,
   real push delivery, provider integrations, signed builds; multi-process
   WebSocket delivery (socket bookkeeping is in-process; the per-push
   re-check is what holds across processes).
5. ChatScreen's own block call is unchanged (server-enforced, list refreshed
   on focus); only Partner Detail uses the store action.

## Final QA environment status

Human QA (`sportsgang-qa`, DB `sportsgang_qa`, volume `sportsgang-qa_pgdata`)
untouched and online: API pid 20592 and Metro pid 19047 with their original
start times (18:56:12 / 18:55:43 AEST, 3 Oct), containers healthy, its
`qa:status` all OK, fixtures 8 users / 81 sessions / 57 bookings / 55 history
at migration 0016, `.qa/config.env` and `state.json` byte-identical, worktree
clean at `60a264c`. Its launcher was only used for the read-only `qa:status`;
snapshots before/after each Docker test run are in the evidence.

## Codex re-review checklist

- [ ] Branch `fix/run-golf-v2-independent-review-r1-r7`, application `ecd1e86`
      on top of `60a264c`; review artifacts unchanged.
- [ ] R1: try every contact path both ways on PG (`tests_integration/test_contact_restriction.py`), including the live WebSocket test; judge the hidden-history and allowed-withdrawal choices in CONTRACTS §8.
- [ ] R2: `QA_TEST_DOCKER=1 python3 -m unittest scripts/qa/test_qa.py`; read-only `qa:status` from another worktree should report a conflict; adoption only from home-test.
- [ ] R3/R4/R7: the new tests in `BookingDetailScreen`, `exploreStore`, `PartnerDetailScreen`, `MyPlansScreen`.
- [ ] R5: native 45→30 and 15→30 on a simulator (traces/screens in `r5-native/`), ideally a physical finger test.
- [ ] R6: wire format (`…Z`) on every audit field; run `tests_integration/test_audit_instants.py` on a Sydney-default DB; decide on the provenance plan.
- [ ] F1–F8 regressions: probes and integration suite.
- [ ] CI green on the final pushed SHA.

## Exact next steps

```sh
git fetch origin
git worktree add ../sg-r1r7-review origin/fix/run-golf-v2-independent-review-r1-r7
cd ../sg-r1r7-review && npm ci && (cd apps/api && uv sync --frozen)
# API + PG/Redis on disposable services only (fresh DB), then:
(cd apps/api && uv run --frozen ruff check . && uv run --frozen pytest -q)
(cd apps/api && POSTGRES_URL=… REDIS_URL=… uv run --frozen alembic upgrade head && POSTGRES_URL=… REDIS_URL=… uv run --frozen pytest tests_integration -q)
npm run test:ci --workspace @protin/mobile -- --runInBand --watchman=false
QA_TEST_DOCKER=1 python3 -m unittest scripts/qa/test_qa.py -v
# Isolated native stack from the review worktree (never the human one):
mkdir -p .qa && printf 'QA_PROJECT=sportsgang-qa-review\nQA_API_PORT=8132\nQA_METRO_PORT=8192\nQA_PG_PORT=55472\nQA_REDIS_PORT=56472\n' > .qa/config.env
npm run qa:up -- --no-open
```

To bring the repairs to the human stack later (human decision): in the
home-test worktree, update to this branch, run `npm run qa:status`
(ownership should read *adoptable*), then `npm run qa:up -- --no-open
--no-seed` (adopts without restarting) and `npm run qa:restart` to load the
new code.
