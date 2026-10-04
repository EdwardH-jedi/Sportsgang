# Overnight 2026-10-05 — resume context

Read this first after compaction or interruption.

## Identity
- Base delivery `8d891ddb862de5345e85895a20fa65649ba1f46e` (branch `chore/run-golf-v2-release-candidate-2026-10-04`), last source `a515b0073cb0f32dad97f88430a203e3427444fe`.
- Morning review publication `ce62aac` (branch `review/run-golf-v2-morning-acceptance-2026-10-04`); earlier app candidate `8b34bca`.
- Work branch `fix/run-golf-v2-overnight-2026-10-05`, worktree `.claude/worktrees/run-golf-v2-overnight`.
- Preserve: `feat/run-first-ui` (fc3fb14, not merged), human QA `sportsgang-qa` (8130/8190/55470/56470), previous candidate QA `sg-rc-20261004-qa` (8163/8263/55663/56663) and its preview 5196, old preview 5187, simulators other than this task's, all review worktrees.

## This task's resources (unique)
- Disposable PG/Redis for integration: `sg-on-20261005-pg` 55671, `sg-on-20261005-redis` 56671 (private env in scratchpad).
- R6 fixtures PG: `sg-on-20261005-r6` 55681.
- Web checks preview: 5206 (temporary); final preview 5207 (detached).
- Final QA project: `sg-on-20261005-qa` API 8173, Metro 8273, PG 55673, Redis 56673, owner home `.qa/owner-home` in this worktree.
- Dedicated simulator: "SportsGang Overnight 20261005" (UDID recorded once created).

## Decisions so far
- Codex CLI is not installed; independent review cannot run (W0/W4 BLOCKED). No self-review is presented as acceptance.
- MA-A/B/C API behaviour is retained unchanged unless a defect is reproduced.

## Progress log
- 03:16 AEDT — setup done; plan files written.
