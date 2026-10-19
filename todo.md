# todo.md — SportsGang working scope

Single source of truth for what is in scope *right now*. Read this first when resuming
after a pause. Update it in the same commit as the work.

_Last updated: 2026-10-19 15:15 (Sydney)._

## Working rules (apply to every session on this repo)

### Model routing
- **All implementation is done by Opus.** "Implementation" = any change to code, tests,
  migrations, configs, CI, or dependency pins, and any debugging that leads to such a change.
- **Sonnet or Haiku only for simple, non-implementation work:** reading files and reporting
  status, running an existing test/lint command and relaying the result, polling CI, grepping
  for drift, drafting PR bodies from a finished diff, updating this file's status lines,
  summarising a log. If a "simple" task turns out to need a code change, stop and hand it
  to Opus — do not let a Sonnet/Haiku agent edit source.
- Review is Codex (read-only report → Opus fixes), per the repo's existing workflow.

### Keep it simple
- One item at a time, in the order listed. Don't start the next item until the current one
  is in a PR with CI green.
- One branch + one PR per item. Branch from fresh `main`. Verify with
  `npm run typecheck -w @protin/mobile && npm run lint -w @protin/mobile` and
  `cd apps/api && uv run pytest tests -q`. Squash-merge, delete branch.
- No speculative features, no refactors outside the item's scope (see `CLAUDE.md`).
- Each item should be small enough to finish in one sitting. If it isn't, split it here first.

### Pausing and resuming (token limit, session end)
- When tokens run low, **stop at a clean point**: commit whatever is verified, push the
  branch, note the exact state under "Resume here", and stop. Don't start a new item.
- Never leave uncommitted edits as the only record of work. Half-done = push to the branch
  with a `wip:` prefix and a line here saying what is left.
- On resume: read this file first, then `git fetch && git status`, then continue from
  "Resume here". Don't re-audit the repo unless this file says to.

### Owner-only actions (never unattended)
- Merging PRs (the cloud session's auto-merge is blocked by a permission check anyway).
- Major-version dependency jumps, `LICENSE`, deleting remote branches, anything irreversible.

## Resume here
- **State:** Scope 1 merged; #22, #23, #28 merged; Scope 4's #27, #19, #24, #26 merged
  2026-10-19. R1–R6 done and ticked; see "Re-verification" in `docs/overnight/2026-10-19.md`.
  #21 rebased onto `main` 2026-10-19 (`todo.md` = `main`'s; now test-only), CI green, open.
- **#25 was not merged:** GitHub closed it (03:59Z) when #26's branch, its base, was deleted on
  merge. The WebSocket reconnect (S12) and R2's reconnect half live only on
  `feat/chat-reconnect` (`d90c44d`); `main` has R2's #26 half, and README says there is no
  reconnect. To land it: `git rebase --onto origin/main 5df02c0 feat/chat-reconnect` (drops
  #26's pre-squash commits), then a new PR to `main`. S12/R2 stay ticked for the repair.
- **Owner, merge:** #21, then the replacement PR for #25 once it exists.
- **Owner, decide:** #20 metro (pulls transitive majors — recommend keep draft until the
  SDK 55 hop S7c removes the need), #15 cryptography (recommend merge: audit clean, 706 pass).
- **Next step (Claude):** open the replacement PR for #25 when the owner says so. S7 needs the
  owner's go-ahead.
- **Environment limits:**
  - The linked-computer shell has no `gh`, no `docker`, no GitHub push credentials, and its
    `apps/api/.venv` may be built for another OS. Do **not** `uv sync` over it.
  - PR work runs from the cloud clone at `/home/claude/sportsgang` (has `gh` + push). If the
    clone is gone, re-clone shallow. The repo is now `EdwardH-jedi/Sportsgang` (old lowercase
    URL redirects). `gh pr create` fails (GraphQL blocked) — use
    `gh api repos/EdwardH-jedi/Sportsgang/pulls -f base=main -f head=<branch> -f title=... -F body=@file`.
  - The Mac CLI session (Claude Code in the local checkout) does have `gh` and push, and its
    `apps/api/.venv` is native arm64: `cd apps/api && uv run --frozen pytest tests -q` →
    706 passed in ~2 min (2026-10-19). PR creation still goes through `gh api … /pulls`.
  - PostgreSQL/Redis integration (`apps/api/tests_integration/`) runs in CI. On the Mac it can
    also run locally: start OrbStack (`orb start`), run throwaway `postgres:16-alpine` (55432) and
    `redis:7-alpine` (56379) with the CI job's env, flush Redis between runs (registration is
    rate-limited), remove the containers after. S5, S9 and S11 did this.
  - Codex CLI is installed on the Mac (`/opt/homebrew/bin/codex`); the review prompt is in
    `.claude/hooks/codex-review.sh`.
  - A stop hook may warn "unpushed commits / no remote branch" on a freshly pushed branch in
    the shallow clone. Check `git ls-remote origin <branch>` first; if it matches HEAD, it's
    a false alarm — just `git push -u origin <branch>`.

