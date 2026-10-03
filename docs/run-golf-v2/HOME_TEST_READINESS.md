# Run + Golf v2 — home acceptance-test readiness

Author: Claude (implementer). Everything here is **implementer
verification**, not an independent review; `CODEX_REVIEW_AFTER_FIXES.md`
does not exist yet and is not written by this task.

## 0. Status: READY_FOR_LOCAL_MANUAL_TEST

The local stack runs and the automated prerequisites are verified. This does
**not** mean App Store/release readiness or provider verification; see §5.

| Item | Value |
| --- | --- |
| Branch / worktree | `chore/run-golf-v2-home-test-ready` in `.claude/worktrees/run-golf-v2-home-test` |
| Base | `origin/fix/run-golf-v2-review-fixes` = `07893825ffa4250a400608f81605d474ad62558b` |
| Final app/API source | `5b154b9` (every later commit is docs/evidence only); pushed HEAD and CI in §6 |
| Running now | QA API `127.0.0.1:8130` + Metro `8190` (simulator mode) + `sportsgang-qa` containers; QA Alice signed in on iPhone 16e |
| Start / recover | `npm run qa:up` · status `npm run qa:status` · runbook `HOME_TEST_RUNBOOK.md` |
| Credentials / manifest | `.qa/credentials.json` · `.qa/manifest.json` (git-ignored, mode 600 / dir 700) |
| Review status | implementer verification only (`PRETEST_VERIFICATION.md`); no independent or Codex review was run |

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

## 2. Progress log

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
- Native block → unblock (iPhone 16e, QA Alice → QA Mod Target): confirm alert, `POST /blocks` 201, card gone;
  Profile › Blocked users → Unblock → `DELETE /blocks` 204; Mod back after pull-to-refresh.
  Found: the Blocked users list showed the raw user id ("Unblock 21c94630-…"; pre-existing since `aa043f4`).
  Fixed (`3aaab6d`): `GET /blocks` adds `blocked_display_name` (outer join, null without a profile; shared-types
  synced), screen shows the name or "Unnamed member"; regressions in `test_safety.py` and
  `BlockedUsersScreen.test.tsx` (6/10 fail on the old screen). Re-verified natively: "Unblock QA Mod Target".
- Account deletion (QA Mod Target): Profile › Delete my account → confirm → `DELETE /auth/me` 204 → welcome screen;
  login again → "Invalid credentials" (`POST /auth/login` 401). `npm run qa:seed` recreated the account.
- Outsider/deleted access via API (`pretest-evidence/outsider-access.txt`): deleted token 401; Cara reading/posting in
  the Alice–Bob chat 403; Cara/Dan reading/confirming/cancelling others' bookings 404.
- Launcher: `qa:restart` left Expo Go on the old JS bundle (it only re-opened the URL). Fixed: the open step quits
  Expo Go first (sign-in persists).
- Network (QA API stopped = server unreachable): My Plans keeps earlier rows. Found: with both sources failing it
  showed two notices each claiming the other source was "still shown". Fixed (`c97ef9a`): one notice
  "Couldn't refresh your plans. Showing what was loaded earlier."; per-source refresh copy; regressions in
  `MyPlansScreen.test.tsx` (2 fail on the old screen). Found: booking detail offline was a dead end (red text, no Back,
  no retry). Fixed (`a2f2186`): header kept + shared error state with Try again; regression in
  `BookingDetailScreen.test.tsx`. Re-verified natively: error with Back/Try again → API restarted → Try again loads.

## 3. QA stack (Phase D/E)

- **Launcher:** `scripts/qa/qa.py` (stdlib only) and `scripts/qa/compose.qa.yml`.
  - npm scripts: `qa:up`, `qa:status`, `qa:seed`, `qa:open`, `qa:down`, `qa:restart`, `qa:stop-api`, `qa:reset`.
  - Compose project `sportsgang-qa`, DB `sportsgang_qa`, named volume `sportsgang-qa_pgdata`. Ports on 127.0.0.1: PG 55470, Redis 56470, API 8130, Metro 8190; a busy port is skipped.
  - Credentials are generated into `.qa/config.env`, which is ignored.
  - Processes are detached and tracked by PID plus a command-line marker; only owned processes are ever stopped.
- **Lifecycle verified** (`pretest-evidence/qa-lifecycle.log`):
  - up → status → repeated up (same PIDs) → repeated seed (adds 0) → down (volume kept) → up → status: same counts.
  - Since then: `qa:restart` ×3, `qa:stop-api` → `qa:up -- --no-open --no-seed` (API only), and device mode → simulator mode switch (`qa-device-mode.log`).
