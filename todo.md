# todo.md — SportsGang working scope

Single source of truth for what is in scope *right now*. Read this first when resuming
after a pause. Update it in the same commit as the work.

_Last updated: 2026-10-19 00:20 (Sydney)._

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
- **State:** Scope 1 merged 2026-10-18 (#16 `081eedc`, #17 `558f52a`, #18 `9808341`).
  #15 (S3) is still a draft. Scope 2 is written below; nothing in it is started yet.
- **Next step (owner):** decide #15.
- **Next step (Claude):** S5, then S6. S7 is a split only — do not start any S7 item
  without the owner's go-ahead.
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
  - PostgreSQL/Redis integration (`apps/api/tests_integration/`) only runs in CI; no local docker.
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

- [ ] **S5 `docs/fsm-mutation-record`** — docs only. Re-run a hand-written mutation check of the
      booking FSM in `apps/api/app/services/bookings.py` (`_TRANSITIONS` edges and actors, the
      participant/actor guards, notification/reminder/rank side effects) against current `main`
      and record it in `docs/review/` next to the historical results from #10 and #14. Mutants
      run in a throwaway worktree, never on the branch. A surviving mutant is recorded as a
      finding, not fixed here — a test for it is a separate S-item.
- [ ] **S6 `fix/image-size-advisory`** — clear GHSA-5p2g-fcmc-qvqq and GHSA-w3rx-r6r6-pgpr (high,
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

## Later (candidates for Scope 3 — not scoped yet)
- Nothing yet. Scope 2 took the rest of the list; the Mac `.venv` rebuild item was stale (the
  venv is native arm64 and runs the suite).

## Log
- 2026-10-18 — scope created. S1 (#16): coverage/tsbuildinfo ignored, todo.md added.
- 2026-10-18 — S2 (#17): PORTFOLIO_FACTS 706 / 722 / 17 migrations.
- 2026-10-18 — S3 (#15): cryptography cap `<51` → 50.0.2; pip-audit clean. Draft, owner decides.
- 2026-10-18 — S4 (#18): ProfileScreen flake reproduced and fixed with beforeAll warm-up.
- 2026-10-18 — Working rules added: Opus for all implementation, Sonnet/Haiku for simple
  status/report tasks only; stop at a clean point when tokens run low.
- 2026-10-18 — Owner merged #16, #17, #18. #15 stays draft.
- 2026-10-19 — Scope 2 written: S5, S6, S7 split into S7a–S7i. Dropped the stale `.venv` item.
