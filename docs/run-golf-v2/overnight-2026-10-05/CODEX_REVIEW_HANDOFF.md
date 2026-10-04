# Codex review handoff — overnight 2026-10-05 candidate

**No independent review has run on this candidate or on its base.** The Codex CLI was not
installed here (IMPLEMENTATION_REPORT §2). This document is the complete brief for the
reviewer; Claude's own results are implementation evidence only.

| Item | Value |
|---|---|
| Branch | `fix/run-golf-v2-overnight-2026-10-05` |
| Base delivery / source | `8d891ddb862de5345e85895a20fa65649ba1f46e` / `a515b0073cb0f32dad97f88430a203e3427444fe` (MA-A/B/C, composer large text, website) |
| Final source SHA | `a9b92c2430456e1b0055436824c6ad6dfcd7c6e4` |
| Delivery SHA | the branch head: `git ls-remote origin refs/heads/fix/run-golf-v2-overnight-2026-10-05` |
| Per-wave commits | W3 `1159f49` · W2 `b10f510` · W1 `a12a368` + test `a9b92c2` (disjoint files) |
| Previous publication | `ce62aac` (morning acceptance; reviewed `8b34bca`) |

Reviewer rules: change no product code; overwrite no original evidence; temporary execution
copies of reviewer tests are fine if their final sources are saved as evidence and the copies
removed; use review-only services (never `sportsgang-qa`, `sg-rc-20261004-qa` or
`sg-on-20261005-qa`, their ports, staging or production).

## Part A — the base candidate (`8d891dd`), as originally scoped

1. Pin and report the exact delivery/source SHAs.
2. Independently assess MA-C, MA-B and MA-A on real disposable PostgreSQL.
3. Preserve Q01–Q09 and the original R1/mobile safety expectations.
4. Judge the two reviewer probes that still fail (on `8d891dd` and on this branch alike —
   11 passed, 2 failed, `evidence/logs/reviewer-followups.log`):
   - `test_concurrent_processors_claim_event_once[two-workers]` waits for BARRIER from a
     second worker in `after-lock` mode; after the atomic claim the loser never reaches the
     token lookup (it prints `RESULT processed=0`). The implementation's replacement pins
     both workers *before* the claim (`test_notification_ownership.py::test_two_workers_paused_before_the_claim_invoke_the_provider_once`).
   - `test_provider_success_commit_failure_is_ambiguous` fails *every* commit, so the cycle
     now fails before dispatch; the replacement fails only the commit that records the send
     (`…provider_success_then_failed_commit_stays_unconfirmed_and_is_not_resent`).
   Establish behaviour-based replacements at the actual authority boundaries; do not accept a
   changed assertion only because it is green.
5. Notification claim ownership, no-token recovery, cancellation, process termination (note:
   a crash after the claim commits but before the provider call leaves the event
   `delivery_unconfirmed` — at-most-once by design), lock timeout, stale identity maps, status
   notices, provider-success/database-failure ambiguity.
6. Room-wide send/closure deadlines and cleanup after cancellation. **Distinguish the
   cancellation-cooperative assumption from a universal hard deadline**: `broadcast` cancels
   and then awaits unfinished sends without a bound; a send that ignored cancellation would
   hold the pair lock. Verify that unfinished sends do not escape authority release.
7. Event times under host-clock skew and real row-lock waits.
8. Report reproduced findings with narrow implementation ownership.

## Part B — this branch's changes

- **Chat ownership** (`ChatScreen.tsx`, `ChatScreen.ownership.test.tsx`): binding epochs per
  account + match; operation-owned guards; Q06-style dialog expiry; `updatedAt` merge of
  proposal refreshes; restriction detected by the contract's exact 403 detail string (the API
  client exposes no status code) and by socket close 4003; non-4003 closes shown as "Live
  updates paused." with a manual Reconnect. Check for missed paths (e.g. focus refresh after
  restriction, reconnect after token change) and whether string-matching the 403 detail is
  acceptable.
- **Chat layout**: chrome capped at 1.4×, input full width at `fontScale` ≥ 2.5, banner hidden
  while typing at `fontScale` ≥ 1.6. Native evidence: `evidence/native-chat/`. Judge whether
  capping chrome is acceptable readable scaling.
