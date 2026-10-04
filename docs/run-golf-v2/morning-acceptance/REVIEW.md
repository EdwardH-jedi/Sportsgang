# Independent morning acceptance review — 2026-10-04

**Code verdict: NEEDS_FIXES.** Q01–Q09 pass in the tested scope. Additional investigations reproduce three P2 defects: duplicate notification dispatch by overlapping processors, room-size-dependent contact lock duration and incomplete closure after cancellation, and inconsistent group-event timestamp provenance. These are separate from the original nine repairs. **Production release is not ready:** R6 production provenance and the deployment/device gates below remain open.

No application code was changed. This publication contains review documents, reproducible reviewer probes, raw logs, native screenshots and accessibility frames.

## Pinned identity and preservation

| Input | Reviewed value |
|---|---|
| Repository | `EdwardH-jedi/Sportsgang` |
| Candidate branch | `fix/run-golf-v2-morning-q01-q09` |
| Delivery | `8b34bca78adc028423defbfb2caca8f4cc2d8a0a` |
| Last application source | `c46f4146aa1c46dd8d8d1700d69581ff90a7b5d4` |
| Previous independent review | `d41efc2cbabed59f4b988e6177aa9354b9bdc3fd` |
| Separate website delivery | `97990d9773669ae6f0ad813f4246f37353ec558d` |
| Review branch | `review/run-golf-v2-morning-acceptance-2026-10-04` |
| Dedicated worktree | `/private/tmp/sportsgang-morning-acceptance-20261004` |

Origin was fetched and all worktrees inspected before execution. A final fetch still resolved the candidate and website refs to their pinned deliveries; no newer candidate was substituted. The publication SHA is the commit containing this directory and is reported separately after remote verification.

Read before execution: `AGENTS.md`, both overnight acceptance/handoff documents, the morning implementation report/review handoff/R6 gate, relevant `docs/run-golf-v2/CONTRACTS.md` sections and saved decisive probes. Source and fresh execution determined the verdict; the implementation report and reference CI totals were not acceptance evidence.

Isolation used Docker project `sg-morning-review-20261004`, PostgreSQL port 55752, Redis 56752, API 8152, Metro 8252, a private QA ownership directory and generated credentials outside published evidence. PostgreSQL databases were `sportsgang_qa`, `sg_review_full`, and `sg_review_sydney`, all inside that project. Reset-like fixtures touched only these disposable databases. Real WebSocket probes used temporary loopback uvicorn servers; notification probes used separate Python processes and recording providers. No production or paid provider was accessed.

`evidence/preservation-before.json` records initial worktree HEAD/status. Its `report_hashes` field was empty; it is not a pre-run hash manifest. `preservation-after.json` compares all 806 existing Run + Golf report/evidence files against pinned Git bytes (initial worktrees were clean), records SHA-256 hashes, and confirms every other worktree's HEAD/status unchanged. The tracked diff against the delivery was empty before adding this directory. Original reports, untracked work, website branch, human services and databases were preserved.

The reviewer API was stopped after exact command/cwd/process identity verification; the owned Metro process and reviewer containers were stopped with `qa.py down` (exit 0). The disposable database volume is retained. Only the dedicated reviewer simulator was shut down; the other four booted simulators and human QA containers remain running. See cleanup and preservation evidence. The recording server's deliberate SIGTERM produced subprocess exit -15, not a failed acceptance check.

## Q01–Q09 dispositions

