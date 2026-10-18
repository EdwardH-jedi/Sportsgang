# todo.md — SportsGang working scope

Single source of truth for what is in scope *right now*. Read this first when resuming
after a pause (token limit, session end). Update it in the same commit as the work.

_Last updated: 2026-10-18 (Sydney)._

## Resume here
- **State:** `main` = `origin/main` @ `04be599`. Open PRs: #15 (draft, cryptography). Nothing else in flight.
- **Next item:** S2 (below).
- **Environment limits (check before planning):**
  - The linked-computer shell has no `gh`, no `docker`, no GitHub push credentials, and its
    `apps/api/.venv` may be built for another OS. Do **not** `uv sync` over it.
  - PR work (branch → push → `gh pr create` → `gh pr checks --watch` → squash-merge) runs from a
    fresh clone in the cloud workspace, which has `gh` and push access.
  - PostgreSQL/Redis integration (`apps/api/tests_integration/`) only runs in CI; no local docker.

## Scope 1 — "post-audit cleanup" (small, safe, no behaviour change)
Goal: leave `main` clean and the portfolio facts accurate after the 2026-10-17/18 overnight runs.
Out of scope: new features, Expo SDK upgrade, schema changes, anything behavioural.

Rules for every item: one branch + one PR, branch from fresh `main`, verify with
`npm run typecheck -w @protin/mobile && npm run lint -w @protin/mobile` and
`cd apps/api && uv run pytest tests -q`, wait for CI green, squash-merge, then tick the box
and add the PR number here.

- [x] **S1 `chore/repo-hygiene`** (done in this PR; verified: typecheck, lint, 706 api tests) — ignore `apps/api/.coverage`; untrack and ignore
      `packages/shared-types/tsconfig.tsbuildinfo` (tracked today, rewritten by every typecheck).
      Commit this `todo.md`. No code change.
- [ ] **S2 `docs/facts-actuals`** — `docs/PORTFOLIO_FACTS.md` still says 686 backend tests /
      16 migrations. Actuals after #13/#14: **706 backend, 722 mobile, 17 migrations
      (linear 0001→0017)**. Re-verify the numbers by running them, datestamp "as of 2026-10-18".
      Check README for the same drift.
- [ ] **S3 `chore/cryptography-bump` (PR #15, draft)** — current cap `<50` leaves one high
      (GHSA-g6cj-pr64-35w5, PKCS7 decrypt oracle, fixed in 50.0.0). Proposed change: cap `<51`
      (locks 50.0.2); audit notes 693 tests pass and pip-audit is clean. Update the branch,
      re-run the full suite plus `tests/test_apple_auth.py` and `tests/test_auth.py`, pip-audit
      must show 0 high. **Merge is the owner's call** — leave the PR ready, do not merge.
- [ ] **S4 `test/profile-screen-flake`** — `ProfileScreen › renders the display name after
      profile loads` timed out once at Jest's 5000 ms in CI (#14). Reproduce, find the slow
      await, fix the test (not by raising the timeout blindly). Skip if it cannot be reproduced
      after 20 local runs; record that here.

## Needs the owner (do not do unattended)
- Merge decision for S3 (major-version `cryptography` jump).
- `LICENSE` choice.
- Deleting stale remote branches (52 remote refs; list them in a PR comment first, delete only on approval).

## Later (not scoped)
- Expo SDK upgrade (clears most of the npm "high" findings; large, separate scope).
- `image-size` npm finding.
- Record the mutation-check result for the booking FSM in `docs/review/`.

## Log
- 2026-10-18 — scope created. S1 done: `.coverage` / `*.tsbuildinfo` ignored, tsbuildinfo untracked.
