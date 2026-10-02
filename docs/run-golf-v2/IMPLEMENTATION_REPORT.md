# Run + Golf v2 — implementation report

Status: IN_PROGRESS (Wave 0 complete; updated per wave)

## 1. Workspace

| Item | Value |
| --- | --- |
| Repository | origin `https://github.com/EdwardH-jedi/Sportsgang.git` (verified) |
| Worktree | `/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/.claude/worktrees/run-golf-v2` |
| Branch | `feat/run-golf-v2` (no upstream configured; nothing pushed) |
| Inspected baseline (todo.md) | `edfb30fe48eddda76ebc9f347581641f3550ed44` |
| Implementation base | `edfb30fe48eddda76ebc9f347581641f3550ed44` = `origin/main` after `git fetch origin` on 2026-10-03 03:21 AEST (fetch succeeded, remote freshness verified) |

### Decisions recorded at Wave 0

- **Base is `origin/main`, not the launch checkout's branch.** The session was
  launched from the main checkout on local branch `feat/run-first-ui`
  (HEAD `ffca063`), which carries 55 local, unpushed commits (Run/Crews tab
  shell, crews, geo discovery, theme v2, deletion of `apps/web`, archive of
  docs/harness). todo.md §3 asks for a branch "from the latest verified main",
  and that branch also changes the marketing web app and harness, which are
  out of scope here. It was **not merged, cherry-picked or borrowed from**,
  and is untouched at `ffca063`. Local `main` (`e8ad7e3`) is also divergent
  from `origin/main`; it was not used.
- The main checkout's untracked `todo.md` was copied (not moved) into this
  worktree and committed here so the morning review reads the same brief.
- No reset/clean/stash was performed anywhere. Existing worktrees: only the
  main checkout.

## 2. Baseline checks (commit `edfb30f`, before any change)

Logs: `/private/tmp/claude-501/-Users-edwardhwang-Desktop-github-repo-only-Sportsgang/3af73a02-e74e-4247-8cf5-bd7eb405041e/scratchpad/logs/baseline-*.log`

| Command | Exit | Count |
| --- | --- | --- |
| `npm ci` (root) | 0 | — |
| `npm run lint --workspace @protin/mobile` | 0 | — |
| `npm run typecheck --workspace @protin/mobile` | 0 | — |
| `npm run typecheck --workspace @protin/shared-types` | 0 | — |
| `npm run test:ci --workspace @protin/mobile -- --runInBand` | 0 | 53 suites, 747 tests passed |
| `uv sync --frozen --dev` (apps/api) | 0 | — |
| `uv run ruff check .` | 0 | — |
| `uv run ruff format --check .` | 0 | — |
| `uv run pytest -q` | 0 | 620 passed |
| `uv run alembic upgrade head` (disposable PG, fresh) | 0 | head = 0015 |
| `uv run pytest tests_integration -q` (disposable PG + Redis) | 0 | 1 passed |

No baseline failures, so any later failure is a regression of this work.

## 3. Disposable integration environment

- Docker daemon: OrbStack (`DOCKER_HOST=unix://$HOME/.orbstack/run/docker.sock`);
  the user's default Docker Desktop context was not running and was not changed.
- Compose project `sg-rungolf-v2` (file kept in the session scratchpad, not in
  the repo): `postgres:16-alpine` on `127.0.0.1:55432` with tmpfs data,
  database `rg2_verify`; `redis:7-alpine` on `127.0.0.1:56379`. Throwaway
  credentials. Port 8000 on the host was already in use by something else and
  was left alone.
- Env used for every API integration command: `APP_ENV=local`,
  `SECRET_KEY=<throwaway>`, `POSTGRES_URL=postgresql://rg2:…@127.0.0.1:55432/rg2_verify`,
  `REDIS_URL=redis://127.0.0.1:56379/0`. No `.env` file exists in the
  worktree; no production/Fly URL was used.

### Legacy data seeded at schema 0015 (for the upgrade check)

Seeded through the public API before migration 0016 existed: 2 users with
profiles + identity preferences, legacy golf and running `sport_profiles`
(level/time/golf_club/goals only), a mutual golf match, a message, a
confirmed booking and a basketball event with a joiner (plus the baseline
integration test's gym match + booking). Snapshot:
`scratchpad/legacy-snapshot-0015.txt`; ids: `scratchpad/legacy-seed.json`.

## 4. Progress by wave

- Wave 0: complete (this section).
- Wave 1–5: pending.
