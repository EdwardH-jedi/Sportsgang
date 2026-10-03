# Run + Golf v2 — review-fix implementation report

Implementer: Claude (primary implementer). Input review: `CODEX_REVIEW.md`
(**NEEDS_FIXES**, P1 ×5, P2 ×3). This report does not issue an independent
verdict; the after-fix verdict belongs to the next Codex review.

## 0. Checkpoint

| Item | Value |
| --- | --- |
| Current wave | Wave 1 — F1/F5/F7 implemented, committing |
| Completed findings | Wave 0 reproduction done for F1–F8 |
| Files being edited | API events/bookings, mobile booking screens |
| Blockers | none so far |
| Next executable action | commit Wave 1, then Wave 2 (F3) |

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

| ID | Pri | Finding | Before (this source) | Repair | After |
| --- | --- | --- | --- | --- | --- |
| F1 | P1 | Rejoin after leave → asyncpg DataError / 500 | EXPECTED_FAIL — running and golf rejoin HTTP 500 (`DataError … $2::TIMESTAMP WITHOUT TIME ZONE`) under TZ=UTC and Sydney (`before/probe-*`) | | |
| F2 | P1 | My Plans first-50 truncation hides future commitments | EXPECTED_FAIL — 55 past events/bookings: future event, confirmed and proposed booking all absent from the first 50 of each source; no segment contract (`before/probe-*` `F2_legacy_first_50`) | | |
| F3 | P1 | Learn-from-experienced admitted without explicit consent | EXPECTED_FAIL — exact counterexample returned `compatible` with `similar_handicap` + `more_experienced` in both directions | | |
| F4 | P1 | Preference change leaves stale recommendations | EXPECTED_FAIL — historical acceptance test on this worktree: 2 failed / 1 passed (`before/cache-acceptance`) | | |
| F5 | P1 | Booking instant depends on API process TZ | EXPECTED_FAIL — naive `T09:00:00` stored `09:00Z` under TZ=UTC but `22:00Z` (previous day) under TZ=Australia/Sydney | | |
| F6 | P2 | Clearing pace locks strict filter on | EXPECTED_FAIL — same acceptance run, strict filter stayed `true` | | |
| F7 | P2 | Running/tennis booking detail shows Golf | EXPECTED_FAIL — new Running/Tennis/legacy label + Sydney time tests: 4 failed (`before/f7-booking-detail`) | | |
| F8 | P2 | Session list stale after join/leave/cancel/create | EXPECTED_FAIL — new real-hook suite: 9 failed / 2 control passed (`before/f8-session-sync`) | | |

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

### Root-cause correction for F1

The review attributed F1 to `joined_at` being `TIMESTAMP WITHOUT TIME ZONE`.
The migrated column is in fact `timestamp with time zone` (migration 0010;
`information_schema` on the fresh disposable DB confirms it). The ORM model
declared it as a naive `DateTime`, so SQLAlchemy bound the rejoin value as
`$2::TIMESTAMP WITHOUT TIME ZONE` and asyncpg's encoder rejected the aware UTC
datetime. The repair therefore aligns the model with the existing column
instead of converting values to naive UTC; no migration is needed.
