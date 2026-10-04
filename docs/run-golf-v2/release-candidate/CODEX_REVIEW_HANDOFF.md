# Codex retest handoff — release candidate (MA-C, MA-B, MA-A, composer large text, website)

**Candidate for independent review. Not accepted until Codex says so.**

| Item | Value |
|---|---|
| Branch | `chore/run-golf-v2-release-candidate-2026-10-04` |
| Base | `8b34bca78adc028423defbfb2caca8f4cc2d8a0a` (the delivery your publication `ce62aacff5dc88efd394abb240dc0a3d0bc3c76d` reviewed) |
| Website input | `97990d9773669ae6f0ad813f4246f37353ec558d`, merged unchanged as `410ec8d` |
| Final source SHA | `a515b0073cb0f32dad97f88430a203e3427444fe` (last commit touching `apps/`, `scripts/`, `packages/`, `.github/`) |
| Delivery SHA | the branch head; verify with `git ls-remote origin refs/heads/chore/run-golf-v2-release-candidate-2026-10-04` |
| Per-finding commits | MA-C `8c18c83` · MA-B `3f55ac5` · MA-A `90a6135` · contract `a41be8c` · web `e70a946`, `a515b00` · mobile `bcecdc8`, `e80b369` |

Each finding's commit touches its own files, so each can be retested at its own SHA.
The full account is in [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md).

## Decisions to check first

1. **MA-C uses a committed claim, not a lock held across the call.** The claim is
   `pending → failed_reason='delivery_unconfirmed'`, committed before the provider
   is called.
   - A failure *before* the call (pair-lock timeout, exception, cancellation) hands
     the event back to pending, which your acceptance item 4 asks for.
   - A failure *after* the call started — timeout, cancellation, crash, or a failed
     commit after the provider accepted — leaves it `delivery_unconfirmed`, and it
     is **not resent**. This follows the owner's instruction "do not … blindly retry
     ambiguous sends".
   - So item 4's "permits pending retry" holds only before the call. Delivery is at
     most once; CONTRACTS §8 has the state table. Please judge whether this
     definition is acceptable.
2. **MA-B's name `WS_SEND_TIMEOUT_SECONDS` now means the room-wide deadline (5 s).**
   Your probe's budget, `≤ WS_SEND_TIMEOUT_SECONDS + 2`, therefore reads the new
   meaning. Closes are bounded separately by `WS_CLOSE_TIMEOUT_SECONDS` (1 s), run
   concurrently and are owned by the connection manager. Unfinished sends are
   cancelled and awaited (unbounded await after cancel; every send in this stack
   is cancellable).
3. **MA-A reads PostgreSQL `clock_timestamp()` after the event row lock** for host
   auto-join, join, rejoin and leave. No model or schema change.
