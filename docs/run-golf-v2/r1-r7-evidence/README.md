# R1–R7 implementation evidence — 3–4 October 2026

Implementer (Claude) evidence for [R1_R7_IMPLEMENTATION_REPORT.md](../R1_R7_IMPLEMENTATION_REPORT.md).
The independent review and its evidence (`../CODEX_REVIEW_AFTER_FIXES.md`,
`../CODEX_FIX_HANDOFF.md`, `../independent-evidence/`) are unchanged.
Application SHA for everything below: **ecd1e86** (API and launcher code
unchanged since ab5c95e). No credentials, tokens or `.qa` files are included;
paths under the session scratch directory are shown as `<scratchpad>`.

| Path | What it shows |
| --- | --- |
| `final-checks/ruff-*.log`, `api-tests.log` | Locked Ruff check/format; API pytest **772 passed, 0 skipped** |
| `final-checks/migrate-verify_final*.log`, `integration-verify_final*.log` | Fresh empty databases migrated to 0016; full integration suite **29 passed, 0 skipped** on a UTC-default and on an `Australia/Sydney`-default database |
| `final-checks/mobile-*.log`, `shared-typecheck.log` | Mobile lint (0 warnings), mobile and shared-types typechecks, Jest **929 passed in 64 suites, 0 skipped** — documented command (Node 26, in-band) and CI-like run (Node 20, `TZ=UTC`, workers) |
| `final-checks/ios-export.log` | iOS JavaScript export: Hermes bundle 4.41 MB, 1,418 modules (a bundle check, not a native build) |
| `final-checks/qa-launcher-docker.log` | `scripts/qa/test_qa.py` with `QA_TEST_DOCKER=1`: **20/20** (13 sacrificial-process + 7 disposable Compose lifecycle) |
| `final-checks/human-before-final.txt`, `human-after-final.txt` | Human QA API/Metro pid, pgid, start time, container start times and volume, identical around the Docker launcher suite |
| `final-checks/probe-{utc,sydney}.json/.log`, `populated-upgrade.json/.log` | Existing `fix-evidence/probe_findings.py` (7/7 PASS under UTC and under Sydney) and `verify_populated_upgrade.py` (9/9 PASS) on a disposable stack at 127.0.0.1:55453 |
| `api_probe_adapted.py`, `api-probe-adapted.json` | The reviewer's R1/R6 probe, same steps on the repaired code (differences marked `ADAPTED`): every contact path is now 403 both ways, controls still pass, `created_at` is `…Z` |
| `qa_probe_adapted.py`, `qa-probe-adapted.json` | The reviewer's R2 probe on the repaired launcher: the forged record is `foreign`, `stop_proc` refuses, the sacrificial child survives |
| `r2-qa-launcher-tests-docker.log`, `r2-human-stack-untouched.txt` | First Docker launcher run (R2 commit) with the human-stack snapshot before/after |
| `r5-native/` | R5 on iPhone 17e (390×844, iOS 26, Expo Go), separate from the human's simulators: `baseline-unfixed-trace.log` and `baseline-*.png` reproduce 45→tap 30→**15**, 15→tap 30→**45**, Done committing 9:45; `fixed-*.trace`/`fixed-*.png` show the repaired wheel (taps, rapid/overlapping taps, flick, slow and held drags, Done/reopen, auto-shifted end time, `accessibility-extra-large` before/after the text cap), `proposal-wire.json` the stored bounds of a proposal entered with the wheel |
| `native-17e/` | Final-code native checks on the same device: R6 chat preview before (“1:51 PM”) and after (“Oct 3”) and blocked date (“Oct 4, 2026”); R1 block from chat, server refusals for both accounts, Chats after block and after unblock; R4 block from partner detail; R7 refresh failure, held retry (“Retrying…” with the notice kept), timeout, recovery |

## Trace format (R5)

`[wheel] +<ms> <column> <event>` lines were logged by a temporary,
never-committed instrumentation of `WheelPicker` (press, programmatic
`scrollTo`, render `contentOffset`, drag and momentum callbacks with
`contentOffset.y`). Rows are 44 pt; `y / 44` is the centred row index.

## Baseline detection

New regression tests were also run against the reviewed source (b530e7f) to
show they detect the defects:

| Area | New tests failing on the baseline |
| --- | --- |
| R1 unit / real PostgreSQL | 13 of 14 (the reporting control passes) / 4 of 4 |
| R3 Booking Detail | 10 of 12 (immediate clear on route change and silent unmount already held) |
| R4 block races | 13 of 14 (Cancel sends nothing already held) |
| R5 wheel rules | 6 of 9 (plus the native reproduction above) |
| R6 real PostgreSQL / Sydney blocked date | 3 of 3 on UTC and on Sydney databases / 1 of 1 |
| R7 retry freshness | 2 of 5 (partial recovery, empty reload, superseding refresh already held) |
| Chats focus refresh (R1 follow-up) | 1 of 1 |
