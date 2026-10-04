# Release candidate — implementation report (4–5 Oct 2026)

**This is a candidate for independent review. It is not accepted, and no
verdict is claimed here; the acceptance decision belongs to Codex.**

## 1. Identity

| Item | SHA |
|---|---|
| Branch | `chore/run-golf-v2-release-candidate-2026-10-04` |
| Base (morning candidate delivery) | `8b34bca78adc028423defbfb2caca8f4cc2d8a0a` (application `c46f4146aa1c46dd8d8d1700d69581ff90a7b5d4`) |
| Consumed Codex review publication | `ce62aacff5dc88efd394abb240dc0a3d0bc3c76d` on `review/run-golf-v2-morning-acceptance-2026-10-04` (reviewed delivery `8b34bca` — verified equal to the base) |
| Website input | `97990d9773669ae6f0ad813f4246f37353ec558d` (`feat/run-golf-v2-web-refresh`), merged unchanged as `410ec8d197ef6e1f0852320a8e14d63d0a951d28` |
| Legal pages source | `ad072fc80aa420b0e78911240809b3baabf4c8af` (`feature/sportgang-official-website`, `apps/web/site/`) |
| **Final source SHA** | `a515b0073cb0f32dad97f88430a203e3427444fe` — the last commit touching `apps/`, `scripts/`, `packages/` or `.github/` |
| Delivery SHA | the branch head after the documentation commits; reported in the terminal handoff and by `git ls-remote` (a commit cannot contain its own SHA) |

Origin was fetched before and after the work. No newer implementation existed for
any pinned input; the candidate, website, review and official-site branches still
resolve to the SHAs above. `origin/feat/run-first-ui` is a separate, divergent line
of work and was not used. Every original branch and review publication is unchanged.

| Commit | Scope |
|---|---|
| `8c18c83` | MA-C — notification event ownership (API) |
| `3f55ac5` | MA-B — room-wide broadcast deadline, bounded concurrent closes (API) |
| `90a6135` | MA-A — one database clock for event membership (API) |
| `a41be8c` | CONTRACTS §5/§8 for the three repairs |
| `410ec8d` | merge of the website delivery `97990d9` |
| `e70a946` | website: legal pages in the build, next-update metadata, CI `web` job |
| `bcecdc8`, `e80b369` | mobile: booking composer at the largest text sizes |
| `a515b00` | website: fixes found by the browser verification (menu at high zoom, 320 px label, no-JS links) |
| others | documentation and evidence only |

## 2. Review findings (severity order given by the review: MA-C, MA-B, MA-A, all P2)

### MA-C — overlapping processors dispatched one event twice

Reproduced at the base: two worker processes, and a worker plus the `/internal`
endpoint, each invoked the provider for the same event.

- **Ownership.** Each due event is claimed by a committed conditional
  `UPDATE … SET failed_reason = 'delivery_unconfirmed' WHERE id = … AND sent_at
  IS NULL AND failed_reason IS NULL`. Only the claimer dispatches. A concurrent
  claimer waits for that commit, re-reads the row and gets nothing. A claimed event
  drops out of every due query. Decisions use the row in the database, never a
  cached entity.
- **Lock order.** The dispatch transaction takes the pair lock (proposals only),
  then writes the event row last. Account deletion uses the same order: user row,
  then cascaded events.
- **Provider success followed by database failure (defined explicitly).** The
  claim is committed before the provider is called. A dispatch that stops
  *before* the call (lock timeout, error, cancellation) hands the event back to
  pending. Once the call has started, an unrecorded outcome stays
  `delivery_unconfirmed` and is **not sent again**. That covers a timeout,
  cancellation, crash, or failed commit after the provider accepted. Delivery is
  at most once, not exactly once; an ambiguous send is never blindly retried. An
  operator can requeue after checking. A stronger guarantee needs a provider
  idempotency key, which is not verified for Expo.
- **No schema change.** `failed_reason` doubles as the marker. CONTRACTS §8 has
  the state table.

