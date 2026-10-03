# Independent R1–R7 acceptance review — 4 October 2026

**Verdict: NEEDS_FIXES.** The ordinary repairs work and the reference suites independently pass, but this review reproduces **three P1 and six P2 findings**. R1 still permits contact across concurrent restriction boundaries. R3/R4 still accept callbacks from earlier identity epochs. R2 has a conditional legacy-adoption failure under a timezone override; R5 has a native large-text layout defect. R6 also has a separately documented, conditional timestamp-information limitation and an unverified production provenance gate. R7 passes the tested stale-data, held-retry, timeout, and recovery paths.

This is a review-only delivery: no application, migration, contract, package, or permanent test files were changed. Failed independent assertions below express the required safe behavior; they are evidence of remaining defects, not an approved green gate.

## Baseline and scope

| Item | Exact identity |
| --- | --- |
| Application/code/test SHA reviewed | `ecd1e86047cdc4411905d43210bc07112bbcbf07` |
| Delivery base | `cd567c80af2f6d23fc9cbe4bd178507c37d85ae3` |
| Previous independent review | `60a264c9180103da18d0aa6aac794840381fd3be` |
| Previously reviewed application | `b530e7f3e726b9e830e52259f0ae699725090f5f` |
| Review branch | `review/run-golf-v2-r1-r7-2026-10-04` |
| Dedicated review worktree | `/private/tmp/sportsgang-r1-r7-review-20261004` |
| Publication SHA | The commit containing this report; the exact SHA is supplied in the publication handoff and verified against the remote branch. It is distinct from the application SHA above. |

Origin was fetched before source review and again before publication preparation. The implementation remote remained at `cd567c8`; no newer implementation changes were found. The entire `ecd1e86..cd567c8` diff, including paths outside apps/packages, contains only documentation/evidence. The ten specified code/test commits were inspected. See [commit history](overnight-evidence-2026-10-04/commit-history.txt) and [delivery paths](overnight-evidence-2026-10-04/delivery-only-paths.txt).

The supplied request ends mid-sentence in R4. A request for the missing remainder was left pending; work continued while the user slept. R5–R7 scope was taken from the repository's implementation report, contracts, previous review, and home-test runbook. No missing text was invented.

Root AGENTS.md review/planning guidance was followed. All work used one persistent terminal and no additional agents. Earlier review and implementation reports/evidence were retained unchanged. Temporary reviewer tests were copied into the mobile test directory solely for execution, then removed; their final sources are saved under this review's evidence directory.

## R1–R7 disposition

The original reproductions in the previous report remain **historical evidence**. This review reran the important acceptance paths on the pinned repaired source; it does not relabel old screenshots or old test totals as fresh results.