| Repair | Disposition | Direct evidence and practical boundary |
|---|---|---|
| Q01 — admission/delivery versus block | PASS, tested single-API topology | Real PostgreSQL and WebSockets: block first refuses registration/dispatch; effect first causes an observed PostgreSQL block waiter, completes registration/send, then block commits and closes 4003. Independent stored-delivery/disconnect check also passes. Aggregate socket time is additional finding B. |
| Q02 — fresh actor after pair-lock wait | PASS | Real lock wait followed by actor deactivation refuses message/like/proposal with 403; no message, discovery action, booking or notification rows; next `/auth/me` is 401. Scalar active flags are selected under the lock. |
| Q03 — proposal push versus block | PASS for block ordering | Separate worker process and API dispatcher: block first means no provider invocation; dispatch first makes block wait until provider return/mark/commit. Timeout leaves pending rows for retry; provider timeout marks failure; status notices remain allowed. Processor overlap is additional finding C. |
| Q04 — booking operation binding | PASS | Original probes and permanent regressions cover route/account A→B→A, unmount, stale confirmation callback, old success/failure, duplicate guard and old finally not releasing a new operation. Monotonic binding epoch owns UI results. |
| Q05 — Explore action ownership | PASS | Original and permanent tests cover account A→B→A, reset/logout, stale focus read, both like/block orders and unique token ownership of `actingOn`; stale finally cannot free another action. |
| Q06 — expired Block dialog | PASS | Blur/refocus keeps the old dialog expired; unmount, covered screen, route/account changes and A→B→A refuse the callback before any request. Same-current-dialog one-shot and failed-block retry controls pass. |
| Q07 — Matches request ordering | PASS | Initial/pull/focus responses share newest-request ownership; out-of-order success/error, unmount and retained owner replacement are covered. Successful recovery clears the old error. |
| Q08 — process start timezone identity | PASS for identity/adoption | Unit identity checks exercise UTC, Sydney, Kiritimati and Los Angeles; exact legacy identity is adopted, one-hour mismatch and foreign PID refused. Real old-launcher API/Metro were adopted under UTC with unchanged PIDs in a dedicated project. Teardown harness limitation below. |
| Q09 — picker accessibility layout | PASS on dedicated simulator | Native pixels and AX frames at default and maximum text sizes show complete Done label, valid target, both neighbor taps, settled swipe, close/reopen and both start/end pickers. Native form→HTTP→PostgreSQL exact-time agreement passes. Physical/Android/release-build coverage remains open. |

Q04–Q07 account replacement tests intentionally retain components. Normal logout resets/unmounts Main through the root navigation flow; retained-component tests are additional lifecycle stress, not evidence that normal logout leaks cards. Original decisive probes were regenerated, executed, saved here, then their exact temporary copies were removed from the mobile test directory.

Source anchors at the reviewed delivery:

- `apps/api/app/services/safety.py:46–55,73–82`: sorted pair locks and fresh scalar active flags; shared effect lock versus exclusive block lock. SQLAlchemy `key_share=True` without `read=True` produces PostgreSQL `FOR NO KEY UPDATE` here.
- `apps/api/app/routers/chat.py` admission and receive cleanup; `app/services/chat.py:100–102,137–165` registration/delivery transaction lifetime. The network handshake precedes authority; room registration does not.
- `apps/api/app/services/notifications.py:185–230,233–272`: proposal dispatch authority and per-event commit. `worker.py` and the internal endpoint call the same dispatcher.
- `apps/mobile/src/screens/bookings/BookingDetailScreen.tsx:81–154`: binding epoch, mounted preflight, result/error/busy ownership.
- `apps/mobile/src/stores/explore.ts:133–147,359–415`: owner epoch and action token.
- `apps/mobile/src/screens/explore/PartnerDetailScreen.tsx:60–90,161–166`: dialog expiry and pre-write currentness.
- `apps/mobile/src/screens/matches/MatchesScreen.tsx:130–210`: owner epoch and common request generation; success clears error.
- `scripts/qa/qa.py:425–518`: PID, command, cwd, pgid, start identity and UTC process-start interpretation; project ownership checks remain separate and strict.
- `apps/mobile/src/screens/bookings/BookingComposerScreen.tsx:367–377,617`: wrapped header/Done layout. Layout acceptance comes from native evidence below, not these styles.

### Adapted barrier scheduling and authority

The old race probe waited for a completed block while holding an effect barrier. After repair, the effect owns a conflicting PostgreSQL lock, so that scheduling would deadlock the probe. The adapted probe starts blocking as a task, observes the real `pg_stat_activity` lock waiter, releases the effect, and only then awaits the completed block. This is a valid change in scheduling; it does not permit a new send after a committed block.

