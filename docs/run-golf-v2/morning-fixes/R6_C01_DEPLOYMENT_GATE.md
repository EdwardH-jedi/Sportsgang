# R6 / C01 — audit-instant deployment gate (separate from Q01–Q09)

**Status: OPEN GATE. Production provenance NOT_RUN** (no production access was
used). No historical row was read, rewritten or migrated. No deployment
configuration was changed. This document prepares the procedure and a
proposal; the decision belongs to the contract/deployment owner.

Source: review C01 (`CODEX_OVERNIGHT_ACCEPTANCE_2026-10-04.md`), CONTRACTS.md
§9, `apps/api/app/core/time.py`, `apps/api/app/core/config.py`
(`db_naive_timezone`, `db_connect_args`).

## 1. What C01 is

Nine audit columns are `timestamp without time zone` filled by PostgreSQL
`now()` in the writing session's `TimeZone`; R6 pins every API/Alembic session
to `DB_NAIVE_TIMEZONE` (default `UTC`) and serializes values back as UTC
instants.

- With `UTC` (the default), every instant has its own wall time: exact.
- With a zone that has daylight saving, such as `Australia/Sydney`, the
  autumn fall-back hour happens twice. Two different instants are stored as
  the same naive value, and no reader can tell them apart afterwards. The
  API's converter resolves such a value to the earlier instant (`fold=0`).

The existing §9 rule "one other zone `Z` throughout → deploy with
`DB_NAIVE_TIMEZONE=Z`" makes history read correctly **and** keeps new writes
in `Z`, so from the next fall-back on, new writes would lose an hour of
identity. That is the information loss C01 records.

## 2. Reproduction (isolated PostgreSQL 16, read-only scalar conversion)

`evidence/probe_r6_overlap_by_zone.py`, run once per configured zone against
the disposable database (`127.0.0.1:55631`). The inputs are the review's, either
side of Sydney's 2026-04-05 03:00 → 02:00 fall-back. Results are in
`evidence/r6-overlap-UTC.json` and `evidence/r6-overlap-Australia-Sydney.json`.

| `DB_NAIVE_TIMEZONE` (session pinned to it) | Instant | Stored naive (`now()` equivalent) | API serializes | Exact |
|---|---|---|---|---|
| `UTC` | 2026-04-04T15:30Z | 2026-04-04 15:30 | 2026-04-04T15:30Z | yes |
| `UTC` | 2026-04-04T16:30Z | 2026-04-04 16:30 | 2026-04-04T16:30Z | yes |
| `Australia/Sydney` | 2026-04-04T15:30Z | 2026-04-05 02:30 | 2026-04-04T15:30Z | yes |
| `Australia/Sydney` | 2026-04-04T16:30Z | 2026-04-05 02:30 | 2026-04-04T15:30Z | **no — one hour lost** |

This matches the review's `r6-overlap.json`. Scope: PostgreSQL's real
`AT TIME ZONE` conversion plus the actual `utc_instant` converter, at
controlled instants. It is not a live `INSERT` under a frozen clock.

PostgreSQL itself resolves the ambiguous wall time differently from the API:
`TIMESTAMP '2026-04-05 02:30' AT TIME ZONE 'Australia/Sydney'` returns
**16:30Z** (the later instant), while the API's `fold=0` reads it as **15:30Z**.
Any future SQL migration of such rows must therefore choose its resolution
explicitly rather than inherit PostgreSQL's default.

## 3. Read-only production provenance procedure (prepared, NOT_RUN)

Run by the deployment owner on the production database with a read-only role,
before the API containing R6 is deployed. Keep the outputs as evidence.

