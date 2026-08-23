"""
MedIQ Sepsis — Inference Module
Import directly into the FastAPI route for:
    GET /api/patients/{id}/predictions/sepsis

predict_sepsis() returns a dict matching 05-api-spec.md Section 4 EXACTLY —
field names, nesting, and types — so the frontend's Risk Trajectory Card and
Intervention Window Timer can consume it with zero reshaping.

On insufficient data (<2h vitals), raises InsufficientDataError — the FastAPI
route should catch this and return the 409 shape from 05-api-spec.md Section 11:
    { "error": "insufficient_data", "hours_available": 1.2, "hours_required": 2 }
per 09-testing-strategy.md Section 3, which explicitly tests for a 409 here,
not a 200 with a flag.
"""
from datetime import timedelta

import numpy as np
import pandas as pd
import shap
from lightgbm import LGBMClassifier
from pytorch_forecasting import TemporalFusionTransformer, TimeSeriesDataSet

# ---- Threshold calibration, per architecture.md Section 10 / 06-database-spec.md ----
DEFAULT_THRESHOLD = 65
DIABETIC_THRESHOLD = 55
DIABETIC_REASON = 'diabetic_lactate_sensitivity'
ELDERLY_THRESHOLD = 60  # age > 65
ELDERLY_REASON = 'elderly_reduced_reserve'
MIN_HOURS_FOR_PREDICTION = 2  # 05-api-spec.md Section 4 / 09-testing-strategy.md Section 3

# feature -> (display name, clinical reference/threshold value) — matches
# 05-api-spec.md shap_explanation shape: {feature, value, threshold, impact, direction}
FEATURE_META = {
    'HR':         ('Heart rate', 100),
    'O2Sat':      ('SpO2', 95),
    'Temp':       ('Temperature', 38.0),
    'SBP':        ('Systolic BP', 110),
    'MAP':        ('MAP', 70),
    'DBP':        ('Diastolic BP', 80),
    'Resp':       ('Respiratory rate', 20),
    'Lactate':    ('Lactate', 2.0),
    'WBC':        ('WBC', 12.0),
    'Creatinine': ('Creatinine', 1.2),
}


class InsufficientDataError(Exception):
    """Raise from the FastAPI route as 409 insufficient_data (05-api-spec.md Section 11)."""
    def __init__(self, hours_available: float, hours_required: float = MIN_HOURS_FOR_PREDICTION):
        self.hours_available = hours_available
        self.hours_required = hours_required
        super().__init__(f'{hours_available}h available, {hours_required}h required')


def get_threshold(is_diabetic: bool, age: float) -> tuple[float, str | None]:
    """Most-conservative-wins rule per 09-testing-strategy.md Section 2:
    'diabetic + elderly -> most conservative (lowest) threshold wins.'
    Returns (threshold, adjustment_reason) where adjustment_reason is the
    machine-readable code used in 06-database-spec.md's
    patient_comorbidities.adjustment_reason / 05-api-spec.md's
    threshold_adjustment_reason — NOT a display label. The frontend maps
    this code to UI copy (e.g. "Threshold adjusted: Diabetic — alert at 55")."""
    candidates = [(DEFAULT_THRESHOLD, None)]
    if is_diabetic:
        candidates.append((DIABETIC_THRESHOLD, DIABETIC_REASON))
    if age > 65:
        candidates.append((ELDERLY_THRESHOLD, ELDERLY_REASON))
    return min(candidates, key=lambda c: c[0])


class SepsisPredictor:
    """Wraps the trained TFT for trajectory prediction, plus a small LightGBM
    surrogate (trained on the same last-observed-vitals -> SepsisLabel mapping)
    used purely for SHAP attribution.

    Why a surrogate instead of SHAP directly on the TFT: SHAP needs many
    forward passes per explanation (KernelExplainer) or a differentiable
    graph (DeepExplainer). Running either against a full 24h-sequence,
    multi-head-attention TFT on every dashboard load is too slow for a live
    clinical UI (09-testing-strategy.md Section 7 targets sub-2s inference).
    A tabular surrogate trained on the same features gives the same
    clinically useful answer — "which vitals are driving this score, and by
    how much" — in milliseconds, using shap.TreeExplainer, which is exact
    and fast for tree models. The TFT still owns the actual risk score and
    trajectory; the surrogate only explains it.
    """
    def __init__(self, checkpoint_path: str):
        self.model = TemporalFusionTransformer.load_from_checkpoint(checkpoint_path)
        self.model.eval()
        self.surrogate = None
        self._explainer = None
        self._feature_cols = None

    def fit_surrogate(self, df: pd.DataFrame, feature_cols: list):
        """Train once (offline, alongside the TFT) on last-observed-vitals-per-patient
        -> ever-had-sepsis. df: the same preprocessed long-format frame used for TFT training."""
        self._feature_cols = feature_cols
        last_obs = df.sort_values('time_idx').groupby('patient_id').last()
        X = last_obs[feature_cols].values
        y = last_obs['SepsisLabel'].astype(int).values
        self.surrogate = LGBMClassifier(
            n_estimators=100, max_depth=4, class_weight='balanced', verbosity=-1
        )
        self.surrogate.fit(X, y)
        self._explainer = shap.TreeExplainer(self.surrogate)
        return self

    def explain(self, current_vitals: dict, top_k: int = 5) -> list:
        """Returns entries matching 05-api-spec.md shap_explanation exactly:
        {feature, value, threshold, impact: "+28 points", direction: "increase"|"normal"}
        """
        if self.surrogate is None:
            raise RuntimeError('Call fit_surrogate() before explain().')
        x = np.array([[current_vitals[c] for c in self._feature_cols]])
        raw_shap = self._explainer.shap_values(x)
        vals = raw_shap[1][0] if isinstance(raw_shap, list) else raw_shap[0]
        vals = np.asarray(vals).flatten()

        contributions = []
        for i, col in enumerate(self._feature_cols):
            display_name, clinical_threshold = FEATURE_META.get(col, (col, None))
            impact_points = float(vals[i]) * 100  # scale to risk-score points
            contributions.append({
                'feature': display_name,
                'value': round(float(current_vitals[col]), 2),
                'threshold': clinical_threshold,
                'impact': f'{impact_points:+.0f} points',
                'direction': 'increase' if impact_points > 0 else 'normal',
                '_abs_impact': abs(impact_points),  # sort key only, stripped below
            })
        contributions.sort(key=lambda c: c['_abs_impact'], reverse=True)
        for c in contributions:
            del c['_abs_impact']
        # 02-UX-flow-spec.md Section 5: fewer than 3 available -> don't pad
        return contributions[:top_k]

    def predict_trajectory(self, patient_sequence_df: pd.DataFrame, dataset_template):
        """patient_sequence_df: a single patient's encoder-length history
        (up to 24h), already imputed, in the schema preprocessing.py produces.
        dataset_template: the TimeSeriesDataSet used at training time (needed
        so pytorch-forecasting applies identical encoding to new patients)."""
        pred_dataset = TimeSeriesDataSet.from_dataset(
            dataset_template, patient_sequence_df, predict=True, stop_randomization=True
        )
        pred_loader = pred_dataset.to_dataloader(train=False, batch_size=1, num_workers=0)
        raw_predictions = self.model.predict(pred_loader, mode='quantiles', return_x=True)
        quantiles = raw_predictions.output[0].numpy()  # (horizon, n_quantiles)
        median_idx = quantiles.shape[-1] // 2
        median_forecast = quantiles[:, median_idx] * 100  # scale 0-1 -> 0-100 risk score
        lower_band = quantiles[:, 0] * 100
        upper_band = quantiles[:, -1] * 100
        return median_forecast, lower_band, upper_band


