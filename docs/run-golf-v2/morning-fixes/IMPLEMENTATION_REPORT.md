# Implementation report — morning repairs Q01–Q09

**Outcome: all nine confirmed findings repaired and verified locally; R6/C01
kept as a separate, still-open deployment gate.** The acceptance decision
belongs to the independent Codex review; see
[CODEX_REVIEW_HANDOFF.md](CODEX_REVIEW_HANDOFF.md).

## 1. Identities

| Item | SHA |
|---|---|
| Base (review publication; app identical to reviewed `ecd1e86`) | `d41efc2cbabed59f4b988e6177aa9354b9bdc3fd` |
| Wave 1 — Q01–Q03 (API) | `20049db` |
| Wave 3a — Q08 (QA launcher) | `55cebf8` |
| Wave 2 — Q04–Q07 (mobile) | `3f5ad41` |
| Wave 3b — Q09 (mobile layout) — **final application SHA** | `c46f414` |
| R6/C01 gate document | `3721d58` |
| Delivery (this report, evidence) | branch head; `git ls-remote origin refs/heads/fix/run-golf-v2-morning-q01-q09` |

**Why this base.** `git fetch --prune` showed no newer repair work on origin.
`d41efc2` is `cd567c8` plus review documents only (`git diff --name-only
ecd1e86 d41efc2` lists nothing outside `docs/`), so starting there puts the
review's documents and evidence beside the exact reviewed source. Worktree:
`.claude/worktrees/run-golf-v2-morning`. Branch:
`fix/run-golf-v2-morning-q01-q09`.

## 2. Findings → changes → decisive verification

