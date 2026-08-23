from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.errors import PatientNotFound
from app.db import get_db, get_session_factory
from app.models.orm import Patient, VitalReading
from app.models.schemas import (VitalsPostResponse, VitalsReadingResponse,
                                VitalsRequest)
from app.services.prediction import (broadcast_window_event,
                                     hours_of_history, run_sepsis_prediction)

router = APIRouter(prefix="/api/patients", tags=["vitals"],
                   dependencies=[Depends(get_current_user)])


def _ensure_patient(db: Session, patient_id) -> Patient:
    patient = db.scalar(select(Patient).where(Patient.patient_id == str(patient_id)))
    if patient is None:
        raise PatientNotFound()
    return patient


def _reading_response(reading: VitalReading) -> VitalsReadingResponse:
    return VitalsReadingResponse(
        reading_id=str(reading.reading_id),
        timestamp=reading.timestamp,
        heart_rate=reading.heart_rate,
        bp_systolic=reading.bp_systolic,
        bp_diastolic=reading.bp_diastolic,
        temperature=None if reading.temperature is None else float(reading.temperature),
        respiratory_rate=reading.respiratory_rate,
        spo2=None if reading.spo2 is None else float(reading.spo2),
        wbc=None if reading.wbc is None else float(reading.wbc),
        lactate=None if reading.lactate is None else float(reading.lactate),
        creatinine=None if reading.creatinine is None else float(reading.creatinine),
        urine_output=None if reading.urine_output is None else float(reading.urine_output),
    )


def _background_prediction(patient_id: str) -> None:
    """ADR-003: synchronous inference in a FastAPI background task — no broker.
    Uses its OWN session: background tasks run after request-scoped sessions close."""
    import logging

    logger = logging.getLogger("mediq.vitals")
    from app.services.prediction import InsufficientDataError

    session_factory = get_session_factory()
    db = session_factory()
    try:
        run_sepsis_prediction(db, patient_id)
        db.commit()
    except InsufficientDataError:
        db.rollback()
    except Exception:
        # never break the client response over a background failure;
        # full traceback lands in stdout logs (docs/11-observability-spec.md §1)
        logger.exception("background sepsis inference failed for patient=%s", patient_id)
        db.rollback()
    finally:
        db.close()


@router.post("/{patient_id}/vitals", response_model=VitalsPostResponse, status_code=201)
def post_vitals(patient_id, body: VitalsRequest,
                background_tasks: BackgroundTasks,
                db: Session = Depends(get_db)):
    """Pydantic enforces clinical-range sanity bounds (422 otherwise) per
    docs/08-security-spec.md Section 3 before data reaches storage or model."""
    patient = _ensure_patient(db, patient_id)

    reading = VitalReading(
        patient_id=patient.patient_id,
        timestamp=body.timestamp,
        heart_rate=body.heart_rate,
        bp_systolic=body.bp_systolic,
        bp_diastolic=body.bp_diastolic,
        temperature=body.temperature,
        respiratory_rate=body.respiratory_rate,
        spo2=body.spo2,
        wbc=body.wbc,
        lactate=body.lactate,
        creatinine=body.creatinine,
        urine_output=body.urine_output,
    )
    db.add(reading)
    db.flush()

    # Mirror to ontology graph (best-effort, Neo4j only when enabled).
    from app.core.config import get_settings as _gs
    if _gs().use_neo4j:
        from app.ontology import cypher
        from app.models.schemas import iso_z
        from app.ontology.neo4j_client import client as neo4j
        neo4j.run(cypher.MERGE_VITAL_READING, {
            "patient_id": str(patient.patient_id),
            "reading_id": str(reading.reading_id),
            "timestamp": iso_z(reading.timestamp),
            "heart_rate": reading.heart_rate,
            "bp_systolic": reading.bp_systolic,
            "bp_diastolic": reading.bp_diastolic,
            "temperature": None if reading.temperature is None else float(reading.temperature),
            "respiratory_rate": reading.respiratory_rate,
            "spo2": None if reading.spo2 is None else float(reading.spo2),
            "wbc": None if reading.wbc is None else float(reading.wbc),
            "lactate": None if reading.lactate is None else float(reading.lactate),
            "creatinine": None if reading.creatinine is None else float(reading.creatinine),
            "urine_output": None if reading.urine_output is None else float(reading.urine_output),
        })

    span_hours, _ = hours_of_history(db, patient.patient_id)
    prediction_triggered = span_hours >= get_settings().min_inference_hours

    # Real-time vitals push (docs/05-api-spec.md Section 10)
    broadcast_window_event(f"vitals:{patient.patient_id}", {
        "event": "vitals_update",
        "data": _reading_response(reading).model_dump(mode="json"),
    })

    # Commit BEFORE scheduling inference: the background task uses its own
    # session and must not race an uncommitted request transaction.
    db.commit()

    response = VitalsPostResponse(**_reading_response(reading).model_dump(),
                                  prediction_triggered=prediction_triggered)

    if prediction_triggered:
        # Sync inference scheduled as a background task so POST returns fast.
        background_tasks.add_task(_background_prediction, str(patient.patient_id))
    return response


@router.get("/{patient_id}/vitals", response_model=list[VitalsReadingResponse])
def list_vitals(patient_id,
                from_: datetime | None = Query(default=None, alias="from"),
                to: datetime | None = Query(default=None),
                db: Session = Depends(get_db)):
    _ensure_patient(db, patient_id)
    query = select(VitalReading).where(
        VitalReading.patient_id == str(patient_id)).order_by(VitalReading.timestamp.asc())
    readings = db.scalars(query).all()
    out = []
    for r in readings:
        ts = r.timestamp if r.timestamp.tzinfo else r.timestamp.replace(tzinfo=timezone.utc)
        if from_ is not None and ts < from_:
            continue
        if to is not None and ts > to:
            continue
        out.append(_reading_response(r))
    return out


@router.get("/{patient_id}/vitals/latest", response_model=list[VitalsReadingResponse])
def latest_vitals(patient_id, db: Session = Depends(get_db)):
    """Last 12 hours of readings, ascending by timestamp."""
    _ensure_patient(db, patient_id)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=12)
    readings = db.scalars(
        select(VitalReading).where(VitalReading.patient_id == str(patient_id))
        .order_by(VitalReading.timestamp.asc())
    ).all()
    return [_reading_response(r) for r in readings
            if (r.timestamp if r.timestamp.tzinfo else r.timestamp.replace(tzinfo=timezone.utc)) >= cutoff]
