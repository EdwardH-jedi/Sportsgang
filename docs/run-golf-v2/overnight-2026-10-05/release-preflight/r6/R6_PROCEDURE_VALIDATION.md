# R6 provenance procedure: validation on isolated fixtures

**Production: NOT_RUN.** No production database, Fly app or deployed service was
contacted. Everything here ran against a disposable PostgreSQL 16.15 container
(`sg-on-20261005-r6`, `127.0.0.1:55681`), which was removed afterwards. The gate
document `docs/run-golf-v2/morning-fixes/R6_C01_DEPLOYMENT_GATE.md` is unchanged
(blob `e28a4e6a3709655edf6710324c3d7430cd48490c`). Any amendment below is a
**proposal** for its owner. Nothing is applied, migrated or rewritten.

## 1. What was validated

The read-only procedure in R6 §3 (steps 1–4) and its interpretation table, **exactly
as written**. The runner reads the first ```` ```sql ```` block under "## 3." from the
gate document at run time and runs it unchanged. That block's sha256 is
`06e0a42f10cba14a0b3ec2841d2d91dbcac9198befa97b0f561d247d369f24cd` (copy:
[raw/procedure_block_as_run.sql](raw/procedure_block_as_run.sql)). Each fixture
gets a fresh database, the procedure runs in a default client session (no `PGTZ`),
and the table is applied to its output.

| File | Content |
|---|---|
| [schema.sql](schema.sql) | The 8 tables and 9 naive audit columns as in migrations 0003/0004 (`timestamp without time zone DEFAULT now()`), plus the aware `notification_events.scheduled_at`. FKs to users/matches are omitted. |
| [fixtures/](fixtures/) | One generated psql script per fixture (deterministic). |
| [run_r6_fixtures.py](run_r6_fixtures.py) | Generator, loader, ground-truth check, procedure runs, table application and scoring (stdlib only). It refuses any container other than `sg-on-20261005-r6` on `127.0.0.1:55681`. |
| [proposed_procedure.sql](proposed_procedure.sql) | The proposed read-only additions (2b, 2c, 2d, 4′), run on the same fixtures. |
| [raw/](raw/) | Verbatim psql transcripts per fixture (`original_procedure.txt`, `proposed_procedure.txt`), the client-`PGTZ` runs, [raw/proof_now_equivalence.txt](raw/proof_now_equivalence.txt) and [raw/console_summary.txt](raw/console_summary.txt). |
| [results.json](results.json) | Parsed outputs, the rows of the table that matched, and the per-row scores. |

**How history is written.** In production, a row's `DEFAULT now()` is a `timestamptz`
assigned to a `timestamp` column, converted in the writing session's `TimeZone`. The
fixtures assign an explicit instant under `SET TIME ZONE …`, or under a role or
database default, which is the same conversion. The proof transcript shows a live
`DEFAULT now()` row equals `now()` assigned, and equals `now() AT TIME ZONE
current_setting('TimeZone')`, under both Sydney and UTC sessions. It also shows
`2026-04-04T15:30Z` and `16:30Z` both stored as `2026-04-05 02:30` under Sydney, and
PostgreSQL reading that value back as `16:30Z`. A proposal's `scheduled_at` is the
instant plus 37 ms, because Python's `now()` runs after transaction start in the same
request (`bookings.create_booking` → `notifications.schedule_booking_notification`,
one commit). After loading, every stored naive value is compared with Python
`zoneinfo` (ground truth). All 1,001 rows matched.

**Scoring.** Each audit row gets the reading the conclusion implies (UTC, Sydney, a
fixed +10 zone, inconclusive, or no decision). It is scored against the zone it was
actually written in:

- correct;
- wrong (10–11 h or 1 h off);
- inconclusive;
- a repeated-hour row, either labelled by the procedure or not.

The table is applied in two ways:

- **all rows**: every matching row is combined, and step 3's ranges are compared with
  step 2's months to find "a period without evidence". This is the careful reading.
- **first match**: the operator stops at the first matching row, in table order.

## 2. Results

Truth zones: U = UTC, S = Australia/Sydney. "Rows" counts audit-column values.

| Fixture (truth) | What the §3 procedure shows | Table row(s) matched | Conclusion as written | Verdict |
|---|---|---|---|---|
| **a** — UTC throughout, incl. 2 rows at 2026-04-05 02:30Z (U, 116 rows) | step 1 `UTC`, `configuration file`, no overrides. Step 2: offset 0 every month. Step 4: 1 message, 1 booking in the window. | R1 | Keep `UTC`. C01 does not apply. Step 4's count is conditional on a Sydney history, so it does not apply. | **CORRECT** (116/116) |
| **b** — Sydney throughout, Feb–Oct (S, 121) | step 1 `Australia/Sydney` (`database`) plus the override row. Step 2: 11 (Feb–Mar), **10 and 11 (Apr)**, 10 (May–Sep), **10 and 11 (Oct)**. | R2 | One non-UTC zone → §4 | **CORRECT** (121/121) with two reading hazards: (i) April and October each show two offsets, which is Sydney DST, not mixing, and the table does not say so; (ii) the month bucket uses the **reader's** session zone. The sample at 2026-05-31T20:00Z counts in June under the database's Sydney default and in May under client `PGTZ=UTC` ([raw/b/step2_with_client_PGTZ_UTC.txt](raw/b/step2_with_client_PGTZ_UTC.txt)). |
| **c1** — UTC, then Sydney from 2026-06-15 (U+S, 112) | step 2: 0 to May, **0 and 10 in June**, 10 from July | R3 (mixed) | June approximate; per-period zones otherwise | **APPROPRIATELY INCONCLUSIVE** (98 correct, 14 June rows inconclusive, 0 wrong) |
| **c2** — Sydney, then UTC from 2026-07-01T00:00Z, a month boundary (S+U, 114) | step 2: 10/11 to June, 0 from July. No month shows both offsets. | R3 (mixed) | Per-period zone by month | **OVERCONFIDENT** (1 wrong). A Sydney row written 2026-06-30T20:00Z is stored as `2026-07-01 06:00`, falls in "July = UTC" and is read as 06:00Z, 10 h late. A UTC row written after the switch is stored earlier (`07-01 03:00`). Near a switch, a row's naive month does not identify its period. |
| **d** — Sydney, a row in **every** audit column at 15:30Z and 16:30Z on 2026-04-04 (S, 133) | step 4: messages 2, bookings 2 | R2 + R4 | Label the step-4 rows as ambiguous | **OVERCONFIDENT in coverage**: 19 rows lie in the repeated hour; the query as written labels 4 (`messages.created_at`, `bookings.created_at`). The other 15 are in `bookings.updated_at`, `blocks`, `reports`, `notification_events`, `push_tokens`, `calendar_booking_syncs`, `google_calendar_tokens`. The trailing comment says "repeat for the other audit columns **as needed**". An operator who extends the query to all nine columns labels all 19. |
| **e1** — UTC history; database default **later** set to Sydney (U, 112) | step 1 `Australia/Sydney` (`database`) plus the `r6_e1` override. Step 2: 0 every month. | **none** | No row covers "current default non-UTC but history UTC" | **NO DECISION (rule gap)**, 112/112. The evidence is sufficient, but R1 requires "no overrides". With client `PGTZ=UTC`, step 1's `SHOW timezone` says `UTC`, source `client` ([raw/e1/step1_with_client_PGTZ_UTC.txt](raw/e1/step1_with_client_PGTZ_UTC.txt)). It reports the operator's session, not the server's. |
| **e2** — Sydney history via a role-in-database override, later RESET; current UTC (S, 112) | step 1 `UTC`, no overrides (the override is gone). Step 2: 10/11. | R2 | Sydney | **CORRECT**. Step 2 rightly outweighs a step 1 that reflects only the present. |
| **f1** — all API traffic Sydney; the **only** booking+proposal pair was written by a bypassing tool session in UTC (S, plus 3 rows U; 59) | step 1 `UTC`, no overrides. Step 2: **one row, 2026-05, offset 0, count 1**. | R1 **and** R3 (7 months without evidence) | First match: "Keep `DB_NAIVE_TIMEZONE=UTC`. C01 does not apply." All rows: May is UTC, other months approximate. | **OVERCONFIDENT / WRONG.** First match: 56/59 wrong, 10–11 h. All rows: 7 wrong (May's messages, blocks, reports, tokens), 49 inconclusive. One correlated sample proved only its own writer's zone. |
| **f2** — Sydney Jan–Sep; one proposal, 2026-06-10 (+10) (S, 66) | step 2: one row, 2026-06, offset **10**, count 1 | R2 + R3 (8 months without evidence) | "One non-UTC zone Z". Z is not named; one +10 offset fits Sydney and a fixed +10 zone alike. | **OVERCONFIDENT if Z is picked from one offset**: fixed +10 (e.g. `Australia/Brisbane`) gives 22 AEDT rows 1 h off; Sydney is right by luck. The all-rows reading is inconclusive for 56 rows: correct. |
| **g** — Sydney via a since-removed override; **no** proposals at all (S, 56) | step 1 `UTC`, no overrides. Step 2: **no rows**. | R1 (vacuously) + R3 | First match: Keep UTC → 56/56 wrong. All rows: everything approximate. | **OVERCONFIDENT** under the first-match reading; **appropriately inconclusive** only if the operator cross-checks step 3 |

The proposed additions ran on the same fixtures with zero wrong readings and zero
unlabelled repeated-hour rows:

| Fixture | Proposed result | Rows: correct / wrong / inconclusive | Repeated-hour rows labelled |
|---|---|---|---|
| a | UTC | 116 / 0 / 0 | – |
| b | Australia/Sydney (identified: AEDT months disagree with fixed +10) | 121 / 0 / 0 | – |
| c1 | MIXED, 1 switch; window `2026-06-03 03:00` – `2026-06-17 20:30` (naive) | 101 / 0 / 11 | – |
| c2 | MIXED, 1 switch; window `2026-06-17 09:30` – `2026-07-03 14:00` (naive) | 102 / 0 / 12 | – |
| d | Australia/Sydney | 114 / 0 / 0 | 19 of 19 (all 9 columns) |
| e1 | UTC; "current default differs from the evidenced history" | 112 / 0 / 0 | – |
| e2 | Australia/Sydney | 112 / 0 / 0 | – |
| f1 | INCONCLUSIVE: no period has 2 samples | 0 / 0 / 59 | – |
| f2 | INCONCLUSIVE: no period has 2 samples | 0 / 0 / 66 | – |
| g | INCONCLUSIVE: no samples | 0 / 0 / 56 | – |

## 3. Where the procedure, as written, is wrong or overconfident

1. **Row 1, "Steps 1–2 show UTC for every period, no overrides".** Two things can
   satisfy it without evidence:
   - an empty step 2 (g), vacuously;
   - a single correlated sample (f1).

   "Every period" is not tied to step 3's ranges, and nothing says how many samples
   make a period evidenced. One sample proves only the zone of the session that
   wrote it. If a seed script, psql session or other bypassing writer used a
   different zone from the API, as CONTRACTS §9 allows, the conclusion "C01 does not
   apply" is wrong for every other row.
2. **Row 2, "One non-UTC zone Z".** Step 2 yields offsets, not a zone. Only samples
   from both DST regimes separate Sydney from a fixed +10 zone (f2). The table does
   not say that 10 and 11 in one April or October bucket are DST rather than mixing
   (b).
3. **No row for a non-UTC current default with a UTC history** (e1). Step 1 is
   current state only. It can neither prove nor disprove history (e1, e2). It also
   reports the operator's session: `SHOW timezone` and `pg_settings` show `source =
   client` under `PGTZ`. Its third query is cluster-wide, so rows for other databases
   or roles must be read for the app's database and role.
4. **Periods are months bucketed in the reader's zone** (`date_trunc('month',
   n.scheduled_at)`), so bucket membership depends on the client (b). The month
   granularity also cannot attribute rows near a switch that falls on a month
   boundary (c2: one row wrong). It shows a mid-month switch (c1) but not when within
   the month it happened.
5. **Step 4 covers two of the nine columns** as written. Its windows are a hand-kept
   list that the operator must "extend". The query misses 15 of the 19 repeated-hour
   rows in d. Conversely, step 4 is conservative for bookings: a proposal's
   `scheduled_at` gives each such booking's exact instant, even in the repeated hour.

What holds: the step-2 correlation itself is sound. The current code writes the
booking and the `proposal_received` event in one transaction, with `scheduled_at`
from Python's UTC clock; reminders are excluded by type. Pure UTC (a) and a
consistently evidenced Sydney history (b, e2) are read correctly. A mid-month switch
is flagged mixed (c1). Step 2 correctly outweighs a misleading step 1 (e2).

## 4. Proposed narrowest amendment (not applied; for the gate's owner)

These are wording changes plus four read-only `SELECT`s, all in
[proposed_procedure.sql](proposed_procedure.sql). None of them is a migration, a
rewrite or a change to deployment. Every conversion names its zone explicitly, so a
client's `PGTZ` cannot change the result.

**Step 1, add after the queries:** "Step 1 describes the current configuration only.
It is not evidence about history. Run it from a client without `PGTZ`; `source =
client` means the value is the operator's own. The third query is cluster-wide: read
the rows for the application's database and role."

**Step 2, keep, then add 2b, 2c and 2d:**

- 2b: per-row agreement with named candidates (`UTC`, `Australia/Sydney`, and
  `Australia/Brisbane` as a fixed +10 contrast), bucketed by UTC month.
- 2c: coverage, meaning audit rows per naive month and column, next to that month's
  sample count.
- 2d: switch points, meaning consecutive samples whose class (UTC versus non-UTC)
  differs.

**Interpretation table, replace rows 1–3 with:**

| Finding | Meaning | Action |
|---|---|---|
| Every month that 2c shows with audit rows has ≥ 2 samples (from ordinary API traffic, not seed, review or QA accounts), and every sample agrees with UTC (2b) | History is UTC, whatever step 1 shows now | Keep `DB_NAIVE_TIMEZONE=UTC`. C01 does not apply. If step 1 shows a non-UTC default or override, record it: tools that bypass the API pin (psql, scripts) write in it, so writes since it was applied form their own period, which needs evidence. |
| As above, but every sample agrees with one non-UTC zone Z (2b), and the samples include both DST regimes, so Z disagrees with every other candidate | History is in Z | §4 (not a long-term `DB_NAIVE_TIMEZONE=Z`, C01). If only one regime is sampled (e.g. only +10), Z is **not identified**: treat it as INCONCLUSIVE for zone identity. |
| 2d lists a switch, or any month that 2c shows with audit rows has < 2 samples | No single reading. Rows from a switch's `prev_sample_utc` until 11 h after its `sample_utc`, and rows in under-sampled months, are **INCONCLUSIVE** | §4 option B per period, only for evidenced periods. Never infer an unevidenced period from step 1 or from a neighbouring period. |
| Step 2 returns no rows | No evidence | **INCONCLUSIVE**. Row 1 must not be read as satisfied. |

**Step 4, replace the windows list with 4′.** It is a predicate over all nine
columns, "both +11 h and +10 h readings map back to the stored value", so no list has
to be kept. Validated on d (19/19). Add one sentence: "a booking with a
`proposal_received` event can be resolved exactly from `scheduled_at`."

The threshold of 2 samples is a policy parameter used for this validation, not a
derived value; the gate's owner sets it. No query can tell whether a sample came from
the API or from a bypassing tool. The amendment narrows the f1 risk (one stray sample
can no longer decide a period) but does not remove it. Excluding known seed, review
and QA accounts from the samples remains a manual step.

## 5. Limits of this validation

- The fixtures are synthetic but use the real column types and PostgreSQL's own
  conversion. Production's PostgreSQL version and its tzdata are not known here.
  Sydney's 2026 rules agree between this container and Python's zoneinfo (the
  ground-truth check passed).
- `now()` is emulated by explicit instants under the same session-zone assignment.
  The equivalence is proven in the transcript, but no live clock was frozen.
- Step 2 measures only `bookings.created_at`. The other eight columns are assumed to
  share the writing session's zone. f1 shows how that assumption fails, and no
  procedure based on these tables can verify it.
- **Production provenance remains NOT_RUN.** Running this procedure, original or
  amended, on production needs an authorised operator with a read-only role, as R6 §3
  says.