| ID | Root cause | Change (files) | Decisive verification |
|---|---|---|---|
| **Q01** | Admission checked, released its transaction, then registered later. Delivery checked, then broadcast later. A block could commit in either gap, and its socket closure missed the late socket. | The pair's `users` rows in PostgreSQL are the single authority boundary. Admission takes the pair's `FOR SHARE` lock (`safety.lock_contact`), checks, registers the already-accepted socket, then rolls back. Delivery holds the same lock from check through broadcast. A block's `FOR NO KEY UPDATE` therefore commits before the check (socket refused, frame not pushed) or after the effect (its closure finds the socket). Per-socket send timeout 5 s. `apps/api/app/routers/chat.py`, `app/services/chat.py`, `app/services/safety.py`, CONTRACTS.md §8 | `tests_integration/test_contact_authority.py`, run with real uvicorn, a real websockets client and real PostgreSQL. Lock waits are observed in `pg_stat_activity`. Admission held → block waits → 201 → socket closed 4003 with no frame. Block first → 4003, never registered. Delivery held → block waits → frame, then closure. The review's two-barrier case → registration, frame, closure. On base `d41efc2` the three race tests fail with "no backend waited on a lock". |
| **Q02** | `_lock_pair` selected `User` entities. After a lock wait, SQLAlchemy returned the identity map's pre-wait actor (active). | `_lock_pair` selects scalar `User.id, User.is_active` under the lock (`safety.py`); lock order and transaction ownership are unchanged. | Same file, parametrised send/like/proposal. The actor is deactivated by a transaction holding the pair lock while the request waits; result is 403 with zero message/action/booking/notification rows, and the next `/auth/me` returns 401. On base all three return 201/200 with a stored row. |
| **Q03** | The proposal push checked the restriction, then awaited the token lookup and provider with no shared boundary, in both the API endpoint and `worker.py`. | A `proposal_received` dispatch holds the pair lock from check through token lookup and the provider call, commits per event, uses PostgreSQL `lock_timeout` 5 s (on timeout the cycle stops and events stay pending) and one 10 s provider deadline. Status notices take no lock. `app/services/notifications.py`, CONTRACTS.md §8 | Recording provider only. Block wins before the lock (in-process and in a separate worker process) → no provider invocation; event `contact_restricted`. Dispatch wins (in-process and separate worker) → the block waits on the lock, the proposal is pushed once, then the block returns 201 with no deadlock. Declined/cancelled notices still dispatch while blocked. Lock timeout leaves the event pending, sent on the next cycle. On base, dispatch-first fails with "no backend waited". |
| **Q04** | Transition and dialog currentness used the `${account}\|${booking}` string, which repeats on A→B→A; the preflight ignored `mounted`. | Monotonic binding epoch on every binding change. The booking, error, busy state and duplicate guard are tagged with it. The preflight requires mounted + same epoch; success, error and finally apply only in that epoch; the no-show dialog uses the same preflight (`BookingDetailScreen.tsx`). | `BookingDetailScreen.test.tsx` "binding epochs (review Q04)": the review's 4 failing probes and 2 controls, plus 5 new cases (A→B→A account success/failure, dialog across account A→B→A, same-epoch no-show posts once, old transition neither blocks nor releases the new one). |
| **Q05** | Store actions compared only the owner ID; finally released any guard on the same target. | Module owner epoch, bumped on owner change and reset; a unique action token, so only the holder releases `actingOn`; `hydrateFocus` checks the epoch. The nullable stale result and feed-generation invalidation are kept (`stores/explore.ts`). | `exploreStore.test.ts` "owner epochs and action ownership (review Q05)": 3 probes + control, both operation orders, a pre-logout action, a stale focus read. |
| **Q06** | The Block dialog's callback ran `block()` with no preflight; mount/focus were checked only after the write. | The owner epoch is snapshotted with the card. Each dialog has a token expired by blur, route change, unmount and use. The confirm requires the same token, mounted, focused and the same epoch **before** any request. Like/pass refuse a card from an earlier epoch (`PartnerDetailScreen.tsx`). | `PartnerDetailScreen.test.tsx` "block confirmation expiry (review Q06)": probe + control, A→B→A, unmount, blur (stays expired), covered screen, route change, one-shot, failed-block retry. |
| **Q07** | Initial, pull and focus loads were separate unguarded paths; focus success never cleared the error; retained owner change kept cards. | One `load('load'\|'pull'\|'focus')`. The newest request wins and unmounted responses are ignored. The list/error are tagged with an account epoch, so an owner change hides the previous cards in the same render and reloads. Success clears the error. The first focus is still skipped (`MatchesScreen.tsx`). | `MatchesScreen.test.tsx` "request ordering and owner (review Q07)": 3 probes + control and 5 new cases. Retained-screen owner replacement is documented separately from normal logout: ProfileScreen and RootNavigator reset the root stack, which unmounts Main. |
| **Q08** | `_legacy_reasons` parsed the system-zone `ps lstart` with `time.mktime` in the caller's `TZ` (11 h off with `TZ=UTC` on Sydney). | `proc_start_utc`: `ps` with `TZ=UTC`, parsed with `calendar.timegm`; a naive `started_at` is read as UTC. Identity `lstart` strings keep the system zone, so existing records, including the human stack's, compare as before. PID/pgid/command/cwd/5 s/project checks are unchanged (`scripts/qa/qa.py`). | `test_legacy_start_time_check_ignores_the_callers_time_zone` (UTC, Sydney, Kiritimati, Los Angeles: adopt exact, refuse 1 h off and a foreign pid); it fails on the base launcher. Docker launcher suite 21/21 in the host zone and 21/21 with `TZ=UTC`. Real pre-repair launcher (`60a264c`) started the actual API/Metro; the repaired launcher under `TZ=UTC` adopted the **same PIDs** (`legacy` → `running`). |
| **Q09** | The picker header was one non-wrapping row; at max text size Done ran to x=468 on a 390-pt screen. | The header wraps: title `flexShrink: 1`; Done has min 44×44, a whole label and right-aligns on its own row. The sheet cap goes 70%→90% and the hint is centred and padded, so the scaled footer stays on screen. No font cap (`BookingComposerScreen.tsx`). | New iPhone 16e simulator (390×844, iOS 26.3): at `accessibility-extra-extra-extra-large`, Done is at x=215 w=151 h=79.7 (right edge 366) for both pickers; default x=310.7 w=55.3 h=44. Both neighbour taps settle on :30 at both sizes; swipe settles on a row; close/reopen keeps the time. Form 11:30–12:30 = HTTP `00:30Z`–`01:30Z` = PostgreSQL `00:30+00`/`01:30+00`. |

