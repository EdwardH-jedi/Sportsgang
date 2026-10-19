# Booking FSM mutation check — 2026-10-19

**Result: 28 of 31 mutants killed. Three survive every suite: a non-participant transition (G4), the notification recipient (S4) and the reminder names (S6).**

That result is historical (tests at `d3429a9`). Section 6 re-runs the three survivors against the tests #21 adds: all three are killed.

Code under test: `apps/api/app/services/bookings.py` at `d3429a9` (`main`; the file last changed in `6761aa5`, #13). Suites: the unit suite `apps/api/tests` (706 tests, DB and Redis mocked) and, for unit-suite survivors only, the integration suite `apps/api/tests_integration` (4 tests on PostgreSQL 16 + Redis 7, as in the CI `integration` job). Nothing here changes code; the findings below are recorded, not fixed.

## 1. Method

- Each mutant is one exact text replacement in `bookings.py`, unique in the file, applied in a throwaway detached worktree at `d3429a9` with its own `uv sync --frozen` venv. `app.services.bookings.__file__` resolved to the worktree copy. The file was restored with `git checkout` after every mutant and the worktree ended clean.
- **Phase 1:** `uv run --frozen pytest tests/test_booking_fsm.py tests/test_bookings.py -q` (128 tests, ~15 s). Any non-zero exit counts as killed.
- **Phase 2**, only if phase 1 passed: `uv run --frozen pytest tests -q` (706 tests, ~2 min).
- **Phase 3**, only for unit-suite survivors: `uv run alembic upgrade head` on a fresh `postgres:16-alpine` container, then `uv run --frozen pytest tests_integration -q` with the CI job's environment. Redis was flushed before each run: registration is rate-limited in Redis, so without the flush a second run fails `test_booking_journey` on the limiter, not on the mutant. G5 ran three times because it depends on a race.
- Baselines before mutating: 128/128 targeted, 706/706 unit, 4/4 integration.

## 2. Results

`fsm::` = `tests/test_booking_fsm.py`, `bk::` = `tests/test_bookings.py`, `rank::` = `tests/test_rank.py`, `pg::` = `tests_integration/test_postgres_integrity.py`. "Failed" is the phase-1 count unless stated.

| ID | Mutation | Result | Killed by (examples) |
|---|---|---|---|
| T1 | drop `("proposed", "confirmed"): "partner"` | killed, 11 failed | `fsm::test_documented_transition_by_each_participant[proposed->confirmed-*]`, `fsm::test_double_confirm_has_no_repeated_side_effects` |
| T2 | drop `("proposed", "declined"): "partner"` | killed, 5 | `fsm::…[proposed->declined-*]`, `bk::test_partner_can_decline_booking` |
| T3 | drop `("proposed", "cancelled"): "proposer"` | killed, 7 | `fsm::…[proposed->cancelled-*]`, `fsm::test_cancel_from_each_state[proposed-proposer]` |
| T4 | drop `("confirmed", "cancelled"): "either"` | killed, 4 | `fsm::…[confirmed->cancelled-*]`, `fsm::test_cancel_from_each_state[confirmed-proposer]` |
| T5 | drop `("confirmed", "completed"): "either"` | killed, 4 | `fsm::…[confirmed->completed-*]`, `bk::test_complete_transition` |
| T6 | drop `("confirmed", "no_show"): "either"` | killed, 6 | `fsm::…[confirmed->no_show-*]`, `fsm::test_no_show_from_each_state[confirmed-proposer]` |
| A1 | proposed→confirmed `"partner"` → `"either"` | killed, 2 | `fsm::…[proposed->confirmed-proposer]`, `bk::test_proposer_cannot_confirm_own_booking` |
| A2 | proposed→declined `"partner"` → `"either"` | killed, 2 | `fsm::…[proposed->declined-proposer]`, `bk::test_proposer_cannot_decline_own_booking` |
| A3 | proposed→cancelled `"proposer"` → `"either"` | killed, 3 | `fsm::…[proposed->cancelled-partner]`, `bk::test_partner_cannot_cancel_proposed_booking` |
| A4 | proposed→confirmed `"partner"` → `"proposer"` | killed, 11 | `fsm::…[proposed->confirmed-*]` |
| A5 | proposed→cancelled `"proposer"` → `"partner"` | killed, 7 | `fsm::…[proposed->cancelled-*]` |
| A6 | confirmed→cancelled `"either"` → `"proposer"` | killed, 2 | `fsm::…[confirmed->cancelled-partner]`, `fsm::test_cancel_from_each_state[confirmed-partner]` |
| A7 | confirmed→completed `"either"` → `"partner"` | killed, 3 | `fsm::…[confirmed->completed-proposer]`, `bk::test_completed_is_terminal` |
| A8 | confirmed→no_show `"either"` → `"proposer"` | killed, 3 | `fsm::…[confirmed->no_show-partner]`, `bk::test_no_show_transition` |
| E1 | add `("confirmed", "confirmed"): "either"` | killed, 3 | `fsm::test_invalid_transition_is_rejected_with_422[confirmed->confirmed-*]` |
| E2 | add `("completed", "cancelled"): "either"` | killed, 5 | `fsm::…_with_422[completed->cancelled-*]`, `fsm::test_cancel_from_each_state[completed-proposer]` |
| E3 | add `("declined", "confirmed"): "partner"` | killed, 3 | `fsm::…_with_422[declined->confirmed-*]`, `bk::test_declined_is_terminal` |
| G1 | partner-only guard `if allowed_by == "partner" and …:` → `if False:` | killed, 4 | `fsm::…[proposed->confirmed-proposer]`, `bk::test_proposer_cannot_confirm_own_booking` |
| G2 | proposer-only guard → `if False:` | killed, 3 | `fsm::…[proposed->cancelled-partner]`, `bk::test_partner_cannot_cancel_proposed_booking` |
| G3 | two-distinct-participants guard `if b.proposer_id == b.partner_id:` → `if False:` | killed, 1 | `fsm::test_booking_without_two_distinct_participants_cannot_transition` |
| G4 | `await _assert_booking_participant(b, current_user_id)` in `transition_booking` → `pass` | **survived** — unit 706/706, integration 4/4 | — (finding F1) |
| G5 | `_get_booking_or_404(…, for_update=True)` → `for_update=False` | unit 706/706 pass; **killed by integration, 3/3 runs** | `pg::test_concurrent_double_completion_awards_once` (`UniqueViolation` on `uq_honor_events_user_booking_reason`), `pg::test_concurrent_confirm_vs_decline_has_one_winner` (`[200, 200]` vs `[200, 422]`) |
| S1 | drop `"confirmed": "booking_confirmed"` from the notification map | killed, 2 | `fsm::…[proposed->confirmed-partner]`, `fsm::test_double_confirm_has_no_repeated_side_effects` |
| S2 | drop `"declined": "booking_declined"` | killed, 1 | `fsm::…[proposed->declined-partner]` |
| S3 | drop `"cancelled": "booking_cancelled"` | killed, 6 | `fsm::…[*->cancelled-*]`, `fsm::test_cancel_from_each_state` |
| S4 | `other_id = b.partner_id if … else b.proposer_id` → `other_id = current_user_id` | **survived** — unit 706/706, integration 4/4 | — (finding F2) |
| S5 | reminder block `if new_status == "confirmed":` → `if False:` | killed, 2 | `fsm::…[proposed->confirmed-partner]`, `fsm::test_double_confirm_has_no_repeated_side_effects` |
| S6 | reminder names swapped (`other_card if recipient_id == current_user_id else actor_card` → `actor_card if … else other_card`) | **survived** — unit 706/706, integration 4/4 | — (finding F2) |
| S7 | `await rank_service.record_booking_transition(…)` → `pass` | killed, 15 | `fsm::test_documented_transition_by_each_participant`, `fsm::test_no_show_from_each_state` |
| S8 | `previous_status = b.status` → `previous_status = new_status` | killed by the full unit suite only, 5 failed | `rank::test_completed_booking_creates_positive_honor_event`, `rank::test_no_show_creates_negative_honor_for_other_and_actor`, `rank::test_late_cancellation_dings_actor_only` |
| S9 | drop the final `await db.commit()` in `transition_booking` | killed, 23 | `fsm::test_documented_transition_by_each_participant`, `bk::test_complete_transition` |

## 3. Findings (recorded, not fixed)

- **F1 — no test sends a non-participant through a transition (G4).** `transition_booking` rejects non-participants with 404 before `_check_transition` runs. Without that check, the actor guards still stop outsiders on the `"partner"`/`"proposer"` edges, but the three `"either"` edges (confirmed → cancelled / completed / no_show) would accept them. The existing non-participant tests (`bk::test_non_participant_cannot_access_booking`, the `outsider` in `tests_integration/test_booking_journey.py`) only `GET` the booking. Candidate test: an outsider `POST`s `/bookings/{id}/cancel`, `/complete` and `/no-show` on a confirmed booking → 404, status unchanged.
- **F2 — notification recipient and reminder names are not asserted (S4, S6).** `fsm::NOTIFICATIONS` pins how many notifications each transition schedules, not who receives them or which name they carry. Notifying the actor instead of the other participant, or swapping the names in the two reminders, passes every test. Candidate test: assert `schedule_booking_notification`'s recipient id and display name in the FSM tests.
- Not findings, for the record: G5 is caught only by the CI `integration` job (the unit suite mocks the session, so it cannot see a dropped row lock), and S8 only by `tests/test_rank.py`, not by the booking tests.

## 4. Earlier mutation checks

| Where | Ran against | Mutations | Recorded result |
|---|---|---|---|
| #10 PR body | head `530c072` (merged `22866fc`, 2026-10-17) | add `("confirmed", "confirmed")` and widen `("proposed", "cancelled")` to `"either"`, applied together | 5 failures; source restored |
| #14 PR body | head `19e63f3` (merged `b46edc5`, 2026-10-18) | proposed→declined `"either"`; drop confirmed→completed; drop the decline notification | 1, 2 and 1 failures |
| `OVERNIGHT_AUDIT_2026-10-17.md` | — | T5 row: "historical mutation experiment not rerun"; Follow-up: summarises #14 | — |

Those correspond to E1 + A3, A2, T5 and S2 here. All are still killed; counts differ because this run's phase 1 also includes `tests/test_bookings.py`.

## 5. Re-running

Recreate the worktree at the commit under test (`git worktree add --detach <dir> <sha>`, then `uv sync --frozen` in `<dir>/apps/api`), apply each mutation in section 2 as a single replacement, run phases 1–3 as in section 1, and restore the file between mutants. For phase 3, start `postgres:16-alpine` (user/password `protin`, db `protin_ci`) and `redis:7-alpine`, and set `APP_ENV=local`, `SECRET_KEY`, `POSTGRES_URL` and `REDIS_URL` as in `.github/workflows/ci.yml`.

## 6. Re-run after #21 (2026-10-19)

The three survivors, re-run against #21's head `6ab26f0` (`tests/test_booking_fsm.py`, 141 tests; `bookings.py` unchanged since `d3429a9`). Same method as section 1, phase 1 only, in a throwaway detached worktree, file restored after each mutant. The table in section 2 stays as it was: it records what the suite at `d3429a9` caught.

| ID | Mutation | Result on `6ab26f0` | Killed by |
|---|---|---|---|
| G4 | `await _assert_booking_participant(b, current_user_id)` in `transition_booking` → `pass` | **killed**, 36 failed / 105 passed | `fsm::test_non_participant_cannot_transition` (all 36 source/destination pairs) |
| S4 | `other_id = … else b.proposer_id` → `other_id = current_user_id` | **killed**, 5 failed / 136 passed | `fsm::test_transition_notifies_the_other_participant_by_the_actors_name`, `fsm::test_confirm_notifies_proposer_and_reminds_each_participant_of_the_other` |
| S6 | reminder names swapped | **killed**, 1 failed / 140 passed | `fsm::test_confirm_notifies_proposer_and_reminds_each_participant_of_the_other` |

Codex's independent verification of #21 (2026-10-19) reported the same three counts. With #21 merged, 31 of 31 mutants are killed: 30 by the unit suite, G5 by the PostgreSQL integration tests. F1 and F2 above are closed by #21.