## Scope 1 — "post-audit cleanup" (small, safe, no behaviour change) — MERGED 2026-10-18 (S3 still draft)
Goal: leave `main` clean and the portfolio facts accurate after the 2026-10-17/18 overnight runs.

- [x] **S1 `chore/repo-hygiene`** — PR #16. `.coverage` / `*.tsbuildinfo` ignored, tsbuildinfo
      untracked, this file added. Verified: typecheck, lint, 706 api tests.
- [x] **S2 `docs/facts-actuals`** — PR #17. `PORTFOLIO_FACTS.md` → 706 backend / 722 mobile /
      17 migrations (0001→0017), "as of 2026-10-18". README carries no counts.
- [x] **S3 `chore/cryptography-bump`** — PR #15, **draft on purpose**. Cap `<51`, locks 50.0.2,
      pip-audit clean, 706 api tests pass. Major jump (43→50): merge is the owner's call.
- [x] **S4 `test/profile-screen-warmup`** — PR #18. Flake reproduced (7585 ms, cold cache +
      CPU load); cause is first-render warm-up, fixed with a `beforeAll` warm-up; 3/3 pass
      under the same load, 722 mobile tests pass.

## Scope 2 — "close the audit tail" (FSM evidence, one npm advisory, Expo upgrade plan)
Goal: record the booking-FSM mutation evidence, clear the `image-size` high without a major
jump, and split the Expo SDK upgrade into one-sitting pieces. Only S5 and S6 get implemented.

- [x] **S5 `docs/fsm-mutation-record`** — PR #19. `docs/review/BOOKING_FSM_MUTATION_2026-10-19.md`:
      31 mutants at `d3429a9`, **28 killed** (27 unit, G5 by PG integration); G4/S4/S6 survived →
      S8. Section 6 (R1) re-runs them on #21's head: 36/5/1 failed, all killed. Original: docs only. Re-run a hand-written mutation check of the
      booking FSM in `apps/api/app/services/bookings.py` (`_TRANSITIONS` edges and actors, the
      participant/actor guards, notification/reminder/rank side effects) against current `main`
      and record it in `docs/review/` next to the historical results from #10 and #14. Mutants
      run in a throwaway worktree, never on the branch. A surviving mutant is recorded as a
      finding, not fixed here — a test for it is a separate S-item.