## 3. R6 / C01

Reproduced, documented and gated; no source change. See
[R6_C01_DEPLOYMENT_GATE.md](R6_C01_DEPLOYMENT_GATE.md).
- With the default UTC pin, both overlap inputs are exact.
- With `Australia/Sydney`, both are stored as `2026-04-05 02:30`, and the
  second comes back as 15:30Z.
- PostgreSQL reads that wall time as the later instant; the API reads it as
  the earlier.
- The read-only production provenance procedure is prepared and **NOT_RUN**.
- No row was rewritten and no configuration was changed.

## 4. Verification (actual commands, exit codes, totals)

All on the final application code `c46f414` unless noted. API commands run
from `apps/api`; others from the worktree root. Node 26.7.0, npm 11.19.0,
Python 3.12 (uv 0.11.15), PostgreSQL 16 and Redis 7 containers. Logs are in
`evidence/logs/`.

| Check | Command | Exit | Result |
|---|---|---|---|
| Ruff | `uv run --frozen ruff check . && uv run --frozen ruff format --check .` | 0 | clean; 148 files formatted |
| API unit | `uv run --frozen pytest -q` | 0 | **772 passed**, 0 skipped; 867 warnings (deprecations; the base suite in this environment shows 880) |
| Q01–Q03 regressions | `uv run --frozen pytest tests_integration/test_contact_authority.py -q` | 0 | **13 passed** |
| Integration, fresh DB, UTC default | `uv run --frozen pytest tests_integration -q -rs` | 0 | **42 passed, 0 skipped** |
| Integration, fresh DB, `Australia/Sydney` default — attempt 1 | same | 1 | 40 passed, **2 failed**: both `test_leave_then_rejoin_reuses_the_participant_row` params, rejoin `joined_at` 2.5–2.8 ms *before* the first join |
| Integration, second fresh DB, `Australia/Sydney` default — attempt 2 | same | 0 | **42 passed, 0 skipped** |
| Adapted review probe | `.venv/bin/python …/evidence/probe_r1_adapted.py` | 0 | **94 PASS, 0 FAIL, 0 harness errors** (run at `20049db`; API unchanged since) |
| Mobile Jest | `npm run test:ci -w @protin/mobile -- --runInBand --watchman=false` | 0 | **967 passed, 64 suites, 0 skipped**; the 17 `console.error` lines are the same pre-existing `act()` warnings as the review's log |
| Review mobile probes | `REVIEW_ROOT=<worktree> make_mobile_probes.py`, then Jest `--runTestsByPath` on the four copies (removed afterwards) | 0 | **16 passed** (was 5/16 on `ecd1e86`) |
| Mobile lint | `npm run lint -w @protin/mobile` | 0 | 0 warnings |
| Typecheck | `npm run typecheck -w @protin/mobile`; `… -w @protin/shared-types` (at `3f5ad41`; generated `tsbuildinfo` restored) | 0 | clean |
| iOS bundle | `npx --no-install expo export --platform ios` (apps/mobile) | 0 | 1,418 modules, Hermes bundle 4.42 MB (bundle check, not a signed build) |
| Launcher, Docker-free | `python3 -m unittest scripts/qa/test_qa.py -v`, host zone and `TZ=UTC` | 0 / 0 | 14 passed, 7 skipped each |
| Launcher + Docker | `QA_TEST_DOCKER=1 …`, host zone and `TZ=UTC` (at `55cebf8`; launcher unchanged since) | 0 / 0 | **21/21 each** |
| Q08 real adoption | `TZ=UTC … evidence/probe_qa_real_adapted.py` (project `sg-morning-q08-real`) | 0 | API pid 95216 and Metro pid 95251 adopted unchanged, `legacy` → `running` |
| C01 probe | `DB_NAIVE_TIMEZONE={UTC,Australia/Sydney} … evidence/probe_r6_overlap_by_zone.py` | 0 / 0 | UTC exact ×2; Sydney: 16:30Z serialized as 15:30Z |
| Q09 native | simulator steps, `evidence/native-q09/` | — | PASS (see §2 Q09) |
| GitHub Actions | run [37166797458](https://github.com/EdwardH-jedi/Sportsgang/actions/runs/37166797458) on `3f5ad41` | — | 8/8 jobs success; the run for the delivery head is listed in the handoff message |

**Sydney attempt 1 explained (environment, not a regression).** The first
join's `joined_at` is the database `now()` default, while a rejoin sets it
from the API host clock (`events.py:435`). On this machine the PostgreSQL
container's clock runs **46 ms ahead** of the host (median of 20 round
trips). A rejoin within 46 ms of the first join therefore reads as earlier.
Neither that code nor that test changed from base. Results:
- Repeated runs of only that test: 3 of 5 repaired runs had a failure while
  the unit suite was loading the machine, and 0 of 5 base runs did.
