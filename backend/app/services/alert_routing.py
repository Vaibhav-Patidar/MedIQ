"""Alert routing (docs/04-tech-spec.md Section 3 'Action layer'):
when a window opens, check the assigned clinician's is_available; if false,
query the next available clinician of matching specialization (the Cypher
pattern in docs/06-database-spec.md Section 3), reassign, then push."""
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.orm import (Clinician, PatientAssignment, PatientDisease)
from app.ontology.graph_service import specialty_for_disease
from app.ontology import cypher
from app.ontology.neo4j_client import client as neo4j

logger = logging.getLogger("mediq.alerts")

# Recommended-action templates shown on the alert card / countdown banner.
RECOMMENDED_ACTIONS = {
    "CRITICAL": "Administer broad-spectrum antibiotics within 30 min; start fluid resuscitation; escalate to ICU team now",
    "HIGH": "Administer broad-spectrum antibiotics; reassess in 1h",
    "MEDIUM": "Draw lactate and blood cultures; reassess vitals within 2h",
    "LOW": "Continue routine monitoring; reassess at next observation round",
}


def recommended_action_for(urgency: str) -> str:
    return RECOMMENDED_ACTIONS.get(urgency, RECOMMENDED_ACTIONS["LOW"])


def get_assigned_clinician(db: Session, patient_id) -> Clinician | None:
    assignment = db.scalar(
        select(PatientAssignment).where(PatientAssignment.patient_id == patient_id)
    )
    if assignment is None:
        return None
    return db.scalar(select(Clinician).where(Clinician.clinician_id == assignment.clinician_id))


def _primary_specialization(db: Session, patient_id) -> str | None:
    """Specialty of the patient's most serious active disease (drives routing)."""
    diseases = db.scalars(
        select(PatientDisease).where(PatientDisease.patient_id == patient_id)
    ).all()
    if not diseases:
        return None
    critical = [d for d in diseases if d.disease_type == "critical"]
    chosen = (critical or diseases)[0]
    return specialty_for_disease(chosen.disease_name)


def find_next_available_clinician(db: Session, patient_id,
                                  exclude_clinician_id=None) -> Clinician | None:
    """Next available clinician of matching specialization, least-loaded first.
    Neo4j traversal when enabled (docs/06-database-spec.md §3 pattern), SQL otherwise."""
    if get_settings().use_neo4j:
        rows = neo4j.run(cypher.FIND_AVAILABLE_CLINICIAN, {"id": str(patient_id)})
        if rows:
            # Cypher RETURNs the node as alias `c`
            node = rows[0].get("c") or next(iter(rows[0].values()), None)
            if node and node.get("clinician_id"):
                cid = str(node["clinician_id"])
                clinician = db.scalar(select(Clinician).where(Clinician.clinician_id == cid))
                if clinician is not None and clinician.clinician_id != exclude_clinician_id:
                    return clinician
    specialization = _primary_specialization(db, patient_id)
    clinicians = db.scalars(
        select(Clinician).where(Clinician.is_available.is_(True)).order_by(Clinician.current_patient_count.asc())
    ).all()
    same_spec = [c for c in clinicians
                 if c.specialization == specialization and c.clinician_id != exclude_clinician_id]
    if same_spec:
        return same_spec[0]
    others = [c for c in clinicians if c.clinician_id != exclude_clinician_id]
    return others[0] if others else None


def assign_patient_to_clinician(db: Session, patient_id, clinician: Clinician) -> None:
    """Reassignment is written to both stores so either backend stays consistent."""
    existing = db.scalar(select(PatientAssignment).where(PatientAssignment.patient_id == patient_id))
    if existing is not None:
        existing.clinician_id = clinician.clinician_id
        existing.assigned_at = datetime.now(timezone.utc)
    else:
        db.add(PatientAssignment(patient_id=patient_id, clinician_id=clinician.clinician_id))
    if get_settings().use_neo4j:
        neo4j.run(cypher.ASSIGN_PATIENT_TO_CLINICIAN, {
            "patient_id": str(patient_id),
            "clinician_id": str(clinician.clinician_id),
        })


def route_window_alert(db: Session, patient, urgency: str) -> tuple[Clinician | None, bool]:
    """Returns (routed_clinician, escalated). Escalates when the assigned doctor
    is unavailable by reassigning to the next available clinician of matching
    specialization (integration-test target, docs/09-testing-strategy.md §3)."""
    assigned = get_assigned_clinician(db, patient.patient_id)
    if assigned is not None and assigned.is_available:
        return assigned, False

    replacement = find_next_available_clinician(
        db, patient.patient_id,
        exclude_clinician_id=assigned.clinician_id if assigned else None,
    )
    if replacement is not None:
        assign_patient_to_clinician(db, patient.patient_id, replacement)
        replacement.current_patient_count = (replacement.current_patient_count or 0) + 1
        if assigned is not None and (assigned.current_patient_count or 0) > 0:
            assigned.current_patient_count -= 1
        logger.info(
            "window alert escalated patient=%s from=%s to=%s (%s)",
            patient.patient_id,
            assigned.name if assigned else "unassigned",
            replacement.name, replacement.specialization,
        )
        return replacement, True

    logger.warning("no available clinician for patient=%s — alert left with %s",
                   patient.patient_id, assigned.name if assigned else "nobody")
    return assigned, False
