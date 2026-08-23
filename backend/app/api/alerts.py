from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.errors import ResourceNotFound
from app.db import get_db
from app.models.orm import InterventionWindow, Patient
from app.models.schemas import (AcknowledgeResponse, ActiveAlertItem)
from app.services.prediction import active_alert_item

router = APIRouter(tags=["alerts"], dependencies=[Depends(get_current_user)])

URGENCY_ORDER = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}


def _active_windows(db: Session) -> list[tuple[InterventionWindow, Patient]]:
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    windows = db.scalars(select(InterventionWindow)).all()
    active = []
    for w in windows:
        if w.acknowledged_at is not None:
            continue
        if w.closes_at is None:
            continue
        closes = w.closes_at if w.closes_at.tzinfo else w.closes_at.replace(tzinfo=timezone.utc)
        if closes > now:
            active.append(w)
    # Sort: urgency desc, then hours_remaining asc (docs/05-api-spec.md §6)
    active.sort(key=lambda w: (
        URGENCY_ORDER.get(w.urgency, 9),
        (w.closes_at.replace(tzinfo=timezone.utc) - now).total_seconds()
        if w.closes_at.tzinfo else (w.closes_at - datetime.now()).total_seconds(),
    ))
    patients = {str(p.patient_id): p for p in db.scalars(select(Patient))}
    return [(w, patients.get(str(w.patient_id))) for w in active]


@router.get("/api/alerts/active", response_model=list[ActiveAlertItem])
def active_alerts(db: Session = Depends(get_db)):
    """Hospital-wide open intervention windows, sorted urgency desc then time left."""
    return [ActiveAlertItem(**active_alert_item(db, w, p)) for w, p in _active_windows(db)]


@router.get("/api/patients/{patient_id}/windows", response_model=list[ActiveAlertItem])
def patient_windows(patient_id, db: Session = Depends(get_db)):
    """All windows for one patient — history included (acknowledged/closed too)."""
    windows = db.scalars(
        select(InterventionWindow).where(InterventionWindow.patient_id == str(patient_id))
        .order_by(InterventionWindow.opens_at.desc())
    ).all()
    patient = db.scalar(select(Patient).where(Patient.patient_id == str(patient_id)))
    items = []
    for w in windows:
        item = active_alert_item(db, w, patient)
        if w.acknowledged_at is not None or w.closes_at is None:
            item["hours_remaining"] = 0.0 if item["hours_remaining"] is None else item["hours_remaining"]
        items.append(ActiveAlertItem(**item))
    return items


@router.post("/api/windows/{window_id}/acknowledge", response_model=AcknowledgeResponse)
def acknowledge_window(window_id, current=Depends(get_current_user),
                       db: Session = Depends(get_db)):
    from datetime import datetime, timezone

    from sqlalchemy.orm.exc import NoResultFound  # noqa: F401  (portability note)

    window = db.scalar(select(InterventionWindow).where(
        InterventionWindow.window_id == str(window_id)))
    if window is None:
        raise ResourceNotFound("Intervention window does not exist.")
    acknowledged_at = datetime.now(timezone.utc)
    window.acknowledged_at = acknowledged_at
    # users.clinician_id links logins to clinicians; fall back to the user id.
    who = str(window.patient_id and (current.clinician_id or current.user_id))
    window.acknowledged_by = current.clinician_id or current.user_id
    db.flush()
    return AcknowledgeResponse(
        window_id=str(window.window_id),
        acknowledged_at=acknowledged_at.isoformat().replace("+00:00", "Z"),
        acknowledged_by=str(current.clinician_id or current.user_id),
    )