| Repair | Original problem → current ordinary behavior | Independent acceptance | Residual disposition |
| --- | --- | --- | --- |
| R1 | One-way/incomplete contact restrictions → shared bilateral policy, pair locks, socket closure and proposal-notice filtering | Real PostgreSQL: both directions refuse message GET/POST, discovery like/pass/save, proposals/confirmation and challenges; match totals exclude the pair. Existing bookings, reports, allowed completion/withdrawal and retained history work. Native block removes chat; unblock restores it. | **FAIL:** Q01–Q03 reproduce admission/delivery, stale account state and queued-push races. |
| R2 | Weak process/worktree ownership → exact identities, canonical owner, project lock and guarded signals | Normal machine zone: 20 launcher tests pass, real old-launcher adoption preserves API/Metro PIDs, and real restart/down/up/reset gives 14 passing assertions. Docker-free suite gives 13 pass/7 deliberate skips. | **Conditional FAIL:** Q08 when the launcher's `TZ` differs from the OS zone. Human-stack destructive testing was not used. |
| R3 | Late detail responses/unsafe offline state → fetch generation and booking/account binding, payload-ID check, Back/Retry | Current component tests pass; independent A-pending→B-resolves→A-resolves control keeps B and posts to B. A→B old dialog is refused. | **FAIL:** Q04 identity-string reuse and dialog-after-unmount remain unsafe. |
| R4 | Screen-owned block mutation/feed resurrection → store guard and page invalidation, nullable stale action result, focus refresh | Existing store/screen tests pass, held-next-page control cannot restore blocked target, and focus-loss completion does not navigate. Native ChatScreen block/unblock refresh works. | **FAIL:** Q05–Q07 cover owner-epoch reuse, stale dialog execution and unordered match responses. |
| R5 | Tap/scroll wheel disagreement → synchronized tap target, local picker draft, commit on close | Fresh iOS simulator: 45→30 and 15→30 tap paths settle on 30; 11:30–12:30 survives close/reopen, proposal HTTP and literal PostgreSQL values. A wheel swipe settles at 09:45 and commits that value. | **Partial:** normal controls pass; Q09 reproduces large-text clipping. Physical-device/VoiceOver/Android testing is NOT_RUN. |
| R6 | Naive audit datetimes → explicit UTC instant serialization and configured DB session zone | 3 configured-Sydney audit tests pass; full integration passes with a Sydney DB default and UTC session pin. Native blocked date shows Oct 4 for the Oct 3 UTC instant. | **Conditional:** C01 repeated-wall-time ambiguity; production historical zone provenance is NOT_RUN. No historical rows were rewritten. |
| R7 | My Plans lost/obscured stale-data notice during retry → retain loaded plans, accessible busy retry, clear only on success | Unit suite passes; real native API stop, held transport, timeout, API restart and retry preserve rows/notice while pending and clear notice after success. | **PASS for tested scope.** Native one-source-only failure was not separately injected; unit tests cover partial-source/initial-load cases. |

## Confirmed findings

### Q01 — P1 — WebSocket admission and delivery are not atomic with blocking (R1)

**Source:** `apps/api/app/routers/chat.py:81–94`, `apps/api/app/services/chat.py:93–95,124–145,149–158`.

Admission checks the pair, releases the transaction, then awaits socket acceptance before registering the room. Blocking can commit while no socket is registered, so the block's room closure misses the later registration. Delivery similarly checks restrictions before awaiting broadcast.

**Reproduction:** a deterministic barrier holds actual `connections.connect` after the admission check. A real HTTP block commits, then registration is released. The real uvicorn/WebSocket connection remains open rather than closing with 4003. A stronger two-barrier run also holds a permitted stored-message delivery before broadcast: commit block while the room is absent, release admission, then release the original broadcast. A real client receives `stored before block` after the block committed.

**Expected:** a socket admitted or frame delivered after the restriction boundary cannot escape the block. Pre-block stored history may remain; storage retention is not the defect.

**Evidence:** [final R1 assertions](overnight-evidence-2026-10-04/r1-results.json), [verified log](overnight-evidence-2026-10-04/r1-final-verified.log), [probe](overnight-evidence-2026-10-04/probe_r1.py). Barriers are injected in memory around the original methods; the server, WebSocket transport and database are real. The already-registered closure/reconnect happy path passes. This is not a claim that every delay leaks a frame, nor proof of multi-process socket safety.

**Repair boundary:** serialize admission registration, delivery authorization and block closure for the supported single realtime process, with a clear linearization rule. Do not introduce a distributed realtime system solely for this finding.

### Q02 — P1 — Pair-lock wait does not refresh an authenticated actor in the ORM identity map (R1)

**Source:** `apps/api/app/services/safety.py:43–46,64–74`.

`_lock_pair` selects User objects without refreshing existing instances. Authentication has already loaded the actor as active. After waiting for another transaction's user-row lock, SQLAlchemy can return that cached actor even though the database row is now inactive.

**Reproduction:** a separate PostgreSQL connection holds the pair locks and deactivates the actor without committing. A request authenticates against the old committed state and waits at the real pair lock. The probe observes the wait through `pg_stat_activity` before committing deactivation. Message, like and proposal requests return **201, 200 and 201**, respectively, and each persists one prohibited row. A following `/auth/me` returns 401.

