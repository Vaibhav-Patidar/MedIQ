"""
MedIQ Sepsis — FastAPI Route
Drop into the backend's routes module. Shows the exact wiring for
GET /api/patients/{id}/predictions/sepsis per 05-api-spec.md Section 4,
including the 409 insufficient_data contract from Section 11.

This is intentionally thin. INTEGRATION NOTE (Team ByteSlay): this is the
provided skeleton with its TODOs now implemented —
  * _load_patient        -> `patients` + `patient_comorbidities` tables
                            (is_diabetic = EXISTS(condition_name='Diabetes'))
  * _load_patient_vitals_as_df -> `vital_readings` last 24h converted into the
                            preprocessing schema (time_idx + FEATURE_COLS,
                            forward-filled/imputed) via inference.py glue
  * _load_previous_risk_score -> latest `progression_states.risk_score`
and the two post-prediction TODOs (progression_states write +
intervention_windows row + WS push) delegated to services.prediction.
"""
from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_user
from app.db import get_db
from app.ml import inference
from app.ml.inference import SepsisPredictor, predict_sepsis, InsufficientDataError
from sqlalchemy.orm import Session

from app.services.prediction import (get_dataset_template,
                                     get_patient_ml_context,
                                     get_predictor,
                                     load_preprocessed_sequence,
                                     persist_sepsis_result,
                                     previous_risk_score,
                                     stabilize_result_with_open_window)

router = APIRouter(prefix="/api/patients", tags=["predictions"],
                   dependencies=[Depends(get_current_user)])

# Loaded once at startup — see sepsis_tft_training.ipynb Section 6 for how
# these artifacts are produced.
predictor: SepsisPredictor | None = None
dataset_template = None
feature_cols: list[str] = list(inference.FEATURE_COLS)


_UNSET = object()


def init_predictor(checkpoint_path: str | None | object = _UNSET,
                   surrogate_horizon: int = 6) -> None:
    """Called from app startup; constructs the predictor (TFT when a checkpoint
    exists, otherwise the deterministic surrogate — never crashes startup).
    With no explicit override this reuses services.prediction's shared
    singleton so the whole app runs on ONE predictor instance."""
    global predictor, dataset_template
    if checkpoint_path is _UNSET:
        from app.services.prediction import get_dataset_template, get_predictor
        predictor = get_predictor()
        dataset_template = get_dataset_template()
        return
    predictor = SepsisPredictor(
        checkpoint_path if checkpoint_path else None,
        surrogate_horizon=surrogate_horizon,
    )
    dataset_template = None  # produced by training; only needed by the TFT branch


@router.get("/{patient_id}/predictions/sepsis")
def get_sepsis_prediction(patient_id: str, db: Session = Depends(get_db)):
    init_predictor()  # idempotent — no-op after first call

    patient_row = _load_patient(db, patient_id)
    vitals_df = _load_patient_vitals_as_df(db, patient_id)
    previous_risk_score_ = _load_previous_risk_score(db, patient_id)

    try:
        result = predict_sepsis(
            patient_id=str(patient_id),
            patient_sequence_df=vitals_df,
            predictor=predictor,
            dataset_template=dataset_template,
            feature_cols=feature_cols,
            is_diabetic=patient_row["is_diabetic"],
            age=patient_row["age"],
            previous_risk_score=previous_risk_score_,
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

    # Countdown consistency: if an open window already exists for this patient,
    # keep ITS closes_at so refreshing never extends a running countdown.
    stabilize_result_with_open_window(db, str(patient_id), result)

    # Skeleton TODOs -> real: write progression_states row; if window_open,
    # create/refresh intervention_windows row + route clinician + WS event.
    persist_sepsis_result(db, str(patient_id), result)
    db.commit()

    return result


# --- DB access (was: stubs) --------------------------------------------------

def _load_patient(db: Session, patient_id: str) -> dict:
    """`patients` row + diabetic flag from `patient_comorbidities`."""
    patient = get_patient_ml_context(db, patient_id)
    return {"age": patient["age"], "is_diabetic": patient["is_diabetic"]}


def _load_patient_vitals_as_df(db: Session, patient_id: str):
    """Last 24h of `vital_readings`, shaped like preprocessing output
    (integer hourly time_idx + FEATURE_COLS, imputed)."""
    return load_preprocessed_sequence(db, patient_id, window_hours=24)


def _load_previous_risk_score(db: Session, patient_id: str) -> float | None:
    """Latest `progression_states.risk_score` for this patient, if any."""
    return previous_risk_score(db, patient_id)
