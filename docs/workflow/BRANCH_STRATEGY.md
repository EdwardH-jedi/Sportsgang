# Protin — Branch Strategy

---

## Overview

All development happens on feature branches. `main` is the integration branch that feeds the home staging server. There is no separate `develop` branch — keep the model simple.

```
feature/...  →  PR  →  main  →  deploy to home staging server
```

---

## Branch naming

Use the format: `{type}/{short-description}`

| Type | When to use | Example |
|---|---|---|
| `feature/` | New user-facing functionality | `feature/booking-status-filter` |
| `fix/` | Bug fixes | `fix/booking-time-utc-offset` |
| `chore/` | Maintenance, deps, config | `chore/update-alembic-deps` |
| `docs/` | Documentation-only changes | `docs/workflow-runbook` |
| `wave/` | Multi-file wave deliverables | `wave/8-workflow-docs` |

Rules:
- Use `kebab-case` in the description. No spaces, no slashes beyond the prefix.
- Keep descriptions short (3–5 words is enough).
- One concern per branch. Do not bundle unrelated changes.

---

## Working on a branch

```bash
# Start from an up-to-date main
git checkout main
git pull

# Create and switch to your branch
git checkout -b feature/my-change
```

Commit often. Commit messages should be imperative and concise:
- `add booking status filter on GET /bookings`
- `fix BookingComposer UTC offset on time submission`
- `update QA checklist with push notification step`

Do not commit `.env`, `.env.staging`, or any credential files. These are in `.gitignore` — check before staging.

---

## Merging to main

- Merge only via a reviewed and approved PR (see `PR_WORKFLOW.md`).
- Squash commits if the branch history is noisy; preserve meaningful commit chains if they tell a clear story.
- Delete the branch after merge.
- Do not commit directly to `main`.

---

## Staying current

Rebase your branch on `main` before opening a PR, or if `main` has advanced significantly during your work:

```bash
git fetch origin
git rebase origin/main
```

Resolve conflicts locally before the PR is opened. Do not merge `main` into your branch — prefer rebase to keep a clean history.

---

## Hotfixes

Hotfixes follow the same flow (`fix/` branch → PR → merge to `main`). There is no separate hotfix branch. If staging is broken and you need to move fast:

1. Cut a `fix/` branch from `main`.
2. Open a PR, get at minimum a quick Claude Code Review pass.
3. Merge and deploy immediately via `bash infra/scripts/deploy.sh --build` on the home staging server.