**Expected:** fresh post-lock account state rejects the request (403 in the contact-policy probe), with zero prohibited rows or delivery. This is a real lock/identity-map result, not a SQLite concurrency inference.

**Evidence:** six failed status/row assertions in [R1 results](overnight-evidence-2026-10-04/r1-results.json). Ordinary block-versus-contact lock tests pass; their success does not establish fresh account state after a wait.

**Repair boundary:** read fresh scalar active flags under the acquired pair locks, or explicitly populate/refresh the selected users. Keep lock order and transaction ownership unchanged unless the new ordering is justified and tested.

### Q03 — P1 — A queued proposal notice can cross a committed block while token lookup is pending (R1)

**Source:** `apps/api/app/services/notifications.py:187–218`.

The proposal restriction check precedes an awaited token lookup and provider dispatch. There is no shared authority boundary with a later block.

**Reproduction:** hold `_get_latest_push_token` after a proposal passes the safety check, commit a real block, then release lookup. The provider boundary is invoked with `proposal_received`. A separate notification process with an IPC barrier reproduces the same result while the API process commits the block.

**Expected:** proposal contact is suppressed across this queued-delivery boundary. The allowed `booking_cancelled` notification control still dispatches while blocked; it concerns an existing commitment and is not unauthorized new contact.

**Evidence:** both single-process and separate-worker failures plus the cancellation control in [R1 results](overnight-evidence-2026-10-04/r1-results.json). The provider is a recording fake: this proves an unauthorized provider invocation, not delivery to a physical device. No paid provider call was made.

**Repair boundary:** define and enforce dispatch-versus-block ordering in the API/worker topology already supported. A process-local WebSocket lock cannot protect a separate notification worker; a second uncoordinated check alone retains a check/use window.

### Q04 — P2 — Booking Detail revalidates old transition/dialog callbacks when an identity string repeats (R3)

**Source:** `apps/mobile/src/screens/bookings/BookingDetailScreen.tsx:85–110,130–150,159–172`.

Fetches use a generation, but transition currentness uses only `${accountId}|${bookingId}`. The pre-request transition guard also omits `mounted.current`.

**Reproduction using the actual component:** start A's cancellation, visit B, return to A and load fresh confirmed A, then resolve the old cancellation: it replaces the fresh state. An old error alerts after account A→B→A. A no-show dialog opened before A→B→A becomes valid again and posts; its callback also posts after unmount.

**Expected:** leaving the route/account epoch permanently expires its completions and dialogs, even if the same ID returns. An unmounted dialog callback must not submit a mutation. The ordinary A→B fetch and old-dialog controls pass and assert display identity plus mutation URL together.

**Evidence:** four failed tests and two controls in [booking probe](overnight-evidence-2026-10-04/codex-overnight-booking.test.tsx) and [verified Jest results](overnight-evidence-2026-10-04/mobile-probe-results-verified.json).

**Repair boundary:** carry a monotonically changing binding epoch through mutation preflight, result, error, finally and confirmation callbacks; distinguish request ownership from a reusable identity string.

### Q05 — P2 — Explore mutation completion and finally lack an owner epoch and operation token (R4)

**Source:** `apps/mobile/src/stores/explore.ts:335–377,381–390`.

`recordAction`/`blockPartner` compare only owner ID. Reset or hydration clears `actingOn`; an earlier operation can become current again after A→B→A. Its finally only compares target ID, allowing it to release a newer same-target operation's guard.

**Reproduction:** old A block returns true after A→B→A; old like returns its old match rather than null. In the third case, an old action settles while a new same-target block is held; the old finally clears the new guard.

**Expected:** returning to A does not revive earlier A operations, and only the operation that acquired the guard may release it. Held page invalidation is a separate control and passes.

**Evidence:** three failed cases in [store probe](overnight-evidence-2026-10-04/codex-overnight-store.test.tsx) and the verified Jest results.