Tests: `tests_integration/test_notification_ownership.py`, 11 cases. The barrier
script gained a `before-dispatch` mode and reports other-booking invocations.
The cases:
- two worker processes paused before the claim, for a proposal and for a status
  notice;
- a worker owning an event while the endpoint processes a batch, and the reverse;
- an old due list together with a stale identity map;
- cancel while waiting for the pair lock;
- an exception before the call;
- cancellation and provider timeout during the call;
- provider success followed by a failed commit;
- no-token retry.

**Against `8b34bca`: 9 fail and 2 controls pass.** The failures are duplicate
invocations, plus the base holding the pair lock after an exception until session
close.

Changed reviewer interleavings (also in the handoff):
- The review's two-worker probe paused both workers at the token lookup. That
  lookup now runs after the claim, so the loser never reaches it and instead
  prints `RESULT processed=0`. The decisive interleaving is pinned before the
  claim.
- The review's commit-failure probe fails *every* commit, so the cycle now stops
  before any dispatch, and the observation became `calls == [bid]`. The permanent
  test fails only the commit that would record the send.
- The review's acceptance text says a failure should "permit pending retry". That
  now holds only for failures before the provider call; after it, the user's
  instruction not to retry ambiguous sends applies. **This is a deliberate choice
  for the reviewer to judge.**

### MA-B — broadcast time scaled with sockets; a hung close stranded others

Reproduced at the base (review: 5.04 s for one stalled socket, 15.08 s for three).

- A room's sends run concurrently under one 5 s deadline (`WS_SEND_TIMEOUT_SECONDS`,
  redefined from per-socket to per-room).
- Unfinished sends are cancelled **and awaited** before the pair lock is released.
  Their sockets are dropped and closed in the background.
- Closing a room unregisters every socket, then attempts all closes concurrently,
  each bounded by `WS_CLOSE_TIMEOUT_SECONDS` (1 s). The connection manager owns
  those attempts, so neither a hung close nor a cancelled block request can stop
  the others.
- The supported topology stays one API process; the limit is documented in
  CONTRACTS §8.

Tests: `tests_integration/test_socket_deadline.py`, 7 cases:
- 1, 3 and 20 stalled sockets while a real block waits on PostgreSQL. Delivery
  ends within 5–6 s; no send is still running when the lock is released; no send
  is invoked after the block commits.
- cancellation and failure during delivery;
- hung and failing closes, awaited and cancelled.

**Against `8b34bca`: 5 fail and 2 controls pass** (one stalled socket; a failed
broadcast releasing the lock). The review's own probes on this candidate: one
stalled socket took 5.04 s and three took 5.04 s; the stuck-close probe leaves the
second socket closed.

### MA-A — event membership timestamps came from two clocks

Reproduced at the base with ±120 s API-host skew: a leave before its join, or a
rejoin two minutes off the database's time.

- Host auto-join, join, rejoin and leave now take their instant from
  `events._membership_time`, read after the event row lock: PostgreSQL
  `clock_timestamp()`. `now()` would be the transaction start, which can predate a
  long lock wait. SQLite unit tests use the process's UTC clock.
- Columns, row reuse, capacity, duplicate-join rejection and the leave/rejoin rules
  are unchanged. The legacy naive audit columns (R6) are untouched.

Tests:
- `tests_integration/test_event_clock.py`, 4 cases: ±120 s host skew with full
  chronological ordering, row reuse and capacity controls; a rejoin and a leave
  that waited for the event lock behind another transition.
- A SQLite unit regression showing every transition uses the helper.

**Against `8b34bca` both skew cases fail. With `now()` substituted for
`clock_timestamp()` both lock-wait cases fail.** So the four cases reject the base
and a transaction-start implementation. The Sydney-default integration suite no
longer depends on DB-container-versus-host clock skew.

## 3. Mobile accessibility (Wave 2)

At `accessibility-extra-extra-extra-large` the booking composer title broke
mid-word ("Propos / e a / session") beside a roughly 3× arrow.

The fix (`bcecdc8`, `e80b369`):
- the title and arrow scale up to the 1.4× cap the app's other screen titles
  already use (`ScreenHeader`);
