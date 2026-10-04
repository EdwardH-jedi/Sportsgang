# Codex retest handoff — morning repairs Q01–Q09

**Candidate for independent review. Not accepted until Codex says so.**

| Item | Value |
|---|---|
| Branch | `fix/run-golf-v2-morning-q01-q09` |
| Base | `d41efc2cbabed59f4b988e6177aa9354b9bdc3fd` (review publication; application identical to reviewed `ecd1e86`) |
| Final application SHA | see [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md) §1 (last commit touching `apps/` or `scripts/`) |
| Delivery SHA | the branch head; verify with `git ls-remote origin refs/heads/fix/run-golf-v2-morning-q01-q09` |
| Commits | `20049db` Q01–Q03 (API) · `55cebf8` Q08 (launcher) · `3f5ad41` Q04–Q07 (mobile) · Q09 and documentation commits after them |

Per-wave commits touch disjoint files, so each wave can be retested at its own
SHA. The R6/C01 gate is a document ([R6_C01_DEPLOYMENT_GATE.md](R6_C01_DEPLOYMENT_GATE.md)),
with no source change.

## What changed in the review's ordering assumptions (read first)

The overnight probes for Q01 and Q03 pause an effect between its restriction
check and its effect, then **commit a block**, then release the effect. After
this repair the effect holds the pair's `FOR SHARE` lock across that gap. The
block's `FOR NO KEY UPDATE` therefore **waits** until the effect finishes; it
cannot commit there. Run unchanged, the original `probe_r1.py`'s admission,
delivery and push cases block forever on their own `await c.post('/blocks/…')`.
That is the interleaving the repair removes (CONTRACTS.md §8, *Serialization
and ordering*).

`evidence/probe_r1_adapted.py` keeps `matrix` and `fresh_account` unchanged.
For the four race cases it starts the block as a task, checks in
`pg_stat_activity` that it is waiting on the lock, releases the barrier, and
asserts the rule:
- the effect completes before the block commits;
- the socket is closed with 4003 afterwards;
- no frame or push happens after the commit;
- in "block first" variants (paused *before* the lock), no provider
  invocation.

Last run: **94 PASS, 0 FAIL, 0 harness errors**
(`evidence/r1-adapted-results.json`). Please check that this adaptation keeps
your safety intent. In particular, the two-barrier delivery case now
*receives* `stored before block`, because that frame is sent before the block
commits. A frame sent after the commit would still fail the test.

## Retest procedure

Use disposable services only. Never point any of this at the human home-test
project (`sportsgang-qa`, ports 8130/8190/55470/56470) or at staging or
production.

```bash
git fetch origin
git worktree add /tmp/sg-retest-q01q09 origin/fix/run-golf-v2-morning-q01-q09
cd /tmp/sg-retest-q01q09
(cd apps/api && uv sync --frozen --dev) && npm ci --ignore-scripts

# Disposable PostgreSQL 16 / Redis 7 with private credentials
docker run -d --name sg-retest-pg -e POSTGRES_USER=sgr -e POSTGRES_PASSWORD=<random> \
  -e POSTGRES_DB=sg_retest -p 127.0.0.1:55741:5432 postgres:16-alpine
docker run -d --name sg-retest-redis -p 127.0.0.1:56741:6379 redis:7-alpine
export APP_ENV=local SECRET_KEY=<random 64 hex> \
  POSTGRES_URL=postgresql://sgr:<random>@127.0.0.1:55741/sg_retest \
  REDIS_URL=redis://127.0.0.1:56741/0
cd apps/api && uv run --frozen alembic upgrade head
```

