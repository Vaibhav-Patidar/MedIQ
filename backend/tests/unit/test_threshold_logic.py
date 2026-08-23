"""docs/09-testing-strategy.md Section 2 — threshold adjustment logic against
the PROVIDED get_threshold(is_diabetic, age).
The comorbidity-adjusted threshold is the single highest-value test target
(the entire ontology thesis of the pitch)."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.ml.inference import (DEFAULT_THRESHOLD, DIABETIC_REASON,
                              ELDERLY_REASON, get_threshold)


def test_diabetic_threshold_is_55():
    assert get_threshold(is_diabetic=True, age=50) == (55, DIABETIC_REASON)
    assert DIABETIC_REASON == "diabetic_lactate_sensitivity"


def test_elderly_threshold_is_60():
    assert get_threshold(is_diabetic=False, age=72) == (60, ELDERLY_REASON)
    assert ELDERLY_REASON == "elderly_reduced_reserve"


def test_both_diabetic_and_elderly_lowest_wins():
    threshold, reason = get_threshold(is_diabetic=True, age=80)
    assert threshold == 55
    assert reason == DIABETIC_REASON


def test_elderly_boundary_strictly_over_65():
    assert get_threshold(False, 65)[0] == DEFAULT_THRESHOLD   # not elderly yet
    assert get_threshold(False, 66)[0] == 60


def test_default_patient_threshold_is_65_with_none_reason():
    # provided get_threshold() returns None as the adjustment reason by default
    assert get_threshold(is_diabetic=False, age=40) == (65, None)


def test_diabetes_wired_from_comorbidities_table_shape():
    """The route derives is_diabetic = EXISTS(condition_name='Diabetes') from
    patient_comorbidities — simulate both outcomes of that lookup."""
    def exists_lookup(condition_name: str | None) -> bool:
        return (condition_name or "").strip().lower() == "diabetes"

    diabetic_row, clean_row = "Diabetes", "Hypertension"
    assert get_threshold(exists_lookup(diabetic_row), 40)[0] == 55
    assert get_threshold(exists_lookup(clean_row), 40)[0] == 65