- the title is centred and carries the header trait;
- Back has a 44-pt target through `hitSlop`;
- the arrow has an explicit line height. Native checking showed its box otherwise
  kept the uncapped 79×102 pt size.
- "Send proposal" has side padding, so a wrapped label no longer runs into the
  pill's ends.

Default size is unchanged within 0.3 pt. The Q09 picker frames are identical to the
reviewer's at both sizes. One real proposal agreed across form, HTTP, PostgreSQL
and detail: 11:30–12:30 AEDT, stored as 00:30Z–01:30Z. Evidence:
[evidence/native/README.md](evidence/native/README.md).

**Seen but not changed:** at the largest size the **chat screen's** ⋯ (report/block)
button extends past the right edge (x 370–442), its partner name is hidden and the
message field is truncated. That is a separate screen outside the authorised
heading repair, recorded as an open item. VoiceOver and physical devices: NOT_RUN.

## 4. Website (Wave 3)

- **Merge.** `97990d9` was merged after inspecting its diff: only `apps/web/**` and
  `docs/run-golf-v2/web-refresh/**`; no lockfile, package rename or design-export
  change.
- **Legal pages.** `apps/web/public/{privacy,terms,support}/index.html` and
  `public/styles.css` are byte-for-byte copies of `ad072fc`. They equal the live
  pages minus the comment Netlify injects; `styles.css` is identical. No address or
  policy text was invented; the support page still says its address will be
  published at launch.
- **Production preview.** `/privacy/`, `/terms/` and `/support/` return 200 with
  identical bytes. Paths without the trailing slash fall back to the home page under
  `vite preview`, so the host must redirect them (Netlify does). All published links
  use the slash.
- **Metadata.** Title, description, Open Graph and Twitter tags, and the no-script
  note, now say the experience comes "in the next update". There is still no
  canonical URL, `og:url` or share image, because the domain and host are undecided.
- **CI.** The new `web` job (Node 20, `npm ci`, typecheck, build, byte comparison of
  the legal pages in `dist/`) is green; existing jobs are unchanged.
- **Claim matrix.** CLAIM_MATRIX records the actual verdict (`ce62aac`). A5 and A6
  are updated; E1, E2 and E7 stay PENDING.
- **Browser checks** ([evidence/web/README.md](evidence/web/README.md)). Run by a
  separate verification pass in Google Chrome 154 headless, driven over the
  DevTools protocol with real key and mouse events.
  - **PASS at 390, 768 and 1440 px:** layout with no overflow; full keyboard order
    (25 Tab stops at 1440, 27 with the menu open at 390) with a visible focus ring;
    menu; FAQ (state exposed in the accessibility tree); anchors land below the
    sticky header.
  - **PASS, emulation labelled:** reduced motion.
  - **PASS:** JavaScript-disabled rendering of `/` and of the three legal pages;
    print of `/` (10 pages) and `/privacy/` (7 pages).
  - **Real 200 % page zoom: PASS.** Applied through a throwaway profile's zoom
    preference, not Cmd+=, because the claude-in-chrome extension was not connected;
    an emulated 200 % run also passed.
  - **Three defects, fixed in `a515b00` and re-checked:**
    - D1: at 320 px the App Store label wrapped with "Store" alone on the second
      line. It now forms two balanced lines.
    - D2: at 300–400 % emulated zoom the open menu's last items could not be
      reached. The menu now scrolls within the viewport.
    - D3: the no-JS links looked like plain text. They are now underlined.
  - **Print-only notes, unchanged:** closed FAQ answers don't print, and some cards
    break across pages.
  - **Safari: NOT_RUN.** `safaridriver` refused the session because Remote
    Automation is off. The attempt itself launched Safari.app, which the verifier
    stopped about 20 s later. It was not a pre-existing session, and no setting was
    changed.

## 5. Verification

Logs: [evidence/logs/](evidence/logs/) (paths sanitised; scanned for credentials).
API checks ran at `a41be8c`, and `apps/api` is unchanged from there to the final
source. Mobile checks ran on the final mobile source. Launcher and packages are
unchanged since the base. The website was re-built and re-checked at `a515b00`
(below). `git diff` between each checked commit and the final source is empty
outside the noted areas.