Inspection and fresh execution preserve both orders: admission/register→block/closure; delivery/send→block/closure; provider invocation/return→block commit; and committed block→refused later effect. Its combined two-barrier case records registration, frame send, then closure. `adapted-probe-audit.json` verifies that `matrix` and `fresh_account` have identical ASTs to the original probe. The fresh adapted result is 94 PASS, 0 FAIL, 0 HARNESS_ERROR; the script's exit 0 alone was not used as its verdict.

An already-sent frame may arrive at the client after the block commit, and an already-invoked provider may deliver later. The property tested is server send/provider invocation under authority, not impossible recall of in-flight work.

Sorted user-ID lock order and one-pair effect transactions are preserved. Real cancellation/exception probes verify delivery rollback and notification session cleanup permit the next block in under one second. The permanent regression also verifies PostgreSQL lock timeout/retry. Real WebSocket disconnect removes registration and does not strand admission authority. These finite probes do not prove deadlock freedom for all unrelated database transactions.

Supported realtime topology is one API process with its in-process registry (`CONTRACTS.md:500–507`). A separate notification worker shares PostgreSQL authority. Multiple API processes/machines cannot close each other's sockets and require an explicit deployment gate; no distributed socket registry was added or assumed. Pair authority serializes blocks against proposals but does not claim ownership of a notification event, as finding C demonstrates.

## Additional reproduced findings

P2 means a reproducible correctness/availability defect requiring repair before this review accepts the candidate; no prohibited post-block contact was observed in the passing ordering probes.

### C / MA-C — P2: overlapping processors dispatch the same pending event

**Evidence:** `notification-two-workers.json` records two separate worker subprocesses invoking the provider for one pending proposal event, each returning `processed=1`. `notification-worker-internal-endpoint.json` records one worker invocation plus one API internal-endpoint invocation for the same event. Both use the real PostgreSQL event and deterministic barriers after the pair lock. Only one database row remains marked sent, so row counts or successful return values hide the duplicate external effect.

**Source:** `apps/api/app/services/notifications.py:245–253` selects all pending event objects without a claim/row lock; `258–266` dispatches cached objects and commits each. The pair's `FOR SHARE` locks are compatible with each other. Both processors pass the contact check and invoke the provider before either transaction marks the event. Worker/internal-endpoint overlap is supported by the current entry points and is not a hypothetical new topology.

**Narrow repair:** claim/reselect one still-pending event atomically before provider invocation and hold that event's authority through its per-event transaction. A row lock with fresh predicates and a documented order is sufficient; a global queue redesign is unnecessary. Do not lock an entire batch and then commit the first event, losing the remaining claims while retaining stale objects. Cover all notification types, preserve proposal pair ordering, timeouts and allowed status notices.

**Acceptance:** two workers and worker/internal overlap invoke the recording provider once per event; a loser skips/rechecks a committed sent/failed event. Exercise multi-event batches and status notices, claim wait/cancellation/exception/rollback, and the original block-first/effect-first orderings. Preserve retry for an unprocessed event after lock timeout.

**Separate external ambiguity:** `provider-success-commit-failure.json` injects a database commit failure after recorded provider success; rollback/retry invokes it twice. Atomic local ownership fixes overlap, but cannot alone guarantee exactly-once external delivery across success/commit failure or an ambiguous network timeout. Document that limitation, and require an external idempotency contract before claiming a stronger guarantee. This ambiguity is not counted as a fourth defect or a newly introduced regression.

### B / MA-B — P2: broadcast duration grows with socket count; closure can strand later sockets

**Evidence:** `broadcast-total-time.json` uses actual 5-second send timeouts, real PostgreSQL pair locks and a real HTTP block waiter, with controlled backpressure at `send_json`. One slow socket completes in 5.036 s; three take 15.081 s. Block remains waiting through the serial broadcast, then returns 201; registry is empty. A failed close in this trial is handled. `socket-close-stuck.json` makes the first socket close hang, cancels after 0.3 s, and observes the second never closed although the room was already removed from the registry.

