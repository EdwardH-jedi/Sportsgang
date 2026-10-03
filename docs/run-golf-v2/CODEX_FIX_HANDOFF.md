# Claude repair handoff — independent review, 3 October 2026

Implement from the reviewed application source **b530e7f3e726b9e830e52259f0ae699725090f5f** on `chore/run-golf-v2-home-test-ready`, or explicitly record a newer source baseline. Read [CODEX_REVIEW_AFTER_FIXES.md](CODEX_REVIEW_AFTER_FIXES.md) and [independent-evidence/README.md](independent-evidence/README.md) first. The original F1–F8 mechanisms pass; seven additional confirmed defects require repair. Do not describe reviewer defect-proof tests as passing acceptance tests.

Keep Sydney running/golf and the existing mutual interest → match → chat → booking model. Do not add invitations, payments, group chat, GPS, inventory or branding work. Preserve legacy sports/history, auth/deletion and migration 0010's aware participant column. Preserve the current human `sportsgang-qa` stack/data and all other worktrees/untracked files. Application implementation belongs to the implementer; this review delivery contains documents and evidence only.

## Wave 1 — server safety and QA ownership, separate owners

These tasks touch independent areas and may be assigned to separate implementers if the human authorizes delegation. Freeze the new safety contract before its dependent mobile work. Neither owner should edit the other's files.

### Task 1A: R1, P1 — enforce bilateral blocked-contact boundaries

**Owner scope:** API `app/services/{safety,chat,matches,discovery,bookings}.py`, `app/routers/chat.py`, targeted API/PG tests and documented interaction contract. Keep mobile edits for Wave 2.

**Reproduce:** on an isolated migrated PostgreSQL database, create two disposable accounts, compatible sport profiles, mutual likes and a match. A blocks B. Call both users' GET/POST `/matches/<id>/messages`, GET `/matches`, and B's POST `/bookings` on the match. Current results are message POST 201, GET 200, active match visible, proposal 201. See `api-probe.json` and `api_probe.py`. Discovery exclusion already works.

**Expected:** the Block confirmation's contact restriction is enforced server-side in either direction. No direct endpoint, new interest or existing/new socket can bypass it. Define retained access to existing commitments/audit history explicitly; do not delete history as a side effect of blocking.

**Implementation:** introduce one reusable bilateral interaction check and apply it consistently. Handle already connected socket delivery and block/send/like races at authoritative boundaries. Avoid a copy-only workaround. Inactive/deleted-account handling must agree between HTTP and WebSocket.

**Acceptance:** real PG direct-access checks in both directions; existing match; concurrent send/like versus block; no disallowed persisted message or pushed event; already connected sockets receive no unauthorized delivery; unblock restores supported contact. Document exact status/error contracts and whether prior message history stays readable. Keep legacy deletion and valid booking transitions passing.

### Task 1B: R2, P1 — make QA ownership fail closed

**Owner scope:** `scripts/qa/qa.py`, `compose.qa.yml`, isolated launcher tests, root QA scripts only if required, runbook. Do not run reset or delete the human volume.

**Reproduce:** `qa_probe.py` creates only a sacrificial process in a temporary directory with `--port 8130` in its argv. Metadata falsely claims the API cwd/cmd/start time. Current `proc_alive` accepts it, and `stop_proc` terminates its process group. Every worktree separately stores credentials/state while controlling the same hardcoded Compose project.

**Expected:** wrong cwd/executable/argv/start identity or resource owner causes an explicit refusal to stop, never a signal. Two worktrees cannot silently take lifecycle control of one database/project with different local configs.

**Implementation:** select and document either a single canonical shared owner with a lock/config identity or separate instance namespaces. Validate actual process start identity, resolved cwd and executable/arguments plus process group. Bind Compose resource ownership to that instance. Plan adoption of the existing volume without recreating or erasing it. Make status distinguish recorded source SHA from verified running-source evidence.

**Acceptance:** two disposable instances/worktrees; PID reuse; substring/prefix port collisions; wrong cwd/start time; stale state; foreign process group; conflicting config; occupied ports; partial Compose start, API/Metro failure, restart/down/reset. Failures leave unrelated processes, containers and data intact. Existing human QA remains online and its volume unchanged throughout. Until this passes, destructive launcher lifecycle testing against the human stack is prohibited.

## Wave 2 — bound mobile mutations and native time selection

Use one mobile booking owner for Tasks 2A and 2C because they share booking acceptance scenarios. Partner moderation may have a separate owner after Task 1A's contract is frozen.

### Task 2A: R3, P2 — bind Booking Detail to route and account

**Files:** `screens/bookings/BookingDetailScreen.tsx`, its focused tests; shared request utility only if one already exists and fits.

**Reproduce:** copy the reviewer Booking Detail test to the normal temporary test directory as explained in evidence README. Hold A fetch, rerender route B, resolve B then A; Partner A becomes visible while Cancel sends `/bookings/B/cancel`.

**Expected / repair:** current route/account/generation owns rendered booking and all mutations. Invalidate on new route/owner, clear incompatible data, and guard success/error/finally and transitions after unmount. Repeated Retry cannot revive an older binding. Preserve native offline Back and successful recovery.

**Acceptance:** controlled A/B permutations, old rejection/finally, late transition response, repeated retry, 403/404/deleted booking, account replacement/logout and unmount. Assert both visible ID/name and mutation URL; never just test that some partner text exists.

### Task 2B: R4, P2 — make block a store-owned serialized mutation

**Files:** `screens/explore/PartnerDetailScreen.tsx`, `stores/explore.ts`, relevant safety helper/tests. Agree with Task 1A before changing status/error behavior.

