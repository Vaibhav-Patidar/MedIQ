"""
MedIQ Sepsis — FastAPI Route
Drop into the backend's routes module. Shows the exact wiring for
GET /api/patients/{id}/predictions/sepsis per 05-api-spec.md Section 4,
including the 409 insufficient_data contract from Section 11.

This is intentionally thin — patient/vitals lookup is stubbed as
TODOs pointing at 06-database-spec.md tables; swap in real
SQLAlchemy/Neo4j calls once the backend teammate has those wired up.
"""
from fastapi import APIRouter, HTTPException
import pandas as pd

from inference import SepsisPredictor, predict_sepsis, InsufficientDataError

router = APIRouter(prefix="/api/patients", tags=["predictions"])

# Loaded once at startup — see sepsis_tft_training.ipynb Section 6 for how
# these artifacts are produced.
predictor: SepsisPredictor | None = None
dataset_template = None
feature_cols: list[str] = []


@router.get("/{patient_id}/predictions/sepsis")
def get_sepsis_prediction(patient_id: str):
    # TODO: replace with real lookups —
    #   patient row: 06-database-spec.md `patients` table (age, etc.)
    #   comorbidity: 06-database-spec.md `patient_comorbidities` table
    #     (is_diabetic = EXISTS(... condition_name = 'Diabetes'))
    #   vitals: 06-database-spec.md `vital_readings`, last 24h,
    #     converted into the same schema preprocessing.py produces
    #     (time_idx, feature_cols, forward-filled/imputed)
    #   previous_risk_score: most recent `progression_states.risk_score`
    #     for this patient, if one exists
    patient_row = _load_patient(patient_id)           # TODO
    vitals_df = _load_patient_vitals_as_df(patient_id)  # TODO
    previous_risk_score = _load_previous_risk_score(patient_id)  # TODO

    try:
        result = predict_sepsis(
            patient_id=patient_id,
            patient_sequence_df=vitals_df,
            predictor=predictor,
            dataset_template=dataset_template,
            feature_cols=feature_cols,
            is_diabetic=patient_row["is_diabetic"],
            age=patient_row["age"],
            previous_risk_score=previous_risk_score,
        )
    except InsufficientDataError as e:
        # Exact 409 shape from 05-api-spec.md Section 11
        raise HTTPException(
            status_code=409,
            detail={
                "error": "insufficient_data",
                "message": f"{e.hours_available}h of vitals available, {e.hours_required}h required.",
                "details": {
                    "hours_available": e.hours_available,
                    "hours_required": e.hours_required,
                },
            },
        )

    # TODO: write result to `progression_states` (06-database-spec.md) so
    # predictions/history and the next call's previous_risk_score work.
    # TODO: if result["window_open"], create an `intervention_windows` row
    # and push the WS /ws/alerts `window_opened` event (05-api-spec.md Section 10).

    return result


# --- stubs: replace with real DB access ---
def _load_patient(patient_id: str) -> dict:
    raise NotImplementedError("Wire to `patients` + `patient_comorbidities` tables")

def _load_patient_vitals_as_df(patient_id: str) -> pd.DataFrame:
    raise NotImplementedError("Wire to `vital_readings` table, shaped like preprocessing.py output")

def _load_previous_risk_score(patient_id: str) -> float | None:
    raise NotImplementedError("Wire to latest `progression_states.risk_score` for this patient")
