"""Graph service: /api/patients/{id}/graph returns IDENTICAL JSON whether backed
by a Neo4j traversal or by joining the PostgreSQL FK tables — ADR-002's actual
decision. The single ONTOLOGY_BACKEND config flag switches implementations."""

import logging
from datetime import timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.orm import (Clinician, Intervention, InterventionWindow,
                            Medication, Patient, PatientAssignment,
                            PatientComorbidity, PatientDisease,
                            ProgressionState)
from app.ontology.neo4j_client import client as neo4j
from app.ontology import cypher

logger = logging.getLogger("mediq.graph")


def _node(node_id: str, node_type: str, label: str, metadata: dict | None = None) -> dict:
    result = {"id": node_id, "type": node_type, "label": label}
    if metadata:
        result["metadata"] = metadata
    return result


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


def _node_metadata(n, ntype: str) -> dict:
    """Extract rich metadata from a Neo4j node for the detail panel."""
    meta: dict = {}
    if ntype == "Medication":
        for k in ("dosage", "frequency"):
            if n.get(k):
                meta[k] = str(n[k])
    elif ntype == "Disease":
        for k in ("icd_code", "disease_type", "specialty"):
            if n.get(k):
                meta[k] = str(n[k])
    elif ntype == "Clinician":
        for k in ("specialization", "is_available", "current_patient_count"):
            if n.get(k) is not None:
                meta[k] = n[k]
    elif ntype == "ProgressionState":
        for k in ("risk_score", "timestamp", "window_open", "window_closes_at"):
            if n.get(k) is not None:
                meta[k] = n[k]
    elif ntype == "InterventionWindow":
        for k in ("urgency", "opens_at", "closes_at", "recommended_action"):
            if n.get(k) is not None:
                meta[k] = str(n[k])
    elif ntype == "Intervention":
        for k in ("type", "description", "performed_at", "outcome"):
            if n.get(k) is not None:
                meta[k] = str(n[k])
    elif ntype == "Patient":
        for k in ("name", "age", "sex", "ward", "bed_number", "blood_type", "admission_date"):
            if n.get(k) is not None:
                meta[k] = n[k]
    return meta


def _graph_from_neo4j(patient_id: str) -> dict | None:
    records = neo4j.get_patient_graph(patient_id)
    if not records:
        return None
    row = records[0]
    p = row["p"]
    pid = str(p["patient_id"])
    nodes = [_node(pid, "Patient", p.get("name", pid), _node_metadata(p, "Patient"))]
    edges: list[dict] = []

    def add_linked(entry: dict, default_rel: str, source: str | None = None) -> None:
        n = entry.get("node")
        if not n:
            return
        ntype = _node_type(n)
        if ntype == "VitalReading":
            return
        label = _node_label(n)
        if not label:
            return
        rel = entry.get("rel") or default_rel
        nid = _node_id(n)
        meta = _node_metadata(n, ntype)
        nodes.append(_node(nid, ntype, label, meta))
        edges.append(_edge(source or pid, nid, str(rel)))

    for entry in row.get("direct", []):
        add_linked(entry, "RELATED_TO")

    ps_entries = [e for e in row.get("progressions", []) if e.get("node")]
    # Only keep the most recent progression state to avoid duplicate nodes
    if ps_entries:
        latest_ps = ps_entries[0]
        add_linked(latest_ps, "IN_PROGRESSION")
        for entry in row.get("windows", []):
            if entry.get("node"):
                wn = entry["node"]
                wid = _node_id(wn)
                wlabel = _node_label(wn) or "WINDOW"
                wmeta = _node_metadata(wn, _node_type(wn))
                nodes.append(_node(wid, _node_type(wn), wlabel, wmeta))
                edges.append(_edge(_node_id(latest_ps["node"]), wid, "OPENS_WINDOW"))

    for entry in row.get("interventions", []):
        add_linked(entry, "RECEIVED")
    for entry in row.get("similar", []):
        add_linked(entry, "SIMILAR_TO")

    # de-duplicate: by id first, then by (type, label) to collapse repeat risk nodes
    seen_n, uniq_nodes = set(), []
    seen_type_label: set[tuple[str, str]] = set()
    id_remap: dict[str, str] = {}  # old_id -> canonical_id for dedup
    for n in nodes:
        if n["id"] in seen_n:
            continue
        type_label_key = (n["type"], n["label"])
        if n["type"] != "Patient" and type_label_key in seen_type_label:
            # Map this duplicate's id to the canonical node's id
            canonical = next(
                (existing for existing in uniq_nodes
                 if existing["type"] == n["type"] and existing["label"] == n["label"]),
                None
            )
            if canonical:
                id_remap[n["id"]] = canonical["id"]
            continue
        seen_n.add(n["id"])
        seen_type_label.add(type_label_key)
        uniq_nodes.append(n)

    # Remap edges that pointed to deduplicated nodes
    seen_e, uniq_edges = set(), []
    for e in edges:
        source = id_remap.get(e["source"], e["source"])
        target = id_remap.get(e["target"], e["target"])
        key = (source, target, e["relation"])
        if key not in seen_e and source in seen_n and target in seen_n:
            seen_e.add(key)
            uniq_edges.append({"source": source, "target": target, "relation": e["relation"]})
    return {"nodes": uniq_nodes, "edges": uniq_edges}


# ---------------------------------------------------------------------------
# Path 2: Postgres-FK fallback (ADR-002) — same JSON shape from FK joins.
# ---------------------------------------------------------------------------


def _iso_str(dt) -> str | None:
    """Convert a datetime to ISO string for metadata."""
    if dt is None:
        return None
    if hasattr(dt, 'isoformat'):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    return str(dt)


