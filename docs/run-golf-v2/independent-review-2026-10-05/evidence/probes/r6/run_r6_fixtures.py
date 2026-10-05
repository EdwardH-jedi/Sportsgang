#!/usr/bin/env python3
"""Validate the R6 read-only provenance procedure on disposable PostgreSQL fixtures.

The procedure is taken VERBATIM from
docs/run-golf-v2/morning-fixes/R6_C01_DEPLOYMENT_GATE.md §3 at run time (its
sha256 is recorded), never retyped. Each fixture is a fresh database in the
disposable container `sg-on-20261005-r6` (127.0.0.1:55681) only; the runner
refuses any other target. Production is never contacted.

For every fixture the runner:
  1. writes fixtures/<id>.sql (deterministic) and loads it on schema.sql;
     rows are written at explicit instants under the stated session zone —
     a timestamptz assigned to a `timestamp` column is converted in the
     session TimeZone exactly as the columns' `DEFAULT now()` is
     (proved once in raw/proof_now_equivalence.txt);
  2. checks every stored naive value against Python's zoneinfo (ground truth);
  3. runs the §3 SQL block verbatim (raw/<id>/original_procedure.txt) and
     proposed_procedure.sql (raw/<id>/proposed_procedure.txt);
  4. applies the §3 interpretation table, and the proposed rule, and scores
     each audit row: read correctly, read wrongly, flagged inconclusive, or a
     repeated-hour row (flagged / not flagged).
Results: results.json. Stdlib only; uses `docker exec ... psql`.

Usage: python3 run_r6_fixtures.py
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import subprocess
import sys
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]
GATE_DOC = ROOT / "docs/run-golf-v2/morning-fixes/R6_C01_DEPLOYMENT_GATE.md"
CONTAINER = "sg-codex-review-20261005-r6"
EXPECTED_BINDING = "127.0.0.1:55783"
UTC = timezone.utc
ZONES = {
    "UTC": UTC,
    "Australia/Sydney": ZoneInfo("Australia/Sydney"),
    "Australia/Brisbane": ZoneInfo("Australia/Brisbane"),
}
UTC_NAMES = {"UTC", "Etc/UTC"}
MIN_SAMPLES = 2  # proposal parameter: a period with fewer samples is INCONCLUSIVE
AUDIT_COLS = [
    "messages.created_at",
    "bookings.created_at",
    "bookings.updated_at",
    "blocks.created_at",
    "reports.created_at",
    "notification_events.created_at",
    "push_tokens.created_at",
    "calendar_booking_syncs.created_at",
    "google_calendar_tokens.connected_at",
]
# Columns the original step 4 query covers as written (messages and bookings.created_at).
ORIGINAL_STEP4_COLS = {"messages.created_at", "bookings.created_at"}


# ---------------------------------------------------------------- psql


def ensure_target() -> None:
    r = subprocess.run(["docker", "port", CONTAINER, "5432/tcp"], capture_output=True, text=True)
    if r.returncode != 0 or EXPECTED_BINDING not in r.stdout:
        sys.exit(f"refusing to run: {CONTAINER} is not bound to {EXPECTED_BINDING}")


def psql(db: str, sql: str, *, mode: str = "csv", env: dict | None = None) -> str:
    cmd = ["docker", "exec", "-i"]
    for k, v in (env or {}).items():
        cmd += ["-e", f"{k}={v}"]
    cmd += [CONTAINER, "psql", "-X", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-P", "pager=off"]
    cmd += {"csv": ["-q", "--csv"], "echo": ["-a"], "quiet": ["-q"]}[mode]
    r = subprocess.run(cmd, input=sql, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"psql failed on {db}: {r.stderr.strip()}")
    return r.stdout


def rows(db: str, sql: str, env: dict | None = None) -> list[dict]:
    return list(csv.DictReader(io.StringIO(psql(db, sql, env=env))))


# ---------------------------------------------------------------- the procedure, verbatim


def procedure_block() -> tuple[str, str]:
    text = GATE_DOC.read_text(encoding="utf-8")
    sec = text.index("## 3. Read-only production provenance procedure")
    start = text.index("```sql\n", sec) + len("```sql\n")
    end = text.index("\n```", start)
    block = text[start:end] + "\n"
    return block, hashlib.sha256(block.encode("utf-8")).hexdigest()


def split_steps(block: str) -> dict[str, list[str]]:
    """Statements of the block, keyed by the step comment ('1'..'4') they follow."""
    steps: dict[str, list[str]] = {}
    step, buf = None, []
    for line in block.splitlines():
        s = line.strip()
        if s.startswith("-- ") and s[3:4].isdigit() and s[4:5] == ".":
            step = s[3]
            continue
        if not buf and (not s or s.startswith("--")):
            continue
        buf.append(line)
        if s.endswith(";"):
            steps.setdefault(step, []).append("\n".join(buf) + "\n")
            buf = []
    return steps


# ---------------------------------------------------------------- fixtures


@dataclass(frozen=True)
class Writer:
    role: str  # database role of the writing session
    set_zone: str | None  # SET TIME ZONE value, or None = session default (role/db/server)
    zone: str  # the effective session TimeZone (asserted at load time)


W_UTC = Writer("postgres", "UTC", "UTC")
W_SYD = Writer("postgres", "Australia/Sydney", "Australia/Sydney")
W_DEFAULT_UTC = Writer("postgres", None, "UTC")  # server default of the container
W_API_SYD = Writer("fx_api", None, "Australia/Sydney")  # from ALTER ROLE ... IN DATABASE


@dataclass
class TruthRow:
    col: str
    key: str
    instant: datetime
    zone: str

    @property
    def naive(self) -> datetime:
        return self.instant.astimezone(ZONES[self.zone]).replace(tzinfo=None)

    @property
    def repeated_hour(self) -> bool:
        if self.zone == "UTC":
            return False
        z = ZONES[self.zone]
        n = self.naive
        return n.replace(tzinfo=z, fold=0).utcoffset() != n.replace(tzinfo=z, fold=1).utcoffset()


def ts(t: datetime) -> str:
    return "TIMESTAMPTZ '" + t.astimezone(UTC).strftime("%Y-%m-%d %H:%M:%S.%f").rstrip("0").rstrip(".") + "+00'"


@dataclass
class Fixture:
    fid: str
    title: str
    truth_note: str
    current_state_note: str
    lines: list[str] = field(default_factory=list)
    truth: dict[str, TruthRow] = field(default_factory=dict)
    writer: Writer | None = None
    role: str = "postgres"
    n: int = 0

    def uid(self, kind: str) -> str:
        self.n += 1
        return str(uuid.uuid5(uuid.NAMESPACE_URL, f"sportsgang-r6/{self.fid}/{kind}/{self.n}"))

    def sql(self, text: str) -> None:
        self.lines.append(text)

    def use(self, w: Writer) -> None:
        if w == self.writer:
            return
        if w.role != self.role:
            self.lines.append(f"\\connect - {w.role}")
            self.role = w.role
        self.lines.append(f"SET TIME ZONE '{w.set_zone}';" if w.set_zone else "RESET TIME ZONE;")
        self.lines.append(
            "DO $$BEGIN IF current_setting('TimeZone') <> '%s' THEN RAISE EXCEPTION 'writer zone is %%', "
            "current_setting('TimeZone'); END IF; END$$;  -- writer: role %s, session TimeZone %s"
            % (w.zone, w.role, w.zone)
        )
        self.writer = w

    def _rec(self, col: str, key: str, at: datetime) -> None:
        self.truth[f"{col}#{key}"] = TruthRow(col, key, at, self.writer.zone)

    def proposal(self, w: Writer, at: datetime) -> str:
        self.use(w)
        b, n = self.uid("booking"), self.uid("notification")
        m, u1, u2 = self.uid("match"), self.uid("user"), self.uid("user")
        self.sql(
            "INSERT INTO bookings (id, match_id, proposer_id, partner_id, sport, starts_at, ends_at, created_at, "
            f"updated_at) VALUES ('{b}', '{m}', '{u1}', '{u2}', 'tennis', {ts(at + timedelta(days=2))}, "
            f"{ts(at + timedelta(days=2, hours=1))}, {ts(at)}, {ts(at)});"
        )
        # scheduled_at = Python now() in the same request, a few ms after transaction start.
        self.sql(
            "INSERT INTO notification_events (id, user_id, booking_id, notification_type, title, body, scheduled_at, "
            f"created_at) VALUES ('{n}', '{u2}', '{b}', 'proposal_received', 'New session proposal', 'fixture', "
            f"{ts(at + timedelta(milliseconds=37))}, {ts(at)});"
        )
        self._rec("bookings.created_at", b, at)
        self._rec("bookings.updated_at", b, at)
        self._rec("notification_events.created_at", n, at)
        return b

    def accept(self, w: Writer, booking: str, at: datetime) -> None:
        self.use(w)
        self.sql(f"UPDATE bookings SET status = 'confirmed', updated_at = {ts(at)} WHERE id = '{booking}';")
        self._rec("bookings.updated_at", booking, at)

    def simple(self, w: Writer, table: str, at: datetime, booking: str | None = None) -> None:
        self.use(w)
        i, u, v = self.uid(table), self.uid("user"), self.uid("user")
        if table == "messages":
            self.sql(f"INSERT INTO messages VALUES ('{i}', '{u}', '{v}', 'fixture', {ts(at)});")
            col = "messages.created_at"
        elif table == "blocks":
            self.sql(f"INSERT INTO blocks VALUES ('{i}', '{u}', '{v}', {ts(at)});")
            col = "blocks.created_at"
        elif table == "reports":
            self.sql(f"INSERT INTO reports VALUES ('{i}', '{u}', '{v}', 'other', {ts(at)});")
            col = "reports.created_at"
        elif table == "push_tokens":
            self.sql(f"INSERT INTO push_tokens VALUES ('{i}', '{u}', 'ExponentPushToken[{i[:8]}]', 'ios', {ts(at)});")
            col = "push_tokens.created_at"
        elif table == "calendar_booking_syncs":
            self.sql(f"INSERT INTO calendar_booking_syncs VALUES ('{i}', '{booking}', '{u}', 'evt-{i[:8]}', {ts(at)});")
            col = "calendar_booking_syncs.created_at"
        elif table == "google_calendar_tokens":
            self.sql(f"INSERT INTO google_calendar_tokens VALUES ('{i}', '{u}', 'primary', {ts(at)});")
            col = "google_calendar_tokens.connected_at"
        else:
            raise ValueError(table)
        self._rec(col, i, at)

    def render(self) -> str:
        head = [
            f"-- R6 validation fixture {self.fid}: {self.title}",
            f"-- Ground truth: {self.truth_note}",
            f"-- Current state left behind: {self.current_state_note}",
            "-- Generated by run_r6_fixtures.py; load with psql (-v ON_ERROR_STOP=1) on schema.sql.",
            "-- A timestamptz literal assigned to a `timestamp` column is converted in the session",
            "-- TimeZone, exactly like the columns' DEFAULT now() at that instant.",
            "",
        ]
        tail = ["\\connect - postgres"] if self.role != "postgres" else []
        return "\n".join(head + self.lines + tail) + "\n"


def d(y: int, mo: int, day: int, h: int = 0, mi: int = 0) -> datetime:
    return datetime(y, mo, day, h, mi, tzinfo=UTC)


def month_activity(fx: Fixture, y: int, mo: int, pick, proposals: bool = True) -> None:
    """A month of ordinary traffic; pick(instant) -> Writer."""
    w = lambda t: pick(t)  # noqa: E731
    b1 = fx.proposal(w(d(y, mo, 3, 3)), d(y, mo, 3, 3)) if proposals else None
    fx.simple(w(d(y, mo, 3, 3, 5)), "messages", d(y, mo, 3, 3, 5))
    fx.simple(w(d(y, mo, 5, 8)), "push_tokens", d(y, mo, 5, 8))
    fx.simple(w(d(y, mo, 10, 12)), "messages", d(y, mo, 10, 12))
    fx.simple(w(d(y, mo, 12, 5)), "blocks", d(y, mo, 12, 5))
    fx.simple(w(d(y, mo, 12, 5, 10)), "reports", d(y, mo, 12, 5, 10))
    if proposals:
        b2 = fx.proposal(w(d(y, mo, 17, 9, 30)), d(y, mo, 17, 9, 30))
        fx.simple(w(d(y, mo, 17, 9, 40)), "calendar_booking_syncs", d(y, mo, 17, 9, 40), booking=b2)
        fx.accept(w(d(y, mo, 18, 10)), b2, d(y, mo, 18, 10))
    fx.simple(w(d(y, mo, 20, 7)), "google_calendar_tokens", d(y, mo, 20, 7))
    fx.simple(w(d(y, mo, 24, 21, 45)), "messages", d(y, mo, 24, 21, 45))
    del b1


def role_override(db: str, zone: str) -> str:
    return (
        "DO $$BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fx_api') THEN CREATE ROLE fx_api LOGIN; "
        "END IF; END$$;\n"
        "GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO fx_api;\n"
        f"ALTER ROLE fx_api IN DATABASE {db} SET timezone = '{zone}';"
    )


def build_fixtures() -> list[Fixture]:
    fx: list[Fixture] = []
    months = range(2, 10)  # Feb..Sep 2026

    a = Fixture(
        "a",
        "history written entirely with session TimeZone UTC",
        "every audit row written in UTC (incl. two rows at 2026-04-05 02:30Z, inside step 4's window)",
        "server default UTC, no overrides",
    )
    for mo in months:
        month_activity(a, 2026, mo, lambda t: W_UTC)
    a.proposal(W_UTC, d(2026, 4, 5, 2, 30))
    a.simple(W_UTC, "messages", d(2026, 4, 5, 2, 35))
    fx.append(a)

    b = Fixture(
        "b",
        "history written consistently with Australia/Sydney",
        "every audit row written in Australia/Sydney (AEDT and AEST; April and October span both)",
        "ALTER DATABASE ... SET timezone = 'Australia/Sydney' (the history's source)",
    )
    for mo in months:
        month_activity(b, 2026, mo, lambda t: W_SYD)
    b.proposal(W_SYD, d(2026, 5, 31, 20))  # 1 June 06:00 Sydney: month bucket depends on the reader's zone
    b.proposal(W_SYD, d(2026, 10, 2, 3))  # AEST (+10)
    b.proposal(W_SYD, d(2026, 10, 4, 3))  # AEDT (+11), after the 4 Oct spring-forward
    b.sql("ALTER DATABASE r6_b SET timezone = 'Australia/Sydney';")
    fx.append(b)

    switch = d(2026, 6, 15)
    c1 = Fixture(
        "c1",
        "mixed: UTC until 2026-06-15T00:00Z, then Australia/Sydney",
        "rows before the switch in UTC, after it in Sydney",
        "ALTER DATABASE ... SET timezone = 'Australia/Sydney' (the change that caused the switch)",
    )
    for mo in months:
        month_activity(c1, 2026, mo, lambda t: W_UTC if t < switch else W_SYD)
    c1.sql("ALTER DATABASE r6_c1 SET timezone = 'Australia/Sydney';")
    fx.append(c1)

    switch2 = d(2026, 7, 1)
    c2 = Fixture(
        "c2",
        "mixed: Australia/Sydney until 2026-07-01T00:00Z (a month boundary), then UTC",
        "rows before the switch in Sydney, after it in UTC; one Sydney row at 2026-06-30T20:00Z is "
        "stored as 2026-07-01 06:00 — later than a UTC row written after the switch",
        "server default UTC, no overrides (the Sydney override was removed at the switch)",
    )
    for mo in months:
        month_activity(c2, 2026, mo, lambda t: W_SYD if t < switch2 else W_UTC)
    c2.simple(W_SYD, "messages", d(2026, 6, 30, 20))  # naive 2026-07-01 06:00
    c2.simple(W_UTC, "messages", d(2026, 7, 1, 3))  # naive 2026-07-01 03:00
    fx.append(c2)

    dd = Fixture(
        "d",
        "Australia/Sydney history with rows inside the 2026-04-05 repeated hour",
        "Sydney throughout; at 2026-04-04T15:30Z and 16:30Z (both stored as 2026-04-05 02:30) a row in "
        "every audit column",
        "ALTER DATABASE ... SET timezone = 'Australia/Sydney'",
    )
    for mo in months:
        month_activity(dd, 2026, mo, lambda t: W_SYD)
    for at in (d(2026, 4, 4, 15, 30), d(2026, 4, 4, 16, 30)):
        bk = dd.proposal(W_SYD, at)
        for table in ("messages", "blocks", "reports", "push_tokens", "google_calendar_tokens"):
            dd.simple(W_SYD, table, at + timedelta(minutes=5))
        dd.simple(W_SYD, "calendar_booking_syncs", at + timedelta(minutes=6), booking=bk)
    first = dd.proposal(W_SYD, d(2026, 4, 1, 1))
    dd.accept(W_SYD, first, d(2026, 4, 4, 16, 40))  # updated_at in the repeated hour
    dd.sql("ALTER DATABASE r6_d SET timezone = 'Australia/Sydney';")
    fx.append(dd)

    e1 = Fixture(
        "e1",
        "current default differs: UTC history, database default later set to Australia/Sydney",
        "every audit row written in UTC (server default)",
        "ALTER DATABASE ... SET timezone = 'Australia/Sydney' applied AFTER the history",
    )
    for mo in months:
        month_activity(e1, 2026, mo, lambda t: W_DEFAULT_UTC)
    e1.sql("ALTER DATABASE r6_e1 SET timezone = 'Australia/Sydney';")
    fx.append(e1)

    e2 = Fixture(
        "e2",
        "current default differs: Sydney history via a role override that was later removed",
        "every audit row written by role fx_api whose per-database setting was Australia/Sydney",
        "server default UTC; the override was RESET after the history, so step 1 shows none",
    )
    e2.sql(role_override("r6_e2", "Australia/Sydney"))
    for mo in months:
        month_activity(e2, 2026, mo, lambda t: W_API_SYD)
    e2.use(Writer("postgres", None, "UTC"))
    e2.sql("ALTER ROLE fx_api IN DATABASE r6_e2 RESET timezone;")
    fx.append(e2)

    f1 = Fixture(
        "f1",
        "single correlated sample agrees with UTC by coincidence",
        "all API traffic (role fx_api, Sydney override) is Sydney; the ONLY booking+proposal pair was "
        "written by a bypassing tool session (role postgres, server default UTC) on 2026-05-12",
        "server default UTC; the API role's override was RESET afterwards",
    )
    f1.sql(role_override("r6_f1", "Australia/Sydney"))
    for mo in months:
        month_activity(f1, 2026, mo, lambda t: W_API_SYD, proposals=False)
    f1.proposal(W_DEFAULT_UTC, d(2026, 5, 12, 2))
    f1.use(Writer("postgres", None, "UTC"))
    f1.sql("ALTER ROLE fx_api IN DATABASE r6_f1 RESET timezone;")
    fx.append(f1)

    f2 = Fixture(
        "f2",
        "single correlated sample in an AEST month (Sydney and fixed +10 indistinguishable)",
        "Sydney throughout (Jan..Sep, AEDT rows Jan-Mar); one proposal only, 2026-06-10T04:00Z (+10)",
        "server default UTC, no overrides",
    )
    for mo in range(1, 10):
        month_activity(f2, 2026, mo, lambda t: W_SYD, proposals=False)
    f2.proposal(W_SYD, d(2026, 6, 10, 4))
    fx.append(f2)

    g = Fixture(
        "g",
        "no correlated sample at all",
        "Sydney history via a since-removed role override; no booking has a proposal notification",
        "server default UTC; override RESET, so step 1 shows UTC and no overrides",
    )
    g.sql(role_override("r6_g", "Australia/Sydney"))
    for mo in months:
        month_activity(g, 2026, mo, lambda t: W_API_SYD, proposals=False)
    g.use(Writer("postgres", None, "UTC"))
    g.sql("ALTER ROLE fx_api IN DATABASE r6_g RESET timezone;")
    fx.append(g)
    return fx


# ---------------------------------------------------------------- run one fixture


def stored_values(db: str) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for col in AUDIT_COLS:
        table, column = col.split(".")
        out[col] = [r["v"] for r in rows(db, f"SELECT {column}::text AS v FROM {table} ORDER BY 1;")]
    return out


def fmt_naive(n: datetime) -> str:
    return n.strftime("%Y-%m-%d %H:%M:%S")


def run_original(db: str, steps: dict[str, list[str]], env: dict | None = None) -> dict:
    s1 = steps["1"]
    show = rows(db, s1[0], env)
    settings = rows(db, s1[1], env)
    overrides = rows(db, s1[2], env)
    return {
        "show_timezone": show[0]["TimeZone"] if show else None,
        "pg_settings": settings,
        "overrides": overrides,
        "step2": rows(db, steps["2"][0], env),
        "step3": rows(db, steps["3"][0], env),
        "step4": rows(db, steps["4"][0], env),
    }


def run_proposed(db: str) -> dict:
    text = (HERE / "proposed_procedure.sql").read_text(encoding="utf-8")
    stmts = split_steps("-- 9. all\n" + text)["9"]
    return {"p2b": rows(db, stmts[0]), "p2c": rows(db, stmts[1]), "p2d": rows(db, stmts[2]), "p4": rows(db, stmts[3])}


# ---------------------------------------------------------------- the §3 interpretation table, applied


def month_key(value: str) -> str:
    return value[:7]


def months_between(lo: str, hi: str) -> list[str]:
    y, m = int(lo[:4]), int(lo[5:7])
    out = []
    while f"{y:04d}-{m:02d}" <= hi[:7]:
        out.append(f"{y:04d}-{m:02d}")
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


def apply_original(o: dict) -> dict:
    s1_utc = o["show_timezone"] in UTC_NAMES and all(r["setting"] in UTC_NAMES for r in o["pg_settings"])
    any_override = bool(o["overrides"])
    by_month: dict[str, set[int]] = {}
    for r in o["step2"]:
        by_month.setdefault(month_key(r["month"]), set()).add(int(float(r["offset_hours"])))
    offsets = set().union(*by_month.values()) if by_month else set()
    needed: set[str] = set()
    for r in o["step3"]:
        if int(r["count"]) > 0:
            needed.update(months_between(r["min"], r["max"]))
    gaps = sorted(needed - set(by_month))
    mixed_months = sorted(m for m, s in by_month.items() if 0 in s and len(s) > 1)
    sydney_like = bool(offsets) and offsets <= {10, 11}
    step4_total = sum(int(r["count"]) for r in o["step4"])
    matched = []
    if s1_utc and not any_override and offsets <= {0}:
        matched.append(
            "R1 (UTC every period, no overrides)" + (" — vacuous: step 2 returned no rows" if not offsets else "")
        )
    if offsets and 0 not in offsets:
        matched.append("R2 (one non-UTC zone; offsets " + ",".join(str(x) for x in sorted(offsets)) + ")")
    if mixed_months or (0 in offsets and len(offsets) > 1):
        matched.append(f"R3 (mixed zones: months {mixed_months or sorted(by_month)})")
    if gaps:
        matched.append(f"R3 (period without evidence: {len(gaps)} month(s) {gaps[0]}..{gaps[-1]})")
    if step4_total and sydney_like:
        matched.append(f"R4 (step 4 non-zero under a Sydney history: {step4_total} rows)")
    return {
        "step1_utc": s1_utc,
        "overrides": any_override,
        "step2_offsets_by_month": {m: sorted(s) for m, s in sorted(by_month.items())},
        "months_needing_a_zone": sorted(needed),
        "months_without_evidence": gaps,
        "mixed_months": mixed_months,
        "step4_total": step4_total,
        "sydney_like": sydney_like,
        "matched_rows": matched,
        "no_row_matches": not matched,
    }


def original_readings(app: dict) -> dict[str, callable]:
    """Per-row reading under the table: 'first match' (stop at the first matching row) and 'all rows'."""
    by_month = {m: set(s) for m, s in app["step2_offsets_by_month"].items()}
    first = app["matched_rows"][0] if app["matched_rows"] else None
    r3 = any(r.startswith("R3") for r in app["matched_rows"])

    def per_month(row: TruthRow) -> str:
        s = by_month.get(row.naive.strftime("%Y-%m"))
        if not s:
            return "INCONCLUSIVE"
        if s == {0}:
            if r3 or (app["step1_utc"] and not app["overrides"]):
                return "UTC"
            return "NO_DECISION"
        if 0 not in s and s <= {10, 11}:
            return "Australia/Sydney"
        return "INCONCLUSIVE"

    def all_rows(row: TruthRow) -> str:
        if not app["matched_rows"]:
            return "NO_DECISION"
        return per_month(row)

    readings = {"all_rows": all_rows}
    if first is None:
        readings["first_match"] = lambda row: "NO_DECISION"
    elif first.startswith("R1"):
        readings["first_match"] = lambda row: "UTC"
    elif first.startswith("R2"):
        offs = {x for s in by_month.values() for x in s}
        if offs == {10}:
            # one +10 offset fits Sydney (AEST) and a fixed +10 zone alike: score both choices
            readings["first_match_Z=Sydney"] = lambda row: "Australia/Sydney"
            readings["first_match_Z=fixed+10"] = lambda row: "Australia/Brisbane"
        else:
            readings["first_match"] = lambda row: "Australia/Sydney"
    else:
        readings["first_match"] = per_month
    return readings


# ---------------------------------------------------------------- the proposed rule


def apply_proposed(p: dict, o_app: dict) -> dict:
    """Proposed rule: per-month agreement (2b) and coverage (2c) with >= MIN_SAMPLES,
    switch windows from consecutive samples (2d), repeated hour in every column (4')."""
    months = {}
    for r in p["p2b"]:
        n, u, s, bne = (int(r[k]) for k in ("samples", "agrees_utc", "agrees_sydney", "agrees_brisbane"))
        if n < MIN_SAMPLES:
            status = "INSUFFICIENT"
        elif u == n and s < n:
            status = "UTC"
        elif s == n and u < n:
            status = "SYDNEY" if bne < n else "NON_UTC_+10_ONLY"
        elif u > 0 and s > 0 and u + s >= n:
            status = "MIXED"
        else:
            status = "UNEXPLAINED"
        months[month_key(r["month_utc"])] = {
            "status": status,
            "samples": n,
            "first": r["first_sample_utc"],
            "last": r["last_sample_utc"],
        }
    sufficient = {k: v for k, v in months.items() if v["status"] != "INSUFFICIENT"}
    sydney_identified = any(v["status"] == "SYDNEY" for v in months.values())
    unexplained = sorted(k for k, v in months.items() if v["status"] == "UNEXPLAINED")
    # Periods start at the first sample and at every UTC <-> non-UTC change (2d).
    periods, windows = [], []
    for r in p["p2d"]:
        at = datetime.fromisoformat(r["sample_utc"][:19])
        cls = "UTC" if int(float(r["offset_hours"])) == 0 else "NON_UTC"
        periods.append((at, cls))
        if r["prev_sample_utc"]:
            windows.append((datetime.fromisoformat(r["prev_sample_utc"][:19]), at + timedelta(hours=11)))
    uncovered = sorted({r["naive_month"][:7] for r in p["p2c"] if int(r["samples_in_month"]) < MIN_SAMPLES})
    flagged_cols = {r["col"] for r in p["p4"] if int(r["rows_in_sydney_repeated_hour"]) > 0}
    classes = {c for _, c in periods}
    if not sufficient:
        overall = "INCONCLUSIVE (no period has enough samples)"
    elif unexplained:
        overall = f"INCONCLUSIVE (samples agree with no candidate zone in {unexplained})"
    elif classes == {"UTC", "NON_UTC"}:
        overall = f"MIXED ({len(windows)} switch(es))"
    elif classes == {"UTC"}:
        overall = "UTC"
    elif sydney_identified:
        overall = "Australia/Sydney"
    else:
        overall = "NON-UTC +10 only: zone not identified (Sydney or a fixed +10 zone)"
    current_differs = (not o_app["step1_utc"] or o_app["overrides"]) and overall == "UTC"
    non_utc_zone = "Australia/Sydney" if sydney_identified else "Australia/Brisbane"

    def reading(row: TruthRow) -> str:
        if not sufficient or unexplained or row.naive.strftime("%Y-%m") in uncovered:
            return "INCONCLUSIVE"
        if any(lo <= row.naive <= hi for lo, hi in windows):
            return "INCONCLUSIVE"
        cls = periods[0][1]
        for start, c in periods:
            if start <= row.naive:
                cls = c
        return "UTC" if cls == "UTC" else non_utc_zone

    return {
        "months": months,
        "overall": overall,
        "periods": [(a.isoformat(" "), c) for a, c in periods],
        "switch_windows_naive": [(lo.isoformat(" "), hi.isoformat(" ")) for lo, hi in windows],
        "uncovered_naive_months": uncovered,
        "repeated_hour_flagged_columns": sorted(flagged_cols),
        "current_default_differs_from_evidenced_history": current_differs,
        "_reading": reading,
    }


# ---------------------------------------------------------------- scoring


def score(truth: list[TruthRow], reading, flagged_cols: set[str]) -> dict:
    out = {
        "correct": 0,
        "wrong": 0,
        "inconclusive": 0,
        "no_decision": 0,
        "repeated_hour_flagged": 0,
        "repeated_hour_unflagged": 0,
    }
    wrong_examples = []
    for row in truth:
        r = reading(row)
        if r == "NO_DECISION":
            out["no_decision"] += 1
        elif r == "INCONCLUSIVE":
            out["inconclusive"] += 1
        elif r == row.zone or (
            r == "Australia/Brisbane"
            and row.zone == "Australia/Sydney"
            and ZONES["Australia/Brisbane"].utcoffset(row.instant.replace(tzinfo=None))
            == row.instant.astimezone(ZONES["Australia/Sydney"]).utcoffset()
        ):
            if row.repeated_hour:
                out["repeated_hour_flagged" if row.col in flagged_cols else "repeated_hour_unflagged"] += 1
            else:
                out["correct"] += 1
        else:
            out["wrong"] += 1
            if len(wrong_examples) < 3:
                read_instant = row.naive.replace(tzinfo=ZONES[r]).astimezone(UTC)
                wrong_examples.append(
                    f"{row.col} stored {fmt_naive(row.naive)} (written {row.instant:%Y-%m-%dT%H:%MZ} in {row.zone}) "
                    f"read as {r} -> {read_instant:%Y-%m-%dT%H:%MZ}"
                )
    out["wrong_examples"] = wrong_examples
    return out


def verdict(s: dict) -> str:
    if s["wrong"] or s["repeated_hour_unflagged"]:
        return "OVERCONFIDENT"
    if s["no_decision"]:
        return "NO_DECISION (rule gap)"
    if s["inconclusive"]:
        return "INCONCLUSIVE for some rows"
    return "CORRECT"


# ---------------------------------------------------------------- main


def proof_now_equivalence(raw: Path) -> None:
    psql("postgres", "DROP DATABASE IF EXISTS r6_proof;", mode="quiet")
    psql("postgres", "CREATE DATABASE r6_proof;", mode="quiet")
    sql = """\
CREATE TABLE t (zone text, created_at timestamp without time zone NOT NULL DEFAULT now(), via_assignment timestamp, via_at_time_zone timestamp);
SET TIME ZONE 'Australia/Sydney';
BEGIN;
INSERT INTO t (zone, via_assignment, via_at_time_zone) VALUES (current_setting('TimeZone'), now(), now() AT TIME ZONE current_setting('TimeZone'));
COMMIT;
SET TIME ZONE 'UTC';
BEGIN;
INSERT INTO t (zone, via_assignment, via_at_time_zone) VALUES (current_setting('TimeZone'), now(), now() AT TIME ZONE current_setting('TimeZone'));
COMMIT;
SELECT zone, created_at = via_assignment AS default_now_equals_assignment, created_at = via_at_time_zone AS default_now_equals_at_time_zone FROM t ORDER BY zone;
-- The repeated hour: two instants, one stored wall time under a Sydney session.
SET TIME ZONE 'Australia/Sydney';
CREATE TABLE r (instant text, created_at timestamp without time zone);
INSERT INTO r VALUES ('2026-04-04T15:30Z', TIMESTAMPTZ '2026-04-04 15:30:00+00'), ('2026-04-04T16:30Z', TIMESTAMPTZ '2026-04-04 16:30:00+00');
SELECT instant, created_at AS stored_naive FROM r ORDER BY instant;
SELECT (TIMESTAMP '2026-04-05 02:30' AT TIME ZONE 'Australia/Sydney') AT TIME ZONE 'UTC' AS postgres_reads_ambiguous_value_as_utc;
"""
    out = psql("r6_proof", sql, mode="echo")
    (raw / "proof_now_equivalence.txt").write_text(out, encoding="utf-8")
    psql("postgres", "DROP DATABASE r6_proof;", mode="quiet")


def main() -> int:
    ensure_target()
    block, block_sha = procedure_block()
    steps = split_steps(block)
    assert [len(steps[k]) for k in "1234"] == [3, 1, 1, 1], {k: len(v) for k, v in steps.items()}
    raw = HERE / "raw"
    (HERE / "fixtures").mkdir(exist_ok=True)
    raw.mkdir(exist_ok=True)
    (raw / "procedure_block_as_run.sql").write_text(block, encoding="utf-8")
    proof_now_equivalence(raw)
    version = rows("postgres", "SELECT version() AS v;")[0]["v"]
    results = {
        "procedure_source": "docs/run-golf-v2/morning-fixes/R6_C01_DEPLOYMENT_GATE.md §3 (first ```sql block)",
        "procedure_block_sha256": block_sha,
        "postgres": version,
        "container": f"{CONTAINER} ({EXPECTED_BINDING}), disposable",
        "min_samples_proposed": MIN_SAMPLES,
        "fixtures": {},
    }
    schema = (HERE / "schema.sql").read_text(encoding="utf-8")
    for f in build_fixtures():
        db = f"r6_{f.fid}"
        script = f.render()
        (HERE / "fixtures" / f"{f.fid}.sql").write_text(script, encoding="utf-8")
        psql("postgres", f"DROP DATABASE IF EXISTS {db};", mode="quiet")
        psql("postgres", f"CREATE DATABASE {db};", mode="quiet")
        psql(db, schema, mode="quiet")
        psql(db, script, mode="quiet")
        # Ground truth check: what PostgreSQL stored == Python zoneinfo's wall time per row.
        truth = list(f.truth.values())
        stored = stored_values(db)
        for col in AUDIT_COLS:
            expect = sorted(fmt_naive(t.naive) for t in truth if t.col == col)
            got = [v[:19] for v in stored[col]]
            if expect != got:
                raise AssertionError(f"{f.fid} {col}: stored {got[:3]}... != expected {expect[:3]}...")
        fdir = raw / f.fid
        fdir.mkdir(exist_ok=True)
        (fdir / "original_procedure.txt").write_text(psql(db, block, mode="echo"), encoding="utf-8")
        (fdir / "proposed_procedure.txt").write_text(
            psql(db, (HERE / "proposed_procedure.sql").read_text(encoding="utf-8"), mode="echo"), encoding="utf-8"
        )
        extra = {}
        if f.fid == "e1":
            out = psql(db, "".join(steps["1"]), mode="echo", env={"PGTZ": "UTC"})
            (fdir / "step1_with_client_PGTZ_UTC.txt").write_text(out, encoding="utf-8")
            extra["step1_with_client_PGTZ_UTC"] = run_original(db, steps, env={"PGTZ": "UTC"})["pg_settings"]
        if f.fid == "b":
            out = psql(db, steps["2"][0], mode="echo", env={"PGTZ": "UTC"})
            (fdir / "step2_with_client_PGTZ_UTC.txt").write_text(out, encoding="utf-8")
            extra["step2_with_client_PGTZ_UTC"] = rows(db, steps["2"][0], env={"PGTZ": "UTC"})
        o = run_original(db, steps)
        o_app = apply_original(o)
        p = run_proposed(db)
        p_app = apply_proposed(p, o_app)
        orig_scores = {
            name: (lambda s: {**s, "verdict": verdict(s)})(score(truth, fn, ORIGINAL_STEP4_COLS))
            for name, fn in original_readings(o_app).items()
        }
        prop_score = score(truth, p_app.pop("_reading"), set(p_app["repeated_hour_flagged_columns"]))
        prop_score["verdict"] = verdict(prop_score)
        zones_used = sorted({t.zone for t in truth})
        results["fixtures"][f.fid] = {
            "title": f.title,
            "truth": f.truth_note,
            "current_state": f.current_state_note,
            "audit_rows": len(truth),
            "zones_used": zones_used,
            "repeated_hour_rows": sorted(
                f"{t.col} {fmt_naive(t.naive)} ({t.instant:%H:%MZ})" for t in truth if t.repeated_hour
            ),
            "original": {"outputs": o, "table_applied": o_app, "scores": orig_scores},
            "proposed": {"outputs": p, "applied": p_app, "score": prop_score},
            **({"extra": extra} if extra else {}),
        }
        psql("postgres", f"DROP DATABASE {db};", mode="quiet")
    psql("postgres", "DROP ROLE IF EXISTS fx_api;", mode="quiet")
    (HERE / "results.json").write_text(json.dumps(results, indent=2, default=str) + "\n", encoding="utf-8")
    # Console summary
    print(f"procedure block sha256 {block_sha}")
    for fid, r in results["fixtures"].items():
        ta = r["original"]["table_applied"]
        print(f"\n[{fid}] {r['title']}  (rows {r['audit_rows']}, truth zones {r['zones_used']})")
        print(f"  original table rows matched: {ta['matched_rows'] or ['none']}")
        for name, s in r["original"]["scores"].items():
            print(
                f"  original/{name}: {s['verdict']}  "
                + ", ".join(f"{k}={v}" for k, v in s.items() if isinstance(v, int))
            )
        ps = r["proposed"]["score"]
        print(
            f"  proposed: {r['proposed']['applied']['overall']} -> {ps['verdict']}  "
            + ", ".join(f"{k}={v}" for k, v in ps.items() if isinstance(v, int))
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
