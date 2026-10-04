# Morning repair evidence — 4 October 2026

Evidence for [IMPLEMENTATION_REPORT.md](../IMPLEMENTATION_REPORT.md). Local paths are replaced with
`<worktree>`, `<scratch>`, `<baseline-d41efc2>` and `~`; database URLs are redacted. No
credentials, tokens or `.qa` files are included. The review's original evidence
(`../overnight-evidence-2026-10-04/`) is unchanged.

| Path | What it shows |
|---|---|
| `probe_r1_adapted.py`, `r1-adapted-results.json`, `logs/probe-r1-adapted.log` | Review probe with `matrix` and `fresh_account` unchanged and the four race cases adapted to the repaired ordering: 94 PASS / 0 FAIL / 0 harness errors |
| `logs/baseline-d41efc2-contact-authority.log` | The 13 new Q01–Q03 tests run against the unrepaired base: 11 fail, 2 controls pass |
| `logs/final-integration-*.log`, `logs/integration-utc.log` | PostgreSQL/Redis integration: fresh UTC DB 42/42; fresh Sydney-default DB attempt 1 40/2 (clock-skew flake), attempt 2 42/42 |
| `logs/rejoin-clock-skew-*.log` | Repeated runs of the flaky rejoin test, base vs repaired, under load and alternating on an idle machine |
| `logs/final-api-unit.log`, `logs/baseline-d41efc2-api-unit.log`, `logs/final-ruff.log` | API unit 772 passed (base 772); Ruff clean |
| `logs/final-mobile-*.log`, `logs/final-ios-export.log`, `logs/wave2-*.log`, `logs/shared-types-typecheck.log` | Jest 967/967 (wave 2: 966), lint 0 warnings, typechecks, iOS bundle export |
| `logs/review-mobile-probes-regenerated.log` | The review's 16 mobile probes regenerated against the repaired worktree: 16/16 |
| `probe_qa_real_adapted.py`, `qa-real-legacy-adoption-utc.json`, `logs/qa-real-legacy-adoption-utc.log` | Q08: a real pre-repair launcher (`60a264c`) started API/Metro; the repaired launcher under `TZ=UTC` adopted the same PIDs |
| `logs/qa-launcher-*.log` | Launcher suite: Docker-free 14/7 skipped and Docker 21/21, each in the host zone and with `TZ=UTC` |
| `probe_r6_overlap_by_zone.py`, `r6-overlap-UTC.json`, `r6-overlap-Australia-Sydney.json` | C01 reproduction per `DB_NAIVE_TIMEZONE` |
| `native-q09/` | Q09 on a new iPhone 16e simulator (390×844, iOS 26.3, Expo Go 54.0.7): screenshots at max text size (`21`–`35`) and default size (`40`–`43`), `q09-frames.json` (Done frames), `proposal-http.json` and `proposal-postgres.txt` (11:30–12:30 Sydney = 00:30Z–01:30Z) |

`21-ax5-start-picker` is the first max-text check: the header was already
fixed, but the footer hint ran past the screen. That led to the sheet-cap
and hint change; `22`–`35` show the final code.
