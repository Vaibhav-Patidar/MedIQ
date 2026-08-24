from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.errors import PatientNotFound
from app.db import get_db
from app.models.orm import (Clinician, Medication, Patient, PatientAssignment,
                            PatientComorbidity, PatientDisease,
                            ProgressionState)
from app.models.schemas import (AssignedDoctorOut, AdjustmentOut,
                                ComorbidityOut, ConditionOut,
                                GraphResponse, MedicationOut, GraphNode, GraphEdge,
                                PatientCreateRequest, PatientDetailResponse,
                                PatientListItem)
from app.ontology import cypher
from app.ontology.graph_service import get_patient_graph
from app.ontology.neo4j_client import client as neo4j

router = APIRouter(prefix="/api/patients", tags=["patients"],
                   dependencies=[Depends(get_current_user)])


# --- helpers ---------------------------------------------------------------


def _ensure_patient(db: Session, patient_id) -> Patient:
    patient = db.scalar(select(Patient).where(Patient.patient_id == str(patient_id)))
    if patient is None:
        raise PatientNotFound()
    return patient


def build_patient_detail(db: Session, patient: Patient) -> PatientDetailResponse:
    diseases = db.scalars(select(PatientDisease).where(
        PatientDisease.patient_id == patient.patient_id)).all()
    comorbidities = db.scalars(select(PatientComorbidity).where(
        PatientComorbidity.patient_id == patient.patient_id)).all()
    meds = db.scalars(select(Medication).where(
        Medication.patient_id == patient.patient_id)).all()

    assigned = None
    assignment = db.scalar(select(PatientAssignment).where(
        PatientAssignment.patient_id == patient.patient_id))
    if assignment is not None:
        clinician = db.scalar(select(Clinician).where(
            Clinician.clinician_id == assignment.clinician_id))
        if clinician is not None:
            assigned = AssignedDoctorOut(
                clinician_id=str(clinician.clinician_id),
                name=clinician.name,
                is_available=bool(clinician.is_available),
            )

    return PatientDetailResponse(
        patient_id=str(patient.patient_id),
        name=patient.name,
        age=patient.age,
        sex=patient.sex,
        blood_type=patient.blood_type,
        admission_date=patient.admission_date,
        ward=patient.ward,
        bed_number=patient.bed_number,
        conditions=[ConditionOut(name=d.disease_name, icd_code=d.icd_code, type=d.disease_type)
                    for d in diseases],
        # Comorbidity rows carry their own threshold adjustment — the ontology
        # payoff surfaced to the UI (PRD F4 "Threshold adjusted: Diabetic — 55").
        comorbidities=[ComorbidityOut(
            name=c.condition_name,
            adjustment=AdjustmentOut(threshold=c.threshold_adjustment,
                                     reason=c.adjustment_reason)
            if c.threshold_adjustment is not None else None,
        ) for c in comorbidities],
        medications=[MedicationOut(name=m.name or "", dosage=m.dosage, frequency=m.frequency)
                     for m in meds],
        assigned_doctor=assigned,
    )


def _sync_patient_to_neo4j(db: Session, patient: Patient) -> None:
    """Mirror the Postgres row into the Neo4j ontology (best-effort)."""
    if not get_settings().use_neo4j:
        return
    neo4j.run(cypher.MERGE_PATIENT, {
        "patient_id": str(patient.patient_id),
        "name": patient.name,
        "age": patient.age,
        "sex": patient.sex,
        "ward": patient.ward,
        "bed_number": patient.bed_number,
        "blood_type": patient.blood_type,
        "admission_date": patient.admission_date.isoformat() if patient.admission_date else None,
    })
    for d in db.scalars(select(PatientDisease).where(
            PatientDisease.patient_id == patient.patient_id)).all():
        neo4j.run(cypher.MERGE_DISEASE_AND_LINK % "HAS_CONDITION", {
            "name": d.disease_name, "icd_code": d.icd_code,
            "type": d.disease_type, "specialty": _specialty(d.disease_name),
            "patient_id": str(patient.patient_id),
        })
    for c in db.scalars(select(PatientComorbidity).where(
            PatientComorbidity.patient_id == patient.patient_id)).all():
        neo4j.run(cypher.MERGE_DISEASE_AND_LINK % "COMORBID_WITH", {
            "name": c.condition_name, "icd_code": None, "type": "chronic",
            "specialty": _specialty(c.condition_name),
            "patient_id": str(patient.patient_id),
        })
    for m in db.scalars(select(Medication).where(
            Medication.patient_id == patient.patient_id)).all():
        neo4j.run(cypher.MERGE_MEDICATION_AND_LINK, {
            "medication_id": str(m.medication_id), "name": m.name,
            "dosage": m.dosage, "frequency": m.frequency,
            "patient_id": str(patient.patient_id),
        })