| Check (command from `apps/api`, `apps/mobile` or root) | Result |
|---|---|
| API unit, SQLite — `uv run --frozen pytest -q tests` | **773 passed**, 0 skipped, 882 warnings (passlib `crypt`, HTTP 422 constant, websockets deprecations) |
| Ruff — `ruff check .`, `ruff format --check .` | clean; 151 files formatted |
| Integration, fresh UTC database — `pytest tests_integration -q -rs` | **64 passed**, 0 skipped, 37 warnings |
| Integration, fresh database with `ALTER DATABASE … SET timezone 'Australia/Sydney'` | **64 passed**, 0 skipped, 36 warnings |
| …of which new: `test_notification_ownership.py` / `test_socket_deadline.py` / `test_event_clock.py` | 11 / 7 / 4 passed |
| Baseline `8b34bca` with the new files (fresh database) | ownership 9 failed, 2 passed; socket deadline 5 failed, 2 passed (the base lacks two names, so a shimmed copy was used); event clock 2 failed, 2 passed |
| Mutation: `clock_timestamp()` → `now()` | event clock 2 failed (both lock-wait cases), 2 passed |
| Review's `test_independent_followups.py` + `test_independent_block_first.py`, unchanged except the port guard | 11 passed, 2 failed — exactly the two adapted interleavings (§2) |
| Adapted R1 probe — `probe_r1_adapted.py` (fresh database) | **94 PASS, 0 FAIL, 0 harness errors** |
| Mobile Jest, `TZ=UTC` and Sydney — `npm run test:ci -w @protin/mobile -- --runInBand --watchman=false` | **64 suites, 968 passed**, 0 skipped, each run; 17 `console.error` blocks (mostly React `act` warnings) |
| Review mobile probes, regenerated — `make_mobile_probes.py` then Jest on the 4 copies (deleted afterwards) | **16/16** |
| Mobile lint / typecheck | 0 warnings / clean |
| iOS bundle — `expo export --platform ios` | exit 0; Hermes bundle 4.42 MB |
| Launcher — `python3 -m unittest scripts/qa/test_qa.py`, `TZ` unset (Sydney) and `TZ=UTC` | 21 ran: 14 passed, 7 Docker opt-in skips, each |
| Launcher with `QA_TEST_DOCKER=1`, `TZ` unset and `TZ=UTC` | **21/21** each |
| Web — `npm run typecheck -w @protin/web`, `npm run build -w @protin/web` (Node 20.20.2) | exit 0 / exit 0 |
| Web production preview — `/privacy/`, `/terms/`, `/support/`, `/styles.css` | 200, bytes identical to `public/` |
| Web browser verification (Chrome 154 headless) | see §4: PASS except D1–D3 (fixed in `a515b00`, re-checked) and Safari NOT_RUN |
| Web build at the final source `a515b00` (Node 20) | exit 0; preview serves exactly `dist/` |
| Native, dedicated simulator | §3 and [evidence/native/README.md](evidence/native/README.md) |
| GitHub Actions | run 37202782760 (`a41be8c`) and run 37202969762 (`e70a946`): all 9 jobs green, including the new "Website typecheck and build"; runs for later commits are listed in the terminal handoff |

## 6. Failed attempts and corrections (kept, not hidden)

- **MA-C design changed once.** The first implementation held a `FOR UPDATE SKIP
  LOCKED` row lock across the provider call. That fixed the overlap, but a failed
  commit after a provider success would have left the event pending and resent
  it — a blind retry of an ambiguous send. It was replaced, before any commit, by
  the committed claim described above.
- **Fake-database unit test.** `test_process_pending_notifications_handles_naive_scheduled_at`
  used a hand-written fake session that could not follow the new statements. It
  now runs on the module's real SQLite session with the same assertions
  (failed == 1, `no_push_token_after_48h`).
- **Barrier harness.** The first `_spawn` treated a worker's earlier
  `PROVIDER_INVOCATION` line as a missing barrier. Workers process earlier due
  events first, so the booking-confirmed case failed for a harness reason. Lines
  before the barrier are now kept.
