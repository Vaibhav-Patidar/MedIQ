from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.errors import ResourceNotFound
from app.db import get_db
from app.models.orm import Clinician
from app.models.schemas import AvailabilityUpdateRequest, ClinicianResponse

router = APIRouter(prefix="/api/clinicians", tags=["clinicians"],
                   dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[ClinicianResponse])
def list_clinicians(db: Session = Depends(get_db)):
    clinicians = db.scalars(select(Clinician).order_by(Clinician.name)).all()
    return [ClinicianResponse(
        clinician_id=str(c.clinician_id),
        name=c.name,
        specialization=c.specialization,
        is_available=bool(c.is_available),
        current_patient_count=int(c.current_patient_count or 0),
    ) for c in clinicians]


@router.put("/{clinician_id}/availability", response_model=ClinicianResponse)
def update_availability(clinician_id, body: AvailabilityUpdateRequest,
                        db: Session = Depends(get_db)):
    """Flipping a clinician unavailable is what triggers live alert escalation
    (docs/09-testing-strategy.md Section 3 'Window open → alert routing')."""
    clinician = db.scalar(select(Clinician).where(
        Clinician.clinician_id == str(clinician_id)))
    if clinician is None:
        raise ResourceNotFound("Clinician does not exist.")
    clinician.is_available = body.is_available
    db.flush()
    return ClinicianResponse(
        clinician_id=str(clinician.clinician_id),
        name=clinician.name,
        specialization=clinician.specialization,
        is_available=bool(clinician.is_available),
        current_patient_count=int(clinician.current_patient_count or 0),
    )
