"""Sepsis prediction pipeline (ADR-003: synchronous inference, no broker).

Shared by:
  * POST /api/patients/{id}/vitals — when >= MIN_INFERENCE_HOURS of readings
    now exist, scheduled as a FastAPI BackgroundTask so the POST returns fast.
  * GET  /api/patients/{id}/predictions/sepsis — implemented inside
    app/ml/sepsis_route.py (the provided skeleton), which reuses the helpers
    here for context loading, persistence and WebSocket push.

All inference goes through the PROVIDED app/ml/inference.py::predict_sepsis.
This module owns: ML-context loading from Postgres (age / is_diabetic /
previous risk), the preprocessing-shaped sequence frame, snapshot persistence
(append-only progression_states), intervention-window lifecycle + clinician
routing + WebSocket events."""
import logging
from datetime import datetime, timedelta, timezone

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.websocket import manager
from app.ml import inference
from app.ml.inference import SepsisPredictor
from app.models.orm import (InterventionWindow, Patient, PatientComorbidity,
                            ProgressionState, VitalReading)
from app.ontology import cypher
from app.ontology.neo4j_client import client as neo4j
from app.services import alert_routing

logger = logging.getLogger("mediq.prediction")

_predictor: SepsisPredictor | None = None
_dataset_template = None


def get_predictor() -> SepsisPredictor:
    global _predictor
    if _predictor is None:
        settings = get_settings()
        _predictor = SepsisPredictor(
            checkpoint_path=settings.sepsis_checkpoint_path or None,
            surrogate_horizon=settings.trajectory_hours,
        )
    return _predictor


def get_dataset_template():
    """The TimeSeriesDataSet used at TFT training time. Produced by the
    training notebook; absent in the surrogate demo mode (predict_trajectory's
    surrogate branch ignores it)."""
    return _dataset_template


class InsufficientDataError(inference.InsufficientDataError):
    """Re-exported so callers can catch the provided error class via services."""


def ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


_ensure_utc = ensure_utc


def parse_result_ts(value) -> datetime | None:
    """Parse the ISO strings predict_sepsis() returns into aware datetimes."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return ensure_utc(value)
    try:
        return pd.Timestamp(value).to_pydatetime().astimezone(timezone.utc) \
            if pd.Timestamp(value).tzinfo is not None else \
            pd.Timestamp(value).tz_localize("UTC").to_pydatetime()
    except Exception as exc:
        logger.warning("could not parse prediction timestamp %r: %s", value, exc)
        return None


# --- ML context from Postgres ------------------------------------------------


def get_patient_ml_context(db: Session, patient_id) -> dict:
    """Age + diabetic flag for the provided get_threshold(is_diabetic, age).
    Threshold logic always reads Postgres patient_comorbidities regardless of
    ONTOLOGY_BACKEND — inference.py::get_threshold contract."""
    patient = db.scalar(select(Patient).where(Patient.patient_id == str(patient_id)))
    if patient is None:
        raise LookupError("patient_not_found")
    comorbidity_names = [c.condition_name for c in db.scalars(
        select(PatientComorbidity).where(PatientComorbidity.patient_id == patient.patient_id)
    ).all()]
    return {
        "name": patient.name,
        "age": float(patient.age),
        "is_diabetic": any(name.strip().lower() == "diabetes" for name in comorbidity_names),
    }


def load_preprocessed_sequence(db: Session, patient_id, window_hours: float = 24.0) -> pd.DataFrame:
    """Last `window_hours` of vital_readings -> the preprocessing-shaped frame
    (integer hourly time_idx + PhysioNet feature columns, imputed)."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=window_hours)
    rows = db.scalars(
        select(VitalReading)
        .where(VitalReading.patient_id == str(patient_id))
        .order_by(VitalReading.timestamp.asc())
    ).all()
    records = []
    for r in rows:
        ts = ensure_utc(r.timestamp)
        if ts < cutoff:
            continue
        records.append({
            "timestamp": r.timestamp,
            "heart_rate": r.heart_rate,
            "spo2": None if r.spo2 is None else float(r.spo2),
            "temperature": None if r.temperature is None else float(r.temperature),
            "bp_systolic": r.bp_systolic,
            "bp_diastolic": r.bp_diastolic,
            "respiratory_rate": r.respiratory_rate,
            "lactate": None if r.lactate is None else float(r.lactate),
            "wbc": None if r.wbc is None else float(r.wbc),
            "creatinine": None if r.creatinine is None else float(r.creatinine),
            "urine_output": None if r.urine_output is None else float(r.urine_output),
        })
    return inference.preprocess_readings_to_sequence(records)


