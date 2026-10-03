# Run + Golf v2 — review-fix implementation report

Implementer: Claude (primary implementer). Input review: `CODEX_REVIEW.md`
(**NEEDS_FIXES**, P1 ×5, P2 ×3), preserved unchanged together with
`review-evidence/`. This report does not issue an independent verdict; the
after-fix verdict belongs to the next Codex review.

**Status: READY_FOR_CODEX_REVIEW** — F1–F8 are repaired; each has permanent
regressions that fail on the unfixed source and pass now; fresh API,
PostgreSQL, upgrade, mobile and native (Expo Go) evidence is recorded.
This is not release approval. Environment-blocked items are listed in §9
(Apple sign-in, real push, Android / physical device / dev-client builds;
native report/block/delete and native offline injection were not run).

## 0. Checkpoint

| Item | Value |
| --- | --- |
| Current wave | Wave 6 — report, push, CI (complete; see §10) |
| Completed findings | F1–F8 repaired and verified (§2) |
| Repair branch / worktree | `fix/run-golf-v2-review-fixes` in `.claude/worktrees/run-golf-v2-fixes` |
| Final tested source | `a599c4f` (mobile + API); API source unchanged since `2869f22` |
| Blockers | none for the repair; environment gaps in §9 |
| Next executable action | independent Codex review (prompt in the hand-off) |

## 1. Initial state (Wave 0)

| Item | Value |
| --- | --- |
| Started | 2026-10-03 14:00 AEST (2026-10-03T04:00Z) |
| Launch checkout | `/Users/edwardhwang/Desktop/github-repo-only/Sportsgang`, branch `feat/run-first-ui`, HEAD `ffca063fa3408ee6654980cfd72bf61fd3d0f654`, untracked `codex-review-prompt.md`, `docs/run-golf-v2/`, `todo.md` (left untouched) |
| Existing implementation worktree | `.claude/worktrees/run-golf-v2`, branch `feat/run-golf-v2`, HEAD `541f035`, clean (left untouched) |
| origin | `https://github.com/EdwardH-jedi/Sportsgang.git` (verified) |
| `origin/feat/run-golf-v2` after fetch | `541f03512280acb818724456afd2eb88e70558c8` — equal to the last observed published HEAD; no newer commits to inspect |
| Ancestry | `edfb30f` (original base) and `541f035` are both ancestors of `origin/feat/run-golf-v2` |
| `origin/main` | `edfb30fe48eddda76ebc9f347581641f3550ed44` (implementation not merged) |
| Repair worktree | `.claude/worktrees/run-golf-v2-fixes` (new, isolated) |
| Repair branch | `fix/run-golf-v2-review-fixes`, created from `origin/feat/run-golf-v2` = `541f035`; inherited tracking removed so the first push sets its own upstream |
| Pre-existing repair branch | none (local or remote) |

Environment: macOS 26.5.1, Xcode 26.6, Node 26.7.0 / npm (repo lockfile),
uv 0.11.15 (Python per `apps/api/uv.lock`), Docker 29.4.0. Booted simulators:
iPhone 17 Pro (iOS 26.3), iPhone 16e (iOS 26.3).

Dependencies installed from lockfiles in the repair worktree: `npm ci`
(exit 0), `uv sync --frozen --dev` in `apps/api` (exit 0).

Disposable services: `docs/run-golf-v2/fix-evidence/compose.yml`, project
`claude-sg-fix-20261003`, PostgreSQL 16 on `127.0.0.1:55453`, Redis 7 on
`127.0.0.1:56453`, tmpfs data, throwaway password supplied at run time from a
scratch file outside the repository. PostgreSQL session `TimeZone` = `UTC`.
No shared/production database and no remote Fly API were used.

## 2. Findings — status table

Labels: EXPECTED_FAIL / ALREADY_FIXED / NOT_REPRODUCED / BLOCKED_ENV (before),
then the repair result.

