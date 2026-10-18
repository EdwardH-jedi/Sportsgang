# todo.md — SportsGang working scope

Single source of truth for what is in scope *right now*. Read this first when resuming
after a pause. Update it in the same commit as the work.

_Last updated: 2026-10-18 23:50 (Sydney)._

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
- **State:** `main` @ `04be599`. Scope 1 is fully implemented; nothing is merged yet.
  Open PRs, all CI green: #16 (S1, carries this file), #17 (S2), #18 (S4), #15 (S3, draft).
- **Next step (owner):** merge #16 → #17 → #18, decide #15.
- **Next step (Claude, after merges):** pick Scope 2 from "Later" below, write it up here
  as S-items *before* touching code, then start.
- **Environment limits:**
  - The linked-computer shell has no `gh`, no `docker`, no GitHub push credentials, and its
    `apps/api/.venv` may be built for another OS. Do **not** `uv sync` over it.
  - PR work runs from the cloud clone at `/home/claude/sportsgang` (has `gh` + push). If the
    clone is gone, re-clone shallow. The repo is now `EdwardH-jedi/Sportsgang` (old lowercase
    URL redirects). `gh pr create` fails (GraphQL blocked) — use
    `gh api repos/EdwardH-jedi/Sportsgang/pulls -f base=main -f head=<branch> -f title=... -F body=@file`.
  - PostgreSQL/Redis integration (`apps/api/tests_integration/`) only runs in CI; no local docker.
  - A stop hook may warn "unpushed commits / no remote branch" on a freshly pushed branch in
    the shallow clone. Check `git ls-remote origin <branch>` first; if it matches HEAD, it's
    a false alarm — just `git push -u origin <branch>`.

## Scope 1 — "post-audit cleanup" (small, safe, no behaviour change) — DONE, awaiting merge
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

## Needs the owner
- Merge #16, #17, #18. Decide #15.
- `LICENSE` choice.
- Deleting stale remote branches (52 remote refs; list in a PR comment first, delete only on approval).

## Later (candidates for Scope 2 — not scoped yet)
- Expo SDK upgrade (clears most of the npm "high" findings; large — would need its own
  S-item split before starting).
- `image-size` npm finding.
- Record the booking-FSM mutation-check result in `docs/review/`.
- `apps/api/.venv` on the Mac: rebuild for macOS so the local shell can run pytest again.

## Log
- 2026-10-18 — scope created. S1 (#16): coverage/tsbuildinfo ignored, todo.md added.
- 2026-10-18 — S2 (#17): PORTFOLIO_FACTS 706 / 722 / 17 migrations.
- 2026-10-18 — S3 (#15): cryptography cap `<51` → 50.0.2; pip-audit clean. Draft, owner decides.
- 2026-10-18 — S4 (#18): ProfileScreen flake reproduced and fixed with beforeAll warm-up.
- 2026-10-18 — Working rules added: Opus for all implementation, Sonnet/Haiku for simple
  status/report tasks only; stop at a clean point when tokens run low.
