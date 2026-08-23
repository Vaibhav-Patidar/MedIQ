"""docs/09-testing-strategy.md Section 2 — SHAP formatting via the provided
module's format_shap_entries (extracted verbatim from SepsisPredictor.explain's
loop): top-N (max 5), sorted by absolute impact descending, direction matches
impact sign."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import numpy as np

from app.ml.inference import FEATURE_COLS, format_shap_entries

VITALS = {"HR": 118, "O2Sat": 97, "Temp": 38.9, "SBP": 96, "MAP": 72,
          "DBP": 60, "Resp": 24, "Lactate": 4.2, "WBC": 15.2,
          "Creatinine": 1.6}


def test_top_five_sorted_by_absolute_impact_desc():
    vals = np.array([2.00, -0.30, 0.12, 0.07, -0.18, 0.05, 0.01, -0.02, 0.30, -0.01])
    out = format_shap_entries(vals, VITALS, FEATURE_COLS, top_k=5)
    assert len(out) == 5
    impacts = [abs(float(o["impact"].split()[0].lstrip("+-"))) for o in out]
    assert impacts == sorted(impacts, reverse=True)
    assert out[0]["feature"] == "Heart rate"        # +200 points, largest


def test_direction_matches_sign_of_impact():
    # SpO2 protective negative -> 'normal'; positive drivers -> 'increase'
    vals = np.array([0.28, -0.08] + [0.0] * 8)
    out = format_shap_entries(vals, VITALS, FEATURE_COLS, top_k=5)
    by_name = {o["feature"]: o for o in out}
    assert by_name["Heart rate"]["direction"] == "increase"
    assert by_name["SpO2"]["direction"] == "normal"


def test_impact_string_format_matches_spec_example():
    vals = np.array([0.276, -0.08] + [0.0] * 8)   # *100 -> +28 / -8 points
    out = format_shap_entries(vals, VITALS, FEATURE_COLS, top_k=5)
    by_name = {o["feature"]: o for o in out}
    assert by_name["Heart rate"]["impact"] == "+28 points"
    assert by_name["SpO2"]["impact"] == "-8 points"


def test_entry_shape_and_feature_meta_display_names():
    vals = np.array([0.1, 0.05, 0.04, 0.03, 0.02, 0.01, 0.005, 0.4, -0.02, -0.01])
    out = format_shap_entries(vals, VITALS, FEATURE_COLS, top_k=5)
    for entry in out:
        assert set(entry.keys()) == {"feature", "value", "threshold", "impact", "direction"}
    by_name = {o["feature"]: o for o in out}
    assert by_name["Heart rate"]["threshold"] == 100
    # Lactate has the largest |impact| (0.4 -> +40 points) and survives top-5
    assert by_name["Lactate"]["impact"] == "+40 points"
    assert by_name["Lactate"]["threshold"] == 2.0
    assert by_name["Lactate"]["value"] == 4.2


def test_fewer_than_five_no_padding():
    cols = ["HR", "Lactate"]
    vitals = {"HR": 118, "Lactate": 4.2}
    out = format_shap_entries(np.array([0.1, -0.05]), vitals, cols, top_k=5)
    assert len(out) == 2
