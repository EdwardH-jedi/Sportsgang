"""Audit timestamps on the wire (docs/run-golf-v2/CONTRACTS.md §9).

Response fields typed ``AuditInstant`` are always serialized as an aware UTC
instant (``2026-10-02T15:30:00Z``). Aware values keep their instant. Naive
values — the nine ``timestamp without time zone`` audit columns, filled by
PostgreSQL ``now()`` in the writing session's TimeZone — are read in
``DB_NAIVE_TIMEZONE``, the zone every API/Alembic session is pinned to
(``Settings.db_connect_args``). For a non-UTC zone, a repeated wall time
resolves to its earlier occurrence (zoneinfo ``fold=0``, as for booking
bounds) and a skipped one uses the offset before the transition.
"""

from __future__ import annotations

from datetime import datetime, timezone, tzinfo
from functools import lru_cache
from typing import Annotated
from zoneinfo import ZoneInfo

from pydantic import AfterValidator

from app.core.config import get_settings


@lru_cache
def naive_zone() -> tzinfo:
    name = get_settings().db_naive_timezone
    return timezone.utc if name == "UTC" else ZoneInfo(name)


def utc_instant(value: datetime) -> datetime:
    if value.tzinfo is None:
        value = value.replace(tzinfo=naive_zone())
    return value.astimezone(timezone.utc)


AuditInstant = Annotated[datetime, AfterValidator(utc_instant)]