4. **The composer title is capped at 1.4×** (the app's `ScreenHeader` scale) rather
   than wrapping at full size. The chat-screen problems seen at maximum size were
   recorded, not changed.

## Your probes against this candidate

Run with the unchanged probe sources, changing only the port guard to a disposable
database (`evidence/logs/reviewer-followups-on-rc.log`,
`evidence/reviewer-followups-on-rc/*.json`): **11 passed, 2 failed.** Both failures
are interleavings the repair removes.

- `test_concurrent_processors_claim_event_once[two-workers]` expects BARRIER from
  the second worker in `after-lock` mode. The token lookup now runs after the
  claim, so the loser never reaches it. It prints `RESULT processed=0 failed=0`.
  `[worker-internal-endpoint]` passes, with 1 invocation and `api_calls: []`.
  The decisive interleaving moved to *before* the claim:
  `test_notification_ownership.py::test_two_workers_paused_before_the_claim_invoke_the_provider_once`
  pauses both workers with the event in their due lists. Outcomes are `sent` and
  `skipped`, with one invocation; the base gives two.
- `test_provider_success_commit_failure_is_ambiguous` patches *every* commit. The
  cycle now commits after reading the due list, so it raises before any dispatch,
  and the retry cycle sends once: `calls == [bid]`, not `[bid, bid]`.
  `test_provider_success_then_failed_commit_stays_unconfirmed_and_is_not_resent`
  fails only the commit that records the send. It observes one call, the event
  left `delivery_unconfirmed`, and no resend.
- Broadcast budget: 5.04 s for one socket and 5.04 s for three. Stuck close: the
  second socket closed. Event clock ±120: pass.

The adapted R1 probe (`../morning-fixes/evidence/probe_r1_adapted.py`) is unchanged
and gives **94 PASS / 0 FAIL / 0 harness errors** on this candidate.

## Retest procedure

Use disposable services only. Never touch the human project `sportsgang-qa`
(8130/8190/55470/56470), this candidate's QA project `sg-rc-20261004-qa`
(8163/8263/55663/56663), staging or production.

```bash
git fetch origin
git worktree add /tmp/sg-retest-rc origin/chore/run-golf-v2-release-candidate-2026-10-04
cd /tmp/sg-retest-rc && (cd apps/api && uv sync --frozen --dev) && npm ci --ignore-scripts
docker run -d --name sg-retest-rc-pg -e POSTGRES_USER=sgr -e POSTGRES_PASSWORD=<random> \
  -e POSTGRES_DB=sg_retest -p 127.0.0.1:<port>:5432 postgres:16-alpine
docker run -d --name sg-retest-rc-redis -p 127.0.0.1:<port>:6379 redis:7-alpine
export APP_ENV=local SECRET_KEY=<random 64 hex> \
  POSTGRES_URL=postgresql://sgr:<random>@127.0.0.1:<port>/sg_retest REDIS_URL=redis://127.0.0.1:<port>/0
cd apps/api && uv run --frozen alembic upgrade head
```

| Check (from `apps/api` unless noted) | Expected |
|---|---|
| `pytest tests_integration/test_notification_ownership.py tests_integration/test_socket_deadline.py tests_integration/test_event_clock.py -q` | 11 + 7 + 4 passed |
| Full integration on a **fresh** UTC database (flush Redis first) | 64 passed, 0 skipped |
| Same on a fresh database with `ALTER DATABASE … SET timezone TO 'Australia/Sydney'` | 64 passed, 0 skipped |
| `uv run --frozen pytest -q tests`; `ruff check .`; `ruff format --check .` | 773 passed; clean |
| Baseline: a detached worktree at `8b34bca`; copy the three new test files and `tests_integration/notification_worker_barrier.py`; for `test_socket_deadline.py` define `WS_CLOSE_TIMEOUT_SECONDS = 1.0` locally and read `_closing` with `getattr(…, ())` | ownership 9 failed / 2 passed (7 duplicate invocations, 1 pair lock held after an exception, 1 label-only: `[provider-timeout]` — the base does not resend but marks `delivery_failed`); deadline 5 failed / 2 passed; clock 2 failed / 2 passed |
| Mutation: replace `func.clock_timestamp()` with `func.now()` in `events._membership_time` | the two lock-wait cases fail |
| `REVIEW_EVIDENCE=<dir> .venv/bin/python ../../docs/run-golf-v2/morning-fixes/evidence/probe_r1_adapted.py` | 94 PASS |
| Root: `npm run test:ci -w @protin/mobile -- --runInBand --watchman=false` (also with `TZ=UTC`) | 64 suites, 968 passed |
| Root: `npm run lint -w @protin/mobile`; `npm run typecheck -w @protin/mobile` | clean |
| Root: regenerated review mobile probes (`overnight-evidence-2026-10-04/make_mobile_probes.py`, then delete the copies) | 16/16 |
| Root: `python3 -m unittest scripts/qa/test_qa.py` with `TZ` unset and `TZ=UTC`, each with and without `QA_TEST_DOCKER=1` | 14 pass + 7 skip; 21/21 |
| Root: `npm run typecheck -w @protin/web && npm run build -w @protin/web` (Node 20), then `vite preview` | `/privacy/`, `/terms/`, `/support/` serve the bytes in `apps/web/public/` |

**Native (A11Y).** Use a **new** simulator, a dedicated launcher project
(`.qa/config.env` with its own `QA_PROJECT` and ports, private `SPORTSGANG_QA_HOME`)
and `qa.py up --mode simulator --no-open`.
- Open Chats › QA Bob › "+ Session" at default size and at
  `accessibility-extra-extra-extra-large`.
- Terminate and relaunch Expo Go after each size change; it keeps stale text sizes
  otherwise.
- Expected frames and the form → HTTP → PostgreSQL receipt:
  [evidence/native/README.md](evidence/native/README.md).

**Website.** [evidence/web/README.md](evidence/web/README.md) lists engines and
versions, which checks were real and which emulated, and what was NOT_RUN.

## Out of scope / still gated

- R6 production provenance: NOT_RUN. No production access; the gate document is unchanged.
- Realtime sockets assume one API process.
- Physical iPhone, VoiceOver, Android, signed builds and real push: NOT_RUN.
- The chat screen at maximum text size: recorded, not changed.
- Website domain/host: undecided, not deployed.
- No merge to main, deployment, App Store submission or paid build.
