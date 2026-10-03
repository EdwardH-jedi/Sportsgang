# Independent review evidence — 3 October 2026

Application source: **b530e7f3e726b9e830e52259f0ae699725090f5f**. Worktree: `/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/.claude/worktrees/run-golf-v2-home-test`. These are fresh reviewer artifacts. Earlier implementer evidence remains in its original directories.

Read [the review](../CODEX_REVIEW_AFTER_FIXES.md) and [repair handoff](../CODEX_FIX_HANDOFF.md) for conclusions, precise source references and limits. `manifest.json` hashes this delivery, including both documents and every retained evidence file except the manifest itself. It records the application baseline separately from the later documentation commit.

## Verification map

| Evidence | Meaning |
| --- | --- |
| `ruff-*.log`, `api-tests.log` | Locked API lint/format/unit checks; 752 passed, zero skipped |
| `migrate.log`, `integration.log` | Fresh isolated PostgreSQL schema through 0016; 22 PG/Redis checks passed, zero skipped |
| `mobile-lint.log`, `*-typecheck.log`, `mobile-tests.log` | Mobile lint and both TypeScript checks; 878 tests in 62 suites, zero skipped, Watchman disabled |
| `ios-export.log` | iOS JavaScript/Hermes export only; generated bundle not retained |
| `populated-upgrade.{json,log}` | Fresh execution of existing populated 0015→0016 compatibility script; 9/9 checks |
| `probe-{utc,sydney}.json` | Fresh execution of existing `fix-evidence/probe_findings.py` on separate databases; 7/7 each |
| `api-probe.json`, `api_probe.py` | Real PG + actual ASGI routes; R1 blocked-contact bypass and R6 actual timestamp schema/wire; passing moderation/name/deletion controls |
| `qa-probe.json`, `qa_probe.py` | R2 ownership failure using only a sacrificial child process; no human service PID signaled |
| `timestamp-{utc,sydney}.json`, `timestamp.js` | Transpiles actual message formatter and runs separate TZ processes; date-boundary parsing/formatting proof |
| `codex-review-*.test.tsx`, `independent-mobile-final.log` | Actual screen/store/hooks with deferred request transport; R3/R4/R7 defect proofs plus controls; eight passing assertions, not eight correctness gates |
| `seed-check.json`, `seed-{first,second}.log` | Actual seeder on an independent API/database; idempotent IDs/history and preserved tester edits |
| `ci.json` | Fresh GitHub CLI inspection of seven successful jobs at the application baseline; separate from local results |
| `qa-status-final.log`, `runtime-provenance.json` | Final human QA health, source comparison, process/resource provenance and private-file permission checks |
| `native-final-state.json` | Fresh final AX snapshots: Alice's 16e Explore session has five spots left; 17 Pro is signed out |

## Native evidence and interpretation

`native-trace.json` contains sequential raw semantic AX snapshots. **Its step names describe the action attempted, not an assertion that the action succeeded.** Capture text/targets and the final report determine observed behavior. Expired element refs, offscreen rows and input-method issues caused some attempts to need a later successful action. Added `review_note` fields explain those cases without changing the raw capture. The final verified states are:

