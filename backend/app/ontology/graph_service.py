"""Graph service: /api/patients/{id}/graph returns IDENTICAL JSON whether backed
by a Neo4j traversal or by joining the PostgreSQL FK tables — ADR-002's actual
decision. The single ONTOLOGY_BACKEND config flag switches implementations."""

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.orm import (Clinician, Intervention, InterventionWindow,
                            Medication, Patient, PatientAssignment,
                            PatientComorbidity, PatientDisease,
                            ProgressionState)
from app.ontology.neo4j_client import client as neo4j
from app.ontology import cypher

logger = logging.getLogger("mediq.graph")


def _node(node_id: str, node_type: str, label: str) -> dict:
    return {"id": node_id, "type": node_type, "label": label}


def _edge(source: str, target: str, relation: str) -> dict:
    return {"source": source, "target": target, "relation": relation}


# Disease name -> clinical specialty mapping used for alert routing when the
# Neo4j `Disease.specialty` property is unavailable in postgres_fk mode.
DISEASE_SPECIALTY = {
    "Sepsis": "Critical Care",
    "Septic Shock": "Critical Care",
    "Pneumonia": "Pulmonology",
    "Meningitis": "Neurology",
    "Alzheimer's Disease": "Neurology",
    "UTI": "Internal Medicine",
}


def specialty_for_disease(disease_name: str) -> str:
    return DISEASE_SPECIALTY.get(disease_name, "Internal Medicine")


def get_patient_graph(db: Session, patient_id: str) -> dict:
    if get_settings_use_neo4j():
        graph = _graph_from_neo4j(patient_id)
        if graph is not None:
            return graph
        logger.warning("neo4j graph empty for %s — falling back to postgres_fk", patient_id)
    return _graph_from_postgres_fk(db, patient_id)


def get_settings_use_neo4j() -> bool:
    from app.core.config import get_settings

    return get_settings().use_neo4j


# ---------------------------------------------------------------------------
# Path 1: Neo4j traversal (parameterized Cypher from 06-database-spec.md §3)
# ---------------------------------------------------------------------------


def _node_type(n) -> str:
    labels = getattr(n, "labels", None)
    if labels:
        # order-stable pick of the primary label
        for preferred in ("Patient", "Disease", "Clinician", "Medication",
                          "VitalReading", "ProgressionState",
                          "InterventionWindow", "Intervention", "MRIScan"):
            if preferred in labels:
                return preferred
        return sorted(labels)[0]
    return "Node"


def _node_label(n) -> str:
    if n.get("name"):
        return str(n["name"])
    if n.get("urgency"):
        return str(n["urgency"])
    if n.get("type") and "Intervention" in getattr(n, "labels", set()):
        return str(n["type"])
    if n.get("risk_score") is not None:
        return f"Sepsis risk {float(n['risk_score']):g}"
    return ""


def _node_id(n) -> str:
    for key in ("patient_id", "clinician_id", "reading_id", "state_id",
                "window_id", "intervention_id", "medication_id", "scan_id"):
        if key in n and n[key] is not None:
            return str(n[key])
    name = n.get("name")
    return str(name) if name else str(getattr(n, "element_id", id(n)))


def _graph_from_neo4j(patient_id: str) -> dict | None:
    records = neo4j.get_patient_graph(patient_id)
    if not records:
        return None
    row = records[0]
    p = row["p"]
    pid = str(p["patient_id"])
    nodes = [_node(pid, "Patient", p.get("name", pid))]
    edges: list[dict] = []

    def add_linked(entry: dict, default_rel: str, source: str | None = None) -> None:
        n = entry.get("node")
        if not n:
            return
        rel = entry.get("rel") or default_rel
        nid = _node_id(n)
        nodes.append(_node(nid, _node_type(n), _node_label(n) or nid))
        edges.append(_edge(source or pid, nid, str(rel)))

    for entry in row.get("direct", []):
        add_linked(entry, "RELATED_TO")
    ps_entries = [e for e in row.get("progressions", []) if e.get("node")]
    for entry in ps_entries:
        add_linked(entry, "IN_PROGRESSION")
    # window edges hang off their progression state
    for entry in row.get("windows", []):
        if entry.get("node") and ps_entries:
            wn = entry["node"]
            wid = _node_id(wn)
            nodes.append(_node(wid, _node_type(wn), _node_label(wn) or wid))
            edges.append(_edge(_node_id(ps_entries[0]["node"]), wid, "OPENS_WINDOW"))
    for entry in row.get("interventions", []):
        add_linked(entry, "RECEIVED")
    for entry in row.get("similar", []):
        add_linked(entry, "SIMILAR_TO")

    # de-duplicate while preserving order
    seen_n, uniq_nodes = set(), []
    for n in nodes:
        if n["id"] not in seen_n:
            seen_n.add(n["id"])
            uniq_nodes.append(n)
    seen_e, uniq_edges = set(), []
    for e in edges:
        key = (e["source"], e["target"], e["relation"])
        if key not in seen_e:
            seen_e.add(key)
            uniq_edges.append(e)
    return {"nodes": uniq_nodes, "edges": uniq_edges}


