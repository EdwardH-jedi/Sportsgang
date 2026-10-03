# Morning repair handoff — 4 October 2026

**Decision: NEEDS_FIXES.** Review application `ecd1e86047cdc4411905d43210bc07112bbcbf07`; delivery base `cd567c80af2f6d23fc9cbe4bd178507c37d85ae3`. Nine confirmed findings: **3 P1 + 6 P2**, plus one conditional R6 information-loss/deployment limitation. No product implementation was changed by the reviewer.

Read [the acceptance report](CODEX_OVERNIGHT_ACCEPTANCE_2026-10-04.md) and [evidence index](overnight-evidence-2026-10-04/README.md). The review branch is `review/run-golf-v2-r1-r7-2026-10-04`. Its publication SHA is the commit containing these files, reported separately from the app SHA in the final publication receipt. Preserve the existing home-test stack and earlier reports; do not run this branch's destructive QA tests on the human project.

## Repair waves and ownership

These are proposed implementation tasks, not changes already made. Keep each owner on the named files, with one integration owner reviewing shared contracts. No new invitation inbox, generic architecture layer, or distributed realtime service is required by this review.

| Wave / owner | Narrow scope | Required acceptance before integration |
| --- | --- | --- |
| 1 — API contact authority | Q01/Q02: safety pair lock/read and chat admission/delivery/block closure. Own `app/services/safety.py`, `app/services/chat.py`, `app/routers/chat.py` and corresponding tests. Coordinate only the block-close callsite with the notification owner. | Barrier-controlled admission→block→registration closes/refuses; permitted delivery→block→wire emits no frame; active actor deactivated while waiting on pair locks is refused with zero message/action/proposal rows. Retain both-direction policy, stored history and allowed existing bookings. |
| 1 — Notification ordering | Q03: existing proposal dispatch worker and its authority boundary. Own `app/services/notifications.py` and worker tests; agree lock/ordering protocol with API contact owner before coding. | Separate process waits after proposal check/token lookup; API commits block; provider receives no proposal notice. Cancellation/decline/completion status notices stay permitted. Define dispatch linearization, rather than relying on an extra uncoordinated check. |
| 2 — Booking Detail | Q04 only: account/route epoch, transition ownership, dialog preflight and unmount. Own BookingDetailScreen and its tests. | A→B→A and account A→B→A never revive old success/error/dialog; callback after unmount sends nothing; same-epoch repeated mutation remains guarded. Keep payload-ID validation, correct mutation URL, Back and Retry. |
| 2 — Explore/Partner Detail | Q05/Q06: store mutation epoch/token plus screen confirmation expiry. Own explore store, PartnerDetail and their tests. Keep nullable stale result semantics for all consumers. | Old owner A operations return stale after A→B→A; old finally cannot release a newer target guard; old confirmation cannot submit for replacement owner or after screen expiry. Both operation orders, duplicate taps, failed block/retry, Cancel and held first/next pages remain safe. |
| 2 — Matches | Q07: one owner/generation-aware request path for initial, pull and focus; honest error/recovery state. Own MatchesScreen and its tests. | Slow earlier focus result cannot overwrite a newer empty list; successful focus recovery clears its old error; retained owner replacement clears prior matches. First focus fetches once and normal chat/back refresh works. Document normal logout unmount rather than overstating a retained-screen test. |
| 3 — QA launcher | Q08 only: timezone-invariant legacy start comparison. Own scripts/qa and its tests. | UTC process TZ on Sydney OS adopts the same real old-launcher PIDs; wrong PID/command/cwd/group/start and project conflicts still refuse. Keep real lifecycle checks distinct from Docker stand-in tests. |
| 3 — Composer layout | Q09 only: adaptive picker header at large text. Own BookingComposerScreen layout and focused tests/native evidence; avoid conflicting with the Booking Detail owner. | Entire Done label and target fit at accessibility-extra-extra-extra-large on 390-point viewport; both minute-neighbor taps, swipe settle, close/reopen and stored proposal remain consistent. Preserve readable text scaling. |
| Contract/deployment owner, before R6 rollout | C01: historical zone provenance and future audit-instant representation. Keep source changes separate from speculative data migration. | Read-only deployed provenance evidence; explicit decision for repeated-hour legacy rows and exact future UTC instants. No blind history rewrite. Reproduce both `15:30Z`/`16:30Z` overlap inputs and label any unavoidable legacy ambiguity. |

Finish wave 1 before claiming bilateral restriction acceptance. Wave 2 owners can work on separate files once the authority contract is fixed; integrate sequentially at shared tests/contracts. Wave 3 is narrow and can follow without widening product scope. Freeze each candidate SHA for independent retest.

## Reuse the evidence correctly

- The reference repaired suites freshly pass: API **772/0 skipped**, integration **29/0 skipped** in UTC and isolated Sydney-default runs, mobile **929/64 suites/0 skipped**, normal-zone Docker launcher **20/0 skipped**, Docker-free **13 pass/7 skips**. These totals do not cover the new failing cases.
- New R1 probe: **81 assertions, 71 pass/10 fail, zero harness errors**. Failures map to Q01–Q03; six assertions describe three stale-actor status/row failures. Notification provider recording is simulated, but its PostgreSQL/API and separate-worker ordering are real.
- New mobile probes: **16 tests, 5 pass/11 fail, zero skips/runtime-error suites**. Final files are `codex-overnight-*.test.tsx` and `mobile-probe-results-verified.json`. Convert these failing safety expectations into permanent regression tests with the repairs; do not convert defect-observing behavior into a green acceptance claim.
- The generator `make_mobile_probes.py` creates temporary test copies in apps/mobile. Run with Jest's `--runTestsByPath`, then remove those copies. Earlier attempts used an unsupported flag and had reviewer harness errors; they are not the decisive results.
- `probe_r1.py` and database probes require disposable credentials through private environment. They reset review fixtures. Never point them at staging, production or the human home-test database.
- Real lifecycle/adoption probes require a dedicated `SPORTSGANG_QA_HOME` and project name. The saved scripts assert the reviewer project; adapt only the isolated fixture namespace before rerunning on a new machine.

## Next independent gate

1. Publish a repair candidate with exact application SHA, per-owner scope and no hidden historical-data mutation.
2. Rerun Q01–Q08 barriers/permutations against actual source and real isolated PostgreSQL. Preserve prohibited-row and real WebSocket assertions, and the separate notification process.
3. Rerun Q09 natively at default and maximum accessibility text sizes, then verify minute selection→form→HTTP→PostgreSQL consistency.
4. Retain the full repaired suites and populated-upgrade/rejoin controls. Clear only disposable rate-limit state when repeating the integration matrix; report warnings, skips and failures honestly.
5. Do not claim physical-device/VoiceOver/Android/provider or production acceptance from simulator, Jest, fake provider or local PostgreSQL evidence. R6 deployment stays conditional until its documented provenance gate is completed.

The human home-test source and stack were preserved. This review used and cleaned up its own API, Metro, PostgreSQL, Redis and simulator. Earlier reports/evidence remain unchanged; the final preservation receipt and evidence hash manifest are linked from the evidence index.
