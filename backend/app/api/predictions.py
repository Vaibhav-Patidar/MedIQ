"""Prediction endpoints. The sepsis route itself lives in app/ml/sepsis_route.py
(the provided route skeleton, wired in here); this module adds the Alzheimer's
stub and the history view."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.ml.sepsis_route import router as sepsis_router
from app.models.orm import ProgressionState

router = APIRouter(dependencies=[Depends(get_current_user)])
router.include_router(sepsis_router)

# [HACKATHON STUB] docs/05-api-spec.md Section 4 — Alzheimer's is the stretch
# module (ADR-001); return the fixed mock shape, no real ML built.
_ALZHEIMERS_MOCK = {
    "stage": "Mild AD",
    "months_to_next_stage": 8,
    "atrophy_rate_mm3_per_year": 420,
    "treatment_effectiveness_score": 0.35,
    "heatmap_url": "/static/heatmaps/scan-demo.png",
}


@router.get("/api/patients/{patient_id}/predictions/alzheimers")
def alzheimers_prediction(patient_id):
    from app.models.schemas import iso_z
    return {**_ALZHEIMERS_MOCK, "generated_at": iso_z(datetime.now(timezone.utc))}


@router.get("/api/patients/{patient_id}/predictions/history")
def prediction_history(patient_id, db: Session = Depends(get_db)):
    """Past sepsis snapshots (append-only progression_states log), newest first."""
    from app.services.prediction import _ensure_utc  # local import avoids cycle
    states = db.scalars(
        select(ProgressionState).where(ProgressionState.patient_id == str(patient_id))
        .order_by(ProgressionState.timestamp.desc())
    ).all()
    history = []
    for s in states:
        traj = s.trajectory or {}
        shap = s.shap_values or []
        closes_iso = None
        if s.window_closes_at is not None:
            closes_iso = s.window_closes_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z") \
                if s.window_closes_at.tzinfo else \
                s.window_closes_at.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
        generated_iso = s.timestamp.astimezone(timezone.utc).isoformat().replace("+00:00", "Z") \
            if s.timestamp.tzinfo else \
            s.timestamp.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
        history.append({
            "risk_score": float(s.risk_score) if s.risk_score is not None else 0.0,
            "risk_score_change": "+0.0",
            "trajectory": traj.get("trajectory", []),
            "trajectory_confidence_band": {
                "lower": traj.get("band_lower", []),
                "upper": traj.get("band_upper", []),
            },
            "window_open": bool(s.window_open),
            "window_closes_at": closes_iso,
            "hours_remaining": None,
            "urgency": "LOW",
            "threshold_used": s.threshold_used or 65,
            # provided get_threshold() yields None for the default case
            "threshold_adjustment_reason": None,
            "shap_explanation": shap,
            "generated_at": generated_iso,
        })
    return history
