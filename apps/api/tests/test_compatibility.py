"""Pure tests for app.services.compatibility (bilateral running/golf rules).

Covers the todo.md Wave 2 example matrix. No DB: profiles are plain
namespaces with the same attributes as SportProfile rows.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services import compatibility as compat


def golf(**overrides) -> SimpleNamespace:
    base = dict(
        preferences_version=2,
        preferred_times=["morning"],
        golf_handicap_tenths=None,
        golf_handicap_source="none",
        golf_experience="played_rounds",
        golf_partner_intents=["similar_level"],
        golf_similarity_tolerance_tenths=None,
        golf_preferred_holes=None,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def run(**overrides) -> SimpleNamespace:
    base = dict(
        preferences_version=2,
        preferred_times=["morning"],
        run_pace_mode="match_pace",
        run_pace_min_sec_per_km=330,
        run_pace_max_sec_per_km=390,
        run_distances_km=None,
        run_group_style=None,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def codes(notes: list[compat.Note]) -> set[str]:
    return {n.code for n in notes}


BEGINNER = dict(golf_experience="range", golf_partner_intents=["learn_from_experienced"])
EXPERT_WELCOMING = dict(
    golf_handicap_tenths=62,
    golf_handicap_source="official_index",
    golf_experience="regular",
    golf_partner_intents=["welcome_beginners"],
)
EXPERT_SIMILAR_ONLY = dict(
    golf_handicap_tenths=62,
    golf_handicap_source="official_index",
    golf_experience="regular",
    golf_partner_intents=["similar_level"],
)


# ---------------------------------------------------------------------------
# Golf
# ---------------------------------------------------------------------------


def test_beginner_seeking_experience_meets_expert_welcoming_beginners() -> None:
    result = compat.assess("golf", golf(**BEGINNER), golf(**EXPERT_WELCOMING))
    assert result.tier == compat.TIER_COMPATIBLE
    assert {"more_experienced", "welcomes_beginners"} <= codes(result.reasons)
    # The expert's view of the same pair is also admissible (bilateral).
    reverse = compat.assess("golf", golf(**EXPERT_WELCOMING), golf(**BEGINNER))
    assert reverse.tier == compat.TIER_COMPATIBLE
    assert "learner_fit" in codes(reverse.reasons)


def test_beginner_and_expert_who_wants_similar_level_only_are_excluded() -> None:
    # The beginner's willingness alone is not enough.
    assert compat.assess("golf", golf(**BEGINNER), golf(**EXPERT_SIMILAR_ONLY)).excluded
    assert compat.assess("golf", golf(**EXPERT_SIMILAR_ONLY), golf(**BEGINNER)).excluded


def test_any_level_does_not_override_the_other_persons_restriction() -> None:
    open_beginner = golf(golf_experience="new", golf_partner_intents=["any_level"])
    assert compat.assess("golf", open_beginner, golf(**EXPERT_SIMILAR_ONLY)).excluded
    # ...but two "any level" golfers are fine.
    assert compat.assess("golf", open_beginner, golf(golf_partner_intents=["any_level"])).tier == "compatible"


def test_learner_needs_evidence_the_other_is_more_experienced() -> None:
    peer_who_welcomes = golf(golf_experience="range", golf_partner_intents=["welcome_beginners"])
    # Same experience band, no handicaps: no evidence of more experience.
    assert compat.assess("golf", golf(**BEGINNER), peer_who_welcomes).excluded


def test_similar_golfers_within_both_limits() -> None:
    a = golf(golf_handicap_tenths=124, golf_handicap_source="official_index", golf_similarity_tolerance_tenths=40)
    b = golf(golf_handicap_tenths=150, golf_handicap_source="estimate", golf_similarity_tolerance_tenths=50)
    result = compat.assess("golf", a, b)
    assert result.tier == compat.TIER_COMPATIBLE
    assert "similar_handicap" in codes(result.reasons)
    assert {"handicap_self_reported", "handicap_estimate"} <= codes(result.caveats)


def test_similar_golfers_outside_one_persons_limit_are_excluded() -> None:
    strict = golf(golf_handicap_tenths=124, golf_handicap_source="official_index", golf_similarity_tolerance_tenths=20)
    loose = golf(golf_handicap_tenths=150, golf_handicap_source="official_index", golf_similarity_tolerance_tenths=100)
    assert compat.assess("golf", strict, loose).excluded
    assert compat.assess("golf", loose, strict).excluded


def test_default_similarity_tolerance_is_five_strokes() -> None:
    a = golf(golf_handicap_tenths=100, golf_handicap_source="official_index")
    assert compat.assess("golf", a, golf(golf_handicap_tenths=150, golf_handicap_source="official_index")).tier
    assert compat.assess("golf", a, golf(golf_handicap_tenths=151, golf_handicap_source="official_index")).excluded


def test_plus_handicaps_compare_on_the_signed_scale() -> None:
    plus = golf(golf_handicap_tenths=-21, golf_handicap_source="official_index")  # +2.1
    scratch = golf(golf_handicap_tenths=20, golf_handicap_source="official_index")  # 2.0
    result = compat.assess("golf", plus, scratch)
    assert result.tier == compat.TIER_COMPATIBLE  # gap 4.1 <= 5.0
    assert "+2.1" in next(n.text for n in result.reasons if n.code == "similar_handicap")
    far = golf(golf_handicap_tenths=40, golf_handicap_source="official_index")  # 4.0 -> gap 6.1
    assert compat.assess("golf", plus, far).excluded


def test_missing_handicaps_use_a_labelled_experience_fallback() -> None:
    a = golf(golf_experience="played_rounds")
    b = golf(golf_experience="played_rounds")
    result = compat.assess("golf", a, b)
    assert result.tier == compat.TIER_COMPATIBLE
    assert codes(result.reasons) >= {"similar_experience"}
    assert "similar_handicap" not in codes(result.reasons)
    text = next(n.text for n in result.reasons if n.code == "similar_experience")
    assert "no two handicaps" in text
    # No handicap was stated, so no self-reported-handicap caveat is invented.
    assert "handicap_self_reported" not in codes(result.caveats)


def test_missing_handicap_and_different_experience_is_not_called_similar() -> None:
    assert compat.assess("golf", golf(golf_experience="range"), golf(golf_experience="regular")).excluded


def test_time_overlap_cannot_offset_intent_incompatibility() -> None:
    both_flexible = dict(preferred_times=["flexible"])
    assert compat.assess(
        "golf", golf(**BEGINNER, **both_flexible), golf(**EXPERT_SIMILAR_ONLY, **both_flexible)
    ).excluded


def test_legacy_profiles_need_setup_and_get_no_invented_match() -> None:
    legacy = golf(preferences_version=None, golf_partner_intents=None, golf_experience=None, golf_handicap_source=None)
    result = compat.assess("golf", golf(), legacy)
    assert result.tier == compat.TIER_NEEDS_SETUP
    assert result.reasons == []
    assert "candidate_setup_missing" in codes(result.caveats)
    viewer_missing = compat.assess("golf", None, golf())
    assert viewer_missing.tier == compat.TIER_NEEDS_SETUP
    assert "viewer_setup_required" in codes(viewer_missing.caveats)


# ---------------------------------------------------------------------------
# Running
# ---------------------------------------------------------------------------


def test_overlapping_pace_ranges_are_compatible_with_the_overlap_named() -> None:
    result = compat.assess("running", run(), run(run_pace_min_sec_per_km=360, run_pace_max_sec_per_km=420))
    assert result.tier == compat.TIER_COMPATIBLE
    assert next(n.text for n in result.reasons if n.code == "pace_overlap") == "Pace ranges overlap at 6:00–6:30 /km"


def test_non_overlapping_pace_ranges_are_excluded() -> None:
    assert compat.assess("running", run(), run(run_pace_min_sec_per_km=400, run_pace_max_sec_per_km=450)).excluded


def test_social_runner_with_unknown_pace_general_vs_strict() -> None:
    social = run(run_pace_mode="social", run_pace_min_sec_per_km=None, run_pace_max_sec_per_km=None)
    general = compat.assess("running", run(), social)
    assert general.tier == compat.TIER_UNVERIFIED
    assert "pace_overlap" not in codes(general.reasons)
    assert "pace_unknown" in codes(general.caveats)
    # Strict pace browsing never admits an undeclared pace.
    assert compat.assess("running", run(), social, strict_pace=True).excluded
    # The social runner looking at the pace-matcher sees the same honest label.
    reverse = compat.assess("running", social, run())
    assert reverse.tier == compat.TIER_UNVERIFIED
    assert "your_pace_unknown" in codes(reverse.caveats)


def test_social_runner_with_declared_but_different_pace_does_not_satisfy_a_pace_matcher() -> None:
    social_fast = run(run_pace_mode="social", run_pace_min_sec_per_km=240, run_pace_max_sec_per_km=270)
    assert compat.assess("running", run(), social_fast).excluded


def test_two_social_runners_emphasise_time_distance_and_style() -> None:
    a = run(
        run_pace_mode="social",
        run_pace_min_sec_per_km=None,
        run_pace_max_sec_per_km=None,
        run_distances_km=[5.0, 10.0],
        run_group_style="stay_together",
        preferred_times=["morning", "evening"],
    )
    b = run(
        run_pace_mode="social",
        run_pace_min_sec_per_km=None,
        run_pace_max_sec_per_km=None,
        run_distances_km=[10.0, 21.1],
        run_group_style="stay_together",
        preferred_times=["evening"],
    )
    result = compat.assess("running", a, b)
    assert result.tier == compat.TIER_COMPATIBLE
    assert {"both_social", "time_overlap", "distance_overlap", "group_style"} <= codes(result.reasons)
    assert "pace_overlap" not in codes(result.reasons)
    assert result.points == 2 + 2 + 2


def test_strict_pace_requires_both_declared_ranges_to_overlap() -> None:
    assert compat.assess("running", run(), run(), strict_pace=True).tier == compat.TIER_COMPATIBLE
    legacy = run(preferences_version=None)
    assert compat.assess("running", run(), legacy, strict_pace=True).excluded
    assert compat.assess("running", run(), legacy).tier == compat.TIER_NEEDS_SETUP


@pytest.mark.parametrize(
    ("tenths", "text"),
    [(124, "12.4"), (-21, "+2.1"), (0, "0.0"), (540, "54.0"), (-100, "+10.0"), (5, "0.5")],
)
def test_format_handicap(tenths: int, text: str) -> None:
    assert compat.format_handicap(tenths) == text


def test_format_pace() -> None:
    assert compat.format_pace(390) == "6:30"
    assert compat.format_pace(305) == "5:05"


def test_unknown_sport_is_rejected() -> None:
    with pytest.raises(ValueError):
        compat.assess("gym", run(), run())