**Repair boundary:** store-owned auth epoch plus unique operation ownership, while preserving the existing feed-generation invalidation and nullable stale action return contract.

### Q06 — P2 — Partner Detail's old confirmation can submit under a replacement owner (R4)

**Source:** `apps/mobile/src/screens/explore/PartnerDetailScreen.tsx:59–72,95,121–141`.

The card is snapshotted at mount. The alert callback invokes `block()` without validating the owner/focus/mount at request time. `canNavigate` is only checked after the server write.

**Reproduction:** open A's block dialog, replace the owner with B, then activate the old Block callback. The actual screen/store path posts `/blocks` for the snapshotted target in B's context. The ordinary focus-loss completion control correctly avoids navigation.

**Expected:** an old account's confirmation cannot authorize a new account's write. Mount/focus checks after the write are too late.

**Evidence:** [partner probe](overnight-evidence-2026-10-04/codex-overnight-partner.test.tsx), verified Jest failure. This is a controlled retained-component/account-replacement case. Ordinary logout resets/unmounts the authenticated stack; this review does not claim an observed native logout leak. Alert callbacks still require preflight expiry independent of later navigation.

### Q07 — P2 — Matches focus responses can restore a blocked chat, and a successful focus refresh leaves a stale error (R4/R1 UI follow-up)

**Source:** `apps/mobile/src/screens/matches/MatchesScreen.tsx:148–185,193–200`; navigation context: `apps/mobile/src/navigation/RootNavigator.tsx:66–112,149–166`.

Initial, pull and focus requests write state without an owner/generation binding or effect cleanup. Focus success sets matches but does not clear an earlier error.

**Reproduction:** hold an old focus result containing a chat, complete a newer empty result after blocking, then release the old result: the blocked chat returns. Separately, initial fetch fails and a later focus succeeds, but the error view still wins. A retained component also preserves the previous owner's cards on replacement.

**Expected:** newer authority wins; successful recovery clears its obsolete error; owner replacement cannot retain prior matches. First focus issues exactly one request and a normal next focus removes the blocked chat (passing control and native evidence).

**Reachability limit:** Main tab screens remain mounted while blurred, so overlapping focus responses are reachable through ordinary chat/back navigation. Normal logout dispatches a root reset and unmounts Main; the retained-account assertion is not evidence of a leak on that normal logout path.

**Evidence:** three failures and one passing control in [matches probe](overnight-evidence-2026-10-04/codex-overnight-matches.test.tsx), verified Jest results.

### Q08 — P2 — Legacy process adoption compares start times in different timezones (R2; conditional environment)

**Source:** `scripts/qa/qa.py:418–419,436–448,455–473`.

`ps` receives `_C_ENV` without TZ and reports the system zone. `_legacy_reasons` parses `lstart` with `time.mktime` in the launcher's process timezone. Running with `TZ=UTC` on this Sydney machine produces an 11-hour discrepancy from the aware recorded timestamp.

**Reproduction:** Docker-enabled launcher tests with UTC process TZ give **19 pass/1 fail**. Verified legacy API/Metro children are falsely classified as foreign, remain running, and `up` starts replacements on alternate ports instead of adopting them. The log shows `Sun Oct 4 03:54:22 2026` versus `2026-10-03T16:54:22+00:00` for the same instant. The host-zone rerun gives **20 pass/0 skip**. A separate real earlier-launcher startup and repaired adoption in the normal host zone preserves both actual API/Metro PIDs.

**Expected:** legacy start identity comparison is invariant to a caller's TZ. Refusal of truly foreign processes must remain strict.

**Evidence:** [UTC launcher failure](overnight-evidence-2026-10-04/qa-launcher.log), [host-zone pass](overnight-evidence-2026-10-04/qa-launcher-host-zone.log), [real adoption](overnight-evidence-2026-10-04/qa-real-legacy-adoption.json).

