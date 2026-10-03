# Run + Golf v2 — pre-test verification (implementer verification)

**Author:** Claude, the implementer of the F1–F8 repairs.
- This is **implementer verification**, not an independent review.
- No Codex review was run or written by this task. `CODEX_REVIEW.md` is unchanged and remains the historical NEEDS_FIXES review.
- `CODEX_REVIEW_AFTER_FIXES.md` does not exist.

## 0. Source

| Item | Value |
| --- | --- |
| Base | `origin/fix/run-golf-v2-review-fixes` = `0789382` (F1–F8 repairs, CI green) |
| Task branch | `chore/run-golf-v2-home-test-ready` in `.claude/worktrees/run-golf-v2-home-test` |
| Changes since base | `3d6bcf8` QA launcher and seeder · `60d7c12` picker a11y · `ff2fb3b` partner Block · `3aaab6d` blocked-user names · `c97ef9a` My Plans refresh notice + launcher reload · `a2f2186` booking-detail retry · `5b154b9` `qa:stop-api` · docs/evidence commits |
| Final automated run | HEAD `5b154b9` (app and API source identical to the final pushed HEAD; later commits are docs/evidence only) |

## 1. F1–F8 re-verified on the base (`0789382`)

All evidence is in `pretest-evidence/`. Each run used fresh services, recorded by `fix-evidence/record.py`.

| Check | Result |
| --- | --- |
| API pytest | 751 passed, 0 skipped (`api-pytest.log`) |
| Integration | 22 passed on a freshly migrated PostgreSQL 16 (`integration.log`) |
| Mobile Jest | 867 passed, 61 suites (`mobile-tests.log`) |
| `probe_findings` | 7/7 PASS under TZ=UTC and TZ=Australia/Sydney: F1 rejoin, F2 segments, F3 consent, F5 instants (`probe-*.json`) |

The F1–F8 native checks from `FIX_IMPLEMENTATION_REPORT.md` were not repeated wholesale.
- The home scenarios (runbook 3, 4, 6, 7, 8, 9) cover F1–F8 again by hand.
- During this task, golf/run partners, join → leave (double tap), My Plans with 110 past rows and booking detail were re-observed natively.

## 2. Found during this pass and fixed (with regressions)

Each fix was re-verified natively on Expo Go 54 / iOS 26.3.

| # | Defect (how found) | Origin | Fix | Regression (fails on old code) | Native evidence |
| --- | --- | --- | --- | --- | --- |
| 1 | Onboarding Birth year / suburb picker exposed the whole list as **one** accessibility element; the trigger did not expose the chosen value (AX tree on the simulator). | pre-existing `Select` | `60d7c12`: the sheet is a sibling of the backdrop; each option is a button with `selected`; the trigger has a value + `expanded`; "Close …" button | `Select.test.tsx` 5 tests (4 fail on old) | `native/a11y-before-birth-year.json` vs `a11y-after-birth-year.json` |
| 2 | Partner detail button read "Report or block" but opened only the report form; there was no way to block from Explore. | v2 partner detail | `ff2fb3b`: separate "Report" and confirmed "Block" (`POST /blocks`); card dropped from the feed; error kept on failure | `PartnerDetailScreen.test.tsx` block success/failure | `moderation-block-confirm.png`, `moderation-after-block.png` |
| 3 | Blocked users list showed the raw user id ("Unblock 21c94630-…"). | pre-existing since `aa043f4` | `3aaab6d`: `GET /blocks` adds `blocked_display_name` (outer join on the profile, null without one; shared-types synced). The screen shows the name or "Unnamed member" | `test_safety.py::test_list_blocks_names_the_blocked_user`; `BlockedUsersScreen.test.tsx` (6/10 fail on old) | `moderation-blocked-list-before-fix.png` → `moderation-blocked-list-named.png` |
| 4 | With the API unreachable, a My Plans refresh showed **two** notices, each saying the *other* source was "still shown". Both had failed and the rows were stale. | v2 My Plans (F2) | `c97ef9a`: one notice "Couldn't refresh your plans. Showing what was loaded earlier."; per-source refresh copy; first-load copy unchanged | `MyPlansScreen.test.tsx` 2 tests (both fail on old) | `network-api-down-refresh.png` |
| 5 | Booking detail offline was a dead end: red text, no Back, no retry. | pre-existing booking detail | `a2f2186`: header kept + shared `ErrorState` with "Try again" | `BookingDetailScreen.test.tsx` "keeps Back and a working retry…" (fails on old) | `network-api-down-booking-detail-before-fix.png` → `network-api-down-booking-detail.png` → `network-recovered-booking-detail.png` |

Launcher defect: `qa:restart` re-opened the URL but Expo Go kept the old JS bundle. Fixed in `c97ef9a`: the open step quits Expo Go first. Sign-in survives because it is stored on the device.

## 3. Found, not fixed (needs a decision)

