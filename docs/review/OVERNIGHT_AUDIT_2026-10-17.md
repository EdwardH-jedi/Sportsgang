# Overnight audit — 2026-10-17

**Verdict: main execution gate PASS; unattended-run scope compliance FAIL (B1).**

Audited GitHub `EdwardH-jedi/Sportsgang` and a fresh detached checkout of `origin/main` at `62a4f85f1039c7c68b5bd14375994f7045781a3c`. Live `git ls-remote` matched before and after verification. Pre-run baseline: `1ac1c68`. The three requested ground-truth commands ran before reading the overnight report. PR states and CI conclusions came from GitHub, not the report.

## 1. Claims versus actual

| Task | Report claims | Actual PR state / merged commit | Match? |
|---|---|---|---|
| T1 | #6 merged; 13 removals; reversible 0016 migration; green CI | MERGED `16fb21141989a47723938a886f6138e11f8c55f7`; 13/13 listed deletions; PostgreSQL up/down/up PASS; CI successful | Yes for execution/deletion claims; three stale model descriptions remain (N1). |
| T2 | #7 merged; 21 replacements in seven files; identifiers unchanged | MERGED `c18b0026d2c772162d1c2b7846d8fcb6c785a594`; exact replacement/file counts match; identifier files unchanged | Yes; stale display-name documentation remains (N3). |
| T3 | #8 merged; six highlights; three-command start; four caveats retained; 24 link targets resolve | MERGED `a428ba8139dc3926a2813a6cda1c08b0ccf7dafa`; structure and links PASS; four T3 caveats preserved | Yes within #8; pre-run comparison finds one caveat deleted by #6 (N2); canonical facts need reconciliation (S3). |
| T4 | #9 merged; patch/minor-only lockfile changes; npm 80→68; Python 51→10 records / six advisories | MERGED `faf31534dfa183bbd831b1fa228468f0d23a615e`; current npm 68 and Python 10/six reproduce; transitive `@expo/json-file` 10→11 | **No: B1 violates the no-major rule.** Historical before-audit totals were not rerun. |
| T5 | #10 merged; 87 pure tests; 686 total; module branch coverage 93%→93% | MERGED `22866fc21640769d4c7b2bcb783c229fa72d8273`; 87/686 PASS; full coverage 93%; excluding new test contexts also 93% | Yes for measured counts/coverage; pure matrix and assertion issues S1–S2. Historical mutation experiment not rerun. |

All five PRs have successful recorded CI checks. Earlier 599-test/722-Jest/integration-one results are historical PR claims, not newly executed results in this audit.

## 2. Findings

### Blocker

- **B1 — Transitive major upgrade escaped the patch/minor boundary.** [package-lock.json:2091](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/package-lock.json:2091) and [package-lock.json:2100](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/package-lock.json:2100): `@expo/package-manager` 1.10.4→1.14.2 changes its `@expo/json-file` requirement from `^10.0.13` to `^11.2.1`; its resolved dependency changes from hoisted 10.0.13 to nested 11.2.1. Comparing only unchanged lockfile locations misses this. PR #9's “all patch/minor” claim and overnight “NO BLOCKERS” verdict are therefore incorrect under this audit's explicit rule. **Fix:** select a compatible package-manager version retaining json-file 10, regenerate the lockfile, and rerun the gate; handle major 11 in a separately authorized change.
- **B2 — Open draft #3 collides with main's Alembic revision.** [PR #3 migration:18](https://github.com/EdwardH-jedi/Sportsgang/blob/f20c10200d37663ac23d6c2f9a3729fbad7e49f1/apps/api/alembic/versions/0016_security_integrity.py#L18) declares `0016` with parent `0015`, already used by [apps/api/alembic/versions/0016_drop_tournaments.py:18](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/api/alembic/versions/0016_drop_tournaments.py:18). GitHub also reports `CONFLICTING`. This blocks #3, not the current main migration chain. **Fix:** rebase #3 and assign its new migration a unique successor revision before rerunning PostgreSQL validation.

### Should-fix