**Repair boundary:** compare a numeric UTC process-start identity, or force the same explicit zone in both OS formatting and parsing. Do not weaken the five-second/start/command/cwd/group validation to make this case pass.

### Q09 — P2 — The time-picker header clips the close control at maximum accessibility text size (R5)

**Source:** `apps/mobile/src/screens/bookings/BookingComposerScreen.tsx:366–379,607–633`.

On the fresh iPhone 16e simulator (390×844 points, iOS 26.3), set `content_size` to `accessibility-extra-extra-extra-large` and reopen Start time. The title and close text scale in a non-shrinking horizontal header. The close button frame is **x=317,width=151**, ending at **468** on a 390-point screen. The visible text reads only a clipped portion of Done; the footer also expands substantially.

**Expected:** the close action and label remain fully visible and usable across supported text sizes. Default-size control frame is x=310.67,width=55.33 and fits the screen.

**Evidence:** [native large-text screenshot](overnight-evidence-2026-10-04/native/44-large-text-wheel.png), [AX frame](overnight-evidence-2026-10-04/native/44-large-text-wheel.json), [default control](overnight-evidence-2026-10-04/native/39-gesture-before.json). The button remains exposed to accessibility and tapping its visible portion successfully closes it ([dismiss result](overnight-evidence-2026-10-04/native/47-large-text-dismiss.json)). This is a reproduced layout/accessibility defect, not a claim that completion is impossible or VoiceOver was tested.

**Repair boundary:** preserve scalable readable text and a fully visible close target through wrapping/shrinking or an adaptive header layout; do not rely on the wheel-row font cap to constrain its surrounding header.

## C01 — R6 conditional information-loss limitation and deployment gate

**Source:** `apps/api/app/core/time.py:6–10,31–34`, `apps/api/app/core/config.py:105–113,160–163`, `docs/run-golf-v2/CONTRACTS.md:523–572`.

Default UTC session pinning and serialization pass. For a database proven to have a consistent Sydney historical wall-time zone, the documented alternate `DB_NAIVE_TIMEZONE=Australia/Sydney` also controls *new* naive audit writes. During the autumn overlap, two distinct instants map to the same naive timestamp. Real PostgreSQL conversion produces `2026-04-05 02:30` for both `2026-04-04T15:30Z` and `16:30Z`; the actual `utc_instant` converter maps both to `15:30Z` using its documented fold=0 policy. The second loses one hour of actual instant identity.

See [overlap evidence](overnight-evidence-2026-10-04/r6-overlap.json) and [probe](overnight-evidence-2026-10-04/probe_r6_overlap.py). This is a read-only PostgreSQL scalar conversion plus the actual converter at controlled historical instants, **not** a clock-frozen live insert, an undocumented fold policy, or a confirmed deployed incident. It is kept separate from the nine confirmed findings because the exact future-write requirement for the alternate legacy configuration needs an explicit contract decision.

**Production provenance: NOT_RUN.** Repository/local evidence cannot prove the deployed database's historical writing zone or distinguish mixed-zone naive rows. Before R6 deployment, perform the existing read-only provenance procedure and preserve its evidence. A known historical zone alone cannot recover repeated-hour rows uniquely. Decide how future audit writes preserve UTC instant identity without blindly rewriting history or conflating historical interpretation with the zone for all future writes.

## Fresh verification and commands

Commands ran from the dedicated worktree (API commands from apps/api). Dependencies were installed from the lockfiles with `uv sync --frozen --dev` and `npm ci --ignore-scripts`. Private environment/credentials stayed outside published evidence.