def _graph_from_postgres_fk(db: Session, patient_id: str) -> dict:
    patient = db.scalar(select(Patient).where(Patient.patient_id == patient_id))
    nodes: list[dict] = []
    edges: list[dict] = []
    if patient is None:
        return {"nodes": nodes, "edges": edges}

    pid = str(patient.patient_id)
    nodes.append(_node(pid, "Patient", patient.name, {
        "name": patient.name,
        "age": patient.age,
        "sex": patient.sex,
        "ward": patient.ward,
        "bed_number": patient.bed_number,
        "blood_type": patient.blood_type,
        "admission_date": _iso_str(patient.admission_date),
    }))

    diseases = db.scalars(
        select(PatientDisease).where(PatientDisease.patient_id == patient_id)
    ).all()
    for d in diseases:
        did = f"disease-{d.record_id}"
        nodes.append(_node(did, "Disease", d.disease_name, {
            "icd_code": d.icd_code,
            "disease_type": d.disease_type,
            "diagnosed_at": _iso_str(d.diagnosed_at),
            "is_active": d.is_active,
        }))
        edges.append(_edge(pid, did, "HAS_CONDITION"))

    comorbidities = db.scalars(
        select(PatientComorbidity).where(PatientComorbidity.patient_id == patient_id)
    ).all()
    for c in comorbidities:
        cid = f"comorbidity-{c.record_id}"
        nodes.append(_node(cid, "Disease", c.condition_name, {
            "threshold_adjustment": c.threshold_adjustment,
            "adjustment_reason": c.adjustment_reason,
        }))
        edges.append(_edge(pid, cid, "COMORBID_WITH"))

    meds = db.scalars(select(Medication).where(Medication.patient_id == patient_id)).all()
    for m in meds:
        mid = str(m.medication_id)
        nodes.append(_node(mid, "Medication", m.name or mid, {
            "dosage": m.dosage,
            "frequency": m.frequency,
            "started_at": _iso_str(m.started_at),
            "stopped_at": _iso_str(m.stopped_at),
        }))
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
            nodes.append(_node(clid, "Clinician", clinician.name, {
                "specialization": clinician.specialization,
                "is_available": clinician.is_available,
                "current_patient_count": clinician.current_patient_count,
            }))
            edges.append(_edge(pid, clid, "ASSIGNED_TO"))

    # Only include the latest progression state (prevents duplicate risk nodes)
    latest_state = db.scalar(
        select(ProgressionState)
        .where(ProgressionState.patient_id == patient_id)
        .order_by(ProgressionState.timestamp.desc())
    )
    if latest_state is not None:
        sid = str(latest_state.state_id)
        score = float(latest_state.risk_score) if latest_state.risk_score is not None else 0.0
        nodes.append(_node(sid, "ProgressionState", f"Sepsis risk {score:g}", {
            "risk_score": score,
            "timestamp": _iso_str(latest_state.timestamp),
            "window_open": latest_state.window_open,
            "window_closes_at": _iso_str(latest_state.window_closes_at),
        }))
        edges.append(_edge(pid, sid, "IN_PROGRESSION"))
        windows = db.scalars(
            select(InterventionWindow).where(InterventionWindow.progression_state_id == latest_state.state_id)
        ).all()
        for w in windows:
            wid = str(w.window_id)
            nodes.append(_node(wid, "InterventionWindow", w.urgency or "WINDOW", {
                "urgency": w.urgency,
                "opens_at": _iso_str(w.opens_at),
                "closes_at": _iso_str(w.closes_at),
                "recommended_action": w.recommended_action,
            }))
            edges.append(_edge(sid, wid, "OPENS_WINDOW"))

    interventions = db.scalars(
        select(Intervention).where(Intervention.patient_id == patient_id)
    ).all()
    for i in interventions:
        iid = str(i.intervention_id)
        nodes.append(_node(iid, "Intervention", i.intervention_type or iid, {
            "type": i.intervention_type,
            "description": i.description,
            "performed_at": _iso_str(i.performed_at),
            "outcome": i.outcome,
        }))
        edges.append(_edge(pid, iid, "RECEIVED"))
        if i.clinician_id:
            clinician = db.scalar(
                select(Clinician).where(Clinician.clinician_id == i.clinician_id)
            )
            if clinician is not None:
                clid = str(clinician.clinician_id)
                if clid not in {n["id"] for n in nodes}:
                    nodes.append(_node(clid, "Clinician", clinician.name, {
                        "specialization": clinician.specialization,
                        "is_available": clinician.is_available,
                    }))
                edges.append(_edge(iid, clid, "PERFORMED_BY"))

    # Final dedup by (type, label) to collapse repeated same-label nodes
    seen_type_label: set[tuple[str, str]] = set()
    uniq_nodes: list[dict] = []
    id_remap: dict[str, str] = {}
    for n in nodes:
        type_label = (n["type"], n["label"])
        if n["type"] != "Patient" and type_label in seen_type_label:
            canonical = next(
                (ex for ex in uniq_nodes if ex["type"] == n["type"] and ex["label"] == n["label"]),
                None
            )
            if canonical:
                id_remap[n["id"]] = canonical["id"]
            continue
        seen_type_label.add(type_label)
        uniq_nodes.append(n)

    valid_ids = {n["id"] for n in uniq_nodes}
    uniq_edges: list[dict] = []
    seen_e: set[tuple[str, str, str]] = set()
    for e in edges:
        src = id_remap.get(e["source"], e["source"])
        tgt = id_remap.get(e["target"], e["target"])
        key = (src, tgt, e["relation"])
        if key not in seen_e and src in valid_ids and tgt in valid_ids:
            seen_e.add(key)
            uniq_edges.append({"source": src, "target": tgt, "relation": e["relation"]})

    return {"nodes": uniq_nodes, "edges": uniq_edges}