- **Socket-deadline baseline.** The base has no `WS_CLOSE_TIMEOUT_SECONDS` or
  `_closing`. A copy with two marked shims was used only for the baseline run. On
  the base the second stalled socket's send does not even start within 5 s, so
  three cases fail at that wait.
- **Legal-page copy.** A first copy wrote empty files: zsh read `$SRC:apps` as the
  `:a` path modifier. The hash comparison against the branch caught it, and the
  copy was redone with `${SRC}`.
- **Composer heading.** The first fix (`bcecdc8`) capped the text, but native
  checking showed the Back box still 79×102 pt and the Send label clipped. Both
  were fixed in `e80b369` and re-checked natively.
- **Small slips.** One Ruff E501 and one import-order fix in new tests. A missing
  `timeout` binary. A `sips` crop that did not crop. Simulator taps that needed a
  second physical tap.

## 7. QA session and preview

Prepared after the final source commit and left running for home testing.
The checklist is [HUMAN_QA.md](HUMAN_QA.md).

| Service | Address | Identity |
|---|---|---|
| QA project | `sg-rc-20261004-qa`, owner home `.qa/owner-home` in the candidate worktree | owned by this worktree; fresh fixtures (`qa reset`: 8 users, 81 sessions, 57 bookings, migration 0016) |
| API | `http://127.0.0.1:8163` | started from `a515b00`, identity verified, health 200 |
| Metro / app | `exp://127.0.0.1:8263` (simulator mode) | started from `a515b00`, identity verified, serves API URL 8163 |
| Website preview | `http://127.0.0.1:5196/` | detached `vite preview`, PID in `.qa/web-preview.pid`, cwd `apps/web` of the candidate worktree; `dist/` built from `a515b00`; `/`, `/privacy/`, `/terms/`, `/support/` byte-identical to the build |
| Simulator | "SportsGang RC 20261004" (iPhone 16e, iOS 26.3), default text size | Expo Go on the Welcome screen of this session |

Stop everything with `npm run qa:down` (using the same `SPORTSGANG_QA_HOME`) and
`kill $(cat .qa/web-preview.pid)`.

Left untouched:
- the human QA stack `sportsgang-qa` and its containers;
- every other simulator;
- the review worktree;
- an earlier `vite preview` on port 5187, serving the website delivery `97990d9`
  from the web-refresh worktree. It was started by the earlier website task, not
  this one, so it was not stopped.

Removed: this task's temporary preview on 5196 (replaced by the detached one), the
temporary review-probe copies, and the scratch owner record (moved). Still kept:
- the disposable test containers `sg-rc-20261004-pg` (55661) and
  `sg-rc-20261004-redis` (56661), for retests;
- the detached baseline worktree at `8b34bca` in the scratch directory.

## 8. Remaining gates

| Gate | Status |
|---|---|
| Independent review of MA-C, MA-B, MA-A and this candidate | **pending** — not accepted until Codex says so |
| R6 production timestamp provenance | **OPEN / NOT_RUN** — production not accessed; use [../morning-fixes/R6_C01_DEPLOYMENT_GATE.md](../morning-fixes/R6_C01_DEPLOYMENT_GATE.md) and its migration proposal; no zone guessed, no history rewritten |
| Single API process serving WebSockets | **OPEN** — repository config is not proof of the live topology; room deadlines, closes and the registry are per process |
| Physical iPhone, VoiceOver, Android, signed build, real Expo/APNs delivery | **NOT_RUN** |
| Notification delivery semantics | at most once by design; exactly-once needs a provider idempotency contract (not verified) |
| Chat screen at the largest text size (⋯ off-screen, name hidden, input truncated) | **open, not changed** — outside this repair; needs a decision |
| Website domain, host, canonical and share image | **undecided** — not deployed; the host must redirect `/privacy` → `/privacy/` |
| Store-build legal URLs (`EXPO_PUBLIC_*_URL`) | not recorded in the repo; set at build time |
| Merge to main, deployment, App Store submission | not done (not authorised) |
