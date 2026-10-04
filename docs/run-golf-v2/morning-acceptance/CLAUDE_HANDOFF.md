# Claude implementation handoff — morning acceptance follow-ups

**Implement MA-C, MA-B, then MA-A.** Independent code verdict is NEEDS_FIXES; original Q01–Q09 repairs passed in the exercised scope. All three new findings are P2 and have failing reproducible safety assertions. Keep booking-first behavior, existing transaction authority and unrelated work unchanged. This handoff requests narrow implementation; this review itself changes no product code.

Base delivery: `8b34bca78adc028423defbfb2caca8f4cc2d8a0a`; application source: `c46f4146aa1c46dd8d8d1700d69581ff90a7b5d4`. Read [REVIEW.md](REVIEW.md), [VERDICT.json](VERDICT.json), `../CONTRACTS.md` §8 and `../morning-fixes/R6_C01_DEPLOYMENT_GATE.md`. Fetch and inspect your actual worktree; preserve any newer work and report it rather than substituting it into this pinned review.

## Ownership and waves

| Wave | Owner boundary | Permitted implementation files | Tests / coordination |
|---|---|---|---|
| 1 — notification ownership (MA-C) | API notification service | `apps/api/app/services/notifications.py` | A new focused integration test file and, only if needed, `tests_integration/notification_worker_barrier.py`. Preserve worker/internal router public interfaces. |
| 2 — finite contact effects (MA-B) | API realtime service | `apps/api/app/services/chat.py`; router only if cancellation ownership requires a small documented change | A separate socket-deadline integration test file; retain existing authority tests. Coordinate CONTRACTS §8 changes after Wave 1. |
| 3 — membership clock (MA-A) | API group-event service | `apps/api/app/services/events.py`; model only if justified by one shared timestamp mechanism | A separate event-clock integration file and focused event unit regressions. No historical repair/migration is implied. |
| 4 — integration evidence | One integration/documentation owner | `docs/run-golf-v2/CONTRACTS.md`, new repair report/evidence | Rerun original decisive probes and suites; preserve these review originals. |

These are sequential waves with separate file ownership, not an instruction to launch parallel agents. Notification and realtime work both depend on the pair-lock contract: keep a single documentation owner to avoid incompatible ordering claims. Shared test helpers should have one owner; use new focused test files to reduce conflict. Mobile screens, stores, QA launcher, website, shared package, deployment configuration and database history are outside the reproduced repair scope.

## Wave 1 — MA-C: atomic ownership of each notification event

Reproduce with the saved `evidence/test_independent_followups.py` tests matching `concurrent_processors`. On the candidate, both two-worker and worker/internal-endpoint cases invoke the recording provider twice for one pending proposal. Receipts: `notification-two-workers.json`, `notification-worker-internal-endpoint.json`. Real PostgreSQL and separate subprocess workers are used; no external provider credentials are necessary.

Root cause: `notifications.py:245–253` reads a batch of unclaimed pending ORM objects; `258–266` dispatches each without fresh atomic ownership. Pair `FOR SHARE` does not exclude another processor's `FOR SHARE`.

Implement a transaction-owned claim/reselect of one still-pending event before calling the provider, with fresh sent/failed predicates after any wait. A row lock or atomic conditional claim can solve this without introducing a new queue. Document claim→pair-lock ordering and bound waits. Preserve per-event commit and do not load/lock a whole batch then release all locks when the first event commits. Do not let the loser dispatch its cached stale event. Apply ownership to proposal and allowed status/reminder notices.

Decisive acceptance:

1. Two separate worker processes paused at deterministic barriers process the same event: exactly one provider invocation and one reported processing result; loser observes the committed state.
2. Worker/internal-endpoint overlap has the same result; include status notices, multiple due events and an already-marked event held in an old session identity map.
3. Proposal block-first refuses the provider; proposal effect-first makes block wait until provider return and marking. Keep both existing real-process ordering probes and 94 adapted assertions.
4. Claim contention, timeout, cancellation, exception and rollback release ownership; a still-pending event can recover. Existing pair lock timeout leaves the cycle pending. Preserve no-token retry and status notices while blocked.
5. Provider-success/database-commit-failure remains explicitly documented as ambiguous external delivery. Preserve `test_provider_success_commit_failure_is_ambiguous` as an observation/control, not a promise of exactly-once delivery. Stronger delivery semantics require a verified provider idempotency contract.

## Wave 2 — MA-B: finite room broadcast and complete closure attempts

Reproduce tests matching `broadcast` and `stuck_close` in `evidence/test_independent_followups.py`. One stalled socket takes 5.036 s and three take 15.081 s while the real block waits on PostgreSQL. First-close failure is tolerated; first-close hang plus cancellation leaves the second socket unclosed and the room removed. Receipts: `broadcast-total-time.json`, `socket-close-stuck.json`.

Root cause: `chat.py:109–118` applies 5 s send + up to 1 s close serially for each socket under the pair lock; `120–125` pops all registrations before unbounded serial close. The 5 s per-socket statement is true; an aggregate bound is missing. Hanging socket operations are controlled transport injections, not a production TCP incident.

