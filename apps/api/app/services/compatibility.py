"""Deterministic, explainable, bilateral running/golf compatibility.

Pure functions over two sport-profile rows (ORM objects or anything with the
same attributes) — no DB or HTTP access, no randomness, no percentages.

A pair is recommended only when *each* person's stated rule admits the
other: a viewer's willingness alone is never enough, and "any level" on one
side never overrides a restriction on the other. Established intent or pace
incompatibility excludes the candidate outright; time/distance fit only
orders candidates that are already admissible.

Tiers (docs/run-golf-v2/CONTRACTS.md §4):
    compatible  — both configured, both rules pass on stated facts
    unverified  — nothing incompatible, but a fact a rule needs is unknown
    needs_setup — either side has not configured v2 preferences
Every reason/caveat is built from stored values only.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from app.services import sport_preferences as prefs

TIER_COMPATIBLE = "compatible"
TIER_UNVERIFIED = "unverified"
TIER_NEEDS_SETUP = "needs_setup"
# Higher ranks sort first. Fit points never move a row across tiers.
TIER_RANK: dict[str, int] = {TIER_COMPATIBLE: 2, TIER_UNVERIFIED: 1, TIER_NEEDS_SETUP: 0}

# A golfer counts as "more experienced" on handicap evidence when their index
# is at least this many strokes (tenths) lower. Without two handicaps the
# stated experience bands decide.
MORE_EXPERIENCED_MARGIN_TENTHS = 50

_GOLF_EXPERIENCE_RANK = {"new": 0, "range": 1, "played_rounds": 2, "regular": 3}
_GOLF_EXPERIENCE_LABEL = {
    "new": "new to golf",
    "range": "driving-range experience",
    "played_rounds": "has played rounds",
    "regular": "plays regularly",
}
_BEGINNER_EXPERIENCE = frozenset({"new", "range"})
_TIME_LABEL = {"morning": "mornings", "afternoon": "afternoons", "evening": "evenings"}
_GROUP_STYLE_LABEL = {
    "stay_together": "staying together",
    "regroup_at_finish": "regrouping at the finish",
    "pace_groups": "pace groups",
}


@dataclass(frozen=True)
class Note:
    code: str
    text: str


@dataclass
class Assessment:
    """Outcome for one (viewer, candidate) pair. ``tier is None`` = exclude."""

    tier: Optional[str]
    reasons: list[Note] = field(default_factory=list)
    caveats: list[Note] = field(default_factory=list)
    points: int = 0

    @property
    def excluded(self) -> bool:
        return self.tier is None


# ---------------------------------------------------------------------------
# Formatting (mirrors the mobile display helpers)
# ---------------------------------------------------------------------------


def format_handicap(tenths: int) -> str:
    """Signed tenths -> display: 124 -> '12.4', -21 -> '+2.1', 0 -> '0.0'."""
    sign = "+" if tenths < 0 else ""
    value = abs(tenths)
    return f"{sign}{value // 10}.{value % 10}"


def format_pace(seconds: int) -> str:
    """Seconds per km -> 'm:ss'."""
    return f"{seconds // 60}:{seconds % 60:02d}"


def _join(words: list[str]) -> str:
    if len(words) <= 1:
        return "".join(words)
    return ", ".join(words[:-1]) + " and " + words[-1]


def _km(d: float) -> str:
    return f"{d:g} km"


# ---------------------------------------------------------------------------
# Shared signals
# ---------------------------------------------------------------------------


def _time_fit(viewer: Any, candidate: Any) -> tuple[int, Optional[Note]]:
    a = set(viewer.preferred_times or [])
    b = set(candidate.preferred_times or [])
    if not a or not b:
        return 0, None
    if "flexible" in a or "flexible" in b:
        return 2, Note("time_flexible", "Timing is flexible on at least one side")
    shared = [t for t in ("morning", "afternoon", "evening") if t in a and t in b]
    if not shared:
        return 0, None
    return 2 * len(shared), Note("time_overlap", f"Both prefer {_join([_TIME_LABEL[t] for t in shared])}")


def _not_configured(viewer: Any, candidate: Any, sport_label: str) -> Optional[Assessment]:
    caveats: list[Note] = []
    if viewer is None or not prefs.is_configured(viewer):
        caveats.append(Note("viewer_setup_required", f"Set up your {sport_label} preferences to see who fits"))
    if not prefs.is_configured(candidate):
        caveats.append(Note("candidate_setup_missing", f"Hasn't set {sport_label} preferences yet"))
    if caveats:
        return Assessment(tier=TIER_NEEDS_SETUP, caveats=caveats)
    return None


# ---------------------------------------------------------------------------
# Golf
# ---------------------------------------------------------------------------


def _numeric_handicap(p: Any) -> Optional[int]:
    if p.golf_handicap_source in ("official_index", "estimate"):
        return p.golf_handicap_tenths
    return None


def _more_experienced(x: Any, y: Any) -> Optional[str]:
    """Return evidence text that ``x`` is more experienced than ``y``, or None.

    Two numeric handicaps decide on their own; otherwise the stated
    experience bands are compared. Nothing is inferred beyond that.
    """
    hx, hy = _numeric_handicap(x), _numeric_handicap(y)
    if hx is not None and hy is not None:
        if hx <= hy - MORE_EXPERIENCED_MARGIN_TENTHS:
            return f"handicap {format_handicap(hx)} vs {format_handicap(hy)}"
        return None
    rx = _GOLF_EXPERIENCE_RANK.get(x.golf_experience or "", -1)
    ry = _GOLF_EXPERIENCE_RANK.get(y.golf_experience or "", -1)
    if rx > ry >= 0:
        return f"{_GOLF_EXPERIENCE_LABEL[x.golf_experience]} vs {_GOLF_EXPERIENCE_LABEL[y.golf_experience]}"
    return None


def _golf_owner_admits(owner: Any, other: Any) -> Optional[tuple[str, str]]:
    """Does ``owner``'s own partner intent accept ``other``? Returns (code, evidence).

    ``learn_from_experienced`` is deliberately not handled here: a wish to
    learn admits a partner only through ``_learning_route``, which also needs
    that partner's explicit consent.
    """
    intents = list(owner.golf_partner_intents or [])
    if "any_level" in intents:
        return "any_level", "open to any level"
    if "similar_level" in intents:
        ho, ht = _numeric_handicap(owner), _numeric_handicap(other)
        tolerance = owner.golf_similarity_tolerance_tenths or prefs.DEFAULT_SIMILARITY_TOLERANCE_TENTHS
        if ho is not None and ht is not None:
            if abs(ho - ht) <= tolerance:
                return "similar_handicap", (
                    f"handicaps {format_handicap(ho)} and {format_handicap(ht)} are within {format_handicap(tolerance)}"
                )
        elif owner.golf_experience and owner.golf_experience == other.golf_experience:
            # Labelled fallback: never presented as a handicap match.
            return "similar_experience", (
                f"both {_GOLF_EXPERIENCE_LABEL[owner.golf_experience]} (no two handicaps to compare)"
            )
    if "welcome_beginners" in intents:
        if other.golf_experience in _BEGINNER_EXPERIENCE:
            return "welcomes_beginner", _GOLF_EXPERIENCE_LABEL[other.golf_experience]
        evidence = _more_experienced(owner, other)
        if evidence:
            return "welcomes_beginner", evidence
    return None


def _learning_route(learner: Any, mentor: Any) -> Optional[tuple[str, str]]:
    """``learner`` learning from ``mentor``. Returns (evidence, consent code).

    Needs all three: the learner's ``learn_from_experienced`` intent, evidence
    that the mentor is more experienced, and the mentor's explicit
    ``welcome_beginners`` or ``any_level``. A broad ``similar_level``
    tolerance is not consent to mentor a learner (review F3).
    """
    if "learn_from_experienced" not in (learner.golf_partner_intents or []):
        return None
    evidence = _more_experienced(mentor, learner)
    if not evidence:
        return None
    mentor_intents = mentor.golf_partner_intents or []
    if "welcome_beginners" in mentor_intents:
        return evidence, "welcomes_beginners"
    if "any_level" in mentor_intents:
        return evidence, "any_level"
    return None


_WELCOMES_BEGINNERS = Note("welcomes_beginners", "Welcomes beginners")
_ANY_LEVEL = Note("any_level", "Open to golfers of any level")


def assess_golf(viewer: Any, candidate: Any) -> Assessment:
    """A pair is admitted by any route that holds on its own:

    - mutual: each person's own non-learning intent (any / similar /
      welcome beginners) admits the other;
    - viewer learns: the viewer wants to learn, the candidate is more
      experienced and explicitly welcomes beginners or any level;
    - candidate learns: the same with the roles swapped.

    Reasons are only taken from routes that actually admit the pair, so a
    similar-level match never carries a learning/mentoring reason.
    """
    pending = _not_configured(viewer, candidate, "golf")
    if pending:
        return pending

    viewer_side = _golf_owner_admits(viewer, candidate)
    candidate_side = _golf_owner_admits(candidate, viewer)
    mutual = viewer_side is not None and candidate_side is not None
    viewer_learns = _learning_route(viewer, candidate)
    candidate_learns = _learning_route(candidate, viewer)
    if not (mutual or viewer_learns or candidate_learns):
        return Assessment(tier=None)

    reasons: list[Note] = []
    caveats: list[Note] = []

    def add(note: Note) -> None:
        if all(r.code != note.code for r in reasons):
            reasons.append(note)

    if mutual:
        code_v, evidence_v = viewer_side
        code_c, evidence_c = candidate_side
        if code_v == "similar_handicap" or code_c == "similar_handicap":
            text = evidence_v if code_v == "similar_handicap" else evidence_c
            add(Note("similar_handicap", f"Similar level: {text}"))
        elif code_v == "similar_experience" or code_c == "similar_experience":
            text = evidence_v if code_v == "similar_experience" else evidence_c
            add(Note("similar_experience", f"Similar experience: {text}"))
        # The candidate's side of the mutual route, from their own intent.
        if code_c == "welcomes_beginner":
            add(_WELCOMES_BEGINNERS)
        if code_c == "any_level":
            add(_ANY_LEVEL)
    if viewer_learns:
        evidence, consent = viewer_learns
        add(Note("more_experienced", f"More experienced than you ({evidence})"))
        add(_WELCOMES_BEGINNERS if consent == "welcomes_beginners" else _ANY_LEVEL)
    if candidate_learns:
        evidence, _ = candidate_learns
        add(Note("learner_fit", f"Wants to learn from experienced golfers ({evidence})"))

    points, time_note = _time_fit(viewer, candidate)
    if time_note:
        reasons.append(time_note)
    holes_v, holes_c = viewer.golf_preferred_holes, candidate.golf_preferred_holes
    if holes_v and holes_c and (holes_v == holes_c or "either" in (holes_v, holes_c)):
        points += 1
        if holes_v == holes_c and holes_v != "either":
            reasons.append(Note("holes", f"Both prefer {holes_v} holes"))

    if _numeric_handicap(viewer) is not None or _numeric_handicap(candidate) is not None:
        caveats.append(Note("handicap_self_reported", "Handicaps are self-reported, not verified"))
    if candidate.golf_handicap_source == "estimate":
        caveats.append(Note("handicap_estimate", "Their handicap is an estimate"))

    return Assessment(tier=TIER_COMPATIBLE, reasons=reasons, caveats=caveats, points=points)


# ---------------------------------------------------------------------------
# Running
# ---------------------------------------------------------------------------


def _declared_pace(p: Any) -> Optional[tuple[int, int]]:
    if p.run_pace_min_sec_per_km is None or p.run_pace_max_sec_per_km is None:
        return None
    return p.run_pace_min_sec_per_km, p.run_pace_max_sec_per_km


def pace_overlap(a: tuple[int, int], b: tuple[int, int]) -> Optional[tuple[int, int]]:
    lo, hi = max(a[0], b[0]), min(a[1], b[1])
    return (lo, hi) if lo <= hi else None


def assess_running(viewer: Any, candidate: Any, *, strict_pace: bool = False) -> Assessment:
    pending = _not_configured(viewer, candidate, "running")
    if pending:
        # A strict pace filter needs two declared ranges; nothing to claim here.
        return Assessment(tier=None) if strict_pace else pending

    pv, pc = _declared_pace(viewer), _declared_pace(candidate)
    overlap = pace_overlap(pv, pc) if pv and pc else None
    reasons: list[Note] = []
    caveats: list[Note] = []
    tier = TIER_COMPATIBLE

    if strict_pace and overlap is None:
        return Assessment(tier=None)

    for owner, other_pace, owner_is_viewer in ((viewer, pc, True), (candidate, pv, False)):
        if owner.run_pace_mode != "match_pace":
            continue
        if other_pace is None:
            # Unknown is not a match and not a mismatch: honest label only.
            tier = TIER_UNVERIFIED
            caveats.append(
                Note("pace_unknown", "Hasn't shared a pace range")
                if owner_is_viewer
                else Note("your_pace_unknown", "They want to match pace; you haven't shared a pace range")
            )
        elif overlap is None:
            return Assessment(tier=None)

    if overlap:
        lo, hi = overlap
        span = format_pace(lo) if lo == hi else f"{format_pace(lo)}–{format_pace(hi)}"
        reasons.append(Note("pace_overlap", f"Pace ranges overlap at {span} /km"))
    elif pv and pc:
        # Both social with different usual paces: still admissible, said plainly.
        caveats.append(Note("pace_differs", "Your usual paces differ"))
    if viewer.run_pace_mode == "social" and candidate.run_pace_mode == "social":
        reasons.append(Note("both_social", "Both run socially — pace is flexible"))

    points, time_note = _time_fit(viewer, candidate)
    if time_note:
        reasons.append(time_note)
    shared_distances = sorted(set(viewer.run_distances_km or []) & set(candidate.run_distances_km or []))
    if shared_distances:
        points += 2 * min(len(shared_distances), 2)
        reasons.append(Note("distance_overlap", f"Both like {_join([_km(d) for d in shared_distances])}"))
    if viewer.run_group_style and viewer.run_group_style == candidate.run_group_style:
        points += 2
        reasons.append(Note("group_style", f"Both prefer {_GROUP_STYLE_LABEL[viewer.run_group_style]}"))

    return Assessment(tier=tier, reasons=reasons, caveats=caveats, points=points)


def assess(sport: str, viewer: Any, candidate: Any, *, strict_pace: bool = False) -> Assessment:
    if sport == "golf":
        return assess_golf(viewer, candidate)
    if sport == "running":
        return assess_running(viewer, candidate, strict_pace=strict_pace)
    raise ValueError(f"v2 compatibility is only defined for running and golf, not {sport!r}")