def previous_risk_score(db: Session, patient_id) -> float | None:
    latest = latest_progression_state(db, patient_id)
    if latest is not None and latest.risk_score is not None:
        return float(latest.risk_score)
    return None


def latest_progression_state(db: Session, patient_id) -> ProgressionState | None:
    states = db.scalars(
        select(ProgressionState).where(ProgressionState.patient_id == str(patient_id))
        .order_by(ProgressionState.timestamp.desc())
    ).all()
    return states[0] if states else None


def hours_of_history(db: Session, patient_id) -> tuple[float, datetime | None]:
    rows = db.scalars(
        select(VitalReading).where(VitalReading.patient_id == str(patient_id))
        .order_by(VitalReading.timestamp.asc())
    ).all()
    if not rows:
        return 0.0, None
    first, last = ensure_utc(rows[0].timestamp), ensure_utc(rows[-1].timestamp)
    return (last - first).total_seconds() / 3600.0, last


# --- window countdown stabilization -------------------------------------------


def open_unacknowledged_window(db: Session, patient_id) -> InterventionWindow | None:
    now = datetime.now(timezone.utc)
    windows = db.scalars(
        select(InterventionWindow).where(
            InterventionWindow.patient_id == str(patient_id),
            InterventionWindow.acknowledged_at.is_(None),
        )
    ).all()
    for w in windows:
        if w.closes_at is None:
            continue
        closes = ensure_utc(w.closes_at)
        if closes > now:
            return w
    return None


def stabilize_result_with_open_window(db: Session, patient_id, result: dict) -> dict:
    """Keep an already-running countdown stable across refreshes: when a fresh
    prediction says the window is still open and an unacknowledged window row
    exists, reuse ITS closes_at/hours_remaining instead of extending them."""
    if not result.get("window_open"):
        return result
    existing = open_unacknowledged_window(db, patient_id)
    if existing is None or existing.closes_at is None:
        return result
    closes = ensure_utc(existing.closes_at)
    remaining = max(0.0, round((closes - datetime.now(timezone.utc)).total_seconds() / 3600.0, 2))
    result["window_closes_at"] = closes.isoformat().replace("+00:00", "Z")
    result["hours_remaining"] = remaining
    return result


# --- persistence + action layer ------------------------------------------------


def persist_sepsis_result(db: Session, patient_id, result: dict) -> InterventionWindow | None:
    """Skeleton TODOs made real: append progression_states snapshot; create or
    refresh an intervention_windows row when the window is open (with alert
    routing + Neo4j mirror + WS push); close stale windows when closed."""
    settings = get_settings()
    patient = db.scalar(select(Patient).where(Patient.patient_id == str(patient_id)))
    generated_at = parse_result_ts(result.get("generated_at")) or datetime.now(timezone.utc)
    closes_at = parse_result_ts(result.get("window_closes_at"))

    state = ProgressionState(
        patient_id=patient.patient_id,
        disease_name="Sepsis",
        timestamp=generated_at,
        risk_score=result["risk_score"],
        stage="sepsis_watch",
        confidence=0.850,
        trajectory={"trajectory": result["trajectory"],
                    "band_lower": result["trajectory_confidence_band"]["lower"],
                    "band_upper": result["trajectory_confidence_band"]["upper"]},
        shap_values=result["shap_explanation"],
        threshold_used=result["threshold_used"],
        window_open=result["window_open"],
        window_closes_at=closes_at,
    )
    db.add(state)
    db.flush()

    if settings.use_neo4j:
        neo4j.run(cypher.MERGE_PROGRESSION_STATE, {
            "patient_id": str(patient.patient_id),
            "state_id": str(state.state_id),
            "risk_score": result["risk_score"],
            "window_open": bool(result["window_open"]),
            "window_closes_at": result.get("window_closes_at"),
            "timestamp": generated_at.isoformat(),
        })

    window = None
    if result["window_open"]:
        urgency = result["urgency"]
        recommended = alert_routing.recommended_action_for(urgency)
        window = open_unacknowledged_window(db, patient.patient_id)
        escalated_event = False
        if window is not None:
            # same clinical episode — refresh urgency/action/closes_at only
            window.progression_state_id = state.state_id
            window.urgency = urgency
            window.closes_at = closes_at or window.closes_at
            window.recommended_action = recommended
        else:
            window = InterventionWindow(
                patient_id=patient.patient_id,
                progression_state_id=state.state_id,
                urgency=urgency,
                opens_at=generated_at,
                closes_at=closes_at,
                recommended_action=recommended,
            )
            db.add(window)
            db.flush()
            clinician, escalated = alert_routing.route_window_alert(db, patient, urgency)
            escalated_event = escalated and clinician is not None
            if settings.use_neo4j:
                neo4j.run(cypher.MERGE_WINDOW_AND_LINK, {
                    "state_id": str(state.state_id),
                    "window_id": str(window.window_id),
                    "urgency": urgency,
                    "opens_at": generated_at.isoformat(),
                    "closes_at": result.get("window_closes_at"),
                    "recommended_action": recommended,
                })
                if clinician is not None:
                    neo4j.run(cypher.ASSIGN_WINDOW_TO_CLINICIAN, {
                        "window_id": str(window.window_id),
                        "clinician_id": str(clinician.clinician_id),
                    })
            broadcast_window_event("alerts", {
                "event": "escalated" if escalated_event else "window_opened",
                "data": active_alert_item(db, window, patient),
            })
        # (refresh path: same clinical episode — no duplicate WS event)
    else:
        _close_stale_windows(db, patient)

    return window


