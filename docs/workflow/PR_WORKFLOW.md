# Protin — PR Workflow

---

## When to open a PR

Open a PR when:
- A feature or fix is complete and locally tested.
- The branch is rebased on current `main` with no conflicts.
- You are ready for a code review pass.

Do not open draft PRs just to back up work. Use your remote branch for that.

---

## PR checklist

Before marking a PR ready for review, confirm:

- [ ] Branch is rebased on current `main`
- [ ] No `.env` or credential files staged
- [ ] Code compiles / type-checks (`npm run typecheck` in `packages/shared-types` if types changed)
- [ ] Manual smoke test done locally (or on staging) for the changed flows
- [ ] PR description explains **what** changed and **why** (one short paragraph is enough)
- [ ] Ownership boundaries respected — no edits outside your wave's scope

---

## Review sequence

Every PR follows this sequence before merge:

```
1. Claude Code Review   — automated review against the codebase
2. Fix findings         — address blockers; note intentional skips
3. Codex final review   — second-pass sign-off
4. Merge to main
5. Deploy to RX6600     — run deploy.sh on the server
```

### 1. Claude Code Review

Run Claude Code Review on the open PR and triage its findings as blocking, advisory or style.

### 2. Fix findings

Resolve all findings rated **blocking**. For findings rated **advisory** or **style**:
- Fix them if it takes less than a few minutes.
- Document skipped findings in a PR comment explaining why.

Push fixes to the same branch. Do not open a new PR.

### 3. Codex final review

After Claude Code Review findings are addressed, request a Codex final review. Codex confirms:
- The PR is coherent and safe to merge.
- No new issues were introduced by the fix commits.

Codex sign-off is required before merge. A simple "LGTM" or "approved" comment from Codex is sufficient.

### 4. Merge

Merge using the platform's merge button (squash or merge commit — team preference). Delete the branch after merge.

### 5. Deploy

On the RX6600:
```bash
git pull
bash infra/scripts/deploy.sh --build
curl http://localhost/health
```

If health check fails after deploy, see the Rollback section in `docs/staging/RUNBOOK.md`.

---

## PR description template

```
## What
One sentence describing the change.

## Why
One sentence or a short bullet list explaining the reason.

## How to test
Steps to manually verify the change on staging or locally.

## Skipped review findings (if any)
- [FINDING-ID] Reason for skipping
```

---

## Merge without full review (emergency only)

If staging is actively broken and a hotfix must land immediately:
- Claude Code Review is still required (it is fast).
- Codex review may be skipped — note this in the PR.
- The person merging takes responsibility for the change.
