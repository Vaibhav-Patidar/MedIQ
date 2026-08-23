"""docs/09-testing-strategy.md Section 2 — countdown/window math against the
PROVIDED detect_window()/compute_urgency(), incl. null window_closes_at
handling exercised through predict_sepsis()."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import numpy as np

from app.ml.inference import (compute_urgency, detect_window,
                              predict_sepsis)


def test_window_opens_when_rising_and_above_threshold():
    traj = np.array([60.0, 62.0, 65.0])
    w = detect_window(risk_now=60.0, risk_trajectory=traj, threshold=55)
    assert w["window_open"] is True
    # hours_remaining = number of forecast hours at/above threshold
    assert w["hours_remaining"] == float(np.sum(traj >= 55))


def test_window_closed_when_never_above_threshold():
    traj = np.array([57.3, 58.0, 59.0])  # above 55 but below default 65
    assert detect_window(57.3, traj, 65) == {"window_open": False,
                                             "hours_remaining": None}


def test_window_requires_rising_not_stale_plateau():
    traj = np.array([80.0, 80.0, 79.0])  # old spike plateauing/declining
    w = detect_window(80.0, traj, 55)
    assert w["window_open"] is False


def test_boundary_inclusive_at_threshold():
    traj = np.array([55.0, 56.0])
    assert detect_window(55.0, traj, 55)["window_open"] is True


def test_urgency_margin_based():
    # docs/05-api-spec.md §4 example: 72.5 @ 55 -> margin 17.5 -> HIGH
    assert compute_urgency(True, 72.5, 55) == "HIGH"
    assert compute_urgency(True, 95.0, 65) == "CRITICAL"   # margin 30 (>25)
    assert compute_urgency(True, 70.0, 55) == "MEDIUM"     # margin 15 (not >15)
    assert compute_urgency(False, 95.0, 65) == "LOW"       # closed -> always LOW


class _DummyPredictor:
    """Minimal stand-in exposing the SepsisPredictor interface used by
    provided predict_sepsis() (surrogate mode)."""
    mode = "surrogate"
    surrogate = None

    def __init__(self, median, lower=None, upper=None):
        self.median = np.array(median)
        self.lower = np.array(lower if lower is not None else [m - 5 for m in self.median])
        self.upper = np.array(upper if upper is not None else [m + 5 for m in self.median])

    def predict_trajectory(self, patient_sequence_df, dataset_template):
        return self.median, self.lower, self.upper

    def explain(self, current_vitals, top_k=5):
        return []


def _sequence(hours=2):
    import pandas as pd
    from app.ml.inference import FEATURE_COLS

    data = {"time_idx": list(range(hours))}
    for col in FEATURE_COLS:
        data[col] = [0.0] * hours
    return pd.DataFrame(data)


def test_predict_sepsis_null_window_closes_at_handled_without_throwing():
    result = predict_sepsis(
        patient_id="p1", patient_sequence_df=_sequence(2),
        predictor=_DummyPredictor([40.0, 41.0]), dataset_template=None,
        feature_cols=__import__("app.ml.inference", fromlist=["FEATURE_COLS"]).FEATURE_COLS,
        is_diabetic=False, age=40, previous_risk_score=None,
        now=__import__("pandas").Timestamp("2026-08-21T12:05:00Z"),
    )
    # closed window -> both fields null; frontend hides countdown entirely
    assert result["window_open"] is False
    assert result["window_closes_at"] is None
    assert result["hours_remaining"] is None
    assert result["urgency"] == "LOW"
