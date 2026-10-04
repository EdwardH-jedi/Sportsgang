# Reproducing this independent review

All source/probe execution targets the pinned delivery and a disposable namespace. `checks.jsonl` contains exact argv, cwd, subprocess exits and elapsed times. A named check's stdout/stderr is in the corresponding `.log`. The source tests here are intentionally outside product test directories; use `-c pyproject.toml` when invoking them from `apps/api` so pytest loads the API async configuration.

## Isolated setup

1. Fetch, inspect worktrees, and create a dedicated checkout at delivery `8b34bca78adc028423defbfb2caca8f4cc2d8a0a`. Read AGENTS.md and pinned contracts before execution.
2. Install root lockfile dependencies (`npm ci`) and API dependencies (`uv sync --frozen --dev` in `apps/api`). Do not replace package manifests/lockfiles. Setup completed successfully in this review; acceptance totals come from the saved fresh commands, not dependency installation.
3. Create ignored `.qa/config.env` with `QA_PROJECT=sg-morning-review-20261004`, `QA_PG_PORT=55752`, `QA_REDIS_PORT=56752`, `QA_API_PORT=8152`, `QA_METRO_PORT=8252`, and fresh private `QA_PG_PASSWORD` / `QA_SECRET_KEY`. See `scripts/qa/qa.py` for remaining config defaults. Never print credentials.
4. Use a private `SPORTSGANG_QA_HOME` outside human ownership records. The saved runner used `/private/tmp/sg-morning-review-private-20261004/owners`. It injects isolated API DB/Redis settings and `EXPO_PUSH_URL=''`.
5. Start only this project's databases:

```sh
docker compose -p sg-morning-review-20261004 -f scripts/qa/compose.qa.yml --env-file .qa/config.env up -d --wait
python3 docs/run-golf-v2/morning-acceptance/evidence/run_check.py migrate-new api -- .venv/bin/alembic upgrade head
```

The runner allows only `sportsgang_qa`, `sg_review_full` and `sg_review_sydney`. For full integration reproductions create the latter two inside this dedicated PostgreSQL container; give the second database default TimeZone Australia/Sydney. Run migrations and integration with `REVIEW_DATABASE` selecting each. Do not use a human project, reset command, hosted DB or paid provider.

## Focused probes

`test_independent_followups.py` uses real PostgreSQL and authenticated ASGI HTTP calls, separate worker processes and a recording provider. Socket-backpressure/hang cases inject controlled transport operations at the service boundary; these are not kernel/network saturation measurements. Guard assertions reject a different PostgreSQL port. It creates unique users/event rows and suppresses other due reviewer notification rows only within the dedicated database.

```sh
python3 docs/run-golf-v2/morning-acceptance/evidence/run_check.py followups-new api -- .venv/bin/python -m pytest -c pyproject.toml ../../docs/run-golf-v2/morning-acceptance/evidence/test_independent_followups.py -q -rs
python3 docs/run-golf-v2/morning-acceptance/evidence/run_check.py block-first-new api -- .venv/bin/python -m pytest -c pyproject.toml ../../docs/run-golf-v2/morning-acceptance/evidence/test_independent_block_first.py -q -rs
```

The first command should fail six safety assertions on this pinned candidate and pass six cleanup/ambiguity controls; the second should pass. New repairs should make the six defect assertions pass. Source imports existing pinned integration helpers and the real subprocess recording worker. Original mobile generated sources are saved as `codex-overnight-*.test.tsx`; temporary copies were removed from `apps/mobile/src/__tests__` after execution.

For the adapted R1 probe use `REVIEW_EVIDENCE` and the private API database environment documented by its source when paths differ; the saved runner sets these. The fresh result is `r1-adapted-results.json`. `adapted-probe-audit.json` compares original/adapted matrix and fresh-account ASTs, preserving scheduling review evidence.

Real legacy adoption additionally requires a private `qa_legacy.py` extracted from commit `60a264c9180103da18d0aa6aac794840381fd3be`. The saved real-adoption command's `MORNING_BOOT` was that private directory. The probe's teardown refusal is retained and explained in REVIEW.md. Do not adopt or stop human services.

## Evidence interpretation and cleanup

`preservation-before.json` snapshots worktree state but has no pre-run report hash manifest. `preservation-after.json` hashes and compares all prior reports/evidence with pinned Git blobs, and confirms unchanged other worktrees. Native pixels/AX are originals; no image/AX normalization was applied. Eight readable logs had only trailing whitespace or extra final blank lines removed; byte-exact originals are retained in `raw-text-originals/*.gz`. `text-normalization.json` records both hashes, including the reviewer probe source before removal of an extra final blank line. `MANIFEST.sha256` covers all published files except itself.

The recording API is an in-memory middleware wrapper, not a product edit. It records only booking time/form fields and status, excluding auth. Its intentional SIGTERM has exit -15; exact identity was verified before stopping. `stop_recording_api.py` contains this run's PID and **must not** be blindly rerun later. The normal `qa.py down` stopped owned Metro and containers with exit 0. The private review database volume is retained and reviewer simulator shut down. Human containers and all other booted simulators remain running. Read `recording-api-cleanup.json`, `reviewer-qa-down.log`, `services-after.json`, `simulators-after.json`.