Use a documented room-wide deadline independent of connection count, with finite concurrent send/close work. The review's ≤7 s assertion is a proposed send/cleanup acceptance budget; choose an explicit justified value and update the contract and gate together. Do not detach unfinished sends: cancel **and await** them before releasing the pair lock. Handle the cleanup owner on request cancellation so all sockets receive a bounded closure attempt and registry removal does not silently lose the remaining work. Failure closure after block commit must not indefinitely delay the HTTP response. Avoid a distributed realtime redesign.

Decisive acceptance:

1. One, three and many stalled connections finish under the documented room deadline, including failed close and hung close. Assert elapsed time, not only an empty registry or style/config value.
2. Observe real PostgreSQL block wait during the effect; all send tasks settle before rollback/authority release; block returns within the deadline plus measured database overhead. Record every server send invocation to prohibit late sends after block commit.
3. A failed/hung close cannot prevent attempts for remaining sockets. Cancel during broadcast and during closure; verify bounded cleanup and no orphan task/held pair lock.
4. Retain real WebSocket admission, delivery, disconnect, two-barrier and committed-block-first tests. Client arrival of an already-sent frame is permitted; server invocation after loss of authority is not.

## Wave 3 — MA-A: one clock for membership transitions

Reproduce tests matching `event_times` in `evidence/test_independent_followups.py`. Shift only the API clock ±120 s after first join; actual HTTP leave/rejoin uses that host clock, while first join uses database `now()`. Negative skew makes leave precede first join; positive skew makes rejoin two minutes later than database time. Both tests preserve participant ID and capacity controls. Receipts: `event-clock--120.json`, `event-clock-120.json`.

Root cause: `models/event.py:108` database first-join default versus `services/events.py:435,492` host-clock rejoin/leave.

Use one database-derived timestamp authority for first join/rejoin/leave under the event row lock. Obtain transition time after lock acquisition; PostgreSQL transaction-start `now()` can predate a long wait. A small service helper or expression is sufficient, with a portable SQLite behavior for unit tests. Preserve same-row reactivation, clearing `left_at`, capacity checks, private visibility, host leave refusal, terminal statuses and full→open transitions. Do not add event history/schema or rewrite historical rows to solve this finding.

Decisive acceptance:

1. Host ±120 s skew leaves database-aligned timestamps; first join≤leave≤rejoin, with post-lock transition time.
2. A real event-lock wait followed by leave/rejoin cannot record transaction-start time before the preceding transition.
3. Rejoin reuses the row/ID; `left_at` clears; rejected over-capacity request creates no extra membership; concurrent final-seat/rejoin and full→open controls pass.
4. Run existing PostgreSQL event capacity/rejoin regressions and the SQLite API suite.

## Reproduction and verification

Use a fresh dedicated worktree/project and disposable PostgreSQL. Never use the human QA database or existing simulator. The runner intentionally guards project `sg-morning-review-20261004` and loopback PostgreSQL port 55752. To reuse the exact scripts, recreate that stopped disposable project with fresh private credentials and isolated ownership; otherwise make an explicit reviewer-only copy changing the namespace/port guards. Keep credentials and ownership files ignored and outside committed evidence.

After migration, from the worktree root:

```sh
python3 docs/run-golf-v2/morning-acceptance/evidence/run_check.py followups api -- .venv/bin/python -m pytest -c pyproject.toml ../../docs/run-golf-v2/morning-acceptance/evidence/test_independent_followups.py -q -rs
python3 docs/run-golf-v2/morning-acceptance/evidence/run_check.py block-first api -- .venv/bin/python -m pytest -c pyproject.toml ../../docs/run-golf-v2/morning-acceptance/evidence/test_independent_block_first.py -q -rs
```

Inspect `-k` names in the source when splitting the waves; use new evidence names so original receipts are not overwritten. Existing private local fixture configuration must never be printed or committed. Exact executed commands/settings variants, exits and warnings are in `evidence/checks.jsonl`; reproduction setup is in `evidence/README.md`.

Run focused acceptance first, then existing real PostgreSQL contact/event suites, full API and mobile suites, Ruff, mobile typecheck/lint and launcher timezone tests. Preserve the original regenerated mobile probes (16 tests) and permanent mobile regressions (171 focused tests). Do not turn a finite green suite into a stronger concurrency/external delivery claim.

Q09 passed native default/maximum picker coverage and one form→HTTP→PostgreSQL submission; no mobile rewrite is requested by these findings. Retained-account lifecycle stress remains distinct from normal logout. Q08 identity/adoption passed; its real-adoption harness teardown refusal must not be reported as a product failure without independent reproduction.

## Remaining release gates

Code repair acceptance and release readiness are separate. R6 production timezone provenance is still required under `../morning-fixes/R6_C01_DEPLOYMENT_GATE.md`; only controlled overlap probes were run here. Actual single-API WebSocket topology must be confirmed before deployment. Physical device, Android, VoiceOver, real notification provider and signed release build remain NOT_RUN. No production access, migration/history rewrite, deploy, merge main, paid build or App Store action is authorized by this handoff.

Deliver a new implementation report with source ownership, actual commands, exits/warnings/skips, new evidence and any changed application SHA. Request a fresh independent review of the completed candidate; preserve this report and original evidence.
