---
name: booking-fsm
description: Guide for working with the booking state machine in apps/api/app/services/bookings.py
triggers: [booking, 예약, 상태 전이, FSM, state machine, transition]
---

# Booking FSM Skill

## Source of truth
`apps/api/app/services/bookings.py` — `_TRANSITIONS` dict

## Valid states and transitions

```
proposed        → confirmed     (partner accepts)
proposed        → declined      (partner declines)
proposed        → cancelled     (proposer withdraws)
confirmed       → completed     (session happened)
confirmed       → cancelled     (either party cancels)
confirmed       → no_show       (partner didn't show)
declined        → (terminal)
completed       → (terminal)
cancelled       → (terminal)
no_show         → (terminal)
```

## Rules for adding a new state or transition

1. **Update `_TRANSITIONS`** in `bookings.py` — this is the single source of truth
2. **Add Alembic migration** if the DB `BookingStatus` enum changes
3. **Write pytest** covering the new transition and its rejection cases (invalid → new state must raise)
4. **Update shared-types** if the status enum is exported to the frontend

## Anti-patterns to avoid
- Do not add state transitions outside of `_TRANSITIONS` (e.g., direct DB updates that bypass the FSM)
- Do not make terminal states transitionable
- Do not add states without rejection test cases
