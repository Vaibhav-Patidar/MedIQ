from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.errors import PatientNotFound, ResourceNotFound
from app.db import get_db
from app.models.orm import (Intervention, InterventionWindow, Patient, User)
from app.models.schemas import (InterventionCreateRequest,
                                InterventionOutcomeRequest,
                                InterventionResponse)
from app.core.config import get_settings
from app.ontology import cypher
from app.ontology.neo4j_client import client as neo4j

router = APIRouter(tags=["interventions"], dependencies=[Depends(get_current_user)])


def _ensure_patient(db: Session, patient_id) -> Patient:
    patient = db.scalar(select(Patient).where(Patient.patient_id == str(patient_id)))
    if patient is None:
        raise PatientNotFound()
    return patient


def _to_response(i: Intervention) -> InterventionResponse:
    return InterventionResponse(
        intervention_id=str(i.intervention_id),
        patient_id=str(i.patient_id),
        clinician_id=str(i.clinician_id) if i.clinician_id else None,
        window_id=str(i.window_id) if i.window_id else None,
        type=i.intervention_type or "",
        description=i.description,  # stored/returned as plain text (no HTML) — XSS-safe by contract
        performed_at=i.performed_at,
        outcome=i.outcome,
        outcome_recorded_at=i.outcome_recorded_at,
    )


@router.post("/api/patients/{patient_id}/interventions",
             response_model=InterventionResponse, status_code=201)
def create_intervention(patient_id, body: InterventionCreateRequest,
                        current: User = Depends(get_current_user),
                        db: Session = Depends(get_db)):
    """Journey A step 7 — 'Intervention logged to patient graph.' Creates the
    Postgres row and (when Neo4j is in use) the Intervention node linked via
    RECEIVED / PERFORMED_BY edges (integration-test target)."""
    patient = _ensure_patient(db, patient_id)
    if body.window_id is not None:
        window = db.scalar(select(InterventionWindow).where(
            InterventionWindow.window_id == str(body.window_id)))
        if window is None:
            raise ResourceNotFound("Intervention window does not exist.")
    intervention = Intervention(
        patient_id=patient.patient_id,
        clinician_id=current.clinician_id,
        window_id=body.window_id,
        intervention_type=body.type,
        description=body.description,
        performed_at=body.performed_at,
    )
    db.add(intervention)
    db.flush()

    if get_settings().use_neo4j:
        neo4j.run(cypher.MERGE_INTERVENTION_AND_LINK, {
            "patient_id": str(patient.patient_id),
            "intervention_id": str(intervention.intervention_id),
            "type": body.type,
            "description": body.description,
            "performed_at": body.performed_at.isoformat(),
            "outcome": None,
            "clinician_id": str(current.clinician_id) if current.clinician_id else None,
        })
    return _to_response(intervention)


@router.put("/api/interventions/{intervention_id}/outcome",
            response_model=InterventionResponse)
def update_outcome(intervention_id, body: InterventionOutcomeRequest,
                   db: Session = Depends(get_db)):
    """Manual outcome field (auto-tracking out of scope per PRD Section 8)."""
    intervention = db.scalar(select(Intervention).where(
        Intervention.intervention_id == str(intervention_id)))
    if intervention is None:
        raise ResourceNotFound("Intervention does not exist.")
    intervention.outcome = body.outcome  # Literal-validated: improved|no_change|deteriorated
    intervention.outcome_recorded_at = datetime.now(timezone.utc)
    db.flush()
    if get_settings().use_neo4j:
        # keep the graph node's outcome in sync for SIMILAR_TO-style queries
        neo4j.run("MATCH (i:Intervention {intervention_id: $id}) SET i.outcome = $outcome",
                  {"id": str(intervention.intervention_id), "outcome": body.outcome})
    return _to_response(intervention)


@router.get("/api/patients/{patient_id}/interventions",
            response_model=list[InterventionResponse])
def list_interventions(patient_id, db: Session = Depends(get_db)):
    _ensure_patient(db, patient_id)
    rows = db.scalars(
        select(Intervention).where(Intervention.patient_id == str(patient_id))
        .order_by(Intervention.performed_at.desc())
    ).all()
    return [_to_response(r) for r in rows]