| ID | Pri | Finding | Before (this source) | Repair (commit) | After (fresh evidence) |
| --- | --- | --- | --- | --- | --- |
| F1 | P1 | Rejoin after leave → asyncpg DataError / 500 | EXPECTED_FAIL — running and golf rejoin HTTP 500 (`DataError … $2::TIMESTAMP WITHOUT TIME ZONE`) under TZ=UTC and Sydney (`before/probe-*`) | ORM `joined_at` declared `DateTime(timezone=True)` to match the migrated TIMESTAMPTZ column (`af17c83`) | Fixed and verified: probe PASS ×2 TZ; 6 new PG tests; populated-upgrade legacy *left* row rejoins on the same id; native leave → rejoin (screens 04–06, DB row reused) |
| F2 | P1 | My Plans first-50 truncation hides future commitments | EXPECTED_FAIL — 55 past events/bookings: future event, confirmed and proposed booking all absent from the first 50 of each source; no segment contract (`before/probe-*` `F2_legacy_first_50`) | `segment`+`as_of`, `(starts_at,id)` order on GET /events?mine and GET /bookings; segmented, paged `usePlans` (`2869f22`) | Fixed and verified: probe PASS ×2; 8 SQLite + 1 PG test; 10 mobile tests; native My Plans with 110 past rows shows Upcoming/Pending and pages Past (screens 07–10, 16–17) |
| F3 | P1 | Learn-from-experienced admitted without explicit consent | EXPECTED_FAIL — exact counterexample returned `compatible` with `similar_handicap` + `more_experienced` in both directions | Explicit admission routes; learning needs evidence **and** the other's `welcome_beginners`/`any_level` (`05a2e0f`) | Fixed and verified: probe PASS ×2; 8 new rule tests + PG `/discovery` counterexample; native golf feed (screen 23) |
| F4 | P1 | Preference change leaves stale recommendations | EXPECTED_FAIL — historical acceptance test on this worktree: 2 failed / 1 passed (`before/cache-acceptance`) | Per-sport `preferenceRevision` + revision-keyed feed + generation bump (`9586c67`) | Fixed and verified: historical acceptance 3/3; 18-test suite; native save → one new `/discovery` request and new reasons (screens 18–22) |
| F5 | P1 | Booking instant depends on API process TZ | EXPECTED_FAIL — naive `T09:00:00` stored `09:00Z` under TZ=UTC but `22:00Z` (previous day) under TZ=Australia/Sydney | Request bounds normalized to UTC (naive = UTC); Sydney-wall-time composer sending UTC; Sydney display (`4f28a6c`) | Fixed and verified: probe PASS under both TZs; PG tests under UTC/Sydney/Los Angeles; native proposal on the DST day stored `2026-10-03 22:00Z` = 9:00 am AEDT (screens 14–17) |
| F6 | P2 | Clearing pace locks strict filter on | EXPECTED_FAIL — same acceptance run, strict filter stayed `true` | Strict pace normalized off without a range; chip dismissible while selected (`9586c67`) | Fixed and verified: acceptance 3/3; suite covers clear/social/delete/legacy; native strict → social save released the filter, no strict request sent (screens 19, 22) |
| F7 | P2 | Running/tennis booking detail shows Golf | EXPECTED_FAIL — new Running/Tennis/legacy label + Sydney time tests: 4 failed (`before/f7-booking-detail`) | Shared `sportLabel()` in booking detail (`4f28a6c`) | Fixed and verified: 6 new tests; native detail "Running" (screen 15) |
| F8 | P2 | Session list stale after join/leave/cancel/create | EXPECTED_FAIL — new real-hook suite: 9 failed / 2 control passed (`before/f8-session-sync`) | Shared session-sync revision, server re-read on mutation and focus, load-more (`9586c67`); refresh-inset fix found natively (`a599c4f`) | Fixed and verified: 12-test suite; native golf final place → list "Full" + "Joined", run join/leave/rejoin counts (screens 03–06, 11–13) |

## 3. Wave 0 — reproduction on the unfixed source (HEAD `541f035`)

Historical probes were read before use: `review-evidence/probe_journeys.py`
records FAIL into JSON and exits 0, and is bound to the torn-down
`/codex_review` database, so it was not re-run. A new probe,
`fix-evidence/probe_findings.py`, records PASS/FAIL per check **and exits 1
on any failure**; it refuses to run unless `POSTGRES_URL` is the disposable
`127.0.0.1:55453` database and uses a random per-run account password. Every
run below was recorded by `fix-evidence/record.py` (command, cwd, exit code,
HEAD, uncommitted-source digest) next to its log.