- On an idle machine, alternating 10 base and 10 repaired runs: 0 failures
  either way.
- A second fresh Sydney-default database: 42/42.

On CI's single-kernel clock this cannot happen. The clock-mixing assumption is
pre-existing and is noted for the API owner, not changed here.

Baseline-detection runs against `d41efc2`: the 13 new Q01–Q03 tests → 11
failed, 2 controls passed (7 defect failures, 4 that error on the missing
lock step). The Q08 time-zone test fails on the base launcher. The
subagent's run of the 37 new mobile tests against the original four sources
gave 28 failures, including all 11 review probe failures.

Native Q09 evidence: `evidence/native-q09/` (13 screenshots, `q09-frames.json`,
`proposal-http.json`, `proposal-postgres.txt`).

Not run: physical iPhone, VoiceOver, Android, signed native build, real
Expo/APNs push, production database and services.

## 5. Isolation and preservation

- Ran on my own isolated services and devices only:
  - PostgreSQL/Redis containers `sg-morning-q01q09-*` (127.0.0.1:55631/56631);
  - launcher projects `sg-morning-q08-real` and `sg-morning-q09`, with
    private owner homes;
  - the simulator "SportsGang Morning Q01-Q09".
- Credentials stayed in private files outside the repo or in git-ignored
  `.qa/`.
- Not touched: the human home-test stack (`sportsgang-qa`, 55470/56470), its
  simulators, the other worktrees, the review branch, and the website branch.
- Expo Go was installed on the new simulator by copying its app bundle from
  an existing simulator's data directory (read-only). That simulator was not
  booted, switched or modified.
- Original reports and evidence (`CODEX_OVERNIGHT_*`,
  `overnight-evidence-2026-10-04/`) are unchanged. CONTRACTS.md §8 gained the
  ordering rule (precedent: the R1–R7 delivery edited §8/§9).

## 6. Limitations

- Realtime sockets are safe only with one API process. A second Fly `app`
  machine would hold sockets a block's closure cannot reach (CONTRACTS §8,
  topology limit; pre-existing, out of scope).
- A block that arrives during a proposal push waits up to about 10 s (the
  provider deadline). A block that arrives during a WebSocket broadcast waits
  up to 5 s per slow socket.
- The review's original `probe_r1.py` race cases cannot run unchanged: they
  would wait forever on the block that the repair now orders after the
  effect. See the handoff for the adapted probe.
- At max text size, the composer's own screen title breaks mid-word. It is
  outside the picker header Q09 names and was not changed.
- Q06/Q07 owner-replacement tests drive retained components; normal logout
  unmounts Main.