| Fresh check | Actual command / context | Result and evidence |
| --- | --- | --- |
| Ruff | `uv run --frozen ruff check .`; `ruff format --check .` | PASS; 146 files already formatted |
| API | `uv run --frozen pytest -q` | **772 passed, 0 skipped**, 874 warnings; `api-tests.log` |
| PG/Redis UTC | `uv run --frozen pytest tests_integration -q -rs` | **29 passed, 0 skipped**; `integration.log` |
| PG default Sydney, fresh Redis state | same integration command after `ALTER DATABASE sg_review SET timezone TO 'Australia/Sydney'` and reviewer-only Redis reset | **29 passed, 0 skipped**; `integration-sydney-isolated.log` |
| Explicit Sydney audit configuration | `DB_NAIVE_TIMEZONE=Australia/Sydney TZ=Australia/Sydney uv run --frozen pytest tests_integration/test_audit_instants.py -q` | **3 passed, 0 skipped**; `audit-sydney-configured.log` |
| Prior seven DB regressions | `apps/api/.venv/bin/python <evidence>/adapted_probe_findings.py <result-json>` with UTC and Sydney process TZ | **7/7 each**; both `f-regressions-*.json` |
| Populated 0015→0016 upgrade | `apps/api/.venv/bin/python <evidence>/adapted_verify_populated_upgrade.py <result-json>` against separate sg_legacy | **9/9**; row hashes/upgrade/rejoin retained; `populated-upgrade.json` |
| Mobile lint | `npm run lint -w @protin/mobile` | PASS, zero warnings |
| Typechecks | `npm run typecheck -w @protin/mobile`; same for `@protin/shared-types` | PASS both |
| Mobile | `npm run test:ci -w @protin/mobile -- --runInBand --watchman=false` | **929 passed, 64 suites, 0 skipped**; `mobile-tests.log` |
| iOS bundle | `npx --no-install expo export --platform ios --output-dir <private reviewer export>` from apps/mobile | PASS; Expo/Hermes bundle only, not a signed native build |
| QA with Docker, host zone | `env -u TZ QA_TEST_DOCKER=1 python3 -m unittest scripts/qa/test_qa.py -v` | **20 passed, 0 skipped**; `qa-launcher-host-zone.log` |
| QA Docker-free | same unittest command without Docker opt-in | **13 passed, 7 skipped**, 20 total; `qa-launcher-docker-free.log` |
| QA timezone override | Docker opt-in, `TZ=UTC`, same unittest command | **19 passed, 1 failed, 0 skipped**; Q08 |
| Independent R1 | `apps/api/.venv/bin/python <evidence>/probe_r1.py` | **71 PASS, 10 FAIL, 0 harness errors**, 81 assertions; Q01–Q03 |
| Independent mobile | four saved suites, Jest `--runInBand --watchman=false --runTestsByPath ... --json` | **5 passed, 11 failed, 0 skipped, 0 runtime-error suites**, 16 tests; Q04–Q07 |
| Real launcher adoption | `python3 <evidence>/probe_qa_real.py` | PASS: prior launcher actual API/Metro starts adopted without PID changes |
| Real launcher lifecycle | `python3 <evidence>/probe_qa_lifecycle.py` | **14 PASS, 0 FAIL**; actual restart, down/up, reset and final down |
| Extra owner/status controls | `PYTHONPATH=<review root> python3 <evidence>/probe_qa_edge_records.py` | **8 PASS**: stale/deleted owner path, interrupted JSON record preservation, and API/Metro start-source comparison. Docker inventory is mocked empty for the file-only owner cases; no signals are sent. |
| Native | targeted `axe` simulator input and `xcrun simctl` screenshots, real review API/Metro | Current simulator evidence for R1/R5/R6/R7; details below |

[checks.json](overnight-evidence-2026-10-04/checks.json), [more-checks.json](overnight-evidence-2026-10-04/more-checks.json), the scripts and logs retain actual argument arrays, exit codes and commands. The independent mobile generator recreates temporary execution copies from the saved probes; remove those copies after use.

The interrupted-owner probe aborts with `JSONDecodeError` before any mutation; it establishes fail-closed preservation, not graceful automatic recovery. Source-status controls distinguish unchanged code across documentation commits from older code requiring restart. The launcher explicitly runs API without reload and Metro with `CI=1`; the recorded start SHA is not a promise of hot reload.