**Source:** `apps/api/app/services/chat.py:109–118` serially spends up to 5 s sending and another 1 s closing each connection under delivery authority. `120–125` pops the entire room, then closes serially without a deadline; cancellation bypasses `except Exception`. `137–162` correctly releases authority in `finally` on cancellation. Block's room closure is after its commit; a stuck closure delays the HTTP response/other closures, not that already-committed block's pair lock.

The documented 5 s **per socket** bound works. The stronger availability conclusion that a slow client cannot hold the contact lock (`CONTRACTS.md:486–488`) is incomplete: total broadcast time is O(number of sockets). There is no total room/closure bound. The transport backpressure and hanging close are injected at the real service boundary; this is not evidence of a saturated kernel TCP buffer or a measured production incident. Real transport ordering is independently covered by Q01.

**Narrow repair:** choose and document a room-wide deadline independent of connection count; bound concurrent sends and close attempts. Cancel and await unfinished sends before releasing contact authority, so no send task can invoke after a block commits. Attempt all closures under a finite total deadline, including failed/hung closes and request cancellation; retain enough cleanup ownership to avoid dropping the room before remaining closes are accounted for. Avoid enlarging the global pair-lock protocol.

**Acceptance:** one, three and many stalled sockets plus a failing/hanging close complete under the declared room deadline (a ≤7 s send/cleanup budget is the review probe's proposed gate, not an existing contract). Block finishes within the deadline plus measured DB overhead; every send task is settled before authority release; closure attempts reach remaining sockets. Cancellation/exception leaves no pair lock or orphan send task. Both original ordering cases remain green.

### A / MA-A — P2: first join, leave and rejoin use different clocks

**Evidence:** real HTTP first join/leave/rejoin and literal PostgreSQL rows in `event-clock--120.json` and `event-clock-120.json`. With only the API `events.datetime` shifted −120 s after first join, first join is 03:40:17.843576Z, leave is 03:38:17.859295Z and rejoin is 03:38:17.871898Z. Leave precedes the first join. With +120 s, rejoin is two minutes ahead of database time. Both controls retain the same participant ID, clear `left_at` on rejoin and refuse a third participant at capacity (422).

**Source:** `apps/api/app/models/event.py:108` defaults first `joined_at` to database `now()`. `apps/api/app/services/events.py:435,492` writes rejoin/leave with the API host clock. Awareness/timezone normalization does not fix provenance or clock skew.

**Narrow repair:** use the same database-derived time authority for membership transitions while the event row is locked. Prefer a transition timestamp obtained after the lock wait; PostgreSQL transaction-start `now()` can precede a long wait, so test that separately. Preserve row reuse, capacity, private visibility, terminal-state rules, soft leave and full→open behavior. No historical rewrite or schema expansion is required by the reproduced defect.

**Acceptance:** ±120 s host skew no longer moves membership times; first join≤leave≤rejoin; times track database authority after a real event-lock wait; reused row and capacity controls stay green. Include concurrent last-seat/rejoin tests and the SQLite unit suite.

## Fresh checks, failures and warnings

Exact argv, cwd, exit codes and durations are in `evidence/checks.jsonl`; each named check has a `.log`. Eight readable logs had trailing whitespace or extra final blank lines removed for publication; their byte-exact originals remain in `evidence/raw-text-originals/*.gz`, with original/presentation hashes in `text-normalization.json`. The reviewer probe source also had one extra final blank line removed, with its original preserved. All other logs and native pixels/AX remain unchanged. The wrapper injects private local settings and guards the unique project. API commands below run from `apps/api`, mobile/launcher commands from repository root. PostgreSQL integration used freshly migrated dedicated databases.

| Check / actual command | Exit | Actual result |
|---|---:|---|
| `.venv/bin/python ../../docs/run-golf-v2/morning-fixes/evidence/probe_r1_adapted.py` | 0 | 94 PASS, 0 FAIL, 0 HARNESS_ERROR |
| `.venv/bin/python -m pytest tests_integration/test_contact_authority.py -q -rs` | 0 | 13 passed, 8 warnings |
| `.venv/bin/python -m pytest -c pyproject.toml ../../docs/run-golf-v2/morning-acceptance/evidence/test_independent_followups.py -q -rs` | 1 | 6 failed (A×2, C×2, B×2), 6 passed cleanup/ambiguity controls, 3 warnings |
| `.venv/bin/python -m pytest -c pyproject.toml ../../docs/run-golf-v2/morning-acceptance/evidence/test_independent_block_first.py -q -rs` | 0 | 1 passed, 5 warnings; corrected reviewer assertion described below |
| `npm run test:ci -w @protin/mobile -- --runInBand --watchman=false --runTestsByPath src/__tests__/codex-overnight-{booking,store,partner,matches}.test.tsx` (four expanded paths in ledger) | 0 | 4 suites, 16 passed |
| Same Jest command with BookingDetailScreen, PartnerDetailScreen, exploreStore, MatchesScreen, BookingComposerScreen test paths | 0 | 5 suites, 171 passed |
| `.venv/bin/python -m pytest -q` | 0 | 772 passed, 867 warnings, no skips |
| `REVIEW_DATABASE=sg_review_full` wrapper: `.venv/bin/alembic upgrade head`; `.venv/bin/python -m pytest tests_integration -q -rs` | 0 / 0 | 42 passed, 35 warnings, no skips (UTC database) |
| `REVIEW_DATABASE=sg_review_sydney` wrapper: same migration and integration commands | 0 / 0 | 42 passed, 35 warnings, no skips (Sydney database default; API UTC session pin) |
| `npm run test:ci -w @protin/mobile -- --runInBand --watchman=false` | 0 | 64 suites, 967 passed, no skips |
| `env TZ=UTC python3 -m unittest scripts/qa/test_qa.py -v` | 0 | 21 ran: 14 passed, 7 intentional Docker opt-in skips |
| `env TZ=UTC QA_TEST_DOCKER=1 python3 -m unittest scripts/qa/test_qa.py -v` | 0 | 21 passed, no skips |
| `env TZ=Australia/Sydney QA_TEST_DOCKER=1 python3 -m unittest scripts/qa/test_qa.py -v` | 0 | 21 passed, no skips |
| `env TZ=UTC MORNING_ROOT=… MORNING_BOOT=… MORNING_EVIDENCE=… MORNING_PROJECT=sg-morning-review-20261004 python3 docs/run-golf-v2/morning-fixes/evidence/probe_qa_real_adapted.py` | 0 | Real legacy API 24917 / Metro 24970 adopted unchanged; teardown limitation below |
| `.venv/bin/ruff check .`; `.venv/bin/ruff format --check .` | 0 / 0 | All checks passed; 148 files already formatted |
| `npm run lint -w @protin/mobile`; `npm run typecheck -w @protin/mobile` | 0 / 0 | Passed |
| R6 overlap probe with default UTC and `DB_NAIVE_TIMEZONE=Australia/Sydney` | 0 / 0 | UTC preserves both instants; Sydney naive overlap loses distinction, as gate states |
| `summarize_native.py`; `verify_native_data.py` via wrapper | 0 / 0 | Native target/selection and exact HTTP/database consistency assertions passed |

Harness mistakes are retained rather than hidden: the first reviewer follow-up invocation omitted `-c pyproject.toml`, so an out-of-tree test collected without async configuration and produced 12 setup errors (exit 1). The configured rerun is the decisive result. The first independent block-first run incorrectly asserted the return of `_closed_with`, a helper whose internal assertions passed and which returns `None`; this produced one harness failure. Removing the outer assertion yielded the recorded one-test PASS. Neither is counted as a product defect.

Warnings include passlib/Python `crypt`, deprecated HTTP 422 constants and websockets APIs. The fresh full mobile run records 18 `console.error` blocks, principally React `act` warnings; assertions passed, but warning-free verification is not claimed. Original mobile probes also emit `act` warnings. Raw logs retain details.

Real Q08 adoption is decisive for unchanged PID/identity. Its in-process legacy/new-launcher harness logs a teardown refusal: Metro 24970 did not exit within the probe's wait and no further signal was sent; the probe catches that `SystemExit`, so overall exit 0 is not proof of teardown success. This is consistent with an unreaped child owned by the old imported module, but that explanation is a hypothesis. The process was gone after the probe exited. A later normal candidate CLI cleanup successfully stopped reviewer Metro 27838, and the original adopted API was stopped normally before native recording. No launcher product defect is inferred from this harness limitation.

## Q09 native evidence

Dedicated device: `B0603E58-8D8E-485C-B2C6-BB3B931444C2`, “SportsGang Independent Morning 20261004”, iPhone 16e, iOS 26.3, 390×844 pt. Expo Go served this pinned worktree on Metro 8252. Only this simulator received app installation, interactions or text-size changes.

At default size, Done target is x=310.67, y=457, w=55.33, h=44 (right edge 366). At `accessibility-extra-extra-extra-large`, it is x=215, y=310.67, w=151, h=79.67 (right edge 366). Both complete labels are visible in original PNGs and targets stay inside the screen. Start/end picker captures at both sizes pass. AX nearest-row centers are exactly on :30 after :15→:30 and :45→:30 taps; final swipes settle on :45; close/reopen preserves 11:30, end picker 12:30. See `native-layout-and-selection.json`, original `native/*.png`/`.json`, and `evidence/NATIVE_PROCEDURE.md`.

`native/fresh-default-form.png` shows 5 October 11:30 AM–12:30 PM Sydney. `native-http-bookings.jsonl` records `2026-10-05T00:30:00.000Z`–`2026-10-05T01:30:00.000Z`, response 201. `native-form-http-postgres.json` verifies the sole resulting booking `7089c0b5-3975-4c25-af79-b6561549fe23` has literal PostgreSQL 00:30+00–01:30+00 and status proposed. This is one real native form→HTTP→database submission, not a style assertion or mock request.

Intermediate exploration captures are retained: an initially too-short swipe did not move the wheel, and a gesture on the multiline form field did not scroll the form. Switching content size while retaining the broader form showed mixed cached text sizes; the app was relaunched at default before the clean final submission. These are not accepted as a full-form accessibility result or counted as defects in this narrow picker review. Expo Go notification limitations were visible; notification permission was declined and no external provider was used.

## Product acceptance versus release readiness

The nine original repairs can be accepted within the measured scope. The complete morning candidate remains **NEEDS_FIXES** until MA-C, MA-B and MA-A meet the handoff's decisive tests. The passing 772/42/967 suites do not cover the counterexamples by themselves.

Release remains **NOT_READY**, separately from that code decision:

1. R6 production provenance must be established with the authorized deployment operator's evidence in `morning-fixes/R6_C01_DEPLOYMENT_GATE.md`. Production was not accessed here. Historic naive audit timestamps cannot be assumed UTC from a local session pin. The controlled Sydney overlap still maps two instants to one naive wall time; no history rewrite is authorized by this review.
2. Verify the actual deployment serves WebSockets from exactly one API process/machine until cross-process closure is implemented. Repository configuration is not live topology proof.
3. Physical-device, Android, VoiceOver, real provider delivery and signed release-build behavior were NOT_RUN. The dedicated Expo Go simulator proves the stated picker checks only; it does not close all device/release gates.
4. After repair, rerun focused acceptance then appropriate API/PostgreSQL/mobile suites and preserve a fresh evidence manifest. Merge/deploy/App Store/paid builds remain outside this review's authorization.

Implementation priorities and exact ownership are in [CLAUDE_HANDOFF.md](CLAUDE_HANDOFF.md); machine-readable dispositions are in [VERDICT.json](VERDICT.json). Evidence integrity is listed in `evidence/MANIFEST.sha256`.