# ---------------------------------------------------------------------------
# Path 2: Postgres-FK fallback (ADR-002) — same JSON shape from FK joins.
# What is lost vs Neo4j: genuine SIMILAR_TO traversal (accepted per ADR-002;
# PRD F8 allows one hardcoded similar-patient example).
# ---------------------------------------------------------------------------


def _graph_from_postgres_fk(db: Session, patient_id: str) -> dict:
    patient = db.scalar(select(Patient).where(Patient.patient_id == patient_id))
    nodes: list[dict] = []
    edges: list[dict] = []
    if patient is None:
        return {"nodes": nodes, "edges": edges}

    pid = str(patient.patient_id)
    nodes.append(_node(pid, "Patient", patient.name))

    diseases = db.scalars(
        select(PatientDisease).where(PatientDisease.patient_id == patient_id)
    ).all()
    for d in diseases:
        did = f"disease-{d.record_id}"
        nodes.append(_node(did, "Disease", d.disease_name))
        edges.append(_edge(pid, did, "HAS_CONDITION"))

    comorbidities = db.scalars(
        select(PatientComorbidity).where(PatientComorbidity.patient_id == patient_id)
    ).all()
    for c in comorbidities:
        cid = f"disease-{c.record_id}"
        nodes.append(_node(cid, "Disease", c.condition_name))
        edges.append(_edge(pid, cid, "COMORBID_WITH"))

    meds = db.scalars(select(Medication).where(Medication.patient_id == patient_id)).all()
    for m in meds:
        mid = str(m.medication_id)
        nodes.append(_node(mid, "Medication", m.name or mid))
        edges.append(_edge(pid, mid, "ON_MEDICATION"))

    assignment = db.scalar(
        select(PatientAssignment).where(PatientAssignment.patient_id == patient_id)
    )
    if assignment is not None:
        clinician = db.scalar(
            select(Clinician).where(Clinician.clinician_id == assignment.clinician_id)
        )
        if clinician is not None:
            clid = str(clinician.clinician_id)
            nodes.append(_node(clid, "Clinician", clinician.name))
            edges.append(_edge(pid, clid, "ASSIGNED_TO"))

    states = db.scalars(
        select(ProgressionState).where(ProgressionState.patient_id == patient_id)
    ).all()
    for s in states:
        sid = str(s.state_id)
        score = float(s.risk_score) if s.risk_score is not None else 0.0
        nodes.append(_node(sid, "ProgressionState", f"Sepsis risk {score:g}"))
        edges.append(_edge(pid, sid, "IN_PROGRESSION"))
        windows = db.scalars(
            select(InterventionWindow).where(InterventionWindow.progression_state_id == s.state_id)
        ).all()
        for w in windows:
            wid = str(w.window_id)
            nodes.append(_node(wid, "InterventionWindow", w.urgency or "WINDOW"))
            edges.append(_edge(sid, wid, "OPENS_WINDOW"))

    interventions = db.scalars(
        select(Intervention).where(Intervention.patient_id == patient_id)
    ).all()
    for i in interventions:
        iid = str(i.intervention_id)
        nodes.append(_node(iid, "Intervention", i.intervention_type or iid))
        edges.append(_edge(pid, iid, "RECEIVED"))
        if i.clinician_id:
            clinician = db.scalar(
                select(Clinician).where(Clinician.clinician_id == i.clinician_id)
            )
            if clinician is not None:
                clid = str(clinician.clinician_id)
                if clid not in {n["id"] for n in nodes}:
                    nodes.append(_node(clid, "Clinician", clinician.name))
                edges.append(_edge(iid, clid, "PERFORMED_BY"))

    return {"nodes": nodes, "edges": edges}