Fresh GitHub API inspection confirms both supplied CI runs succeeded on their exact SHAs with eight jobs: [application run 37131294040](https://github.com/EdwardH-jedi/Sportsgang/actions/runs/37131294040) and [delivery run 37131918067](https://github.com/EdwardH-jedi/Sportsgang/actions/runs/37131918067). These are remote CI evidence, separate from the local fresh checks above. This report's publication does not imply its own CI has completed.

### Native proof and limits

Only the newly created **SportsGang Codex R1-R7 Review** iPhone 16e simulator was operated. Original home-test simulators were not switched or relaunched. Device provenance is in [native-device.json](overnight-evidence-2026-10-04/native-device.json).

- R5 tap evidence: screenshots 13→14 and 15→16 show both neighboring-minute paths ending at 30. Screenshots 18→19 retain 11:30 on close/reopen. The actual sent proposal and PostgreSQL row both store `2026-10-05T00:30Z`–`01:30Z`, matching **11:30–12:30 Sydney**. See [wire/storage values](overnight-evidence-2026-10-04/native/proposal-wire-and-storage.json) and screenshot 22.
- R1 native block: screenshots 24→26 remove QA Bob's chat; bilateral server GET/POST checks give 403 and match totals zero, while the existing booking remains 200. Unblock screenshot 36 restores the original chat/history. These are ordinary-path controls, not the deterministic race reproductions.
- R6 screenshot 34 shows **Blocked Oct 4, 2026**, correctly reflecting the review's UTC/Sydney date boundary.
- R7 screenshots 27→28 retain two confirmed rows after actual `stop-api`. Screenshot/AX 29 retain the notice and rows with a disabled/busy `Retrying…` action during a transport held beyond the request timeout. Screenshot 30 returns to Retry with the notice still present. After verified holder shutdown and actual `up --no-open --no-seed`, screenshot 31 clears the notice and refreshes rows.
- Simulator HID input includes real scroll/tap events; it is not a physical iPhone or a VoiceOver session. Android, physical-device feel, signed build, paid push delivery, production services, and full repeated rapid native gesture permutations are **NOT_RUN**. Maximum native text size was tested and failed as Q09.

### Attempt hygiene

The first Sydney full integration rerun reused registration-rate-limit keys from the UTC run: **27 pass/2 fail** (429 plus cascading event-loop cleanup). It is retained, then rerun with only the disposable review Redis cleared: 29 pass. This is not evidence of a timestamp defect.

Early independent probe attempts contained reviewer fixture/harness errors (wrong account-delete URL, duplicate generated push token, mutable result alias, old Jest flag and a held `act` callback). They were corrected without touching product code. Authoritative files are **r1-final-verified.log + r1-results.json** and **mobile-probes-verified.log + mobile-probe-results-verified.json**. Earlier attempt logs are retained for transparency and must not be counted as additional defects or combined into test totals.

Typechecking regenerated the tracked `packages/shared-types/tsconfig.tsbuildinfo` cache in the dedicated reviewer worktree. The cache was restored to the exact delivery-base blob; its before/restored hashes are recorded in `generated-cache-restoration.json`. The final preservation recheck passes all 26 assertions. The earlier finalization log retains the detected cache difference, rather than hiding that intermediate failure.

## Preservation and morning handoff

The original five worktrees, 107 original untracked files, human QA config/state, and human containers/processes are checked against the before snapshot. See [final preservation receipt](overnight-evidence-2026-10-04/final-preservation.json). Reviewer services and the new simulator are removed after use; no human stack was reset/adopted/reseeded. Evidence credentials, private env, tokens and exports are excluded from this delivery. A SHA-256 manifest covers the review documents and saved evidence.

The application remains **NEEDS_FIXES**. Begin with R1 authority repairs, then bind mobile callbacks to epochs, then close the conditional launcher/native-layout gaps. Keep the R6 production provenance/representation decision explicit. The concrete ownership and acceptance plan is in [the morning handoff](CODEX_OVERNIGHT_HANDOFF_2026-10-04.md).
