"""v2 running/golf sport-preference vocabulary and merged-state validation.

Field-level checks (enum membership, numeric ranges, list normalisation)
live on the Pydantic request schema. The rules here need the *merged* row —
existing values plus the request patch — because v2 fields follow
"omitted = preserved, null = cleared" semantics, so a partial patch must
not be able to leave an invalid combination behind.
See docs/run-golf-v2/CONTRACTS.md §2.
"""

from __future__ import annotations

from typing import Any, Mapping

FOCUS_SPORTS: tuple[str, ...] = ("running", "golf")
V2_PREFERENCES_VERSION = 2

GOLF_HANDICAP_SOURCES: tuple[str, ...] = ("official_index", "estimate", "none")
GOLF_EXPERIENCE_LEVELS: tuple[str, ...] = ("new", "range", "played_rounds", "regular")
GOLF_PARTNER_INTENTS: tuple[str, ...] = (
    "similar_level",
    "learn_from_experienced",
    "welcome_beginners",
    "any_level",
)
GOLF_PREFERRED_HOLES: tuple[str, ...] = ("9", "18", "either")
RUN_PACE_MODES: tuple[str, ...] = ("match_pace", "social")
RUN_GROUP_STYLES: tuple[str, ...] = ("stay_together", "regroup_at_finish", "pace_groups")

# Handicap index bounds in signed tenths: +10.0 (stored -100) to 54.0.
HANDICAP_MIN_TENTHS = -100
HANDICAP_MAX_TENTHS = 540
TOLERANCE_MIN_TENTHS = 10
TOLERANCE_MAX_TENTHS = 200
# Product default for "similar level" when the user has not picked a gap.
DEFAULT_SIMILARITY_TOLERANCE_TENTHS = 50
# Pace bounds, seconds per km (2:00 to 20:00 /km).
PACE_MIN_SEC_PER_KM = 120
PACE_MAX_SEC_PER_KM = 1200
RUN_DISTANCE_MAX_KM = 100.0
RUN_DISTANCES_MAX_ITEMS = 6

GOLF_FIELDS: tuple[str, ...] = (
    "golf_handicap_tenths",
    "golf_handicap_source",
    "golf_experience",
    "golf_partner_intents",
    "golf_similarity_tolerance_tenths",
    "golf_preferred_holes",
)
RUN_FIELDS: tuple[str, ...] = (
    "run_pace_mode",
    "run_pace_min_sec_per_km",
    "run_pace_max_sec_per_km",
    "run_distances_km",
    "run_group_style",
)
V2_FIELDS: tuple[str, ...] = ("preferences_version", *GOLF_FIELDS, *RUN_FIELDS)


def validate_merged(sport: str, values: Mapping[str, Any]) -> list[str]:
    """Return human-readable problems with a merged v2 preference state.

    ``values`` must contain every key in ``V2_FIELDS``. An empty list means
    the combination is valid.
    """
    errors: list[str] = []

    if sport != "golf" and any(values[f] is not None for f in GOLF_FIELDS):
        errors.append("Golf preferences can only be saved on a golf profile.")
    if sport != "running" and any(values[f] is not None for f in RUN_FIELDS):
        errors.append("Running preferences can only be saved on a running profile.")
    if sport not in FOCUS_SPORTS and values["preferences_version"] is not None:
        errors.append("Sport preferences are only available for running and golf.")
    if errors:
        return errors

    configured = values["preferences_version"] == V2_PREFERENCES_VERSION

    if sport == "golf":
        handicap = values["golf_handicap_tenths"]
        source = values["golf_handicap_source"]
        if handicap is not None and source is None:
            errors.append("Say where your handicap comes from (official index or estimate).")
        if source == "none" and handicap is not None:
            errors.append("A handicap value cannot be combined with 'no handicap'.")
        if configured:
            if source is None:
                errors.append("Choose your handicap situation.")
            elif source != "none" and handicap is None:
                errors.append("Enter your handicap, or choose 'no handicap'.")
            if values["golf_experience"] is None:
                errors.append("Choose your golf experience.")
            if not values["golf_partner_intents"]:
                errors.append("Choose at least one kind of golf partner.")

    if sport == "running":
        pace_min = values["run_pace_min_sec_per_km"]
        pace_max = values["run_pace_max_sec_per_km"]
        if (pace_min is None) != (pace_max is None):
            errors.append("Give both ends of your pace range, or neither.")
        elif pace_min is not None and pace_min > pace_max:
            errors.append("The faster pace must not be slower than the slower pace.")
        if configured:
            mode = values["run_pace_mode"]
            if mode is None:
                errors.append("Choose whether you want to match pace or run socially.")
            elif mode == "match_pace" and pace_min is None:
                errors.append("Matching pace needs your comfortable pace range.")

    return errors


def is_configured(values: Mapping[str, Any] | Any) -> bool:
    """True when a row (mapping or ORM object) is v2-configured."""
    version = values.get("preferences_version") if isinstance(values, Mapping) else values.preferences_version
    return version == V2_PREFERENCES_VERSION