def _replace_collections(db: Session, patient: Patient, body: PatientCreateRequest) -> None:
    for d in list(db.scalars(select(PatientDisease).where(
            PatientDisease.patient_id == patient.patient_id))):
        db.delete(d)
    for c in list(db.scalars(select(PatientComorbidity).where(
            PatientComorbidity.patient_id == patient.patient_id))):
        db.delete(c)
    for m in list(db.scalars(select(Medication).where(
            Medication.patient_id == patient.patient_id))):
        db.delete(m)
    db.flush()
    for d in body.conditions:
        db.add(PatientDisease(patient_id=patient.patient_id, disease_name=d.name,
                              icd_code=d.icd_code, disease_type=d.type,
                              diagnosed_at=datetime.now(timezone.utc), is_active=True))
    for c in body.comorbidities:
        db.add(PatientComorbidity(patient_id=patient.patient_id,
                                  condition_name=c.name,
                                  threshold_adjustment=c.threshold_adjustment,
                                  adjustment_reason=c.adjustment_reason))
    for m in body.medications:
        db.add(Medication(patient_id=patient.patient_id, name=m.name,
                          dosage=m.dosage, frequency=m.frequency,
                          started_at=datetime.now(timezone.utc)))


def _specialty(disease_name: str) -> str:
    from app.ontology.graph_service import specialty_for_disease
    return specialty_for_disease(disease_name)


# --- endpoints --------------------------------------------------------------


@router.get("", response_model=list[PatientListItem])
def list_patients(
    ward: str | None = Query(default=None),
    risk_min: float | None = Query(default=None, ge=0, le=100),
    db: Session = Depends(get_db),
):
    patients = db.scalars(select(Patient).order_by(Patient.name)).all()
    # latest state per patient (small demo dataset — one pass in Python keeps it portable)
    states = db.scalars(select(ProgressionState).order_by(ProgressionState.timestamp.desc())).all()
    latest_state = {}
    for s in states:
        latest_state.setdefault(str(s.patient_id), s)
    assignments = {str(a.patient_id): a for a in db.scalars(select(PatientAssignment))}
    clinicians = {str(c.clinician_id): c for c in db.scalars(select(Clinician))}

    # Batch-load all diseases and comorbidities to avoid N+1 queries
    all_diseases = db.scalars(select(PatientDisease)).all()
    diseases_by_patient: dict[str, list[str]] = {}
    for d in all_diseases:
        diseases_by_patient.setdefault(str(d.patient_id), []).append(d.disease_name)

    all_comorbidities = db.scalars(select(PatientComorbidity)).all()
    comorbidities_by_patient: dict[str, list[str]] = {}
    for c in all_comorbidities:
        comorbidities_by_patient.setdefault(str(c.patient_id), []).append(c.condition_name)

    items = []
    for p in patients:
        pid = str(p.patient_id)
        state = latest_state.get(pid)
        risk = float(state.risk_score) if state and state.risk_score is not None else None
        if ward is not None and p.ward != ward:
            continue
        if risk_min is not None and (risk is None or risk < risk_min):
            continue
        assignment = assignments.get(pid)
        doctor = clinicians.get(str(assignment.clinician_id)) if assignment else None
        items.append(PatientListItem(
            patient_id=pid,
            name=p.name,
            age=p.age,
            sex=p.sex,
            ward=p.ward,
            bed_number=p.bed_number,
            conditions=diseases_by_patient.get(pid, []),
            comorbidities=comorbidities_by_patient.get(pid, []),
            current_risk_score=risk,
            window_open=bool(state.window_open) if state else False,
            assigned_doctor=doctor.name if doctor else None,
        ))
    return items


@router.post("", response_model=PatientDetailResponse, status_code=201)
def create_patient(body: PatientCreateRequest, db: Session = Depends(get_db)):
    patient = Patient(
        name=body.name,
        age=body.age,
        sex=body.sex,
        blood_type=body.blood_type,
        admission_date=body.admission_date,
        ward=body.ward,
        bed_number=body.bed_number,
    )
    db.add(patient)
    db.flush()
    _replace_collections(db, patient, body)
    _sync_patient_to_neo4j(db, patient)

    # Explicit commit so the new patient is immediately queryable across all sessions
    db.commit()
    return build_patient_detail(db, patient)


@router.get("/{patient_id}", response_model=PatientDetailResponse)
def get_patient(patient_id, db: Session = Depends(get_db)):
    patient = _ensure_patient(db, patient_id)
    return build_patient_detail(db, patient)


@router.put("/{patient_id}", response_model=PatientDetailResponse)
def update_patient(patient_id, body: PatientCreateRequest, db: Session = Depends(get_db)):
    patient = _ensure_patient(db, patient_id)
    patient.name = body.name
    patient.age = body.age
    patient.sex = body.sex
    patient.blood_type = body.blood_type
    patient.admission_date = body.admission_date
    patient.ward = body.ward
    patient.bed_number = body.bed_number
    _replace_collections(db, patient, body)
    _sync_patient_to_neo4j(db, patient)
    return build_patient_detail(db, patient)


@router.get("/{patient_id}/graph", response_model=GraphResponse)
def patient_graph(patient_id, db: Session = Depends(get_db)):
    """Identical JSON from Neo4j traversal OR Postgres-FK joins (ADR-002),
    selected by the ONTOLOGY_BACKEND flag."""
    _ensure_patient(db, patient_id)
    graph = get_patient_graph(db, str(patient_id))
    return GraphResponse(
        nodes=[GraphNode(**n) for n in graph["nodes"]],
        edges=[GraphEdge(**e) for e in graph["edges"]],
    )
