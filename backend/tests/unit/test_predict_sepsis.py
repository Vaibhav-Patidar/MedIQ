"""Unit tests for the PROVIDED predict_sepsis() orchestration: insufficient-data
raise, exact §4 key set, risk_score_change semantics, window field population."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import pandas as pd
import numpy as np
import pytest

from app.ml.inference import (FEATURE_COLS, InsufficientDataError,
                              predict_sepsis)

NOW = pd.Timestamp("2026-08-21T12:05:00Z")


class DummyPredictor:
    mode = "surrogate"
    surrogate = None

    def __init__(self, median):
        self.median = np.array(median, dtype=float)

    def predict_trajectory(self, patient_sequence_df, dataset_template):
        # real predict_trajectory returns numpy arrays (quantiles.numpy())
        return (self.median,
                np.maximum(0.0, self.median - 5),
                np.minimum(100.0, self.median + 5))

    def explain(self, current_vitals, top_k=5):
        return [{
            "feature": "Lactate", "value": 4.2, "threshold": 2.0,
            "impact": "+28 points", "direction": "increase",
        }]


def _sequence(hours=2, lactate=4.2, hr=118):
    data = {"time_idx": list(range(hours))}
    for col in FEATURE_COLS:
        data[col] = [0.0] * hours
    data["Lactate"] = [lactate] * hours
    data["HR"] = [hr] * hours
    return pd.DataFrame(data)


def test_under_two_hours_raises_insufficient_data():
    with pytest.raises(InsufficientDataError) as exc:
        predict_sepsis("p1", _sequence(hours=1), DummyPredictor([50]), None,
                       FEATURE_COLS, is_diabetic=False, age=40)
    assert exc.value.hours_available == 1
    assert exc.value.hours_required == 2


def test_exact_response_key_set():
    result = predict_sepsis("p1", _sequence(2), DummyPredictor([72.5] * 6), None,
                            FEATURE_COLS, is_diabetic=True, age=67,
                            previous_risk_score=69.3, now=NOW)
    assert set(result.keys()) == {
        "risk_score", "risk_score_change", "trajectory",
        "trajectory_confidence_band", "window_open", "window_closes_at",
        "hours_remaining", "urgency", "threshold_used",
        "threshold_adjustment_reason", "shap_explanation", "generated_at",
    }
    assert result["trajectory_confidence_band"].keys() == {"lower", "upper"}


def test_diabetic_uses_lower_threshold_and_opens_window():
    # rising trajectory (provided detect_window requires not-a-stale-plateau)
    result = predict_sepsis("p1", _sequence(2),
                            DummyPredictor([57.3, 58.5, 60.0, 61.5, 63.0, 64.5]),
                            None, FEATURE_COLS, is_diabetic=True, age=58,
                            now=NOW)
    assert result["threshold_used"] == 55
    assert result["threshold_adjustment_reason"] == "diabetic_lactate_sensitivity"
    assert result["window_open"] is True
    assert result["window_closes_at"] is not None
    # closes_at = now + hours_remaining (forecast hours above threshold)
    closes = pd.Timestamp(result["window_closes_at"])
    assert closes > NOW


def test_non_diabetic_same_score_stays_closed_with_null_fields():
    result = predict_sepsis("p1", _sequence(2), DummyPredictor([57.3] * 6),
                            None, FEATURE_COLS, is_diabetic=False, age=58,
                            now=NOW)
    assert result["threshold_used"] == 65
    assert result["threshold_adjustment_reason"] is None  # provided default
    assert result["window_open"] is False
    assert result["window_closes_at"] is None
    assert result["hours_remaining"] is None


def test_risk_score_change_none_on_first_then_signed_string():
    first = predict_sepsis("p1", _sequence(2), DummyPredictor([70] * 6), None,
                           FEATURE_COLS, False, 40, previous_risk_score=None,
                           now=NOW)
    assert first["risk_score_change"] is None  # no previous snapshot yet

    second = predict_sepsis("p1", _sequence(2), DummyPredictor([70] * 6), None,
                            FEATURE_COLS, False, 40, previous_risk_score=66.8,
                            now=NOW)
    assert second["risk_score_change"] == "+3.2"


def test_critical_margin_mapping():
    result = predict_sepsis("p1", _sequence(2), DummyPredictor([95.0, 96.0, 97.0, 98.0, 99.0, 99.0]),
                            None, FEATURE_COLS, False, 40, now=NOW)
    assert result["window_open"] is True
    assert result["urgency"] == "CRITICAL"   # margin 95-60=35 (>25)