**Naive timestamps shown as local time.**
- **Columns:** `messages.created_at`, `bookings.created_at/updated_at`, `blocks.created_at`, `reports.created_at`, `notification_events.created_at`, `push_tokens.created_at`, `calendar_booking_syncs.created_at` and `google_calendar_tokens.connected_at` are `timestamp without time zone`. They are filled by `now()` (QA PostgreSQL `TimeZone` = UTC).
- **What the API returns:** e.g. `"created_at": "2026-10-03T08:09:07.426424"`, with no offset. JavaScript parses that as device-local time.
- **Visible effect:**
  - The Chats list shows "8:09 AM" for a message sent at about 6:09 pm Sydney (`layout-17pro-chats.png`).
  - Blocked users dates can be a day off between 00:00 and 10:00 Sydney time.
  - The chat thread shows no times. It interleaves messages and proposals by comparing the two equally naive strings, which is consistent today.
- **Why not patched here:**
  - The correct fix is a column-type migration (`ALTER … TYPE timestamptz USING col AT TIME ZONE 'UTC'`) after confirming the production database time zone, and this task excludes migrations.
  - A read-side "naive = UTC" patch would hard-code a production assumption that can't be verified from here.
  - Patching only messages would break the thread interleaving with bookings.
  - Your separate `feat/run-first-ui` branch has `932f5c7 "one formatter for times and dates"`; reconcile with it.

## 4. Observations, unchanged (product decisions, not defects)

- Session cards read "6 runners · 5 spots left": the number is the group size ("Total runners including you" in the host form). Some readers may take it as six people going.
- "Leave this run" has no confirmation; rejoining is one tap.
- `apps/mobile/src/lib/safety.ts` keeps its own copy of the block types instead of importing `@protin/shared-types`, contrary to the api-contract skill. This is pre-existing; both copies were updated.
- For a received pending proposal, booking detail offers Confirm, Decline and Cancel (FSM-allowed; Decline and Cancel overlap for the receiver).

## 5. Hypotheses probed, not reproduced

| Hypothesis | Result |
| --- | --- |
| `useEventDetail` applies a stale response after navigation | Not reproduced: request generation guard + tests |
| Double tap on Join sends two joins | Not reproduced natively: one `POST /events/…/join` for a double tap on iPhone 17 Pro |
| `usePlans` refresh/load-more race loses rows | Not reproduced (generation guard; `myPlansPaging.test.tsx`) |
| Error rendered as an empty state | Not reproduced: both-sources first-load failure shows "Could not load your plans" + Try again |
| Outsider access | Refused: Cara reading/posting in the Alice–Bob chat → 403; others' bookings read/confirm/cancel → 404; deleted account's token → 401 (`outsider-access.txt`) |

## 6. Final automated results (HEAD `5b154b9`)

| Command | Exit | Result |
| --- | --- | --- |
| `alembic upgrade head` on fresh disposable PG 16 (tmpfs) | 0 | 0001 → 0016 (`final-migrate-fresh.log`) |
| `uv run pytest tests_integration -q` (same fresh PG + Redis 7) | 0 | 22 passed, 0 skipped |
| `uv run ruff check .` / `uv run ruff format --check .` | 0 / 0 | clean |
| `uv run pytest -q` | 0 | **752 passed**, 0 skipped (751 + 1 new) |
| `npm run lint --workspace @protin/mobile` | 0 | 0 warnings |
| `npm run typecheck --workspace @protin/mobile` / `@protin/shared-types` | 0 / 0 | clean |
| `npm run test:ci --workspace @protin/mobile -- --runInBand` | 0 | **878 passed, 62 suites**, 0 skipped (867 + 11 new) |
| `expo export --platform ios` (APP_ENV=local, no `EXPO_PUBLIC_API_URL`) | 0 | Hermes bundle 4.41 MB, outside the repository (**bundle check only — not a release build**) |

## 7. Native results (Expo Go 54.0.7, iOS 26.3 simulators)

| Area | Device | Result |
| --- | --- | --- |
| Picker accessibility | iPhone 16e | PASS after fix (§2 #1) |
| Partial onboarding resume (Step 1 then relaunch) | iPhone 16e | Lands in Explore with "Set up your running preferences / Set up now" (documented contract) |
| Running partners vs manifest | iPhone 16e, 17 Pro | PASS (Fern fits; Cara/Mod pace not confirmed; Eve not set; Dan and Bob absent) |
| Golf partners vs manifest | iPhone 17 Pro | PASS (Bob via learning route; Cara absent) |
| Report → block → unblock | iPhone 16e | PASS after fixes (§2 #2, #3); API 201/201/204 |
| Account deletion → login refused | iPhone 16e | PASS (`DELETE /auth/me` 204; login 401 "Invalid credentials") |
| API unreachable → retry → recovered | iPhone 16e | PASS after fixes (§2 #4, #5) |
| Join double tap → one request; leave restores | iPhone 17 Pro | PASS |
| Layout: Explore run/golf sessions + partners, partner detail, session detail, host form, My Plans, booking detail, Chats, chat thread | iPhone 17 Pro | No clipping or overlap (`layout-17pro-*.png`) |
| Device (LAN) mode | simulator opening `exp://192.168.1.105:8190` | PASS; API log shows requests from the LAN address (`qa-device-mode.log`) |

## 8. Gaps (not verified)

- Sign in with Apple, real push delivery, physical iPhone (the paired device was unavailable) and dev-client/release builds. There are no signing identities on this Mac.
- My Plans one-source failure natively (no fault injector; covered by Jest).
- Large-text sweep (listed as an optional runbook check).
- The naive-timestamp issue in §3.
