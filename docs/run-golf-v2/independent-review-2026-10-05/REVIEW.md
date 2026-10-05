# Independent review — SportsGang overnight candidate, 2026-10-05

**Code acceptance: NEEDS_FIXES — 6 P2 findings and 1 P3 finding.** The full existing suites pass, but independent boundary probes and a fresh native replay expose remaining defects. No product code was changed. This report and its evidence are local review artifacts; no commit, push, merge, deployment, paid build or submission was performed.

| Decision | Result |
|---|---|
| Final code acceptance | **NEEDS_FIXES**; resolve P2 findings F01–F06 and repeat the affected gates |
| Base MA-A / MA-C | Accepted within the isolated PostgreSQL and recording-provider scope below |
| Base MA-B | **Not accepted**: repeated cancellation can release authority with a send still running |
| Manual-QA readiness | Suitable for targeted repair/retest; **not accepted as a completed manual-QA candidate**. Maximum-text restricted chat is visibly broken |
| Production release | **NO_GO / NOT_VERIFIED**; all listed operational/device gates remain open regardless of code fixes |

## 1. Exact reviewed identities and preservation

| Identity | SHA |
|---|---|
| Branch read from origin | `fix/run-golf-v2-overnight-2026-10-05` |
| Reviewed delivery | `59013601ae97b70a035f3abaae00c74edfa52e99` |
| Reviewed final source | `a9b92c2430456e1b0055436824c6ad6dfcd7c6e4` |
| Base delivery | `8d891ddb862de5345e85895a20fa65649ba1f46e` |
| Base source | `a515b0073cb0f32dad97f88430a203e3427444fe` |
| Original main checkout | `e8ad7e3fc0a977396c511fa228980a2af5b22d3a` |

The detached review checkout is `/private/tmp/sportsgang-independent-review-20261005`. The delivery adds nine documentation/evidence files after the final source commit. API code, packages, QA launcher and R6 gate are byte-identical between base delivery and final source. Thus the fresh API/MA results assess the same implementation as the base; this is not a claim that a second complete suite was run in a base checkout. The implementer's mobile baseline-failure run is implementation evidence only.

[Reviewed source inventory](evidence/reviewed-source.json), [before inventory](evidence/before.json), [after inventory](evidence/after.json), and [preservation result](evidence/preservation-result.json) bind the result to the checkout and original evidence. All 12 pre-existing worktrees retained their heads, statuses and tracked/non-ignored untracked file hashes. Stashes and all 13 pre-existing container identities/port mappings were unchanged. The review checkout changed only by this new review directory. Temporary mobile test execution copies were removed.

Only review-owned PostgreSQL/Redis, API `8181`, Metro `8281`, preview `5291`, and simulator `C17D665C-69FC-474D-A7B0-6EB8201128F2` were used. Review containers and service processes were removed/stopped; their ports are closed. The new simulator is retained, shut down. Existing human QA, staging and production were untouched. Credentials were synthetic, stored outside the evidence, then removed. Original evidence was never overwritten.

## 2. Reproduced findings

### F01 — P2: a second cancellation releases the pair lock before a send finishes

**Source:** `apps/api/app/services/chat.py:124–131`, `194–195` (`ConnectionManager.broadcast`, `deliver_message`).

The first cancellation cancels the child sends and enters `await asyncio.wait(sends)`. A second cancellation interrupts that unprotected drain. `deliver_message` then rolls back and releases the contact lock while a child is still performing asynchronous cancellation cleanup. A real PostgreSQL-backed HTTP block can commit at that point.

The independent socket double has ordinary asynchronous `finally` cleanup; it does not permanently ignore cancellation. The probe sends two cancellations, observes rollback with one send still running, and obtains HTTP **201** for the block while that send remains running. Evidence: [double-cancel.json](evidence/authority-extra/double-cancel.json), [probe](evidence/probes/test_cancellation_review.py), [final run](evidence/logs/cancellation-crash-review-final.log): **1 failed, 1 passed**.

This proves an authority/cleanup escape on the injected transport. It does **not** demonstrate a real ASGI frame delivered after the block. That distinction limits severity to P2 here; the stated invariant still fails.

**Owner:** API realtime delivery only. Make the drain survive repeated cancellation and complete before rollback. A timeout followed by unlocking with live sends would preserve the defect. Add a deterministic second-cancellation PostgreSQL gate.

### F02 — P2: refocus misses a restriction received while the socket was disconnected

**Source:** `apps/mobile/src/screens/chat/ChatScreen.tsx:439–448` (`useFocusEffect`).

