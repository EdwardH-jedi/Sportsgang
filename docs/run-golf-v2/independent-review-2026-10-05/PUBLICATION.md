# Review publication and continuing workspace

The user authorized committing and pushing the completed review and repair handoff after the independent review finished. This is an evidence-only publication; the candidate's application code is unchanged.

| Item | Value |
|---|---|
| Continuing review branch | `codex/review-run-golf-v2-2026-10-05` |
| Continuing worktree | `/Users/edwardhwang/.codex/worktrees/sportsgang-review/Sportsgang` |
| GitHub branch | [review branch](https://github.com/EdwardH-jedi/Sportsgang/tree/codex/review-run-golf-v2-2026-10-05) |
| Publication parent / reviewed delivery | `59013601ae97b70a035f3abaae00c74edfa52e99` |
| Reviewed application source | `a9b92c2430456e1b0055436824c6ad6dfcd7c6e4` |
| Acceptance | **NEEDS_FIXES — 6 P2 and 1 P3** |
| Report / repair handoff | [REVIEW.md](REVIEW.md) / [REPAIR_HANDOFF.md](REPAIR_HANDOFF.md) |

`REVIEW.md` and `RESULT.json` describe the state at review completion. Their statements that artifacts were local and no commit/push had occurred are historical review-phase facts. This publication follows that snapshot; it does not rerun the review or change its verdict.

## Evidence integrity

The review report, repair handoff and publishable evidence were copied byte for byte from `/private/tmp/sportsgang-independent-review-20261005`. The original review worktree and its evidence remain intact. [publication-source-copy.json](evidence/publication-source-copy.json) records the copied file hashes and exclusions.

The three ignored Python `__pycache__` files are execution caches, not review evidence, and are excluded from GitHub. [review-run-manifest.original.sha256](evidence/review-run-manifest.original.sha256) preserves the original complete execution-directory inventory, including those local caches. `MANIFEST.sha256` is regenerated for the files actually published, excludes itself, and includes the original inventory and this publication note. Raw logs, screenshots, fixtures and reviewer probe sources are unchanged.

## Continuing commits

Use this worktree and branch for subsequent review/report/evidence commits. Preserve the existing dated review. For a later candidate or retest, add a new dated directory under `docs/run-golf-v2/`, pin its exact source/delivery SHA, retain original evidence and explicitly distinguish fresh results from inherited results. Any change in the application candidate should be reviewed in a separate disposable checkout; it must not silently modify this evidence publication's source baseline.

```bash
cd /Users/edwardhwang/.codex/worktrees/sportsgang-review/Sportsgang
git status --short
git branch --show-current
# Stage only the intended review artifacts after verifying evidence and hashes.
git add -- docs/run-golf-v2/<review-directory>
git diff --cached --name-only
git commit -m "docs(review): record candidate review and repair handoff"
git push
```

Keep commits scoped to review artifacts. Product implementation remains with the assigned repair owners in `REPAIR_HANDOFF.md`. No merge, deployment or timestamp rewrite is authorized by this publication. Operational and device release gates remain open.
