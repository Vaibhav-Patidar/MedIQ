"""Unit tests for the trained XGBoost bundle integration
(backend/checkpoints/sepsis_xgboost.pkl + model_config.json)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
import pytest

from app.ml import inference

PKL = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))), "checkpoints", "sepsis_xgboost.pkl")

pytestmark = pytest.mark.skipif(not os.path.exists(PKL),
                                reason="trained bundle not present")


@pytest.fixture(scope="module")
def predictor():
    return inference.SepsisPredictor(checkpoint_path=PKL)


def _sequence(rows):
    records = []
    t0 = datetime.now(timezone.utc)
    for i, vals in enumerate(rows):
        rec = {"timestamp": t0 - timedelta(hours=len(rows) - 1 - i)}
        rec.update(vals)
        records.append(rec)
    return inference.preprocess_readings_to_sequence(records)


BENIGN = dict(heart_rate=88, spo2=98, temperature=36.8, bp_systolic=124,
              bp_diastolic=78, respiratory_rate=16)
STRESSED = dict(heart_rate=132, spo2=91, temperature=39.4, bp_systolic=95,
                bp_diastolic=55, respiratory_rate=30)


def test_loads_in_xgboost_mode(predictor):
    assert predictor.mode == "xgboost"
    assert predictor.model_features[0].endswith("_mean")
    assert set(predictor._feature_cols) == {"HR", "O2Sat", "Temp", "SBP", "MAP", "DBP", "Resp"}


def test_stressed_patient_scores_higher_than_benign(predictor):
    benign = predictor.predict_trajectory(_sequence([BENIGN] * 6), None)[0]
    stressed = predictor.predict_trajectory(_sequence(
        [BENIGN] * 4 + [STRESSED] * 3), None)[0]
    assert len(stressed) == predictor.surrogate_horizon == 6
    assert float(stressed[0]) > float(benign[0])          # model separates
    assert 0.0 <= float(benign[0]) <= 100.0


def test_explain_uses_feature_meta_names_and_directions(predictor):
    seq = _sequence([BENIGN] * 4 + [STRESSED] * 3)
    predictor.predict_trajectory(seq, None)               # primes window stats
    latest = {c: float(seq.iloc[-1][c]) for c in FEATURE_COLS_ALL()}
    entries = predictor.explain(latest, top_k=5)
    assert 1 <= len(entries) <= 5
    known = {"Heart rate", "SpO2", "Temperature", "Systolic BP", "MAP",
             "Diastolic BP", "Respiratory rate"}
    for e in entries:
        assert e["feature"] in known
        assert e["direction"] in {"increase", "normal"}
        assert e["impact"].endswith("points")


def test_trajectory_rising_for_deteriorating_series(predictor):
    median, lower, upper = predictor.predict_trajectory(
        _sequence([BENIGN] * 4 + [STRESSED] * 3), None)
    assert np.all(lower <= median + 1e-6)
    assert np.all(median <= upper + 1e-6)


def FEATURE_COLS_ALL():
    return ["HR", "O2Sat", "Temp", "SBP", "MAP", "DBP", "Resp",
            "Lactate", "WBC", "Creatinine"]