- **Backend target:**
  - `qa:status` reads the app config Metro actually serves and requires its `apiUrl` to equal the QA API.
  - Metro is started with inherited `EXPO_PUBLIC_*` removed, so the app cannot silently target a remote backend.
- **Fixtures** (`scripts/qa/seed_qa.py`): 8 accounts (Alice, Bob, Cara, Dan, Fern, Eve, Newbie, Mod Target).
  - Sessions: run with spots, golf with one place, full run, cancelled run, and 22 paging runs.
  - Social graph: an Alice↔Bob match + message, a pending and a confirmed 1:1 booking.
  - History: 55 + 55 past rows.
  - Counts: `qa_users 8, qa_sessions 81, qa_bookings 57, history 55`, migration 0016.
  - Seeding is idempotent and keeps tester edits. It works within the real rate limits by backing off; no limits are disabled.

## 4. Final verification (Phase G) — HEAD `5b154b9`

| Check | Exit | Result | Evidence |
| --- | --- | --- | --- |
| Fresh disposable PG 16 + Redis 7 (`claude-sg-pretest`, tmpfs, recreated) → `alembic upgrade head` | 0 | 0001 → 0016 | `final-migrate-fresh.log` |
| `uv run pytest tests_integration -q` | 0 | 22 passed, 0 skipped | `final-integration.log` |
| `uv run ruff check .` / `ruff format --check .` | 0 / 0 | clean | `final-ruff-*.log` |
| `uv run pytest -q` | 0 | 752 passed, 0 skipped | `final-api-pytest.log` |
| mobile `lint` / `typecheck`; shared-types `typecheck` | 0 / 0 / 0 | clean | `final-mobile-*.log`, `final-shared-types-typecheck.log` |
| `npm run test:ci --workspace @protin/mobile -- --runInBand` | 0 | 878 passed, 62 suites, 0 skipped | `final-mobile-tests.log` |
| `expo export --platform ios` | 0 | Hermes bundle 4.41 MB (bundle only, not native execution, not a release build) | `final-ios-export.log` |

- The new regressions are collected by the normal suites: `Select.test.tsx`, `PartnerDetailScreen.test.tsx`, `BlockedUsersScreen.test.tsx`, `MyPlansScreen.test.tsx`, `BookingDetailScreen.test.tsx` and `test_safety.py`.
- Native evidence is listed in `PRETEST_VERIFICATION.md` §7.
- The running QA stack serves the final source; `qa:status` prints the SHA.

## 5. Pending manual and provider checks

| Check | Status |
| --- | --- |
| Runbook scenarios 1–13 by a human | pending (you) |
| Sign in with Apple | BLOCKED: needs a signed build; no signing identities |
| Push delivery | BLOCKED: needs a physical device + dev build + Expo push credentials |
| Physical iPhone | not run: paired iPhone was unavailable; LAN mode is prepared and was checked from a simulator |
| Release/dev-client build | not run: no remote EAS builds by instruction, no local signing |
| My Plans one-source failure natively | not prepared; Jest only |
| Naive timestamps (Chats list time) | found, not fixed: needs a migration decision (`PRETEST_VERIFICATION.md` §3) |

## 6. Push, CI and hand-over state

| Item | Value |
| --- | --- |
| Pushed | `chore/run-golf-v2-home-test-ready` (upstream set; normal pushes only, no force) |
| CI on `4894f6f` (last app/API/launcher change + docs) | success — lint, typecheck, lint-mobile, test, test-mobile, PostgreSQL and Redis booking journey, docker-build: https://github.com/EdwardH-jedi/Sportsgang/actions/runs/37111312458 |
| CI on earlier heads | `3d6bcf8`, `60d7c12`, `ff2fb3b`, `5302f44`: success |
| QA data | `npm run qa:reset -- --yes` run at 18:56 AEST so `qa.newbie` is profile-less again; reseeded 8 accounts / 81 sessions / 57 bookings / 55 history (`pretest-evidence/qa-reset.log`) |
| Left running | QA stack on source `4894f6f` (`npm run qa:status` → all OK); Expo Go open on both simulators |
| Stopped | temporary verification services `claude-sg-pretest` (tmpfs; `compose down`, no volume flag) |
| Untouched | `feat/run-first-ui` checkout and its untracked files, the other worktrees, other databases/ports/processes |