- **Website**: preview-only 301/404 hook in `apps/web/vite.config.ts`; `check-routes.mjs` in CI;
  `apps/web/hosting/netlify/_redirects` deliberately empty (reasoning in its README); print
  handling in `Faq.tsx` and `index.css`.
- **Release preflight**: `scripts/release/preflight.py` must never print a non-allow-listed
  env value (canary tests); R6 procedure validation and the proposed amendment
  (`release-preflight/r6/`) — judge the amendment; the gate document is unchanged.

## Part C — final review task

Judge all scoped findings against the actual final code; verify the chat safety and
accessibility repairs and the web behaviour; recheck MA-A/B/C and important Q01–Q09
non-regressions; assess the validity of the changed reviewer interleavings; and **separate code
acceptance, manual-QA readiness and production-release status**. Publish exact reviewed SHAs,
evidence, limitations and a repair handoff for anything remaining. Do not implement product
changes.

## Retest procedure (disposable services only)

```bash
git fetch origin
git worktree add /tmp/sg-review-overnight origin/fix/run-golf-v2-overnight-2026-10-05
cd /tmp/sg-review-overnight && (cd apps/api && uv sync --frozen --dev) && npm ci
docker run -d --name sg-review-on-pg -e POSTGRES_USER=sgr -e POSTGRES_PASSWORD=<random> \
  -e POSTGRES_DB=sg_review -p 127.0.0.1:<port>:5432 postgres:16-alpine
docker run -d --name sg-review-on-redis -p 127.0.0.1:<port>:6379 redis:7-alpine
export APP_ENV=local SECRET_KEY=<random 64 hex> \
  POSTGRES_URL=postgresql://sgr:<random>@127.0.0.1:<port>/sg_review REDIS_URL=redis://127.0.0.1:<port>/0
cd apps/api && uv run --frozen alembic upgrade head
```

| Check | Implementation result |
|---|---|
| `pytest tests_integration -q -rs` on fresh UTC and on fresh Sydney-default databases (flush Redis first) | 64 / 64 passed, 0 skipped |
| `pytest -q tests`; `ruff check .`; `ruff format --check .` | 773 passed; clean |
| `REVIEW_EVIDENCE=<dir> .venv/bin/python ../../docs/run-golf-v2/morning-fixes/evidence/probe_r1_adapted.py` | 94 PASS |
| `ce62aac` follow-up and block-first probes (port guard changed only) | 11 passed, 2 failed (Part A.4) |
| Root: `npm run test:ci -w @protin/mobile -- --runInBand --watchman=false` (also `TZ=UTC`) | 65 suites, 989 passed |
| Chat ownership baseline: copy `apps/mobile/src/__tests__/ChatScreen.ownership.test.tsx` into a worktree at `8d891dd` and run it | 18 failed, 2 passed (of the first 20; the 21st also fails there) |
| Root: `npm run lint -w @protin/mobile`; `npm run typecheck -w @protin/mobile` | clean |
| Root: `npm run typecheck -w @protin/web && npm run build -w @protin/web && npm run check:routes -w @protin/web` (Node 20) | 0 / 0 / 28 of 28 |
| `python3 -m unittest scripts/release/test_preflight.py`; `python3 scripts/release/preflight.py` | 17 OK; exit 0 |
| `python3 -m unittest scripts/qa/test_qa.py` (TZ unset and UTC) | 14 passed + 7 Docker skips |

Native: create your own simulator; for a visible software keyboard set
`ConnectHardwareKeyboard=0` for that device's UDID in `com.apple.iphonesimulator`
`DevicePreferences` before its first boot and enter text only through the on-screen Paste
callout (a hardware key event hides the keyboard). Relaunch Expo Go after each text-size
change. Expected frames: `evidence/native-chat/ax-frames.json`.

## Still gated regardless of the review

R6 production provenance (and the procedure amendment), live single-process WebSocket
topology, physical iPhone / VoiceOver / Android / signed build / real push provider, Safari,
website domain and host. No merge, deploy, App Store submission or paid build was made.
