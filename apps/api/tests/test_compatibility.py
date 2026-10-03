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
# Learning needs the other golfer's explicit consent (review F3)
# ---------------------------------------------------------------------------

# The review's counterexample: an estimated 30.0 range golfer who wants to
# learn, and a regular 24.0 golfer who only wants similar-level partners but
# allows a 10.0 gap. The gap fits the mentor's tolerance and the mentor is
# more experienced, yet the mentor never offered to play with learners.
LEARNER_30 = dict(
    golf_handicap_tenths=300,
    golf_handicap_source="estimate",
    golf_experience="range",
    golf_partner_intents=["learn_from_experienced"],
)
SIMILAR_24_BROAD = dict(
    golf_handicap_tenths=240,
    golf_handicap_source="estimate",
    golf_experience="regular",
    golf_partner_intents=["similar_level"],
    golf_similarity_tolerance_tenths=100,
)


def test_broad_similarity_tolerance_is_not_consent_to_mentor() -> None:
    assert compat.assess("golf", golf(**LEARNER_30), golf(**SIMILAR_24_BROAD)).excluded
    # Whoever is the viewer.
    assert compat.assess("golf", golf(**SIMILAR_24_BROAD), golf(**LEARNER_30)).excluded


@pytest.mark.parametrize(
    ("consent", "consent_code"),
    [(["welcome_beginners"], "welcomes_beginners"), (["any_level"], "any_level")],
)
def test_explicit_consent_admits_the_learner_with_truthful_reasons(consent, consent_code) -> None:
    mentor = golf(**{**SIMILAR_24_BROAD, "golf_partner_intents": ["similar_level", *consent]})
    learner_view = compat.assess("golf", golf(**LEARNER_30), mentor)
    assert learner_view.tier == compat.TIER_COMPATIBLE
    # The learner wanted to learn, not a similar-level partner: no similar claim.
    assert codes(learner_view.reasons) == {"more_experienced", consent_code, "time_overlap"}
    assert "24.0 vs 30.0" in next(n.text for n in learner_view.reasons if n.code == "more_experienced")
    mentor_view = compat.assess("golf", mentor, golf(**LEARNER_30))
    assert mentor_view.tier == compat.TIER_COMPATIBLE
    assert codes(mentor_view.reasons) == {"learner_fit", "time_overlap"}


def test_consent_without_more_experience_does_not_admit_a_learner() -> None:
    # 28.0 is not at least 5.0 better than 30.0, so there is nothing to learn from.
    near_peer = golf(
        golf_handicap_tenths=280,
        golf_handicap_source="estimate",
        golf_experience="regular",
        golf_partner_intents=["welcome_beginners", "any_level"],
    )
    assert compat.assess("golf", golf(**LEARNER_30), near_peer).excluded
    assert compat.assess("golf", near_peer, golf(**LEARNER_30)).excluded


def test_learning_and_similar_level_are_alternatives_judged_separately() -> None:
    # The learner also accepts similar-level partners within 10.0.
    learner = golf(**{**LEARNER_30, "golf_partner_intents": ["learn_from_experienced", "similar_level"]})
    learner_broad = golf(
        **{
            **LEARNER_30,
            "golf_partner_intents": ["learn_from_experienced", "similar_level"],
            "golf_similarity_tolerance_tenths": 100,
        }
    )
    # Asymmetric limits: the learner's default 5.0 does not cover the 6.0 gap.
    assert compat.assess("golf", learner, golf(**SIMILAR_24_BROAD)).excluded
    # Both limits cover it: admitted as similar level only, with no
    # learning/mentoring reason because the mentor gave no consent.
    similar_only = compat.assess("golf", learner_broad, golf(**SIMILAR_24_BROAD))
    assert similar_only.tier == compat.TIER_COMPATIBLE
    assert "similar_handicap" in codes(similar_only.reasons)
    assert not codes(similar_only.reasons) & {"more_experienced", "learner_fit", "welcomes_beginners", "any_level"}
    reverse = compat.assess("golf", golf(**SIMILAR_24_BROAD), learner_broad)
    assert not codes(reverse.reasons) & {"more_experienced", "learner_fit"}
    # Mentor adds consent: both routes hold and both are explained.
    mentor = golf(**{**SIMILAR_24_BROAD, "golf_partner_intents": ["similar_level", "welcome_beginners"]})
    both = compat.assess("golf", learner_broad, mentor)
    assert {"similar_handicap", "more_experienced", "welcomes_beginners"} <= codes(both.reasons)


def test_one_sided_any_level_never_overrides_the_other_persons_rule() -> None:
    open_mentor = golf(**{**SIMILAR_24_BROAD, "golf_partner_intents": ["any_level"]})
    # A learner is admitted through the learning route (consent + evidence)...
    assert compat.assess("golf", golf(**LEARNER_30), open_mentor).tier == compat.TIER_COMPATIBLE
    # ...but a similar-only golfer whose own limit is exceeded stays excluded.
    strict = golf(
        golf_handicap_tenths=300,
        golf_handicap_source="official_index",
        golf_experience="range",
        golf_partner_intents=["similar_level"],
        golf_similarity_tolerance_tenths=30,
    )
    assert compat.assess("golf", strict, open_mentor).excluded
    assert compat.assess("golf", open_mentor, strict).excluded


def test_learning_evidence_from_bands_and_plus_handicaps_stays_honest() -> None:
    no_handicap_learner = golf(golf_experience="new", golf_partner_intents=["learn_from_experienced"])
    plus_mentor = golf(
        golf_handicap_tenths=-21,
        golf_handicap_source="official_index",
        golf_experience="regular",
        golf_partner_intents=["welcome_beginners"],
    )
    # One numeric handicap only: experience bands decide, never a handicap claim.
    banded = compat.assess("golf", no_handicap_learner, plus_mentor)
    assert banded.tier == compat.TIER_COMPATIBLE
    assert "plays regularly vs new to golf" in next(n.text for n in banded.reasons if n.code == "more_experienced")
    assert "similar_handicap" not in codes(banded.reasons)
    assert "handicap_self_reported" in codes(banded.caveats)
    # Two numeric handicaps: +2.1 vs 30.0 (estimated) is the evidence.
    estimated_learner = golf(**LEARNER_30)
    numeric = compat.assess("golf", estimated_learner, plus_mentor)
    assert "+2.1 vs 30.0" in next(n.text for n in numeric.reasons if n.code == "more_experienced")
    assert "handicap_estimate" not in codes(numeric.caveats)  # the candidate's index is official
    assert "handicap_estimate" in codes(compat.assess("golf", plus_mentor, estimated_learner).caveats)
    # A mentor with no stated handicap and the same band as the learner is no evidence.
    same_band = golf(golf_experience="range", golf_partner_intents=["any_level"])
    assert compat.assess("golf", golf(**LEARNER_30), same_band).excluded


def test_a_learner_and_a_legacy_profile_get_setup_not_a_learning_claim() -> None:
    legacy_expert = golf(
        preferences_version=None,
        golf_partner_intents=None,
        golf_experience=None,
        golf_handicap_source=None,
    )
    result = compat.assess("golf", golf(**LEARNER_30), legacy_expert)
    assert result.tier == compat.TIER_NEEDS_SETUP
    assert result.reasons == []


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
