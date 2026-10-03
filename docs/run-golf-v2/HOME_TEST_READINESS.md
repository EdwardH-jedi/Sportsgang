# Run + Golf v2 — home acceptance-test readiness

Author: Claude (implementer). Everything here is **implementer
verification**, not an independent review; `CODEX_REVIEW_AFTER_FIXES.md`
does not exist yet and is not written by this task.

## 0. Checkpoint

| Item | Value |
| --- | --- |
| Status | in progress |
| Phase | C — native checks in progress (picker a11y fixed + verified natively) |
| Branch / worktree | `chore/run-golf-v2-home-test-ready` in `.claude/worktrees/run-golf-v2-home-test` |
| Base | `origin/fix/run-golf-v2-review-fixes` = `07893825ffa4250a400608f81605d474ad62558b` (last app-source commit `a599c4f`) |
| Next action | native moderation (report/block/unblock/delete), offline/retry, iPhone 17 Pro layout; then runbook, PRETEST_VERIFICATION.md, final checks, push |

## 1. Phase A — starting state (2026-10-03 17:56 AEST)

| Item | Value |
| --- | --- |
| origin | `https://github.com/EdwardH-jedi/Sportsgang.git` |
| `origin/fix/run-golf-v2-review-fixes` after fetch | `0789382` — no commits after the observed repair HEAD |
| `origin/feat/run-golf-v2` / `origin/main` | `541f035` / `edfb30f` (repair not merged) |
| Launch checkout | `feat/run-first-ui` @ `ffca063`, untracked `codex-review-prompt.md`, `docs/run-golf-v2/`, `todo.md` — untouched |
| Other worktrees | `.claude/worktrees/run-golf-v2` (`feat/run-golf-v2` @ `541f035`), `.claude/worktrees/run-golf-v2-fixes` (`fix/run-golf-v2-review-fixes` @ `0789382`, clean) — untouched |
| New task worktree | `.claude/worktrees/run-golf-v2-home-test`, branch `chore/run-golf-v2-home-test-ready` from `0789382`, inherited tracking removed |
| Dependencies | `npm ci` exit 0, `uv sync --frozen --dev` exit 0 (lockfiles unchanged) |
| Review status | `CODEX_REVIEW.md` = NEEDS_FIXES (historical); `FIX_IMPLEMENTATION_REPORT.md` = READY_FOR_CODEX_REVIEW; no after-fix Codex review present |

Previously completed (per `FIX_IMPLEMENTATION_REPORT.md`, re-verified in
§2): F1–F8 repairs with regressions; CI green on `417fa28` and `0789382`.
Previous verification services were torn down; none of their databases,
ports, processes or fixture IDs are assumed to exist.

Environment: macOS 26.5.1, Xcode 26.6, Node 26.7.0, uv 0.11.15, Docker
29.4.0 (OrbStack engine). Booted simulators: iPhone 17 Pro (iOS 26.3,
`EC0E6542-…`) and iPhone 16e (iOS 26.3, `3D2AF32A-…`), Expo Go 54.0.7
installed. `axe` 1.8.0 for simulator automation. Mac LAN address
`192.168.1.105` (en0). No code-signing identities (`security
find-identity` → 0), so no local dev-client/device build; a paired iPhone
("iPhone17,3") is listed by `devicectl` as *unavailable* (not connected).
Ports already in use by other processes (not touched): 8000, 8765, 8802,
3999, 5000, 7000.

Known gaps carried in: native report/block/delete and offline/one-source
failure not exercised; only iPhone 16e re-run; picker accessibility
observation; Apple sign-in, real push, physical device, dev-client
unverified.

## Progress log (checkpoint)

- QA stack: `npm run qa:up` / `qa:status` / `qa:seed` / `qa:restart` / `qa:down` / `qa:reset -- --yes`
  implemented in `scripts/qa/`; lifecycle verified (`pretest-evidence/qa-lifecycle.log`).
- Base re-verification on `0789382`: API 751, integration 22 (fresh PG), mobile 867, probe 7/7 ×2 TZ
  (`pretest-evidence/`).
- Picker accessibility: reproduced aggregated AX element natively (`native/a11y-before-birth-year.json`),
  fixed in `Select.tsx`, regression `Select.test.tsx` (4/5 fail on the old component), verified
  natively (`native/a11y-after-birth-year.json`: each option a Button, trigger value exposed, Close button).
- Partial onboarding resume: after Step 1 + relaunch the user lands in Explore with the
  "Set up your running preferences" prompt (documented contract).
- Moderation: report from partner detail works natively (honest "Report submitted"; `POST /reports` 201).
  Found: the partner-detail button read "Report or block" but only opened the report form (no block
  path from Explore). Fixed: separate "Report" and confirmed "Block" (`lib/safety.blockUser`), card dropped
  from the feed on success, error kept on failure; regressions in `PartnerDetailScreen.test.tsx`.
  Next: native block → unblock → account deletion as QA Mod Target.