- **S1 — The new pure tests do not pin the whole permitted matrix.** [apps/api/tests/test_booking_fsm.py:33](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/api/tests/test_booking_fsm.py:33) lists six valid edges, but no new test exercises `proposed→declined` or `confirmed→completed`; proposer rejection for `proposed→confirmed/declined` is also absent. Five of 72 state-pair/participant combinations remain untested in this file. Existing API tests cover the omitted edges, so this is a pure-test gap, not a demonstrated product failure. **Fix:** parameterize all six valid edges across both participants through the service boundary.
- **S2 — Tests freeze undocumented wording and private seams.** [apps/api/tests/test_booking_fsm.py:62](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/api/tests/test_booking_fsm.py:62), [apps/api/tests/test_booking_fsm.py:64](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/api/tests/test_booking_fsm.py:64), [apps/api/tests/test_booking_fsm.py:154](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/api/tests/test_booking_fsm.py:154), [apps/api/tests/test_booking_fsm.py:175](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/api/tests/test_booking_fsm.py:175) directly call `_check_transition`, replace three private helpers, and require exact exception prose. The wording is “documented” only in the new test's own docstring/current implementation, not an independent API contract; [.claude/skills/booking-fsm/SKILL.md:15](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/.claude/skills/booking-fsm/SKILL.md:15) still names `pending_partner` and omits proposed cancellation. **Fix:** assert public status/state/side-effect behavior and document stable error codes; update the FSM contract before pinning exact text.
- **S3 — Portfolio facts still disagree with the audited product.** [docs/PORTFOLIO_FACTS.md:10](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/PORTFOLIO_FACTS.md:10) and [docs/PORTFOLIO_FACTS.md:37](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/PORTFOLIO_FACTS.md:37) promise court/venue booking while [README.md:207](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/README.md:207) explicitly disclaims facility reservations. Facts at [docs/PORTFOLIO_FACTS.md:140](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/PORTFOLIO_FACTS.md:140) and [docs/PORTFOLIO_FACTS.md:150](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/PORTFOLIO_FACTS.md:150) still say approximately 620 backend tests and 15 migrations; main has 686 tests and 16 migrations. The new “linear chain” claim at [README.md:9](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/README.md:9) is source-verified but absent from the canonical facts. **Fix:** describe participant session coordination with venue attachment, refresh/datestamp counts, and record the linear migration chain in Portfolio Facts.

### Nit