| Evidence | Command (cwd) | Exit | Result |
| --- | --- | --- | --- |
| `before/probe-UTC` | `TZ=UTC uv run python …/probe_findings.py` (apps/api) | 1 | F1 run+golf FAIL (rejoin 500), F2 FAIL, F3 FAIL (counterexample + control reasons), F5 PASS |
| `before/probe-Australia-Sydney` | same with `TZ=Australia/Sydney` | 1 | as above **plus** F5 FAIL: stored `2026-10-12T22:00:00Z` for sent `2026-10-13T09:00:00` |
| `before/cache-acceptance` | historical `jest.review.config.js` + `cache.acceptance.test.js` (apps/mobile, resolves to this worktree) | 1 | 2 failed / 1 passed / 3 total — F4 and F6 fail, forced-refresh control passes |
| `before/f7-booking-detail` | new tests in `BookingDetailScreen.test.tsx` (app source unchanged) | 1 | 4 failed / 17 passed — Running, Tennis, legacy `pickleball`, Sydney-time display |
| `before/f8-session-sync` | new `sessionListSync.test.tsx` (app source unchanged) | 1 | 9 failed / 2 passed — the two passing tests are controls (no fetch loop, stale sport response dropped) |
| `before/api-pytest` | `uv run pytest -q` (apps/api) | 0 | 729 passed, 0 skipped |
| `before/integration` | `uv run pytest tests_integration -q` (apps/api, fresh PG at 0016) | 0 | 9 passed, 0 skipped |
| `before/mobile-tests` | `jest --ci --runInBand --watchman=false` (apps/mobile) | 1 | 813 passed + 4 failed / 817 — the 4 are the new F7/F5 tests already added; the original 811 pass |

The F3 control (`welcome_beginners` added) also reported FAIL before the fix:
the pair was admitted, but by the mentor's broad `similar_level` route, so the
reasons were `similar_handicap` + `more_experienced` and never
`welcomes_beginners` — the explanation did not match the consent route.

New regressions were additionally run against an untouched export of
`541f035` (`git archive`, scratch directory, same disposable PG) to show they
detect the defects:

| Evidence | Result on base |
| --- | --- |
| `before/f1-regressions-on-base.log` | 5 of the 6 new rejoin tests fail (500); the sixth (a rejected rejoin writes nothing) passes on base by design |
| `before/f5-regressions-on-base.log` | 6 failed / 32 passed: PG legacy payload under Sydney and Los Angeles process TZ, SQLite equivalent offsets, mixed naive/aware (500), Sydney-midnight, past-check with `+14:00` |
| `before/f3-regressions-on-base.log` | 4 failed / 34 passed: the broad-tolerance counterexample, the `welcome_beginners` control's reasons, the multi-intent explanation test and the persisted PostgreSQL counterexample |
| `before/f4-f6-f8-regressions-on-base.log` | 24 failed / 5 passed (mobile export of `541f035` + this branch's new suites). The 5 passing are controls: no fetch loop, stale-sport response dropped, forced refresh, account switch, plain detail→back |
| `before/f2-mobile-regressions-on-base.log` | 10 failed / 10 (the old client never sends `segment`/`as_of`) |
| `before/f2-api-regressions-on-base.log` | 7 failed / 2 passed (the 2 are privacy/left-session guards that already held) |

### Root-cause correction for F1

The review attributed F1 to `joined_at` being `TIMESTAMP WITHOUT TIME ZONE`.
The migrated column is in fact `timestamp with time zone` (migration 0010;
`information_schema` on the fresh disposable DB confirms it). The ORM model
declared it as a naive `DateTime`, so SQLAlchemy bound the rejoin value as
`$2::TIMESTAMP WITHOUT TIME ZONE` and asyncpg's encoder rejected the aware UTC
datetime. The repair therefore aligns the model with the existing column
instead of converting values to naive UTC; no migration is needed.

## 4. Repairs

### F1 — rejoin on PostgreSQL

- **Cause (corrected):** see "Root-cause correction" above. The ORM
  declaration of `event_participants.joined_at` disagreed with the
  migrated TIMESTAMPTZ column.
- **Change:** `apps/api/app/models/event.py` — `joined_at` is
  `DateTime(timezone=True)`. The service still writes the aware UTC instant
  on rejoin (`services/events.py` unchanged). No migration; stored values
  keep their meaning; `left_at` and attendance timestamps were already
  TIMESTAMPTZ.
- **Tests:** `tests_integration/test_event_capacity.py` — running and golf
  leave/rejoin reuse the same row id (single row, `left_at` NULL, fresh
  `joined_at`, `has_joined`, serialized with `Z`), full → leave → open →
  rejoin → full ×3, duplicate and concurrent rejoins count once, a rejected
  rejoin (full / cancelled) writes nothing, the leaver racing two newcomers
  for one place never oversubscribes. Existing race, duplicate, cancel-vs-
  join and lock-wait tests unchanged and passing.

### F5 — booking instants; F7 — sport label

- **API:** `apps/api/app/schemas/bookings.py` — a `field_validator`
  normalizes `starts_at` and `ends_at` to aware UTC (offset-free → UTC;
  offsets keep their instant) before the order check, past-time check and
  storage; `services/bookings.py` past check simplified accordingly.
- **Mobile:** `lib/sessionTime.ts` gains `defaultSydneyDate` and
  `sydneyProposalTimes` (built on the existing `sydneyWallTimeToUtc`);
  `BookingComposerScreen` collects Sydney wall time, shows "Times are Sydney
  time (AEST/AEDT)", validates on instants and sends UTC ISO;
  `CalendarPicker` takes Sydney's `today`. `BookingDetailScreen` and the
  in-chat `SessionProposalCard` render with `formatSydneyDateTime` /
  `formatSydneyRange`; booking detail labels its times "Sydney time" and
  uses the shared `sportLabel()` (gym/golf/tennis/running, honest
  capitalized fallback for unknown legacy values).
- **Tests:** `tests/test_bookings.py` (+6: equivalent offsets, legacy
  naive = UTC, mixed naive/aware, instant-based ranges, Sydney midnight,
  past check incl. `+14:00`), `tests_integration/test_booking_time.py` (+5:
  same naive payload under UTC / Sydney / Los Angeles process TZ, Sydney
  proposal → confirm → both participants' lists), mobile
  `BookingComposerScreen.test.tsx` (+6, frozen clocks: UTC payload, DST gap
  error, DST-day real minutes, overlap → earlier AEDT instant, late evening),
  `sessionTime.test.ts` (+4), `BookingDetailScreen.test.tsx` (+6).

### F3 — explicit learning consent

- **Change:** `apps/api/app/services/compatibility.py` — `_golf_owner_admits`
  no longer handles `learn_from_experienced`; `_learning_route(learner,
  mentor)` requires the intent, more-experience evidence and the mentor's
  `welcome_beginners`/`any_level`; `assess_golf` admits a pair if the mutual
  route or either learning route holds and takes reasons only from routes
  that hold.
- **Tests:** `tests/test_compatibility.py` (+8): the exact 30.0 / 24.0 /
  tolerance-10 counterexample both ways; `welcome_beginners` and
  `any_level` controls with exact reason sets; consent without enough
  experience; asymmetric limits; similar-level-only admission carrying no
  learning reason; both routes explained; one-sided `any_level`; banded,
  plus and estimated handicaps; legacy rows. `tests_integration/
  test_run_golf_v2_journey.py` (+1): the persisted counterexample through
  `/discovery` with consent toggled on/off and blocking. Every pre-existing
  compatibility and discovery test passed unchanged.

### F4 / F6 — preference changes reach Explore

- **Change:** `stores/profile.ts` keeps `preferenceRevision` per sport,
  bumped only after a successful save/clear/delete, or when a re-fetch
  returns a different row (a first load is not a change). `stores/
  explore.ts`: feeds carry the revision they were assessed under; reuse
  needs the same key **and** revision; a change for the feed's sport drops
  it and bumps the generation (old success/error/loading completions are
  ignored); strict pace is switched off when the viewer has no declared
  range (`setStrictPace`, `loadFeed`, and a lazily registered profile
  subscription — registered on Explore's first action so tests that mock
  the profile store are unaffected). `hooks/useDiscovery.ts` depends on the
  revision. `ExploreScreen`: the strict chip stays pressable while selected.
- **Tests:** `src/__tests__/preferenceInvalidation.test.tsx` (18) — the
  promoted `cache.acceptance` scenarios plus creation, sport-scoped
  deletion, failed save, re-fetch equal vs different, forced refresh,
  stale success, stale error/loading, rapid saves, logout/account switch,
  strict release for clear/social/delete/legacy, no strict request without a
  range, screen-level new answer with one request, detail→back keeps feed
  and filters, stuck-strict release and turning the filter off.

### F8 — session lists

- **Change:** new `stores/sessionSync.ts` (a revision only, no data);
  `lib/events.ts` marks sessions changed after a successful create / join /
  leave / cancel / complete; `hooks/useEvents.ts` re-reads on that signal,
  clears rows on a sport/filter change, keeps generation guards, re-reads as
  many rows as shown (≤50) and adds offset `loadMore` with id de-duplication
  and a separate retryable error; `ExploreScreen` re-reads on re-focus
  (other accounts), offers "Show more sessions", and — after the native
  finding below — shows the refresh spinner only for the user's own pull.
- **Tests:** `src/__tests__/sessionListSync.test.tsx` (12) over an in-memory
  `/events` server: final golf place, leave/rejoin, list updates while
  covered, rejected join (no optimistic Joined), create → list + My Plans,
  cancel → leaves list, moves to Past, other-account change on focus,
  background re-reads without the spinner, no fetch loop, stale sport
  response, 23 sessions with offset shift, load-more failure and retry.

### F2 — complete My Plans

- **API:** `services/events.py` + `routers/events.py`: `segment`
  (`upcoming|past`, requires `mine=true`) and `as_of`; `services/
  bookings.py` + `routers/bookings.py`: `segment` (`upcoming|pending|past`)
  and `as_of`; `(starts_at, id)` ascending, Past descending; default
  behavior unchanged apart from the `id` tie-break.
- **Mobile:** `hooks/usePlans.ts` rewritten around (segment, source) pages
  with one `as_of` per load generation, complete-prefix merge, per-segment
  "Show more", independent source errors with retry, load-more errors that
  keep loaded rows, reload on session mutations, account-switch and late
  response guards; `buildPlanItems` keeps its lifecycle meanings with an
  ordinal key tie-break (was `localeCompare`) to match the API order.
  `MyPlansScreen` shows the server's Pending total and the paging footer;
  `lib/events.ts` passes `segment`/`as_of`.
- **Tests:** `tests/test_plan_segments.py` (8), `tests_integration/
  test_my_plans_segments.py` (1: 55 past sessions + 55 past bookings,
  future-dated cancelled/completed, ties, every page), mobile
  `myPlansPaging.test.tsx` (10, segment-aware server: 112-row Past,
  interleaved Upcoming pages, Pending pages, id collisions, source failure
  and retry, load-more failure and retry, changes on refresh, account switch
  with a late response, server/client segment agreement). Two assertions in
  `MyPlansScreen.test.tsx` were updated for the new request contract
  (exact URLs; 5 requests per load); every other existing assertion kept.

### Found during native verification — refresh inset (part of F8)

On the simulator the Explore list kept a ~60 pt blank pull-to-refresh inset
above "Host a run" after returning from a join (screen 03). Cause: the new
background re-read ran while Explore was covered and `RefreshControl
refreshing` was bound to it. Fixed in `a599c4f` (spinner only for the user's
pull) with a regression test that fails on the old binding; native screens
04–30 were taken after the fix.

## 5. Contract, migration and legacy decisions

Recorded in `CONTRACTS.md` (§4 golf routes and client preference contract,
§5 client session lists and participant lifecycle, §6 My Plans segments,
§7 booking instants):

- **F1:** no schema change. `joined_at` is TIMESTAMPTZ in every migrated
  database; only the ORM declaration was wrong. IDs, foreign keys, rows and
  audit semantics are untouched (verified by the populated upgrade, §7).
- **F5 legacy clients:** offset-free `starts_at`/`ends_at` are read as UTC —
  the convention the API's past-time check always used and what an API in
  UTC stored. No device timezone is inferred; historical bookings are not
  rewritten.
- **F3:** learning admission needs explicit consent; `todo.md` stays the
  product source and now agrees with `CONTRACTS.md`.
- **F2:** new optional query parameters only; default responses unchanged
  except the deterministic `id` tie-break. Known offset-paging limit (a plan
  changing segment between two page loads of one generation can be missed
  until the next refresh; repeats are de-duplicated) is documented.
- **F8:** offset paging on the Explore list with the same documented limit.
- No migration was added; `0016` is untouched; no shared-types response
  shape changed; no release identifiers, app config, lockfiles, CI workflow
  or dependencies changed (`git diff 541f035..HEAD` over those paths is
  empty).

## 6. Verification on the repaired source

All recorded with `fix-evidence/record.py` (`after/*.json` hold command,
cwd, exit code, HEAD and `source_dirty=false`). API/DB rows ran on HEAD
`4361c95` (source = `2869f22`); `final-*` mobile rows on `a599c4f`, the final
source. API source did not change after `2869f22`.

| Check | Command (cwd) | Exit | Result |
| --- | --- | --- | --- |
| `after/uv-sync` | `uv sync --frozen --dev` (apps/api) | 0 | — |
| `after/ruff-check`, `ruff-format` | `uv run ruff check .`, `uv run ruff format --check .` | 0, 0 | clean |
| `after/api-pytest` | `uv run pytest -q` (SQLite) | 0 | **751 passed, 0 skipped** (was 729) |
| `after/alembic-fresh`, `alembic-current` | `uv run alembic upgrade head` on a new DB | 0 | `0016 (head)` |
| `after/integration` | `uv run pytest tests_integration -q` (fresh PG + Redis) | 0 | **22 passed, 0 skipped** (was 9) |
| `after/probe-UTC`, `probe-Australia-Sydney` | `probe_findings.py` on a fresh DB each | 0, 0 | all 7 checks PASS in both TZs (before: 5 and 6 FAIL) |
| `after/populated-upgrade` | `verify_populated_upgrade.py` (0015 → seed → head) | 0 | 9/9 checks PASS (§7) |
| `after/npm-ci` | `npm ci` (root) | 0 | — |
| `after/final-mobile-lint` | `npm run lint --workspace @protin/mobile` | 0 | clean |
| `after/final-mobile-typecheck` | `npm run typecheck --workspace @protin/mobile` | 0 | clean |
| `after/shared-typecheck` | shared-types `tsc` with an external tsbuildinfo | 0 | clean |
| `after/final-mobile-tests` | `npm run test:ci --workspace @protin/mobile -- --runInBand` | 0 | **867 passed in 61 suites, 0 skipped** (was 811 / 58); no Watchman workaround needed |
| `after/mobile-time-suites-Asia-Seoul`, `-America-Los_Angeles` | 8 time-related suites with `TZ=` set | 0, 0 | 219 / 219 each |
| `after/cache-acceptance` | historical `jest.review.config.js` + `cache.acceptance.test.js` | 0 | **3 passed / 3** (before 2 failed / 1 passed) |
| `after/final-ios-export` | `npx --no-install expo export --platform ios --output-dir <scratch>` (apps/mobile) | 0 | Hermes bundle 4.4 MB, written outside the repository |

New-test count: API +22 unit, +13 integration; mobile +56.

## 7. PostgreSQL and upgrade evidence

- Disposable stack only (`fix-evidence/compose.yml`, project
  `claude-sg-fix-20261003`, tmpfs). Fresh databases for each gate:
  `fix_after` (integration), `fix_probe_utc` / `fix_probe_australia_sydney`
  (probe), `fix_legacy` (upgrade), `fix_native` (native). `fix_fresh` and
  `fix_final` were used during development.
- **Populated upgrade** (`after/populated-upgrade-results.json`): empty DB →
  `alembic upgrade 0015` → SQL-seeded legacy graph (3 users and profiles,
  8 gym/tennis/running/golf sport rows, 2 identity preferences, 1 match +
  message, 3 bookings, 2 events, 4 participants incl. one `left` row) →
  hash every column of every row → `upgrade head` → identical hashes and
  counts; v2 columns NULL on legacy rows; `joined_at` is TIMESTAMPTZ;
  legacy password login; legacy gym/golf fields readable with
  `preferences_version` NULL; legacy messages readable; the legacy *left*
  participant rejoins on the same row id; legacy bookings/events land in
  the right My Plans segments. Fixture IDs are in the JSON.
- Real-PG coverage in the normal suite: rejoin lifecycle and races
  (`test_event_capacity.py`), booking instants under three process TZs
  (`test_booking_time.py`), consent counterexample (`test_run_golf_v2_
  journey.py`), My Plans segments (`test_my_plans_segments.py`).

## 8. Native evidence (Expo Go — not a release or dev-client build)

Runtime (`native/runtime.json`): Expo Go 54.0.7 on the iPhone 16e simulator
(iOS 26.3, 390×844 pt), Xcode 26.6; Metro `--port 8091 --offline`, API
`uvicorn` on `127.0.0.1:8031` against `fix_native`. Fixtures
(`native/seed.json`, created by `seed_native.py` with the password from
local env): Alice `61c5c052…`, Bob `31a11ace…`, Cara `31afe6d2…`, match
`6fd93eaa…`, Bob's run `0f524cdb…` (capacity 4), Bob's golf round
`658bc9e9…` (capacity 2), 55 past sessions + 55 past bookings for Alice.
API request log: `native/api-requests.log`. Screens in `native/screens/`.

| Journey | Screens | Result |
| --- | --- | --- |
| Run join → back → list | 01–03 | "4 runners · 2 spots left" + Joined; 03 shows the inset bug (pre-`a599c4f` bundle) |
| Leave → back → rejoin → back (F1/F8) | 04–06 | capacity 3 → 2 left, Joined, no inset; PostgreSQL shows Alice's single participant row reactivated |
| My Plans with 110 past rows (F2) | 07–10 | Upcoming shows the joined run; Past newest first; "Show more" continues to older pages |
| Golf final place (F8) | 11–13 | detail "2 golfers · Full"; returned list "Full" + "Joined" |
| Running 1:1 proposal (F5/F7) | 14–17 | composer "Times are Sydney time (AEST/AEDT)", default Sun 4 Oct (DST day) 9–10 am; detail "Running", "Sun 4 Oct · 9:00 am"; stored `2026-10-03 22:00Z`; Pending → Bob confirms (API) → Upcoming "Confirmed" with the same time |
| Strict pace and preference save (F4/F6) | 18–22 | strict on → empty; save Social without pace → one new `GET /discovery?sport=running` without `strict_pace`; filter unchecked/disabled; Cara's card changes from "Pace not confirmed" to "Fits both ways · Both run socially" |
| Golf learning consent (F3) | 23 | Bob (welcomes beginners) shown with learning reasons; Cara (similar-only, broad tolerance) absent |
| New account onboarding, photos/bio skipped | 24–28 | register → name → birth year (coordinate tap; AX exposes the list as one element and no selected value) → suburb → Running Social → Mornings → Finish → Explore; API persisted `Dana / 2000 / Annandale / running social v2` |
| Large text (accessibility-large) | 29–30 | session detail and My Plans wrap without clipping; setting restored to `large` |

Simulator notes: the hardware-keyboard input source was Korean, so one
free-text location typed during the booking step became Hangul jamo
(typed-text artifact; sport, times and status unaffected); input switched
to English with Ctrl+Space for onboarding and toggled back afterwards. iOS
"Save Password?" sheets were dismissed with "Not Now".

## 9. Not verified / environment gaps / observations

| Item | State | Reproduction / next step |
| --- | --- | --- |
| Apple sign-in | BLOCKED_ENV — no signing / Apple test account / dev-client here; unit tests only | signing-capable build + test Apple ID: first login, re-login, failure |
| Real push | BLOCKED_ENV — Expo Go, no provider credentials | dev-client on a device: permission, receipt, tap navigation |
| Android, physical iOS, dev-client / release build | BLOCKED_ENV — only iOS simulators + Expo Go | repeat §8 journeys on those runtimes |
| Native report / block / account deletion | NOT_RUN natively (existing unit/API tests pass; block exclusion re-verified via API in the F3 PG test) | disposable accounts: report, block/unblock, delete, re-login refused |
| Native offline / one-source failure | NOT_RUN natively; covered by mobile tests with controlled transport | block one endpoint while My Plans is open; Retry |
| iPhone 17 Pro | not re-run (16e only this time) | repeat §8 on the second simulator |
| Select / picker accessibility | Observation: AX exposes the birth-year and suburb lists as one aggregated element and the field exposes no selected value; selection works by touch | VoiceOver pass on Step 1 |
| `tournament_participants.joined_at` | Observation, untouched (out of scope): same naive-ORM vs TIMESTAMPTZ-migration drift as F1 | align the model if tournaments ever update the column |
| Integration-suite environment sensitivity | Observation, pre-existing: the cursor test assumes ≤50 running users; `/auth/register` is limited to 3/min per address across runs; after a failure in `test_booking_journey` the next lifespan shutdown can hit a Redis pool bound to the closed loop ("Event loop is closed") | run on fresh services (as CI does); clear `LIMITS:LIMITER/*` between back-to-back local runs |
| Extra list request | Behavior: after a mutation the Explore list is re-read when the change happens and again when the screen regains focus (one extra GET, no loop) | — |
| `buildPlanItems` tie-break | Changed from `localeCompare` to ordinal key comparison (same result for the app's ids; matches the API order) | — |

## 10. Commits, push and CI

Initial: `origin/feat/run-golf-v2` = `541f035`. Repair branch
`fix/run-golf-v2-review-fixes` (created from it), worktree
`.claude/worktrees/run-golf-v2-fixes`; upstream `origin/fix/run-golf-v2-
review-fixes`.

| Commit | Content | CI |
| --- | --- | --- |
| `adf1181` | Wave 0 reproduction evidence | (pushed with the next) |
| `af17c83` | F1 | — |
| `4f28a6c` | F5 / F7 + CONTRACTS | [run 37096231614](https://github.com/EdwardH-jedi/Sportsgang/actions/runs/37096231614) success (7/7 jobs incl. PostgreSQL integration) |
| `05a2e0f` | F3 | [run 37096506268](https://github.com/EdwardH-jedi/Sportsgang/actions/runs/37096506268) success |
| `9586c67` | F4 / F6 / F8 | [run 37097145286](https://github.com/EdwardH-jedi/Sportsgang/actions/runs/37097145286) success |
| `2869f22` | F2 | [run 37098012849](https://github.com/EdwardH-jedi/Sportsgang/actions/runs/37098012849) success |
| `4361c95`, `06838fd` | checkpoint, after-evidence (docs only) | pushed with the next |
| `a599c4f` | refresh-inset fix found natively (source) | pushed with `417fa28` |
| `417fa28` | this report + native evidence (docs only; first CI run containing `a599c4f`) | [run 37099725704](https://github.com/EdwardH-jedi/Sportsgang/actions/runs/37099725704) success — lint, typecheck, lint-mobile, test, test-mobile, PostgreSQL and Redis booking journey, docker-build |
| addendum commit | this CI line and cleanup confirmation (docs only) | reported in the hand-off message |

The final pushed commit is documentation-only on top of the last source
commit `a599c4f`; the tested source for the mobile rows is `a599c4f` and
for the API/DB rows `2869f22` (no API change since).

No merge into `main`, no force-push or history rewrite, no deployment, no
EAS update/build, no App Store action, no remote database migration and no
external messages. The launch checkout (`feat/run-first-ui`) and the
original implementation worktree were not modified.

## 11. Cleanup

Metro and the API process started for the native gates were stopped; the
disposable Docker project `claude-sg-fix-20261003` was removed with
`docker compose down` (no `-v`; data was tmpfs) after CI on `417fa28`
passed; `docker ps` shows none of its containers and ports 8031/8091 are
free. The base
export used for "fails on base" runs lives only in the session scratch
directory. No user database, volume or other process was touched.