| Check | Command (from `apps/api` unless noted) | Expected |
|---|---|---|
| Q01–Q03 regressions | `uv run --frozen pytest tests_integration/test_contact_authority.py -q` | 13 passed |
| Full integration (UTC) | `docker exec sg-retest-redis redis-cli FLUSHALL; uv run --frozen pytest tests_integration -q -rs` | 42 passed, 0 skipped |
| Full integration (Sydney DB default) | fresh DB with `ALTER DATABASE … SET timezone TO 'Australia/Sydney'`, flush Redis, same command | 42 passed, 0 skipped. If `test_leave_then_rejoin_reuses_the_participant_row` fails by a few ms, check the DB-container vs host clock skew (report §4); it compares a DB-clock and a host-clock timestamp |
| Adapted review probe | `REVIEW_EVIDENCE=<dir> .venv/bin/python ../../docs/run-golf-v2/morning-fixes/evidence/probe_r1_adapted.py` | 94 PASS / 0 FAIL / 0 harness errors |
| API unit | `uv run --frozen pytest -q` | 772 passed |
| Ruff | `uv run --frozen ruff check . && uv run --frozen ruff format --check .` | clean |
| Mobile (root) | `npm run test:ci -w @protin/mobile -- --runInBand --watchman=false` | 967 passed, 64 suites, 0 skipped |
| Mobile lint/typecheck (root) | `npm run lint -w @protin/mobile`; `npm run typecheck -w @protin/mobile` | 0 warnings; clean |
| Review mobile probes (root) | `REVIEW_ROOT=<this worktree> REVIEW_EVIDENCE=<dir> python3 docs/run-golf-v2/overnight-evidence-2026-10-04/make_mobile_probes.py`, Jest `--runTestsByPath` on the four copies, then delete them | 16/16. The generator takes each file's header (imports/mocks) from the current tests, which now mock `navigation.addListener` (Partner Detail subscribes to `blur`). Running the saved `codex-overnight-partner.test.tsx` *as saved* fails its 2 cases with `navigation.addListener is not a function` until that one mock line is added |
| Launcher (root) | `env -u TZ python3 -m unittest scripts/qa/test_qa.py`; `TZ=UTC …` | 14 pass / 7 skip each |
| Launcher + Docker (root) | `QA_TEST_DOCKER=1` with and without `TZ=UTC` | 21/21 each |
| Q08 real adoption (root) | `evidence/probe_qa_real_adapted.py` with `TZ=UTC`, a dedicated `.qa/config.env` project and `SPORTSGANG_QA_HOME` (see its docstring) | same API/Metro PIDs, `legacy` → `running` |
| C01 reproduction | `DB_NAIVE_TIMEZONE={UTC,Australia/Sydney} REVIEW_EVIDENCE=<dir> .venv/bin/python ../../docs/run-golf-v2/morning-fixes/evidence/probe_r6_overlap_by_zone.py` | UTC exact for both; Sydney collapses 16:30Z onto 15:30Z |

Baseline detection: the new Q01–Q03 tests were also run against `d41efc2`
(`evidence/logs/baseline-d41efc2-contact-authority.log`). **11 fail and 2
controls pass.**
- Seven failures show the defect itself:
  - "no backend waited on a lock" for admission, delivery, the two-barrier
    case and dispatch-first;
  - 201/200 with a stored row for the stale-actor send, like and proposal.
- Four error because the base has no lock step for the test to pause in (the
  Q03 block-first, lock-timeout and both worker cases). Your original probe
  already shows the base failure for those orderings.

## Q09 native retest

Q09 needs its own simulator. Do not reuse the human's or another session's.

1. `xcrun simctl create "<name>" com.apple.CoreSimulator.SimDeviceType.iPhone-16e com.apple.CoreSimulator.SimRuntime.iOS-26-3`, boot it, install Expo Go 54.
2. Start a dedicated launcher project: `.qa/config.env` with its own
   `QA_PROJECT`/ports, `SPORTSGANG_QA_HOME=<private>`, then
   `python3 scripts/qa/qa.py up --mode simulator --no-open`.
3. `xcrun simctl openurl <udid> exp://127.0.0.1:<metro port>`, then log in as a
   seeded account (`.qa/credentials.json`), open a chat, tap **+ Session**,
   and open **Start time**.
4. Check at default size and after `xcrun simctl ui <udid> content_size accessibility-extra-extra-extra-large`:
   - the Done button's AX frame lies inside 0…390 and is ≥ 44 pt tall;
   - "Done" is fully visible;
   - both minute-neighbour taps settle on :30;
   - a swipe settles;
   - close/reopen keeps the time;
   - the sent proposal and the PostgreSQL row hold the same Sydney times.

Results from this delivery are in [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md) §4 (Q09).

## Starting a fresh QA session from this candidate

The human home-test stack (`chore/run-golf-v2-home-test-ready` worktree,
project `sportsgang-qa`) still runs **pre-repair** code. To test this candidate
without touching it:

1. Make a new worktree from the branch head (step 1 above). Install
   dependencies.
2. In that worktree, write `.qa/config.env` with a **new** project name
   (e.g. `sg-candidate-q01q09`) and free ports. Use a private
   `SPORTSGANG_QA_HOME` if you don't want it registered next to the human
   owner record.
3. `npm run qa:up` (or `python3 scripts/qa/qa.py up --mode simulator`) starts
   PostgreSQL/Redis, migrates, starts the API and Metro, and seeds the QA
   accounts. Credentials are written to `.qa/credentials.json` (mode 600,
   git-ignored).
4. Point a dedicated simulator at the printed Metro URL. When finished, run
   `npm run qa:down` (stops processes and containers) or `qa:reset -- --yes`
   (also drops that project's volume). Neither affects other projects.

Do **not** run `qa:reset` or the fixture-resetting probes in the human
worktree.

## Out of scope / still gated

- R6 production provenance: NOT_RUN (no production access). See
  R6_C01_DEPLOYMENT_GATE.md before deploying the API.
- Not run: physical iPhone, VoiceOver, Android, signed build, real
  Expo/APNs push, production services.
- Realtime sockets assume one API process (CONTRACTS.md §8, topology limit).