- **N1 — Three comments describe a deleted model as current.** [apps/api/app/models/event.py:48](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/api/app/models/event.py:48), [apps/api/app/services/events.py:4](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/api/app/services/events.py:4), [packages/shared-types/src/event.ts:4](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/packages/shared-types/src/event.ts:4) still contrast Event with capitalized/backticked `Tournament`. These are obsolete model references, unlike explicitly future taxonomy examples. **Fix:** remove the nonexistent model comparison or label it as a historical/conceptual distinction.
- **N2 — The pre-run README caveat was deleted, not moved.** [Pre-run README:181](https://github.com/EdwardH-jedi/Sportsgang/blob/1ac1c68/README.md#L181) contains the sentence ending “tournament rank integration are unfinished”; #6 removes it and current Limitations does not retain it. [docs/overnight/2026-10-17.md:30](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/overnight/2026-10-17.md:30) is accurate for #8's four moves but cannot be read as an audit-wide “none deleted” statement. **Fix:** document the T1 exception explicitly; do not restore a misleading claim that removed endpoints still exist.
- **N3 — Display-name example remains stale.** [docs/deployment/APPLE_TESTFLIGHT_PREP.md:128](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/deployment/APPLE_TESTFLIGHT_PREP.md:128) says the configured app name is `Protin`; [apps/mobile/app.config.js:169](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/app.config.js:169) and generated iOS display metadata say `SportsGang`. **Fix:** correct only the quoted display name, preserving slug and bundle ID.

## 3. PRs still open

| PR | Decision | Required work |
|---|---|---|
| [#3 — docs: renew Protin for engineering portfolio](https://github.com/EdwardH-jedi/Sportsgang/pull/3), draft, head `f20c102` | **FIX THEN MERGE** | Resolve conflicts against current main; fix B2; separate still-useful security changes from superseded portfolio/docs work and preserve T1–T5; run the complete gate on the resulting head. This audit does not certify all 79 files in this older PR. |

No overnight PR remains open/draft. No PR was merged, closed, or edited during this audit.

## 4. Measured numbers and task evidence

Commands ran on macOS with Node `26.7.0`, npm `11.19.0`, Python `3.12.14`, uv `0.11.15`. Node 20, the README prerequisite, was not separately tested. Durations below are measured wall-clock durations, including command startup.

| Command / check | Result | Duration |
|---|---|---|
| `npm ci` | PASS, exit 0; 1,085 packages added | 5.553 s |
| `npm run typecheck -w @protin/mobile` | PASS, exit 0 | 2.877 s |
| `npm run lint -w @protin/mobile` | PASS, exit 0 | 2.989 s |
| `uv sync --frozen --dev` | PASS, exit 0; 52 installed packages | 1.012 s |
| `uv run pytest tests -q` | PASS, exit 0; 686 passed, 721 warnings; pytest time 100.77 s | 107.368 s |
| `docker compose up -d` | PASS, exit 0; isolated Compose project | 0.404 s |
| `uv run alembic upgrade head` | PASS, exit 0; fresh database → 0016 | 1.695 s |
| `uv run alembic downgrade -1` | PASS, exit 0; 0016 → 0015 | 0.538 s |
| `uv run alembic upgrade head` | PASS, exit 0; 0015 → 0016 | 0.301 s |
| `npm audit --json` | FINDINGS, exit 1; 68 vulnerable package entries | 1.472 s |
| `npm audit --omit=dev --json` | FINDINGS, exit 1; 45 production-tree entries | 1.358 s |
| `uvx pip-audit --path .venv/lib/python3.12/site-packages --format=json` | FINDINGS, exit 1; 10 records, six unique advisories | 4.742 s |
| Exact requested `uv run pytest --cov=app.services.bookings --cov-report=term-missing tests/test_booking_fsm.py` | FAIL, exit 4: pytest-cov absent from lockfile | 0.631 s |
| Same command with `uv run --with pytest-cov` | PASS; 87 tests; 112 statements, 61 missing; 46% statements | 1.703 s |
| New file with ephemeral pytest-cov and `--cov-branch` | PASS; 87 tests; 40 branches, four partial; 40% combined | 1.502 s |
| Full suite with ephemeral pytest-cov, branches, per-test contexts, greenlet/thread tracing | PASS; 686 tests, 714 warnings; 112 statements, five missing, 40 branches, five partial; 93% combined | 98.682 s |

Full gate: **PASS**. Coverage tooling: exact requested command **FAIL**, ephemeral-tool fallback **PASS**; no dependency file was changed. Full-suite coverage misses are `67, 82→84, 112, 127, 140, 212`. Excluding every `test_booking_fsm` context from that run gives the identical 93% and missing locations: +0.0 percentage points. This reproduces the coverage delta on unchanged main code without modifying/removing the new file.

### T1 — deletion, migration, navigation

PASS: all 13 deleted paths equal the PR body's “Removed paths” set; zero unlisted or non-tournament model/route/test deletions. Edits to shared test files remove only a tournament import/mock. Migration 0016's downgrade body is AST-identical to 0009's upgrade. PostgreSQL showed 28 public tables at 0015, including both tournament tables and all four secondary tournament indexes; head has 26 tables and neither tournament table. All 27 imported screen files resolve; all 28 registered routes, including the local `MainTabs` component, remain valid. No tournament navigation names remain.

Complete case-insensitive source-search inventory: **45 matching lines**, excluding the drop migration, dependency directories, and generated files. Each comma-separated line number below is one hit. The actual migration directory is `apps/api/alembic/versions`; there is no root-level `alembic/versions`.

| File / all matching lines | Classification |
|---|---|
| [apps/api/alembic/versions/0009_tournaments.py:1,7,12,29,55,57,58,59,60,63,64,72,73,79,81,82,83,84,85](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/api/alembic/versions/0009_tournaments.py:1) | Legitimate: retained historical migration chain. |
| [apps/api/alembic/versions/0010_events.py:8](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/api/alembic/versions/0010_events.py:8) | Legitimate: retained historical migration chain. |
| [apps/api/app/models/event.py:48](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/api/app/models/event.py:48) | Leftover: deleted model comparison (N1). |
| [apps/api/app/models/honor_system.py:17](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/api/app/models/honor_system.py:17) | Legitimate: explicitly future/conceptual verified-result taxonomy; no live feature reference. |
| [apps/api/app/routers/honor_system.py:12](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/api/app/routers/honor_system.py:12) | Legitimate: explicitly future/conceptual verified-result taxonomy; no live feature reference. |
| [apps/api/app/services/events.py:4](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/api/app/services/events.py:4) | Leftover: deleted model comparison (N1). |
| [apps/api/app/services/honor_system.py:12,234](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/api/app/services/honor_system.py:12) | Legitimate: explicitly future/conceptual verified-result taxonomy; no live feature reference. |
| [apps/api/tests/test_honor_system.py:132](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/api/tests/test_honor_system.py:132) | Legitimate: explicitly future/conceptual verified-result taxonomy; no live feature reference. |
| [apps/mobile/src/__tests__/LocalRankSection.test.tsx:197](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/__tests__/LocalRankSection.test.tsx:197) | Legitimate: asserts tournament text is absent. |
| [apps/mobile/src/components/LocalRankSection.tsx:30](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/components/LocalRankSection.tsx:30) | Legitimate: explicitly future/conceptual verified-result taxonomy; no live feature reference. |
| [apps/mobile/src/hooks/useHonorSystem.ts:43](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/hooks/useHonorSystem.ts:43) | Legitimate: explicitly future/conceptual verified-result taxonomy; no live feature reference. |
| [apps/mobile/src/lib/honorSystem.ts:8](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/lib/honorSystem.ts:8) | Legitimate: explicitly future/conceptual verified-result taxonomy; no live feature reference. |
| [docs/deployment/RELEASE_GATE_CHECKLIST.md:420](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/deployment/RELEASE_GATE_CHECKLIST.md:420) | Legitimate: dated release guardrail/history. |
| [docs/overnight/2026-10-17.md:11,19,20,22,48](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/overnight/2026-10-17.md:11) | Legitimate: removal/run history. |
| [docs/release/APP_STORE_METADATA.md:78,120,343,371](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/release/APP_STORE_METADATA.md:78) | Legitimate: dated release guardrail/history. |
| [docs/release/LEGAL_WEBSITE_CONTENT.md:56,213](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/release/LEGAL_WEBSITE_CONTENT.md:56) | Legitimate: dated release guardrail/history. |
| [packages/shared-types/src/event.ts:4](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/packages/shared-types/src/event.ts:4) | Leftover: deleted model comparison (N1). |
| [packages/shared-types/src/honor-system.ts:15](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/packages/shared-types/src/honor-system.ts:15) | Legitimate: explicitly future/conceptual verified-result taxonomy; no live feature reference. |

### T2 — naming

PASS: 21 exact substitutions in seven files. Package names, Python distribution/module paths, env/config keys, database/Docker names, SecureStore key, bundle ID, and slug were preserved. API error strings contain no `Protin`; OpenAPI, OAuth completion, and fallback notification text use SportsGang. `app.config.js`: name `SportsGang`, slug `protin`, iOS bundle `com.edh1223.protin`; the locked Expo config plugin computes `CFBundleDisplayName=SportsGang`. No committed native iOS directory exists, so this is config-generation evidence, not an installed-binary inspection.

Complete requested-extension scan: **85 files** (`.ts/.tsx/.json/.py/.md`), excluding node_modules/.venv/.git; hidden/no-ignore cross-check produced the same hits. Classification: **ID** = preserve technical identifier or fixture; **Internal** = developer prose/log/history, not product UI; **Explanation** = intentional public/internal naming distinction; **Contact** = retained address placeholder; **Stale** = N3. No remaining product UI brand string was found.

| File | Classification |
|---|---|
| [AGENTS.md](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/AGENTS.md:1) | Internal + ID |
| [CLAUDE.md](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/CLAUDE.md:1) | Internal + ID |
| [README.md](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/README.md:11) | Explanation + ID |
| [apps/api/app/core/config.py](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/api/app/core/config.py:10) | ID |
| [apps/api/app/main.py](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/api/app/main.py:33) | Internal |
| [apps/api/app/models/google_calendar.py](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/api/app/models/google_calendar.py:45) | Internal |
| [apps/api/app/services/apple_auth.py](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/api/app/services/apple_auth.py:161) | ID |
| [apps/api/scripts/seed_bots.py](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/api/scripts/seed_bots.py:58) | ID |
| [apps/api/scripts/seed_review_data.py](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/api/scripts/seed_review_data.py:42) | ID |
| [apps/api/scripts/smoke_venues_live.py](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/api/scripts/smoke_venues_live.py:689) | ID |
| [apps/api/tests/test_apple_auth.py](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/api/tests/test_apple_auth.py:55) | ID |
| [apps/api/tests/test_auth.py](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/api/tests/test_auth.py:297) | ID |
| [apps/api/tests/test_seed_bots.py](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/api/tests/test_seed_bots.py:47) | ID |
| [apps/api/worker.py](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/api/worker.py:2) | Internal |
| [apps/mobile/eas.json](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/eas.json:17) | ID |
| [apps/mobile/package.json](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/package.json:2) | ID |
| [apps/mobile/src/__tests__/AttendanceCheckScreen.test.tsx](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/__tests__/AttendanceCheckScreen.test.tsx:13) | ID |
| [apps/mobile/src/__tests__/BattleDetailScreen.test.tsx](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/__tests__/BattleDetailScreen.test.tsx:12) | ID |
| [apps/mobile/src/__tests__/BattlesScreen.test.tsx](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/__tests__/BattlesScreen.test.tsx:12) | ID |
| [apps/mobile/src/__tests__/ChallengeDetailScreen.test.tsx](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/__tests__/ChallengeDetailScreen.test.tsx:14) | ID |
| [apps/mobile/src/__tests__/ChallengeListScreen.test.tsx](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/__tests__/ChallengeListScreen.test.tsx:13) | ID |
| [apps/mobile/src/__tests__/HonorCard.test.tsx](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/__tests__/HonorCard.test.tsx:12) | ID |
| [apps/mobile/src/__tests__/PublicProfileScreen.test.tsx](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/__tests__/PublicProfileScreen.test.tsx:12) | ID |
| [apps/mobile/src/__tests__/RankBadge.test.tsx](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/__tests__/RankBadge.test.tsx:13) | ID |
| [apps/mobile/src/__tests__/RankSummaryCard.test.tsx](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/__tests__/RankSummaryCard.test.tsx:13) | ID |
| [apps/mobile/src/__tests__/auth.test.ts](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/__tests__/auth.test.ts:73) | ID |
| [apps/mobile/src/__tests__/legal.test.ts](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/__tests__/legal.test.ts:70) | ID |
| [apps/mobile/src/components/ChallengeStatusBadge.tsx](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/components/ChallengeStatusBadge.tsx:3) | ID |
| [apps/mobile/src/components/RankBadge.tsx](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/components/RankBadge.tsx:4) | ID |
| [apps/mobile/src/components/RankSummaryCard.tsx](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/components/RankSummaryCard.tsx:5) | ID |
| [apps/mobile/src/components/VenueCard.tsx](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/components/VenueCard.tsx:4) | ID |
| [apps/mobile/src/components/VenueMapView.tsx](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/components/VenueMapView.tsx:12) | ID |
| [apps/mobile/src/hooks/useHonorSummary.ts](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/hooks/useHonorSummary.ts:4) | ID |
| [apps/mobile/src/hooks/useNearbyVenues.ts](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/hooks/useNearbyVenues.ts:9) | ID |
| [apps/mobile/src/hooks/useRankSummary.ts](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/hooks/useRankSummary.ts:4) | ID |
| [apps/mobile/src/hooks/useUserHonorSummary.ts](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/hooks/useUserHonorSummary.ts:4) | ID |
| [apps/mobile/src/lib/challenges.ts](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/lib/challenges.ts:5) | ID |
| [apps/mobile/src/lib/events.ts](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/lib/events.ts:4) | ID |
| [apps/mobile/src/lib/honorSystem.ts](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/lib/honorSystem.ts:19) | ID |
| [apps/mobile/src/lib/notifications.ts](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/lib/notifications.ts:5) | Internal |
| [apps/mobile/src/lib/rank.ts](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/lib/rank.ts:5) | ID |
| [apps/mobile/src/screens/battles/CreateBattleScreen.tsx](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/screens/battles/CreateBattleScreen.tsx:25) | ID |
| [apps/mobile/src/screens/bookings/BookingComposerScreen.tsx](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/screens/bookings/BookingComposerScreen.tsx:35) | ID |
| [apps/mobile/src/screens/bookings/NearbyCourtsModal.tsx](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/screens/bookings/NearbyCourtsModal.tsx:20) | ID |
| [apps/mobile/src/screens/onboarding/OnboardingStep3Screen.tsx](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/screens/onboarding/OnboardingStep3Screen.tsx:14) | ID |
| [apps/mobile/src/screens/onboarding/OnboardingStep4Screen.tsx](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/screens/onboarding/OnboardingStep4Screen.tsx:10) | ID |
| [apps/mobile/src/stores/auth.ts](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/stores/auth.ts:3) | ID |
| [apps/mobile/src/stores/profile.ts](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/src/stores/profile.ts:9) | ID |
| [apps/mobile/tsconfig.json](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/apps/mobile/tsconfig.json:7) | ID |
| [docs/PORTFOLIO_FACTS.md](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/PORTFOLIO_FACTS.md:5) | Explanation + ID |
| [docs/alpha/ALPHA_READINESS.md](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/alpha/ALPHA_READINESS.md:1) | Internal + ID |
| [docs/alpha/ALPHA_READINESS_UPDATED.md](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/alpha/ALPHA_READINESS_UPDATED.md:1) | Internal + ID |
| [docs/contracts/README.md](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/contracts/README.md:1) | Internal + ID |
| [docs/contracts/RELEASE_CHECKLIST.md](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/contracts/RELEASE_CHECKLIST.md:145) | Internal + ID |
| [docs/contracts/naming.md](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/contracts/naming.md:3) | Internal + ID |
| [docs/deployment/APPLE_TESTFLIGHT_PREP.md](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/deployment/APPLE_TESTFLIGHT_PREP.md:1) | Stale at :128; otherwise Internal + ID |
| [docs/deployment/APP_STORE_SUBMISSION.md](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/deployment/APP_STORE_SUBMISSION.md:6) | Internal + ID |
| [docs/deployment/RELEASE_GATE_CHECKLIST.md](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/deployment/RELEASE_GATE_CHECKLIST.md:1) | Internal + ID |
| [docs/deployment/RELEASE_RUNBOOK.md](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/deployment/RELEASE_RUNBOOK.md:1) | Internal + ID |
| [docs/legal/PRIVACY_POLICY.md](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/legal/PRIVACY_POLICY.md:19) | Contact |
| [docs/legal/TERMS_OF_SERVICE.md](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/legal/TERMS_OF_SERVICE.md:29) | Contact |
| [docs/overnight/2026-10-17.md](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/overnight/2026-10-17.md:25) | Internal + ID |
| [docs/planning/PROJECT_STATUS.md](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/planning/PROJECT_STATUS.md:1) | Internal + ID |
| [docs/planning/PROTIN_HARNESS_PLAN.md](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/planning/PROTIN_HARNESS_PLAN.md:1) | Internal + ID |
| [docs/release/APP_PRIVACY_LABEL_DRAFT.md](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/release/APP_PRIVACY_LABEL_DRAFT.md:224) | Internal + ID |
| [docs/release/APP_RELEASE_REVIEW.md](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/release/APP_RELEASE_REVIEW.md:176) | Internal + ID |
| [docs/release/APP_STORE_METADATA.md](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/release/APP_STORE_METADATA.md:20) | Internal + ID |
| [docs/release/GOOGLE_PLACES_RELEASE_QA.md](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/release/GOOGLE_PLACES_RELEASE_QA.md:69) | Internal + ID |
| [docs/runbooks/venues.md](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/runbooks/venues.md:20) | Internal + ID |
| [docs/security/SECURITY_AUDIT.md](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/security/SECURITY_AUDIT.md:104) | Internal + ID |
| [docs/staging/ENV_VARS.md](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/staging/ENV_VARS.md:1) | Internal + ID |
| [docs/staging/KNOWN_ISSUES.md](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/staging/KNOWN_ISSUES.md:1) | Internal + ID |
| [docs/staging/QA_CHECKLIST.md](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/staging/QA_CHECKLIST.md:1) | Internal + ID |
| [docs/staging/RUNBOOK.md](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/staging/RUNBOOK.md:1) | Internal + ID |
| [docs/staging/SETUP.md](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/staging/SETUP.md:1) | Internal + ID |
| [docs/workflow/BRANCH_STRATEGY.md](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/workflow/BRANCH_STRATEGY.md:1) | Internal + ID |
| [docs/workflow/CODE_REVIEW.md](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/workflow/CODE_REVIEW.md:1) | Internal + ID |
| [docs/workflow/PR_WORKFLOW.md](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/docs/workflow/PR_WORKFLOW.md:1) | Internal + ID |
| [infra/fly/README.md](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/infra/fly/README.md:1) | Internal + ID |
| [package-lock.json](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/package-lock.json:2) | ID |
| [package.json](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/package.json:2) | ID |
| [packages/shared-types/package.json](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/packages/shared-types/package.json:2) | Internal + ID |
| [packages/shared-types/src/common.ts](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/packages/shared-types/src/common.ts:2) | Internal + ID |
| [packages/shared-types/src/index.ts](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/packages/shared-types/src/index.ts:2) | Internal + ID |
| [packages/shared-types/src/user.ts](/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/packages/shared-types/src/user.ts:8) | Internal + ID |

### T3 — README

PASS: read all 210 lines; title → one product paragraph → six engineering highlights → three shell command lines. All **11 `](docs/...)` occurrences** resolve; all **24 unique relative link/image targets** resolve (28 occurrences), and `#local-setup` exists. Approval date (13 May 2026), v1.0, review cycle, and stack versions agree with Portfolio Facts. No new user/adoption/rating/production-readiness number appears. The new source-backed linear-chain claim is not recorded in Portfolio Facts (S3).

All four caveats moved by #8 retain their meaning in Limitations: listing evidence, external-service test boundary, CI/load/concurrency limits, and integration configuration/delivery requirements. The pre-run comparison's one deleted “unfinished” sentence is N2. Safety/setup/license instructions containing “not” remain instructions, not hidden product-readiness caveats.

### T4 — dependency audit

| Ecosystem / scope | Critical | High | Moderate/medium | Low | Total |
|---|---:|---:|---:|---:|---:|
| npm all | 0 | 47 | 21 | 0 | 68 |
| npm production dependency tree | 0 | 24 | 21 | 0 | 45 |
| npm dev-only | 0 | 23 | 0 | 0 | 23 |
| Python runtime, unique advisories | 0 | 3 | 1 | 2 | 6 |
| Python dev-only | 0 | 0 | 0 | 0 | 0 |

npm totals count affected package entries, including propagation (11 distinct direct advisory IDs), not 68 independent vulnerabilities. “Production tree” means present under `--omit=dev`; it includes Expo/Metro tooling and does not prove shipped-mobile exploitability. Python's 10 records collapse to six unique advisories in runtime `cryptography==43.0.3`; the local `protin-api` package is skipped because it is not on PyPI. A bare `uvx pip-audit` returned zero findings in 2.792 s because it audited the isolated tool environment; only the explicit project-site-packages audit above is relevant.

Python severity sources and minimum fixed versions:

| Advisory | Severity | Fixed version |
|---|---|---|
| [GHSA-r6ph-v2qm-q3c2](https://github.com/advisories/GHSA-r6ph-v2qm-q3c2) | High | 46.0.5 |
| [GHSA-jwv3-5hgf-82ww](https://github.com/advisories/GHSA-jwv3-5hgf-82ww) | High | 49.0.0 |
| [GHSA-537c-gmf6-5ccf](https://github.com/advisories/GHSA-537c-gmf6-5ccf) | High | 48.0.1 |
| [GHSA-m2h6-j472-rp4c](https://github.com/advisories/GHSA-m2h6-j472-rp4c) | Medium | 49.0.0 |
| [GHSA-79v4-65xg-pq4g](https://github.com/advisories/GHSA-79v4-65xg-pq4g) | Low | 44.0.1 |
| [GHSA-m959-cc7f-wv43](https://github.com/advisories/GHSA-m959-cc7f-wv43) | Low | 46.0.6 |

All Python fixes exceed the existing `<44` constraint. These residual advisories were disclosed by the run; package presence alone is not a verified exploit path.

PASS: package.json manifests and pyproject.toml unchanged; only package-lock.json and uv.lock changed in #9. All seven Python changes are same-major: anyio 4.13.0→4.14.2; idna 3.11→3.20; mako 1.3.11→1.4.3; pydantic-settings 2.13.1→2.16.0; pyjwt 2.12.1→2.15.1; python-multipart 0.0.28→0.0.32; starlette 1.0.0→1.8.0. npm has 158 same-location version changes; cross-location dependency resolution reveals B1. Root react-refresh 0.17.0→0.14.2 is a downgrade/dedupe, not a major increase. Both frozen installs pass.

### T5 — every new test

All test names below are in `apps/api/tests/test_booking_fsm.py`.

| Test (line) | Cases | Transition / assertion |
|---|---:|---|
| `test_invalid_matrix_is_the_complement_of_the_documented_table` (73) | 1 | Fixture arithmetic: 36 pairs − six allowed = 30; does not execute the service. |
| `test_invalid_transition_raises_422` (79) | 60 | All 30 invalid pairs × proposer/partner; 422 and unchanged status, plus exact message. |
| `test_no_show_from_each_state` (117) | 12 | confirmed→no_show accepted for both; proposed and all terminal states→no_show rejected. |
| `test_cancel_from_each_state` (126) | 12 | proposed→cancelled proposer accepted/partner rejected; confirmed→cancelled both accepted; terminal states rejected. |
| `test_double_confirm_is_rejected_by_the_fsm` (139) | 1 | proposed→confirmed by partner, then confirmed→confirmed rejected; first mutation is manually assigned by the test. |
| `test_double_confirm_has_no_repeated_side_effects` (147) | 1 | Public service confirm followed by rejected duplicate; one rank call, three notification schedules and one commit total. |

PASS purity: no DB/client fixtures and no network calls; Booking objects stay in memory, I/O is mocked, and the only explicit fixture is `monkeypatch`. The new file tests four of six permitted edges and 67/72 state-pair/participant combinations. Missing: proposed→declined (both actors), confirmed→completed (both actors), proposed→confirmed (proposer rejection). Existing API tests cover the omitted transition edges and partner-only rejection branches; no permitted edge is wholly absent across the combined suite. This is separate from private-helper and exact-message coupling in S2.

Evidence directory: [/tmp/sportsgang-overnight-audit-20261017.s2GIKm](/tmp/sportsgang-overnight-audit-20261017.s2GIKm). Verification used a separate detached clone; only its untracked dependency/test artifacts were generated. The isolated Compose project `sportsgang-audit-20261017-s2gikm` and its two fresh volumes were removed after verification. The original checkout was clean before the report write; no source, index, branch, or PR changes were made. The sole repository write is this report.

## Follow-up 2026-10-18

Each group ran as one PR: branch from (or rebase onto) fresh `main` → `npm run typecheck -w @protin/mobile`, `npm run lint -w @protin/mobile`, `cd apps/api && uv run pytest tests -q` → push → PR → CI → squash-merge. Run order was PR1 → PR4 → PR2 → PR3 → PR5.
- PR4 went before PR2 so its counts, datestamped "as of 2026-10-17" (686 tests, 16 migrations), were still true when it merged.
- PR3 went after PR2 because PR2 changes `transition_booking`, the function PR3's tests call.

| Group | PR | Outcome | Merge commit | Findings addressed |
|---|---|---|---|---|
| PR1 `fix/deps-b1` | [#11](https://github.com/EdwardH-jedi/Sportsgang/pull/11) | Merged; CI green | `0a0d554` | **B1.** `overrides: {"@expo/package-manager": "1.10.4"}` (in range for `@expo/cli`'s `^1.9.11`). `npm ls @expo/json-file` shows only 10.0.16, `npm ci` passes, npm audit unchanged at 68. `pytest-cov` added to the api dev deps; the §4 coverage command now runs without `--with`. |
| PR4 `docs/facts-reconcile` | [#12](https://github.com/EdwardH-jedi/Sportsgang/pull/12) | Merged; CI green | `43b16e9` | **S3** (session coordination with an attached venue; 686 backend / 722 mobile tests; 16 migrations, linear 0001→0016; all "as of 2026-10-17"), **N1**, **N2** (README Limitations line on #6), **N3**. |
| PR2 `chore/security-migration-from-pr3` | [#13](https://github.com/EdwardH-jedi/Sportsgang/pull/13) | Merged; CI green; the integration job ran 0016→0017 and 4 tests | `6761aa5` | **B2.** #3's `0016_security_integrity` became `0017` (`down_revision` 0016). PostgreSQL 16 `upgrade head` / `downgrade -1` / `upgrade head` pass, with one head. |
| (draft #3) | [#3](https://github.com/EdwardH-jedi/Sportsgang/pull/3) | Closed: "Superseded by #7/#8 (naming, README) and #13 (security migration)." | — | Branch `chore/portfolio-renewal` kept on origin at `f20c102`. |
| PR3 `test/booking-fsm-public-boundary` | [#14](https://github.com/EdwardH-jedi/Sportsgang/pull/14) | Merged; CI green after one re-run of a flaky job | `b46edc5` | **S1, S2.** All cases go through `transition_booking`. Assertions are status code + resulting status + side-effect counts. Added: proposed→declined and confirmed→completed for both actors, and the proposer's 403 on proposed→confirmed. The skill doc now says `proposed` and lists proposer cancellation. |
| PR5 `chore/cryptography-bump` | [#15](https://github.com/EdwardH-jedi/Sportsgang/pull/15) | **Left open as draft**; CI green | — | `cryptography>=46.0.6,<50` locks 49.0.0, which clears all six §4 advisories. One **high** remains (see below), so the 0-high gate fails. |

Notes:
- **#13 scope.**
  - Carried over: the migration; the model constraints; one-time, hashed, expiring Google OAuth state with PKCE; service guards matching the constraints; `SELECT … FOR UPDATE` in `transition_booking`; the tests that exercise these.
  - Not carried over: #3's "cannot complete before scheduled end" rule (a behaviour change no constraint backs) and its other hardening (trusted-proxy rate limiting, protected config, key validation, Apple auth, media validation + `pillow`, chat/users/notifications routers, mobile/web, CI/infra). #13's body lists each one; the code is still on `chore/portfolio-renewal`.
  - #3's PostgreSQL test sat under `tests/integration/`, gated on an unset `POSTGRES_TEST_URL`, so it never ran. It moved to `tests_integration/`, which CI's integration job runs.
- **FSM module coverage** (full suite, branches, `concurrency = greenlet,thread`): 93% at audit → 91% after #13 (its participant guards are unreachable through the API) → **94%** after #14. Mutations on proposed→declined, confirmed→completed and the decline notification each fail the new tests.
- **#14 flake.** The pull_request run's `test-mobile` failed once: `ProfileScreen › renders the display name after profile loads` hit Jest's 5000 ms timeout. The push run on the same SHA passed, and so did the re-run. #14 changes no mobile code.
- **#15 blocker.** [GHSA-g6cj-pr64-35w5](https://github.com/advisories/GHSA-g6cj-pr64-35w5) (PYSEC-2026-3552, CVE-2026-69247, **high**) is a PKCS7 decrypt oracle affecting `>=44.0.0,<50.0.0`, fixed in 50.0.0. No version under the requested `<50` cap reaches 0 high.
  - Nothing depends on cryptography except protin-api itself, and the app doesn't call PKCS7.
  - Tested but not committed: `<51.0.0` locks 50.0.2, pip-audit reports no known vulnerabilities, and 693 tests pass. Accepting that major version is the owner's call.
  - pip-audit: before, 10 records / 6 advisories (3 high, 1 medium, 2 low); after, 2 records / 1 advisory (1 high).
- **Post-run actuals**, superseding #12's datestamped figures: 17 migrations (linear 0001→0017), 706 backend tests, 722 mobile tests, 4 PostgreSQL/Redis integration tests.
- **Left unchanged:**
  - `apps/api/.coverage` is not gitignored, so it now shows up untracked after coverage runs.
  - The tracked `packages/shared-types/tsconfig.tsbuildinfo` is rewritten by local typechecks after #12's `event.ts` comment change; the local copy was restored, not committed.
- **Local environment.** OrbStack was off. Starting it for the PostgreSQL checks also brought up `protin-postgres-1`, `protin-redis-1` and the `supabase_*_our-trace` containers. The throwaway `postgres:16-alpine` / `redis:7-alpine` containers were removed and OrbStack stopped afterwards.
- `gh pr list` after the run: only #15 (deliberately left as a draft).