After a transient close, a peer can block while no socket is attached to receive close `4003`. Refocus only refreshes `/bookings`, which intentionally remains readable for existing sessions after a block. It never rechecks `/matches/{id}/messages`, so old history, input and the proposal CTA remain visible until a later contact request or manual Reconnect discovers the restriction.

The independent test loads private history, closes the socket with `1006`, makes the message endpoint reject with the exact restriction detail while bookings succeeds, then refocuses. The history remains visible. Evidence: [probe:212](evidence/probes/ChatScreen.review.test.tsx#L212), [final mobile run](evidence/logs/mobile-independent-final.log). Server-side contact writes remain protected; this is a client authority-refresh defect, not a successful blocked send.

**Owner:** chat focus/refresh path. Recheck contact authority/history on return using the existing binding and request-generation guards. Preserve My Plans access and ensure late requests cannot repopulate a restricted binding.

### F03 — P2: an older booking action response overwrites a newer refresh

**Source:** `apps/mobile/src/screens/chat/ChatScreen.tsx:459–465`; compare `mergeProposals:115–120`.

`updatedAt` protects a refresh from undoing an action, but the reverse merge unconditionally replaces the row. Hold a confirmation response, let a later refresh observe the booking completed with a newer `updatedAt`, then release the old confirmation response: the card regresses to **Session confirmed**. The API permits confirmed → completed, so the ordering is feasible. The probe observes the newer row before releasing the old response; it does not assume a nonexistent “Session completed” label.

Evidence: [probe:248](evidence/probes/ChatScreen.review.test.tsx#L248), [final mobile run](evidence/logs/mobile-independent-final.log).

**Owner:** chat proposal-state merge. Apply version ordering in both directions; retain the fetched-list membership rule so a delayed action cannot resurrect a removed row. Add this inverse-order case beside the existing refresh-after-action test.

### F04 — P2: block completion and its acknowledgement survive blur

**Source:** `apps/mobile/src/screens/chat/ChatScreen.tsx:282–294`, especially `287–288`.

The initial action sheet and confirmation expire on blur, but `performBlock` only checks binding currentness after the request. Two independent cases fail: a valid block finishing after blur shows an alert over another screen; an already-open success alert's saved **OK** callback calls `navigation.goBack()` after blur. A retained screen can keep the same account/match epoch throughout.

Evidence: [completion probe:240](evidence/probes/ChatScreen.review.test.tsx#L240), [acknowledgement probe:231](evidence/probes/ChatScreen.review.test.tsx#L231), [final mobile run](evidence/logs/mobile-independent-final.log).

**Owner:** chat safety-dialog lifetime. Keep an already-authorized block request valid, but expire its UI continuation and acknowledgement with focus/dialog ownership. Cover success and error continuations. No wrong-target block was reproduced.

### F05 — P2: maximum-text restricted chat overlaps the header and loses its explanation

**Source:** `apps/mobile/src/screens/chat/ChatScreen.tsx:679–685`, `991–995` (`styles.centred`).

Fresh Expo Go replay on an owned iPhone 16e, iOS 26.3, **390 × 844 pt**, maximum accessibility text size: an actual peer block closes the local socket and correctly hides the history/input. The restricted content is an unscrollable, vertically centered `View`; fully scaled text is taller than its available space. It paints through the header and below the screen.

Native geometry places the title at **y=2.33, height=371.67**, overlapping Back/More options at **y=93.67, height=44**. The explanation begins at **y=382** and ends at **1010.67**, beyond the 844 pt screen. A physical More options tap opens no sheet at maximum size. With default size and a fresh app relaunch, the same real restriction shows a readable explanation and the physical tap opens Report/Block.

Evidence: [maximum screenshot](evidence/native/09-chat-max-restricted.png), [maximum text geometry](evidence/native/09-chat-max-restricted-text-geometry.json), [physical-tap attempt](evidence/native/10-restricted-max-safety-menu.png), [default control](evidence/native/13-restricted-default-relaunched.png), [default menu control](evidence/native/14-restricted-default-relaunched-menu.png). Captures 11/12 precede the required relaunch and are not valid default-size controls.

**Owner:** chat restricted-state layout, same mobile owner as F02–F04. Keep the header clear; make the full-size explanatory content scroll within the remaining viewport. Validate actual visible/tappable controls, not only AX presence or horizontal bounds. This prevents a full accessibility acceptance despite the successful normal-chat composer repair.

### F06 — P2: preflight prints reflected short non-allow-listed environment values

**Source:** `scripts/release/preflight.py:647–655` (`_sanitize`).

The sanitizer excludes values shorter than 16 characters. In a committed temporary fixture repository, an untracked filename containing the synthetic 10-character env canary `sgShort9K2` enters `source.dirty_paths`. Both text and JSON preflight output print that non-allow-listed value, with exit **0**. This violates the handoff's literal requirement that a non-allow-listed env value never be printed.

Evidence: [canary results](evidence/preflight-short-canary-final.json), [self-contained fixture probe](evidence/probes/preflight_canary_review.py), [text output](evidence/logs/preflight-short-final-text.log), [JSON output](evidence/logs/preflight-short-final-json.log). Only a synthetic canary was exposed. No actual credentials were copied to the evidence.

**Owner:** release preflight and its tests. Cover short/nonempty values and reflected paths/branch metadata in both formats, including JSON escaping. Passing the existing 17 tests establishes their current coverage; it does not satisfy this broader privacy requirement. If the privacy contract is intentionally narrower, its owner must explicitly resolve that mismatch.

### F07 — P3: replacing a same-account token leaves a healthy replacement socket labelled paused

**Source:** `apps/mobile/src/screens/chat/ChatScreen.tsx:485–522`; paused reset is only in manual `reconnect:525–529`.

A transient close sets paused. Replacing the token while keeping the same user/match opens a new socket, but no `onopen` handler clears paused or catches up history. The test observes the replacement-token URL and fires its open callback; **Live updates paused.** remains.

Evidence: [probe:222](evidence/probes/ChatScreen.review.test.tsx#L222), [final mobile run](evidence/logs/mobile-independent-final.log). This is a mocked retained-account token-change path, not proof that ordinary logout/login follows it: an intervening null user creates a new epoch. The control for a saved old socket close after token replacement passes.

**Owner:** chat socket lifecycle. Reconcile successful attachment/catch-up under the current socket generation, without clearing a real restriction or accepting old socket events.

## 3. Fresh checks and the base MA decisions

All results below were produced by this review, not copied from the implementation report.

| Check | Independent result | Evidence |
|---|---|---|
| API unit suite | **773 passed** | [log](evidence/logs/api-unit.log) |
| Ruff / format | Clean; 151 files formatted | [check](evidence/logs/ruff-check.log), [format](evidence/logs/ruff-format.log) |
| Real PostgreSQL integration, fresh UTC-default DB | **64 passed, 0 skipped** | [log](evidence/logs/integration-utc.log) |
| Real PostgreSQL integration, fresh Sydney-default DB | **64 passed, 0 skipped** | [log](evidence/logs/integration-sydney.log) |
| Adapted original R1 regression probe | **94 PASS, 0 FAIL, 0 HARNESS_ERROR** | [log](evidence/logs/r1-adapted.log), [rows](evidence/r1/r1-adapted-results.json) |
| Mobile, Sydney and UTC process TZ | Each **65 suites / 989 passed** | [Sydney](evidence/logs/mobile-sydney.log), [UTC](evidence/logs/mobile-utc.log) |
| Mobile lint / typecheck | Clean | [lint](evidence/logs/mobile-lint.log), [types](evidence/logs/mobile-typecheck.log) |
| Original reviewer follow-up/block-first probes | **11 passed / 2 failed**; both obsolete placements explained below | [final log](evidence/logs/original-reviewer-probes-final.log) |
| Additional cancellation/crash probes | **1 failed / 1 passed**, F01 and intentional crash state | [final log](evidence/logs/cancellation-crash-review-final.log) |
| Additional mobile boundary probes | **5 failed / 2 passed**, F02/F03/F04/F07 plus controls | [final log](evidence/logs/mobile-independent-final.log) |
| QA launcher, ordinary run | **14 passed / 7 Docker opt-in skips** | [log](evidence/logs/launcher-unit.log) |
| QA launcher with disposable Docker lifecycle | **21 passed / 0 skipped**; real PG/Redis, stub API/Metro readiness services | [log](evidence/logs/launcher-docker.log) |
| Web typecheck / Node 20 build / route policy | Clean / clean / **28 of 28** | [types](evidence/logs/web-typecheck.log), [build](evidence/logs/web-build.log), [routes](evidence/logs/web-routes.log) |
| Release preflight unit tests | **17 OK** | [log](evidence/logs/preflight-unit.log) |
| Release preflight | Exit 0, **CONSISTENT_WITH_MISSING_INPUTS** | [log](evidence/logs/preflight.log) |
| Offline iOS JS export | Exit 0, 8 files; fingerprint `112f60827f35f6627b5175107946c8b4498bdba33ac1338f42ba946ab4f4499f` | [export log](evidence/logs/ios-export.log), [manifest/preflight](evidence/ios-export-preflight.json) |

**MA-A:** `events._membership_time` reads PostgreSQL `clock_timestamp()` after the event row lock. Fresh `test_event_clock.py` covers host skew ±120 seconds and real lock-wait transitions. Join/leave/rejoin ordering and the leave/last-place concurrency matrix passed in both database defaults. Accepted in this scope; no SQLite result substitutes for that evidence.

**MA-C:** the committed conditional `_claim` update owns an event before pair-lock/token/provider work. The two-worker replacement pauses **both processes before the claim**, releases them against the same due event, then checks one provider call and sent/skipped outcomes for proposal and status notices. The other replacement fails only the **post-provider outcome commit**, proving one accepted provider invocation remains `delivery_unconfirmed` and is not retried. These are behaviour-based authority probes, not merely relaxed assertions.

Fresh integration also covers worker/internal-endpoint competition in both orders, stale due lists and identity maps, cancellation while waiting for the pair lock, pre-provider exception recovery, provider timeout/cancellation, no-token recovery, block-first suppression, dispatch-first lock waits, and status notices after a block. The independent process-termination addition kills an owner after the claim commits but before provider invocation: **zero provider calls, `delivery_unconfirmed`, no automatic resend, pair lock free** ([result](evidence/authority-extra/crash-after-claim.json)). This is the documented at-most-once loss window. Real Expo/APNs delivery and exactly-once semantics are not verified.

The original after-lock two-worker test expects the losing worker to reach token lookup; it now correctly skips the already-claimed event and prints `RESULT processed=0`, so its barrier expectation is obsolete. The original fail-every-commit test interrupts the initial due-list transaction before provider work; it does not inject the advertised provider-success/failed-outcome-commit boundary. Their failures were independently reproduced and retained; they are not counted as new candidate defects. Only their port guard changed, plus execution required `--asyncio-mode=auto`.

**MA-B:** fresh cooperative room-wide send tests (including 1/3/20 slow sockets), concurrent bounded close attempts and ordinary cancellation pass. The deadline covers concurrent sends, rather than one timeout per socket. It is **not a universal hard deadline**: cancelling then awaiting a cancellation-resistant send can hold the authority lock without a bound. A separate local probe shortens the configured deadline to 20 ms and observes the broadcast still waiting another 100 ms until the injected send cooperates ([result](evidence/authority-extra/deadline-assumption.json), [probe](evidence/probes/probe_deadline_assumption.py)). This known limitation is separate from F01's newly reproduced early authority release under repeated cancellation.

## 4. Q01–Q09, chat contract and native limits

| Scope | Disposition |
|---|---|
| Q01 realtime admission/delivery versus block | Fresh real PostgreSQL + real local uvicorn/websockets gates pass; F01 adds a remaining cancellation boundary |
| Q02 actor deactivation during pair-lock wait | Scalar post-wait authority checks pass for send/like/proposal, with no corresponding writes |
| Q03 proposal dispatch versus block | Both ordering directions, separate workers, status-notice exception and lock timeout pass |
| Q04 BookingDetail account/booking epochs | Current complete mobile suite passes the binding-epoch cases; no product changes in that screen |
| Q05 owner-bound stale mobile data | Existing regression suite passes; this is test-level evidence, not a new physical-device replay of every flow |
| Q06 PartnerDetail dialog expiry | Existing cases pass; analogous chat post-block continuation remains F04 |
| Q07 Matches request ownership/order | Existing generation/owner tests pass |
| Q08 launcher ownership/timezone | Fresh 21-case disposable lifecycle suite passes, including process identity, refusal boundaries and TZ invariance |
| Q09 picker header/wheel | Fresh max-text native Start time/Done are visible; physical neighbour taps select 15 then 30, with 30 visibly selected in [capture 08](evidence/native/08-picker-neighbour-to30.png). Full mobile picker tests pass |

Chat's account+match epoch and per-operation guards improve ownership without changing other screen owners. Existing 21 ownership tests pass; the independent controls confirm a refocus cannot restore already-hidden history and a saved old socket close cannot restrict the replacement attachment. Exact-string `isRestriction` is acceptable **for the current API-client contract**, which exposes `detail` through `Error.message` and no status field; it remains brittle if that contract or wording changes. It is not the cause of F02, where the authoritative endpoint is never queried.

Fresh native replay used an isolated database, API and Metro from the reviewed source. Maximum text, the long partner name, Korean software keyboard, English keyboard switching, five-line mixed text, Send, composer and time picker were exercised. The planning banner disappears while typing; the full-width input and Send remain above the visible software keyboard. An actual sent message read back from the review database preserves all five lines ([DB result](evidence/native/sent-message-db.json)). Native captures are under [evidence/native](evidence/native/).

The 1.4× chrome cap is a reasonable compact-header tradeoff within the demonstrated 390 pt normal-chat layout: controls stay readable and messages/input scale fully. It is not full Dynamic Type compliance or VoiceOver acceptance. Partner-name truncation retains the full accessible label. F05 shows that restricted-state content was outside that successful layout treatment. Fresh 375 pt replay, physical iPhone, VoiceOver, Android, hardware keyboard, signed binary and real push are **NOT_RUN**. Supplied 375 pt images remain implementer evidence only.

## 5. Website and release procedure

Fresh headless Chrome **154.0.8037.97** checked widths 320/390/768/1440 with no horizontal overflow, reduced-motion behaviour, and JavaScript-disabled home/legal routes. Local preview route checks confirm canonical 301 redirects preserving query strings, exact slash-form legal content, and 404 for missing assets/routes and incomplete builds. The Netlify `_redirects` file contains comments only, so there are no active redirect rules or SPA fallback; the route checker validates that deliberate policy and the documented Pretty URLs assumption. Actual hosting/domain behaviour is **NOT_RUN**.

Chrome A4 printing produces 10 pages with all ten FAQ questions and answers; closed and mixed accordion states are restored after printing. The first visual attempt was not treated as success until a complete browser run and PDF render inspection. Evidence: [browser results](evidence/web/browser-results.json), [complete print text checks](evidence/web/print-complete-check.json), [QA PDF](evidence/web/home-a4.pdf), [rendered FAQ page](evidence/web/print-09.png). Text checks normalize PDF apostrophe substitutions and whitespace lost around inline links; the rendered FAQ pages were also inspected. Safari is **NOT_RUN**; no claim is made about its print lifecycle or deployed redirects. No additional web defect was reproduced in the scoped checks.

**R6 amendment judgment:** useful, valid as a diagnostic proposal; **not sufficient to approve historical production provenance**. Fresh PostgreSQL 16.15 runs of all ten fixtures match the implementer's original/proposed scoring ([comparison](evidence/r6-comparison.json), [raw transcripts and results](evidence/probes/r6/)). The gate remains unchanged: blob `e28a4e6a3709655edf6710324c3d7430cd48490c`; original SQL block SHA-256 `06e0a42f10cba14a0b3ec2841d2d91dbcac9198befa97b0f561d247d369f24cd`.

The original first-match interpretation can treat no samples as UTC, generalize one bypass-writer sample to API history, confuse a +10 offset with a zone, miss a switch-window row and leave 15 of 19 repeated-hour audit rows unflagged. The proposed named-zone, UTC-bucket, coverage/switch and nine-column ambiguity queries avoid wrong readings on these fixtures by keeping weak periods inconclusive. However, two samples per month is a policy threshold, not proof of representative writers; booking correlation does not establish the other eight columns' writers, and historical overrides, bypass traffic and production tzdata require operator evidence. The amended interpretation should explicitly condition any “history is UTC/Z” conclusion on that external provenance. Do not migrate, rewrite timestamps or choose `DB_NAIVE_TIMEZONE` from these fixture scores.

Preflight's clean result means local configuration is internally consistent with missing inputs. The export does not contain the documented legal URLs because the public URL variables were unset; it is a source/export fingerprint, **not** a release-configured signed build. EAS remote build number, signing/APNs inputs and legal URL build injection remain unverified. F06 prevents acceptance of the requested output-privacy contract.

## 6. Limits, evidence interpretation and handoff

Production R6, the amended procedure's operational approval, deployed single-process WebSocket topology, physical iPhone/VoiceOver/Android, signed release build, real Expo/APNs, Safari, website domain and host remain **OPEN / NOT_RUN**. Local real sockets support the single-process concurrency tests; they do not prove deployed topology or multi-process broadcast support.

Earlier harness attempts included original reviewer probes without asyncio auto-mode, an initial R1 output-directory failure, early R6 path/shared-role setup attempts, an uncommitted canary fixture without source metadata, an initial stale-action test searching for a nonexistent completed label, and browser capture setup failures. Where retained, these preliminary logs are diagnostic only; use the explicitly linked final logs/results for verdicts. These setup failures are not candidate defects. Captures 11/12 likewise are not native default-size controls.

The bounded ownership/wave plan and decisive repair gates are in [REPAIR_HANDOFF.md](REPAIR_HANDOFF.md). The artifact digest is [MANIFEST.sha256](MANIFEST.sha256); it excludes itself. Repairs should retain the candidate identities and original evidence, then publish a new source SHA with fresh affected gates. No application changes are part of this delivery.