- [~] **S6 `fix/image-size-advisory`** — blocked: PR #20 (draft) drops `image-size`, but metro 0.83.8
      moves its own deps across majors — accepts 1→2, mime-types 2→3, negotiator 0→1, and
      hermes-parser/hermes-estree 0.32→0.35 (Codex B3). Owner decides. Original: clear GHSA-5p2g-fcmc-qvqq and GHSA-w3rx-r6r6-pgpr (high,
      `image-size@1.2.1` ← `metro@0.83.3` ← `@expo/metro@54.2.0` ← `expo@54.0.37`, all latest
      for SDK 54). No 1.x fix exists (fixed in 2.0.3), so an `image-size` override is a major
      jump and is out. Route: root `overrides` moving the whole metro family 0.83.3 → 0.83.8
      (patch; 0.83.8 drops `image-size`; SDK 55's `@expo/metro` already ships 0.83.5–0.83.8).
      Verify: `npm ci`, one metro version in `npm ls metro --all`, `npm audit` high 47 → 46 with
      nothing new, typecheck/lint/jest, and `npx expo export` (ios + android) so the bundler
      actually runs on assets. If the family can't move cleanly or export breaks, leave the PR
      as draft and say why. The override comes out again at the SDK 55 hop (S7c).
- [ ] **S7 `expo-sdk-upgrade`** — **split only; do not start without the owner's go-ahead.** One
      branch + PR per sub-item, in order, never two SDK hops in one PR. Target **SDK 58**
      (expo 58.0.14, RN 0.88, React 19.3): npm audit's suggested fixes for 34 of the 47 highs
      are Jest 30 / jest-expo 58 / RN 0.88. Sources: `npx expo-doctor` (2026-10-19, 16/18 pass),
      the expo.dev/changelog/sdk-NN posts and each SDK's `bundledNativeModules.json`, read by a
      research agent; UNCONFIRMED = not checked against a primary source. Each item verifies
      with typecheck, lint, jest, `npx expo-doctor` and `npx expo export`. No `ios/`/`android/`
      folders, so prebuild changes don't apply. Majors → owner merges.
  - [ ] **S7a** pre-flight, no SDK change: fix the two `expo-doctor` failures — `app.json` values
        that `app.config.js` ignores (fold in or delete; `npx expo config` output must not
        change) and the root devDependency `@expo/config-plugins` (nothing in `src/` imports
        it; find out why `8015005` added it before removing it).
  - [ ] **S7b** CI Node 20 → 22 (`.github/workflows/ci.yml`, 3 jobs). SDK 55 needs ≥ 20.19.4;
        SDK 58 drops Node 20 (`^22.13 || ^24.3 || ^26`).
  - [ ] **S7c** hop 54 → 55: RN 0.83, React 19.2.0, expo-* → ~55, jest-expo ~55,
        `react-native-maps` 1.20.1 → 1.27.2 (breaking changes UNCONFIRMED), Sentry 7.2 → ~7.11.
        Legacy architecture removed (the app sets no `newArchEnabled`, so it's already on the
        new one). Remove S6's metro override here.
  - [ ] **S7d** hop 55 → 56, TypeScript held at ~5.9 via `expo.install.exclude`: RN 0.85, iOS min
        15.1 → 16.4, Hermes v1 default, `expo/fetch` becomes the global `fetch` (check the fetch
        mock in `src/__tests__/api.test.ts`), expo-calendar's original API deprecated
        (`src/lib/calendar.ts`; migration path UNCONFIRMED), jest-expo now needs
        `@react-native/jest-preset`.
  - [ ] **S7e** TypeScript 5.9 → 6.0 (SDK 56's version): fix the new strictness errors only.
  - [ ] **S7f** hop 56 → 57: RN 0.86, no breaking changes listed; take expo ≥ 57.0.17 (Hermes v1
        memory-regression fix).
  - [ ] **S7g** hop 57 → 58, Sentry held at 7 via `expo.install.exclude`: RN 0.88, React 19.3,
        RN Strict TypeScript API on by default, maps 1.29; expo-notifications now shows
        foreground notifications by default — confirm the handler at
        `src/lib/notifications.ts:53` keeps today's behaviour. Needs S7b.
  - [ ] **S7h** `@sentry/react-native` 7 → 8 (SDK 58 bundles ~8.28; migration guide UNCONFIRMED).
  - [ ] **S7i** Jest 29 → 30 (jest-expo 58 accepts both), then re-run `npm audit` and record
        what's left. `@testing-library/jest-native` is deprecated upstream; replace it only if
        it blocks Jest 30.

## Needs the owner
- Decide #15.
- Go-ahead for S7 (each hop is a major-version change).
- `LICENSE` choice.
- Deleting stale remote branches (52 remote refs; list in a PR comment first, delete only on approval).
- Scope 3/4 PRs: merge #21 and the replacement for #25 (see "Resume here"), plus the
  decisions in `docs/overnight/2026-10-19.md` "Re-verification" (#24 empty-upload 422 and
  unreferenced files on an unknown-outcome commit, #26 device scroll check and page size 50,
  S10's 44 uncovered lines). S14's picker question is decided (in-house).

## Scope 3 — "overnight hardening" (tests, bug fixes, UX gaps the README admits to)
Goal: turn the README's "still need hardening" sentence and the S5 mutation findings into
merged, tested fixes, in one unattended run. Every item below was checked against code on
2026-10-19 before being listed; none is speculative.

### Overnight protocol (this scope only)
- Run items **in order**; each is one branch + one PR, CI green, then move on **without
  waiting for a merge** — branch every item from `origin/main`, not from the previous branch,
  so PRs stay independent. Record the PR number here as you go (push `todo.md` updates on
  each item's own branch; keep the diff to that item's lines to avoid conflicts).
- If an item is blocked (can't reproduce, dependency needs a major, CI red after two
  honest fix attempts): mark it `[~] blocked: <reason>`, open the PR as draft, and go to
  the next item. Never spend more than ~2 hours of wall-clock on one item.
- Behaviour changes must come with a test that fails without the change. UX items must
  come with an RNTL test and must not change any API contract (`packages/shared-types`
  untouched unless the item says so).
- Stop only when the list is exhausted or tokens are low. On stop: push, update "Resume
  here", list anything half-done as `wip:`.
- Model routing from "Working rules" still applies: Opus implements; Sonnet/Haiku only for
  CI polling, status lines and PR bodies.

### A. Security / correctness tests (API, no behaviour change)
- [x] **S8 `test/booking-participant-guard`** — tests in #21; mutation-doc append in #19 (R1). Re-verified.
  Original tick: — PR #21, CI green. +41 FSM tests (747 api);
      outsider gets **404** on all 36 pairs (current behaviour; the text below said 403). G4/S4/S6
      re-run: all killed (36/5/1 failed after Codex's widening). Mutation-doc append waits for #19 (doc not on `main`). Original: F1 from S5: `transition_booking`'s participant
      check (`_assert_booking_participant`, `services/bookings.py:73`) has no test; deleting
      it keeps the whole suite green. Add unit tests: a third user gets 403 on every transition
      (cancel/complete/no-show/confirm/decline) of a proposed and a confirmed booking, and the
      booking row and notification count are unchanged. Also cover the two other S5 survivors
      recorded in `docs/review/BOOKING_FSM_MUTATION_2026-10-19.md` (notification recipient and
      reminder display name) with assertions on *who* receives what. Re-run those three mutants
      by hand in a throwaway worktree and append the result to that doc.
- [x] **S9 `test/booking-concurrent-transitions`** — PR #22, CI green. Premise was stale (#13's two
      PG tests already kill `for_update=False`); added cancel-vs-complete by different actors with
      notification/honor/rank asserts, loser 422. Mutant fails 3/3 locally. README line dropped. Original: `with_for_update()` exists at
      `services/bookings.py:66` but nothing exercises it. Add a PostgreSQL integration test in
      `apps/api/tests_integration/` (runs in CI's PostgreSQL/Redis job): two concurrent
      `transition_booking` calls on one confirmed booking (e.g. cancel vs complete) → exactly
      one succeeds, the other gets the FSM 409/400, one notification set is sent. Use two
      sessions + `asyncio.gather`. Then drop "concurrent booking transitions" from README
      Limitations in the same PR.
- [x] **S10 `test/api-service-coverage`** — PR #23, CI green. Gap was a coverage artifact (no
      greenlet tracing), not mocking or missing tests: with `concurrency = greenlet,thread` in
      `pyproject.toml` the six modules are 87–100% (94%), all of `app/` 92%. No per-module PRs
      needed; 44 uncovered lines listed in #23 for the owner. Original: measured 2026-10-19 with `--cov=app`:
      `services/challenges.py` 31%, `services/events.py` 38%, `routers/users.py` 39%,
      `services/matches.py` 45%, `services/safety.py` 53%, `services/discovery.py` 54%.
      First confirm the repo's own coverage command agrees (the audit quoted 93% overall; if
      the gap is because services are mocked in unit tests, say so in the PR). Then, one PR
      per module, highest-value first (**safety → discovery → matches**; leave
      challenges/events for S10d/S10e if time allows): unit tests through the public service
      functions, SQLite like the rest of `tests/`, target ≥80% per module. No source changes
      except a bug found by a test, which gets its own commit and a note here.

### B. Bug fix (API)
- [x] **S11 `fix/photo-replace-failure-safe`** — #24, repaired by R3 (Codex F1/F2). Re-verified.
  Original tick: — PR #24, CI green. New files written beside old
      (unique names), rows + `avatar_url` in one commit, replaced rows' files deleted after it under a
      profile row lock; empty upload → 422. Codex fixes: rollback-safe user id, no dir sweep, keep new
      files if the commit outcome is unknown, response built before commit. +7 unit (713 api) + 1 PG
      test (lock: 3/3 fail without).
      Note (Codex, R3c): the row lock is released at commit, *before* the replaced files are
      deleted; the file cleanup is not under the lock.
      README line dropped. Original: `routers/users.py:140-179` deletes the
      `ProfilePhoto` rows and calls `media_storage.clear_user_photos()` **before**
      `save_user_photos()`; if saving fails (bad file, disk error) the user is left with no
      photos and a dangling `avatar_url`. Fix: validate + write new files to a temp location
      first, then swap and delete old files, and only then delete/insert rows in one
      transaction; on any failure the old photos and rows must survive. Tests: a 3-file upload
      whose 2nd file is invalid leaves the previous photos and `avatar_url` untouched on disk
      and in the DB. Drop "failure-safe photo replacement" from README Limitations.

### C. UX gaps (mobile; no API contract change)
- [x] **S12 `feat/chat-reconnect`** — #25 (stacked on #26), repaired by R2 (Codex B1). Re-verified.
  Original tick: — PR #25, CI green. Backoff 1/2/4/8/8 s, foreground reconnect,
      gap refetch via `fetchMessages`, "Reconnecting…" line, no retry on 1008/4xxx, clean unmount.
      failed refetch keeps the chat on screen (Codex). +8 RNTL tests in a new file (730 mobile), 7 fail
      on `main`. README word dropped. Original: `ChatScreen.tsx:303` opens the WebSocket with no
      `onclose`/`onerror` handling, no reconnect, and no app-foreground handling, so a
      backgrounded app silently stops receiving messages. Add: reconnect with capped
      backoff (1s→2s→4s→8s, max 5 tries), re-fetch the latest page on reconnect to fill the
      gap, reconnect on `AppState` → active, a small "Reconnecting…" line above the composer
      while disconnected, and clean teardown on unmount. RNTL tests with a fake WebSocket:
      close → reconnect called with backoff, foreground → reconnect, unmount → no leak.
      Drop "chat reconnection" from README Limitations.
- [x] **S13 `feat/chat-history-pagination`** — #26, repaired by R2 + R5 (Codex B1). Re-verified.
  Original tick: — PR #26, CI green. Client loaded the *oldest* 100
      (API is ASC + offset); now newest page first via `total`, "Load earlier messages" header (not
      `onStartReached`: fires at offset 0 on mount), dedupe, scroll hold (set before the spinner,
      per Codex), fetch error cleared on success. +7 tests (729 mobile).
      Auto-merges with #25 except README. Original: API already supports `limit`/`offset`
      (`routers/chat.py:53`); the client only loads the latest page. Add load-older on
      scroll-to-top (or a "Load earlier" button if `onStartReached` is unreliable on this
      RN version), preserve scroll position, dedupe by message id against WS arrivals. RNTL
      test: initial 50, pull → next 50 prepended, no duplicates. Drop "chat history
      pagination" from README Limitations (the whole sentence should be gone after S9/S11/S12/S13).
- [x] **S14 `feat/booking-datetime-picker`** — #27, repaired by R4 (Codex B2). Re-verified.
  Original tick: — PR #27 (docs only), CI green. Already shipped
      2026-05-05 (`a5b187b`, `e80456f`: calendar grid + time wheel, past blocked, local no-`Z`); NB-005
      marked resolved. Native datetimepicker swap and "next whole hour" default left to owner. Original: KNOWN_ISSUES NB-005: `BookingComposerScreen`
      takes date/time as free text (`YYYY-MM-DD`, `HH:MM`). Replace with
      `@react-native-community/datetimepicker` (check the SDK-54 compatible version with
      `npx expo install`; if it needs a major that `expo install` doesn't pick, stop and mark
      blocked). Keep the same `scheduled_at` ISO payload and the W7-003 fix (local time, no
      `Z`). Default to the next whole hour; disallow past times in the UI; keep the existing
      server-side validation untouched. Update the existing composer tests; mark NB-005
      resolved in KNOWN_ISSUES.
- [x] **S15 `test/onboarding-screen`** — PR #28, CI green. Dead (`export {}`, no imports, no
      route): deleted. All 27 remaining screens have a test; PORTFOLIO_FACTS has no screen-test
      sentence, so untouched. Original: `screens/auth/OnboardingScreen.tsx` (9 lines) is the
      only screen without a test. If it's a pure redirect/wrapper, add a 1-case test; if it's
      dead (not in any navigator), delete it and its route. Either way, every screen then has
      a test; note the count in `docs/PORTFOLIO_FACTS.md` only if a sentence there already
      talks about screen tests.

### D. Finish
- [x] **S16 `docs/scope3-report`** — `docs/overnight/2026-10-19.md`, docs-only commit on `main`. Original: `docs/overnight/2026-10-19.md` in the same shape as the
      2026-10-17 report: per-item outcome, PR numbers, what was blocked and why, test-count
      deltas, and the README Limitations lines removed. Update "Resume here" and the Scope 3
      checkboxes. Docs-only commit on `main` is fine for this one.

## Scope 4 — "repair after verification" (fix what Codex proved, then merge Scope 3)
Source: Codex independent verification 2026-10-19 (batch verdict REQUEST_CHANGES). Every item
below cites its finding. Same Overnight protocol as Scope 3: branch per item, CI green, no
merges, `[~] blocked:` and move on if stuck. Each repair must add the exact regression Codex
used, so the finding cannot silently return.

- [x] **R1 `docs/mutation-record-rebase`** (F3 + F4) — #19 rebuilt on `main` (`c03d014`) and
      force-pushed; merges cleanly (was: `todo.md` conflict). Section 6 appended; G4/S4/S6 re-run
      on `6ab26f0` by hand: 36/105, 5/136, 1/140, matching Codex. S6 kept `[~]` per Codex B3.
      Original: rebase #19 onto current `main`, resolving
      `todo.md` by keeping `main`'s text (only take #19's S5/S6 ticks). In the same branch append
      a "Re-run after #21 (2026-10-19)" table to
      `docs/review/BOOKING_FSM_MUTATION_2026-10-19.md`: G4 → 36 failed/105 passed, S4 → 5/136,
      S6 → 1/140 (the figures Codex reproduced on #21's head), keeping the historical 28/31 as
      historical. Force-push #19 (it is a docs branch; note the rewrite in a PR comment). This
      closes S8's missing criterion without touching #21.
- [x] **R2 `fix/chat-gap-recovery`** (B1, BLOCKER) — #26: loaded `[start,end)` runs replace
      `oldestOffset`; "Load earlier" fills the slice below the newest run first. #25 (now stacked on
      #26): reconnect pages back ≤10 pages until it joins; a bigger or failed gap shows "Some messages
      may be missing" inline. Codex's test + cap + failed-page: 3 fail on `25950f2`+`189dd41`, pass
      now (740 mobile). Original: the real bug: with #25+#26, 100 persisted
      messages, 70 arrive while disconnected → reconnect fetches only the newest 50 (ids 120–169),
      `Math.min` keeps `oldestOffset=50`, "Load earlier" then fetches 0–49 and disappears;
      **ids 100–119 are unreachable forever.** Fix in the #26 branch first: replace the single
      `oldestOffset` with explicit loaded ranges (list of [start,end) offsets or a Set of ids +
      total), and never hide "Load earlier" while any interior range is missing. Then rebase #25
      onto #26 and change its reconnect refetch to page **backwards from the latest page until
      it overlaps an already-loaded id** (cap at e.g. 10 pages; beyond that, keep the gap
      visible with a "Some messages may be missing — load earlier" state). Add Codex's exact
      combined regression (100 → disconnect → +70 → reconnect → every id 0–169 reachable via
      "Load earlier") to `ChatScreen.reconnect.test.tsx`. Update both PR bodies; #25's body must
      say it is stacked on #26.
- [x] **R3 `fix/photo-replace-cancel-and-lock`** (F1 + F2, on the #24 branch) — #24 rebased on
      `main`. (a) `except BaseException` before commit: delete new files, roll back, re-raise;
      Codex's cancel test fails on `da7e204`, passes now; docstring states the ambiguous-commit case.
      (b) A holds the lock on an Event; B must show in `pg_stat_activity` as a lock waiter before it
      reads the profile. Green 5/5; lock mutant **fails 5/5**. (c) note added under S11. README
      edit dropped from #24 (#26 owns the bullet, R5). 715 api + 6 PG integration. Original:
      (a) `asyncio.CancelledError` at flush leaves all new files on disk: catch
      `BaseException` for the pre-commit window, roll back, delete the new files, re-raise.
      Keep the post-commit-ambiguous case as is (files retained) but fix the endpoint docstring
      to say exactly that. Test: inject `CancelledError` at `AsyncSession.flush`, assert the
      three new files are gone and old rows/avatar intact.
      (b) The PG lock regression passes 2/3 runs with `.with_for_update()` removed. Make overlap
      deterministic: first request holds its transaction after the profile read on an
      `asyncio.Event`; assert the second request is blocked at that read (timeout → it must NOT
      have progressed); release; without the lock the second progresses and the test fails.
      Run the lock mutant 5× — must fail 5/5.
      (c) Add a note line in `todo.md` S11 that lock release happens at commit, before old-file
      cleanup (Codex NOTE on `todo.md:205`).
- [x] **R4 `feat/booking-composer-submit-guard`** (B2, on the #27 branch, becomes code) — #27
      rebased, re-titled. **Decision (owner, 2026-10-19): keep the in-house CalendarPicker /
      TimeWheelPicker; no `@react-native-community/datetimepicker`.** Default = `nextWholeHour()`
      (23:00+ → 00:00 tomorrow); validation no longer memoised, past start flagged on any date,
      re-checked at submit (no API call, existing error shown). Codex's 2 tests fail on `bc365a0`,
      pass now; 728 mobile, also TZ=UTC on Node 20. Original: keep
      the in-house `CalendarPicker`/`TimeWheelPicker` (owner call: a native module adds nothing
      user-visible; record this decision in the item). Implement the two unmet criteria:
      default start = **next whole hour** from now (not tomorrow 09:00), and **re-validate at
      submit** that start is not in the past (and not within the server's 1-hour grace in a way
      that would be rejected), showing the existing error instead of calling the API. Tests with
      a fixed clock: at 10:30 local the default payload is `T11:00:00`; advance the fake clock
      past the chosen start while mounted → Send does not call the API. Server contract untouched.
      Re-title #27 and update KNOWN_ISSUES wording.
- [x] **R5 `docs/readme-limitations-precise`** (after R2/R3 land in their PRs) — #26 replaces the
      bullet with three precise ones (no reconnect yet; unknown-outcome photo commit leaves
      unreferenced files; scroll hold is RNTL-only); #25 (stacked) swaps the first for the
      10-page gap limit. #24/#25 no longer edit README, so no README conflicts. Merge #24 before
      #26. Original: do not delete
      the README hardening bullet; replace it with precise remaining limitations: (1) chat
      reconnect recovers gaps up to N pages, larger gaps are flagged not auto-filled; (2) a photo
      replace whose DB commit outcome is unknown may leave unreferenced files on disk (no
      reconciliation job); (3) native scroll stability of chat history is RNTL-verified only.
      Put this in #26 (the last of the four to merge) so the bullet is coherent at every point.
- [x] **R6 `chore/scope3-reverify`** — done 2026-10-19, docs-only on `main`. Merged #27, #21, #19,
      #24, #26, #25 onto `c03d014` (#21 and #27 added: #21 isn't merged; S14's probe needs #27).
      746 mobile, 756 api, 6 PG/Redis; all four Codex probes pass. Original: after R1–R5: in a
      throwaway worktree merge
      #23,#28,#21,#22,#19,#24,#26,#25 in that order, run typecheck/lint/jest/pytest/
      tests_integration (real PG+Redis), and re-run Codex's four failed independent probes
      (70-message gap, cancellation, lock mutant ×5, next-hour/elapsed-start). All must pass.
      Record results in `docs/overnight/2026-10-19.md` under "Re-verification", docs-only on
      `main`. Then `[x]` S8/S11/S12/S13/S14 here with the repairing PR numbers.

## Later (not scoped)
- S7a–S7i Expo SDK upgrade — owner's go-ahead required.
- ~~S10d/S10e~~: closed by S10's measurement (with greenlet tracing, challenges 93% and events
  94%, both above the 80% target; see #23).
- Decide #15 (cryptography) and #20 (metro/image-size) — owner. Codex B3: #20 pulls accepts 1→2,
  mime-types 2→3, negotiator 0→1 (transitive majors); keep draft unless the no-major rule is
  explicitly waived.

## Log
- 2026-10-18 — scope created. S1 (#16): coverage/tsbuildinfo ignored, todo.md added.
- 2026-10-18 — S2 (#17): PORTFOLIO_FACTS 706 / 722 / 17 migrations.
- 2026-10-18 — S3 (#15): cryptography cap `<51` → 50.0.2; pip-audit clean. Draft, owner decides.
- 2026-10-18 — S4 (#18): ProfileScreen flake reproduced and fixed with beforeAll warm-up.
- 2026-10-18 — Working rules added: Opus for all implementation, Sonnet/Haiku for simple
  status/report tasks only; stop at a clean point when tokens run low.
- 2026-10-18 — Owner merged #16, #17, #18. #15 stays draft.
- 2026-10-19 — Scope 2 written: S5, S6, S7 split into S7a–S7i. Dropped the stale `.venv` item.
- 2026-10-19 — Scope 3 overnight run: S8 #21, S9 #22, S10 #23, S11 #24, S12 #25, S13 #26,
  S14 #27, S15 #28, all CI green and Codex-reviewed, none merged. Premises corrected: S8 (404),
  S9 (lock already tested), S10 (coverage artifact), S13 (oldest page), S14 (already shipped).
  S16: report `docs/overnight/2026-10-19.md`.
- 2026-10-19 — Codex independent verification of Scope 1–3: REQUEST_CHANGES. S8/S11/S12/S13/S14
  downgraded to [~]; Scope 4 (R1–R6) written. #23/#28/#22/#21 cleared for merge.
- 2026-10-19 — Scope 4: R1 #19, R2 #26+#25 (#25 now stacked on #26), R3 #24, R4 #27 (re-titled;
  in-house pickers kept), R5 #26+#25 README. R6 combined re-verification green; Codex's four
  failed probes pass. S8/S11–S14 ticked. Nothing merged; #21 found still open.
- 2026-10-19 — Owner merged #27, #19, #24, #26. #25 auto-closed unmerged (base branch deleted).
  #21 rebased onto `main` keeping `main`'s `todo.md`; CI green. R2 ticked on `main` (R1/R3/R4/R5
  arrived ticked with their PRs).