def _close_stale_windows(db: Session, patient: Patient) -> None:
    now = datetime.now(timezone.utc)
    windows = db.scalars(
        select(InterventionWindow).where(
            InterventionWindow.patient_id == patient.patient_id,
            InterventionWindow.acknowledged_at.is_(None),
        )
    ).all()
    for w in windows:
        if w.closes_at is None:
            continue
        closes = ensure_utc(w.closes_at)
        if closes > now:
            w.closes_at = now
            broadcast_window_event("alerts", {
                "event": "window_closed",
                "data": active_alert_item(db, w, patient),
            })


def broadcast_window_event(channel: str, event: dict) -> None:
    """Loop-aware fire-and-forget push (works from request handlers and sync
    background tasks alike — see ConnectionManager.publish)."""
    manager.publish(channel, event)


def run_sepsis_prediction(db: Session, patient_id, now=None) -> dict:
    """Full pipeline through the PROVIDED predict_sepsis(); persists the
    snapshot/window/routing/WS side effects. Returns the exact §4 payload."""
    settings = get_settings()

    context = get_patient_ml_context(db, patient_id)  # raises LookupError if missing
    df = load_preprocessed_sequence(db, patient_id, window_hours=24.0)
    prev = previous_risk_score(db, patient_id)

    ts_now = pd.Timestamp(now) if now is not None else pd.Timestamp.now(tz="UTC")

    # Raises inference.InsufficientDataError when <2h — callers translate to 409.
    result = inference.predict_sepsis(
        patient_id=str(patient_id),
        patient_sequence_df=df,
        predictor=get_predictor(),
        dataset_template=get_dataset_template(),
        feature_cols=list(inference.FEATURE_COLS),
        is_diabetic=context["is_diabetic"],
        age=context["age"],
        previous_risk_score=prev,
        now=ts_now,
    )

    stabilize_result_with_open_window(db, patient_id, result)
    persist_sepsis_result(db, patient_id, result)
    logger.info(
        "sepsis pipeline done patient=%s risk=%.1f threshold=%d window=%s urgency=%s mode=%s",
        patient_id, result["risk_score"], result["threshold_used"],
        result["window_open"], result["urgency"], get_predictor().mode,
    )
    return result


def active_alert_item(db: Session, window: InterventionWindow, patient: Patient | None = None) -> dict:
    from app.models.schemas import iso_z

    patient = patient or db.scalar(select(Patient).where(Patient.patient_id == window.patient_id))
    closes_at = ensure_utc(window.closes_at) if window.closes_at is not None else None
    remaining = max(0.0, (closes_at - datetime.now(timezone.utc)).total_seconds() / 3600.0) if closes_at else 0.0
    return {
        "window_id": str(window.window_id),
        "patient_id": str(window.patient_id),
        "patient_name": patient.name if patient else "",
        "urgency": window.urgency,
        "hours_remaining": round(remaining, 2),
        "window_closes_at": iso_z(closes_at),
        "recommended_action": window.recommended_action,
    }