def detect_window(risk_now: float, risk_trajectory: np.ndarray, threshold: float) -> dict:
    """Window detection: window_open when risk is at/above threshold AND still
    rising (not a stale plateau from an old spike), per architecture.md."""
    above = risk_trajectory >= threshold
    if not above.any():
        return {'window_open': False, 'hours_remaining': None}

    rising = risk_trajectory[1] - risk_trajectory[0] > 0 if len(risk_trajectory) > 1 else True
    window_open = bool(risk_now >= threshold and rising)
    hours_remaining = float(np.sum(above)) if window_open else None
    return {'window_open': window_open, 'hours_remaining': hours_remaining}


def compute_urgency(window_open: bool, risk_now: float, threshold: float) -> str:
    """LOW|MEDIUM|HIGH|CRITICAL per 05-api-spec.md. Simple margin-based
    mapping — reasonable default, tune against real PhysioNet score
    distributions once trained (see README)."""
    if not window_open:
        return 'LOW'
    margin = risk_now - threshold
    if margin > 25:
        return 'CRITICAL'
    if margin > 15:
        return 'HIGH'
    return 'MEDIUM'


def predict_sepsis(patient_id: str, patient_sequence_df: pd.DataFrame,
                    predictor: SepsisPredictor, dataset_template,
                    feature_cols: list, is_diabetic: bool, age: float,
                    previous_risk_score: float | None = None,
                    now: pd.Timestamp | None = None) -> dict:
    """Top-level function the FastAPI route calls directly. Returns the exact
    response shape for GET /api/patients/{id}/predictions/sepsis
    (05-api-spec.md Section 4). Raises InsufficientDataError if <2h of vitals
    — the route should catch this and emit the 409 shape from Section 11.

    previous_risk_score: last known risk_score for this patient, used to
    compute risk_score_change. Pass None on a patient's first prediction.
    now: injectable for tests; defaults to current UTC time.
    """
    now = now or pd.Timestamp.utcnow()
    hours_available = patient_sequence_df['time_idx'].nunique()

    if hours_available < MIN_HOURS_FOR_PREDICTION:
        raise InsufficientDataError(hours_available=hours_available)

    threshold, threshold_reason = get_threshold(is_diabetic, age)

    median_forecast, lower_band, upper_band = predictor.predict_trajectory(
        patient_sequence_df, dataset_template
    )
    risk_now = float(median_forecast[0])

    window = detect_window(risk_now, median_forecast, threshold)
    urgency = compute_urgency(window['window_open'], risk_now, threshold)

    window_closes_at = None
    if window['window_open'] and window['hours_remaining'] is not None:
        window_closes_at = (now + timedelta(hours=window['hours_remaining'])).isoformat()

    risk_score_change = None
    if previous_risk_score is not None:
        delta = risk_now - previous_risk_score
        risk_score_change = f'{delta:+.1f}'

    current_vitals = {c: patient_sequence_df.iloc[-1][c] for c in feature_cols}
    shap_explanation = predictor.explain(current_vitals) if predictor.surrogate is not None else []

    return {
        'risk_score': round(risk_now, 1),
        'risk_score_change': risk_score_change,
        'trajectory': [round(float(v), 1) for v in median_forecast],
        'trajectory_confidence_band': {
            'lower': [round(float(v), 1) for v in lower_band],
            'upper': [round(float(v), 1) for v in upper_band],
        },
        'window_open': window['window_open'],
        'window_closes_at': window_closes_at,
        'hours_remaining': window['hours_remaining'],
        'urgency': urgency,
        'threshold_used': threshold,
        'threshold_adjustment_reason': threshold_reason,
        'shap_explanation': shap_explanation,
        'generated_at': now.isoformat(),
    }