- Session lifecycle: `joined-detail`, `plans-after-join`, `plans-after-leave`, `rejoin`, `restore-unjoined`, `explore-restored`; final smaller-screen state in `native-final-state.json`.
- Automatic preference refresh: `social-cleared-saved-auto-feed`, `native-auto-feed.json` and `native-preferences-api.json`; earlier clear-only attempt correctly hit match-pace validation.
- Moderation: `native-report-submitted`, `native-blocked-name`, `native-unblock-confirmed`; API list controls in `api-probe.json`. Native success does not close the server-contact or request-race defects.
- Plans: `native-one-source-retained-upcoming`, `native-both-sources-refresh-failed`, `native-first-load-both-sources-fail`, `native-plans-retry-recovered`; `native-plans-stale.png` shows the one-source notice. Pending Retry freshness uses the focused test, not that screenshot.
- Booking: `native-booking-confirmed-sydney-time`, `native-booking-initial-fetch-failed`, `native-booking-offline-back-retry-recovered`, `native-chat-booking-time`; corresponding confirmed/offline PNGs. `native-booking-wire.json` records the initial API proposal before native confirmation.
- Composer: `native-wheel-before-tap.png` → `native-wheel-after-tap.png` → `native-wheel-committed.png` show centered minute 45, visible-row 30 tap settling on 15, and Done committing 05:15. `native-composer-wire.json` is the subsequently sent 05:15–07:45 proposal and other-account API confirmation. The earlier `native-composer-proposal-sent` attempt had not yet sent it.
- Select: `native-select-large-text-no-results`, `native-select-search-reset-reopened`, `native-select-backdrop-dismissed-verified`, `native-select-selected.json` and large-text PNG. Actual VoiceOver speech/focus, selected-trait announcement and software-keyboard overlap remain unverified.
- Deletion: `native-account-deleted-signed-out`, `native-cleanup.json`, final signed-out AX snapshot. Both disposable accounts were removed and their former tokens return 401.

The iPhone 16e and 17 Pro ran existing Expo Go on iOS 26.3. Failure injection used separate proxy 8143 / Metro 8193 while the human API 8130 stayed online. `native_proxy.py` forwards requests to that API and injects HTTP 503s according to a local `proxy-mode.txt` (`none`, `events`, `bookings`, `detail`, `all`). It is a record of the technique, **not a command to run against supplied accounts**. It does not relay WebSockets, and its redacted log is not successful realtime evidence. Private account credentials/tokens and proxy control files are excluded.

## Reproduction boundaries

Run repository-supported checks from the documented worktree using locked dependencies. Keep all DB-mutating tests on separately generated credentials, independent project/ports and disposable databases. The review used project `codex-sg-review-20261003`, PG 55453, Redis 56453, tmpfs PG storage; it was removed afterward. Never use the persistent `sportsgang-qa` database for integration fixtures or these probes.

For timestamp rendering, from the worktree root:

```sh
TZ=UTC node docs/run-golf-v2/independent-evidence/timestamp.js
TZ=Australia/Sydney node docs/run-golf-v2/independent-evidence/timestamp.js
```

`api_probe.py` imports the actual API and mutates its configured database. It refuses a `POSTGRES_URL` unless it contains the review-only loopback port and `review_` database prefix. Run from `apps/api` with generated disposable API/Redis settings, migrated schema, providers disabled, and `REVIEW_EVIDENCE_DIR` pointing to a new temporary output directory. Do not weaken its guard to point at human QA. The seeder has a `sportsgang_qa` database-name guard; its test therefore used that name only inside the independent PG instance and API 8144, with its private manifest output outside the repository.

The focused Jest files need their normal relative-import location under `apps/mobile/src/__tests__/`. If reproducing, copy only these three uniquely named files there temporarily, then run from the root:

```sh
npm run test:ci --workspace @protin/mobile -- --runInBand --watchman=false --runTestsByPath src/__tests__/codex-review-booking.test.tsx src/__tests__/codex-review-block.test.tsx src/__tests__/codex-review-plans.test.tsx
```

Move/remove only those temporary reviewer copies afterward. Assertions labeled `PROOF` intentionally expect the current broken outcome; invert/adapt them to corrected behavior for implementation acceptance. They do not belong in a passing production gate unchanged.

`qa_probe.py` imports the reviewed launcher and stops only the child it creates. It does not read `.qa/state.json` or call launcher lifecycle commands. Running it again overwrites its adjacent result file, so copy it to a temporary directory if retaining this delivery unchanged. Full QA down/reset/startup-failure testing remains NOT_RUN until namespace isolation and ownership are repaired.

No private configuration, tokens, passwords, `.qa` data or generated bundles are published. Local fixture UUIDs, display names, loopback addresses and process IDs are test provenance. Retained screenshots are unmodified native captures; JSON/log redaction removes private token values, not behavioral results. Terminal-only trailing whitespace and extra blank lines at log EOF were normalized for the artifact diff.
