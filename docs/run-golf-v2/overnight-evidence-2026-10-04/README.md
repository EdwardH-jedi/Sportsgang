# Overnight review evidence — 4 October 2026

Pinned application: `ecd1e86047cdc4411905d43210bc07112bbcbf07`. Base delivery: `cd567c80af2f6d23fc9cbe4bd178507c37d85ae3`. These artifacts support [the acceptance report](../CODEX_OVERNIGHT_ACCEPTANCE_2026-10-04.md) and [repair handoff](../CODEX_OVERNIGHT_HANDOFF_2026-10-04.md).

## Decisive results

| Evidence | Meaning |
| --- | --- |
| `r1-results.json`, `r1-final-verified.log`, `probe_r1.py` | 81 independent checks: 71 pass, 10 fail, zero harness errors; Q01–Q03. Real PostgreSQL, actual services/ASGI, real uvicorn/WebSockets and separate-process notification probe. Fake provider records invocation only. |
| `mobile-probe-results-verified.json`, `mobile-probes-verified.log`, four `codex-overnight-*.test.tsx` files | 16 independent component/store tests: 5 pass, 11 fail, no skips/runtime-error suites; Q04–Q07. |
| `make_mobile_probes.py` | Recreates temporary execution copies. Use Jest `--runTestsByPath` and remove copies after running. |
| `qa-launcher.log`, `qa-launcher-host-zone.log`, `qa-launcher-docker-free.log` | UTC override: 19 pass/1 fail; host-zone Docker: 20 pass; Docker-free: 13 pass/7 deliberate skips; Q08. |
| `qa-real-legacy-adoption.json/.log`, `probe_qa_real.py` | Actual prior-launcher API/Metro adoption on the normal host zone, unchanged PIDs. Namespace/path adapters isolate it from the human project. |
| `qa-real-lifecycle.json/.log`, `probe_qa_lifecycle.py`, `qa-real-*.log` | 14 passing assertions across actual restart/down/up/reset, marker preservation/removal, process identity and final down. |
| `qa-edge-records.json/.log`, `probe_qa_edge_records.py` | Eight passing file-only owner/source-status controls. Empty Docker inventory mocked for owner cases; interrupted JSON fails closed with an exception, not automatic recovery. |
| `native/44-large-text-wheel.png/.json`, `native/39-gesture-before.json`, `native/47-large-text-dismiss.json` | Q09: title/close header clipping at maximum iOS accessibility text size; exposed target can still be tapped to dismiss. |
| `r6-overlap.json/.log`, `probe_r6_overlap.py` | C01: controlled real PostgreSQL wall-time conversion plus actual converter; alternate Sydney configuration loses repeated-hour instant identity. No frozen-clock live insertion or production provenance claim. |
| `native-device.json`, `native/*.png/.json` | New reviewer iPhone 16e, iOS 26.3/Expo Go. Ordinary block/unblock, picker gestures/form/storage, blocked date and My Plans failure/held retry/recovery. |
| `native/proposal-wire-and-storage.json`, `native/native-block-server-checks.json` | Actual reviewer API and literal PostgreSQL proposal values; bilateral blocked access and retained booking controls. |
| `checks.json`, `more-checks.json`, suite logs, `run_checks.py`, `run_more.py` | Exact commands/exits for fresh broad checks; see report for isolated rerun interpretation. |
| `f-regressions-*.json/.log`, `populated-upgrade.json/.log`, adapted scripts | Fresh 7/7 previous regression controls in both process zones; 9/9 populated 0015→0016 upgrade checks. Earlier evidence originals unchanged. |
| `ci-ecd1e86.json`, `ci-cd567c8.json` | Fresh remote CI metadata: eight successful jobs on each exact supplied SHA; separate from local acceptance. |
| `worktrees-before.json`, `human-private-hashes-before.json`, `final-preservation.json` | Worktree/107 untracked-file preservation, hashed private human config/state and live-stack checks. No secret values. |
| `review-metadata.json`, `SHA256SUMS.json` | Versions, baseline/final fetch identity, and content hashes for the delivered report/handoff/evidence (manifest excludes itself). |

## Native sequence

Screenshots/curated AX JSON use matching step names. 01–06 launch/login/Explore; 08–09 Chats/Chat; 10–22 proposal, wheel taps, close/reopen and sent detail; 23–26 native block and empty Chats; 27–31 loaded plans, offline notice, held retry, timeout and recovery; 32–36 blocked-date screen and unblock/chat restoration; 37–43 additional proposal swipe/commit; 44 maximum accessibility text; 47 successful dismissal by the visible close target.

Some simulator automation attempts did not activate the intended control (07, 41, 42, 45, 46). They are retained, not claimed as completed actions. Use the observed screenshot/AX state and the corrected subsequent step. `axe --tap-style physical` refers to simulator HID input, not a physical device. The holding HTTP server is reviewer-owned and was stopped after verifying its exact identity.

## Attempts and isolation

Early `r1-probe*`, `r1-final.log`, `mobile-probes*` other than `*-verified`, and earlier mobile JSON are non-authoritative attempt records. Reviewer fixture/mocking/flag mistakes were corrected before the decisive reruns. Do not aggregate them into counts or defects. `more-checks.json` records an intermediate probe command; the final verified log/results supersede that intermediate output.

`integration-sydney.log` retains the 27-pass/2-fail reused-Redis attempt. Its 429/rate-limit and cascading cleanup issue disappeared after flushing only the disposable review Redis; `integration-sydney-isolated.log` is the clean 29-pass result. The launcher UTC failure is a separately reproduced product/configuration finding, not this Redis contamination.

`finalize-progress.log` caught the reviewer's typecheck-generated tracked incremental cache. `generated-cache-restoration.json` records restoration to exact delivery-base bytes. `final-preservation-recheck.log` and `final-preservation.json` are the decisive 26-pass preservation receipt, including reviewer cleanup and unchanged human resources.

Presentation text removes trailing line whitespace and extra blank lines at EOF so the documentation commit passes `git diff --check`. `raw-text-originals/*.gz` preserves exact pre-normalization bytes for every changed text file; `text-normalization.json` records both hashes. Evidence values/assertions are unchanged. These compressed originals are also included in the private-value scan and final hash manifest.

Scripts use private environment files/credentials excluded from Git. Direct probe containers used ports 55504/56504 and a separate populated-upgrade database. Actual launcher project `sg-codex-r1r7-real` used API 8144, Metro 8194, PostgreSQL 55514 and Redis 56514, plus a private owner directory. No destructive test targeted the human project. PostgreSQL/Redis/provider/transport evidence is labeled at its actual boundary in the report.