**Reproduce:** mount detail, hold a force-loaded feed response, complete block, finish old response: blocked card returns. Separately hold block, tap Show interest: both `/blocks/...` and `/discovery/actions` run, Chat navigation and later goBack conflict.

**Expected / repair:** block invalidates current/page generations and suppresses that account-bound target from old responses. A synchronous shared action guard prevents overlapping block/like/pass and duplicate taps. Guard completion/navigation against changed owner/card/screen. Cancel sends nothing; a failed block keeps card and allows retry.

**Acceptance:** first-page and next-page responses after block; rapid block presses; both block/like/pass orderings; rejection and retry; sport switch, account change and unmount; ordinary native removal/name/unblock still works. Do not rely on filtering a single current array as authorization.

### Task 2C: R5, P2 — native wheel must commit the tapped row

**Files:** `components/WheelPicker.tsx`, booking composer time-picker integration and focused tests. Component is unchanged from main, but remains an acceptance defect in the reviewed booking flow.

**Reproduce:** on iPhone 17 Pro Expo Go, open start time, settle minute 45, physically tap visible 30, wait, Done. Fresh screenshots show 45 → **15**, with Done committing 05:15. From selected 15, tapping visible 30 settled on 45. Refer to the three wheel PNGs. Avoid offscreen AX rows; validate the visible coordinates and settled value.

**Expected / repair:** physical tap, visual center selection, committed form value, reopening and request bounds agree. Investigate competing `scrollTo` calls from the selected-value effect and press handler plus momentum callbacks. Use one selection/scroll authority and ignore obsolete programmatic momentum. Exact callback ordering needs native instrumentation; do not assume a Jest prop check proves it.

**Acceptance:** native 45→30 and 15→30 minute taps, hour taps, wheel gestures, repeated/rapid input, Done/reopen, auto-adjusted end time, original smaller-screen and enlarged-text settings, real request/storage comparison. Include an actual finger test on physical iPhone when available. Preserve F5 UTC conversion, legacy input semantics, DST gap/overlap policy and duration validation.

## Wave 3 — coherent timestamps and freshness semantics

### Task 3A: R6, P2 — establish one audit-instant contract

**Owner scope:** API timestamp models/serialization/session-write policy, shared contracts, mobile timestamp parsing/formatting and Chat comparator, targeted migrations only after provenance is established. This crosses API/mobile: freeze the contract first, then assign bounded file ownership. Do not copy or merge changes from `feat/run-first-ui` without explicit coordination.

**Reproduce:** actual DB/ORM/HTTP returns `2026-10-02T15:30:00` without offset. Actual message preview under Sydney parses 05:30Z and displays Oct 2, whereas aware 15:30Z displays 1:30 AM Oct 3. Block date is also one calendar day wrong. Same transaction `now()::timestamp` differs under UTC and Sydney DB sessions.

**Expected / repair:** dates represent an absolute instant consistently across all compared message/booking audit fields and visible consumers. Establish production historical write/session-zone provenance before deciding legacy interpretation. If one zone is proven, a centralized aware response adapter plus guaranteed write convention is a smaller first repair than an immediate historical column conversion. If provenance is mixed/unknown, define explicit legacy handling and aware future writes; do not blindly tag all history UTC. A forward migration requires a documented reversible data policy.

**Acceptance:** real PG UTC/Sydney sessions and API TZ variants; midnight and DST boundaries; legacy/null cases; aware response contract; correct preview/block date; mixed message/proposal timeline sorted by common instants with stable ties. Uniform current naive strings did not reproduce a relative-order failure; do not invent one in the repair report. Appointment starts/ends remain governed by F5 independently.

### Task 3B: R7, P2 — preserve stale notice through Retry

**Files:** `hooks/usePlans.ts`, My Plans tests/UI only as necessary. Avoid changing segmentation/paging contracts.

**Reproduce:** load a row, fail its source refresh, press Retry with response held. Line 386 sets `error:null`; warning disappears although retained rows are still stale. Reject the held request; warning reappears.

**Expected / repair:** retain the source failure/freshness state until successful replacement. Show retry progress and guard repeated retry without presenting old rows as recovered. Only clear recovered sources; empty successful responses count as success.

**Acceptance:** pending retry and repeat taps; one/both-source failure; partial recovery; zero-row successful load followed by failure; obsolete generations; failure then real recovery. Native injected one-source/both-source/first-load/recovery controls must stay passing.

## Final acceptance and delivery gate

1. Record current source SHA, branch, status and worktrees; preserve unrelated changes and reviewer evidence. Use isolated PostgreSQL/Redis with independent project/ports/database and generated private credentials.
2. Run locked Ruff/API/PG checks and mobile lint/typechecks/Jest plus iOS export. Current baselines are 752 API, 22 PG integration, 878 mobile/62 suites, zero skips. Added tests must prove corrected expectations; reviewer `PROOF` tests deliberately assert the broken behavior and need inversion/adaptation, not a green-label copy.
3. Re-run populated 0015→0016 legacy compatibility and F1 aware same-row rejoin; no unnecessary participant migration. Run targeted new blocking, ownership, request-race, timestamp and freshness gates.
4. Re-run native session lifecycle, preferences before pull, strict enabled then cleared, known Sydney proposal/confirmation across Chat/Detail/Plans, moderation/deletion and injected failures. Native wheel gate is mandatory for R5. Preserve demo accounts and restore temporary edits; leave the API online.
5. Document physical-device/VoiceOver/software-keyboard/Android/provider/signed-build gaps honestly. An Expo export or simulator LAN URL cannot close them.
6. Publish implementation and validation with exact application SHA and changed-file ownership. Keep review artifact commits distinct from application fixes. Do not force-push, merge main, deploy, migrate remotely, trigger paid builds or submit to App Store under this handoff.