```sql
-- 1. Current and configured zone, and any per-database/per-role override.
SHOW timezone;
SELECT setting, source, sourcefile FROM pg_settings WHERE name = 'TimeZone';
SELECT coalesce(d.datname, '*') AS db, coalesce(r.rolname, '*') AS role, s.setconfig
  FROM pg_db_role_setting s
  LEFT JOIN pg_database d ON d.oid = s.setdatabase
  LEFT JOIN pg_roles r ON r.oid = s.setrole;

-- 2. Per-period writing zone (CONTRACTS §9): naive bookings.created_at vs the
--    aware scheduled_at of the proposal notice written by the same request.
SELECT date_trunc('month', n.scheduled_at) AS month,
       round(extract(epoch FROM b.created_at - (n.scheduled_at AT TIME ZONE 'UTC')) / 3600) AS offset_hours,
       count(*)
  FROM bookings b
  JOIN notification_events n ON n.booking_id = b.id AND n.notification_type = 'proposal_received'
 GROUP BY 1, 2 ORDER BY 1, 2;

-- 3. Range of naive history per audit column (what periods need a zone).
SELECT 'messages.created_at' AS col, min(created_at), max(created_at), count(*) FROM messages
UNION ALL SELECT 'bookings.created_at', min(created_at), max(created_at), count(*) FROM bookings
UNION ALL SELECT 'bookings.updated_at', min(updated_at), max(updated_at), count(*) FROM bookings
UNION ALL SELECT 'blocks.created_at', min(created_at), max(created_at), count(*) FROM blocks
UNION ALL SELECT 'reports.created_at', min(created_at), max(created_at), count(*) FROM reports
UNION ALL SELECT 'notification_events.created_at', min(created_at), max(created_at), count(*) FROM notification_events
UNION ALL SELECT 'push_tokens.created_at', min(created_at), max(created_at), count(*) FROM push_tokens
UNION ALL SELECT 'calendar_booking_syncs.created_at', min(created_at), max(created_at), count(*) FROM calendar_booking_syncs
UNION ALL SELECT 'google_calendar_tokens.connected_at', min(connected_at), max(connected_at), count(*) FROM google_calendar_tokens;

-- 4. Label rows that are ambiguous IF the history was written in Sydney time:
--    naive values inside a fall-back repeated hour (first Sunday of April,
--    02:00–03:00 local). Extend the list to cover the range found in step 3.
WITH windows(start_at) AS (VALUES (TIMESTAMP '2025-04-06 02:00'), (TIMESTAMP '2026-04-05 02:00'))
SELECT w.start_at, 'messages' AS tbl, count(*) FROM windows w JOIN messages m
    ON m.created_at >= w.start_at AND m.created_at < w.start_at + interval '1 hour' GROUP BY 1, 2
UNION ALL
SELECT w.start_at, 'bookings', count(*) FROM windows w JOIN bookings b
    ON b.created_at >= w.start_at AND b.created_at < w.start_at + interval '1 hour' GROUP BY 1, 2;
-- (repeat for the other audit columns as needed; any non-zero count is
--  ambiguous under a Sydney history and cannot be resolved uniquely)
```

Interpretation:

| Finding | Meaning | Action |
|---|---|---|
| Steps 1–2 show UTC for every period, no overrides | History is exact under the default | Keep `DB_NAIVE_TIMEZONE=UTC`. C01 does not apply. |
| One non-UTC zone `Z` for every period | History is correct only when read in `Z` | Do **not** simply set `DB_NAIVE_TIMEZONE=Z` long-term (C01). Use §4. |
| Mixed zones, or a period without evidence | No single reading is right | Treat affected periods as approximate; §4 option B with a per-period zone, only after the evidence exists. |
| Step 4 non-zero (Sydney history) | Those rows are ambiguous | Label them; they cannot be recovered exactly by any zone choice. |

Known context, still to be verified: the App Store release is 14 May 2026, and
Sydney's next fall-back is 4 April 2027. If production history began after the
last fall-back (5 April 2026), a consistently-Sydney history contains no
repeated-hour values, and step 4 should return zero rows. Pre-launch or test
data could be older; the query is what proves it.

## 4. Proposal: exact future instants, independent of legacy interpretation

The goal is to separate two things that `DB_NAIVE_TIMEZONE` currently couples:
how existing naive rows are **read**, and how new rows are **written**.

**Option A — history is UTC (expected from repository evidence).** Nothing to
change: keep the UTC session pin. Every future write is an exact instant.

**Option B — history is in another zone (recommended if step 2 says so).** A
reviewed one-time migration of the nine audit columns to `timestamptz`, in a
maintenance window, after the step 1–4 evidence is in hand and tested on a
restored copy:

```sql
ALTER TABLE messages ALTER COLUMN created_at TYPE timestamptz
  USING created_at AT TIME ZONE '<verified zone>';
-- … the other eight columns; inverse:
-- ALTER TABLE messages ALTER COLUMN created_at TYPE timestamp
--   USING created_at AT TIME ZONE '<verified zone>';
```

After it, `now()` stores the exact instant whatever the session zone, the
`AuditInstant` converter keeps aware values unchanged, and
`DB_NAIVE_TIMEZONE` stops mattering for these columns. Decisions this needs
before it is written:

- Ambiguous rows (step 4): PostgreSQL's `AT TIME ZONE` picks the later
  instant, the API currently shows the earlier one. Pick one policy, apply it
  explicitly (for example a `CASE` with a fixed `+11:00` offset inside the
  window to keep the API's current reading), and record the affected row IDs.
- This is a schema change that rewrites table storage. It is not part of this
  repair branch and must not be applied without the owner's decision.

**Option C — interim, if a non-UTC history must be served before B ships.**
Setting `DB_NAIVE_TIMEZONE=<zone>` reads history correctly. New writes are
exact until the next fall-back (4 April 2027 for Sydney); B has to land
before then, or the repeated hour's writes lose identity as reproduced in §2.

## 5. Deployment rule (unchanged, restated)

Run §3 on production before deploying the API that contains R6. Set
`DB_NAIVE_TIMEZONE` from that evidence before the API restarts on the new code.
Do not guess the zone. Do not rewrite or migrate history from this branch.
