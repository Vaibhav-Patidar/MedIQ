"""MedIQ synthetic ontology seed loader.

Run AFTER `docker compose up`:
    docker compose exec backend python seed_data.py

Loads (docs/06-database-spec.md Section 6 — seeded once, not generated at runtime):
  * clinicians (incl. one deliberately unavailable to demo alert escalation)
  * the demo login (doctor@mediq.local, role 'clinician')
  * patients + conditions + comorbidities + medications
  * PhysioNet-style synthetic sepsis vitals time-series (>=2h for the patients
    that must trigger real predictions; <2h for the insufficient-data demo)
  * one hardcoded SIMILAR_TO edge (PRD F7/F8 allows exactly this)

Journey B contract (docs/09-testing-strategy.md Section 4 step 6):
  * Ramesh Yadav   — diabetic   — final risk ~72 -> window OPENS  at threshold 55
  * Sunita Devi    — non-diabetic — final risk ~57 -> NO window (threshold 65)
"""
import os
import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.config import get_settings
from app.core.logging_config import configure_logging
from app.core.security import hash_password
from app.db import get_engine, reset_engine
from app.models.orm import (Base, Clinician, Intervention, InterventionWindow,
                            Medication, Patient, PatientAssignment,
                            PatientComorbidity, PatientDisease,
                            ProgressionState, User, VitalReading)
from app.ontology import cypher
from app.ontology.neo4j_client import client as neo4j
from app.services.prediction import InsufficientDataError, run_sepsis_prediction


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def interpolate_series(start: dict, end: dict, hours: int) -> list[dict]:
    """Hourly readings ending `now`, ramping from `start` to `end` values."""
    keys = ["heart_rate", "bp_systolic", "bp_diastolic", "temperature",
            "respiratory_rate", "spo2", "wbc", "lactate", "creatinine",
            "urine_output"]
    end_time = utcnow()
    out = []
    n = hours - 1
    for i in range(hours):
        frac = i / max(1, n)
        row = {"timestamp": end_time - timedelta(hours=n - i)}
        for k in keys:
            s, e = start.get(k), end.get(k)
            if s is None or e is None:
                row[k] = e
            elif k == "temperature":
                row[k] = round(s + (e - s) * frac, 1)
            elif k in ("lactate", "creatinine", "spo2", "wbc"):
                row[k] = round(s + (e - s) * frac, 2)
            else:
                row[k] = int(round(s + (e - s) * frac))
        out.append(row)
    return out


CLINICIANS = [
    {"name": "Dr. Rao", "specialization": "Critical Care", "is_available": True,
     "current_patient_count": 0},
    # Deliberately unavailable: opening Ramesh Yadav's window must escalate to Dr. Rao
    {"name": "Dr. Mehta", "specialization": "Critical Care", "is_available": False,
     "current_patient_count": 2},
    {"name": "Dr. Iyer", "specialization": "Infectious Disease", "is_available": True,
     "current_patient_count": 1},
    {"name": "Dr. Khan", "specialization": "Neurology", "is_available": True,
     "current_patient_count": 0},
]

PATIENTS = [
    {
        "key": "ramesh", "name": "Ramesh Yadav", "age": 67, "sex": "M",
        "blood_type": "B+", "ward": "ICU-3", "bed_number": "12",
        "assigned_to": "Dr. Mehta",  # unavailable -> live escalation demo
        "conditions": [
            {"name": "Sepsis", "icd_code": "A41.9", "type": "critical"},
        ],
        "comorbidities": [
            # THE ontology payoff (PRD F4): diabetic threshold override
            {"name": "Diabetes", "threshold_adjustment": 55,
             "adjustment_reason": "diabetic_lactate_sensitivity"},
        ],
        "medications": [
            {"name": "Metformin", "dosage": "500mg", "frequency": "BID"},
            {"name": "Piperacillin-Tazobactam", "dosage": "4.5g", "frequency": "QID"},
        ],
        "vitals_start": {"heart_rate": 96, "bp_systolic": 122, "bp_diastolic": 74,
                         "temperature": 37.6, "respiratory_rate": 19, "spo2": 98,
                         "wbc": 10.5, "lactate": 1.8, "creatinine": 1.1,
                         "urine_output": 55},
        # Surrogate math lands at ~71.7 risk -> window at 55 (not 65), urgency HIGH
        "vitals_end": {"heart_rate": 118, "bp_systolic": 105, "bp_diastolic": 62,
                       "temperature": 39.2, "respiratory_rate": 26, "spo2": 96,
                       "wbc": 14.2, "lactate": 4.4, "creatinine": 1.5,
                       "urine_output": 28},
        "vitals_hours": 12,
        "predict": True,
    },
    {
        "key": "sunita", "name": "Sunita Devi", "age": 58, "sex": "F",
        "blood_type": "O+", "ward": "ICU-2", "bed_number": "04",
        "assigned_to": "Dr. Rao",
        "conditions": [
            {"name": "Pneumonia", "icd_code": "J18.9", "type": "critical"},
        ],
        "comorbidities": [],  # NON-diabetic: same-ish score must NOT open a window
        "medications": [{"name": "Paracetamol", "dosage": "650mg", "frequency": "TDS"}],
        "vitals_start": {"heart_rate": 98, "bp_systolic": 118, "bp_diastolic": 70,
                         "temperature": 37.8, "respiratory_rate": 20, "spo2": 98,
                         "wbc": 11.0, "lactate": 1.9, "creatinine": 1.0,
                         "urine_output": 50},
        # ~57.3 risk -> below default 65 -> NO window (Journey B contrast)
        "vitals_end": {"heart_rate": 114, "bp_systolic": 108, "bp_diastolic": 66,
                       "temperature": 38.8, "respiratory_rate": 25, "spo2": 96,
                       "wbc": 15.0, "lactate": 3.6, "creatinine": 1.35,
                       "urine_output": 32},
        "vitals_hours": 12,
        "predict": True,
    },
    {
        "key": "arjun", "name": "Arjun Patel", "age": 72, "sex": "M",
        "blood_type": "A+", "ward": "General-1", "bed_number": "22",
        "assigned_to": "Dr. Iyer",
        "conditions": [
            {"name": "Alzheimer's Disease", "icd_code": "G30.1", "type": "chronic"},
        ],
        "comorbidities": [
            {"name": "Hypertension", "threshold_adjustment": None, "adjustment_reason": None},
        ],
        "medications": [
            {"name": "Amlodipine", "dosage": "5mg", "frequency": "OD"},
            {"name": "Donepezil", "dosage": "10mg", "frequency": "OD"},
        ],
        "vitals_start": {"heart_rate": 96, "bp_systolic": 130, "bp_diastolic": 80,
                         "temperature": 37.1, "respiratory_rate": 18, "spo2": 97,
                         "wbc": 9.5, "lactate": 1.7, "creatinine": 1.0,
                         "urine_output": 50},
        "vitals_end": {"heart_rate": 98, "bp_systolic": 128, "bp_diastolic": 78,
                       "temperature": 37.2, "respiratory_rate": 18, "spo2": 97,
                       "wbc": 9.8, "lactate": 1.9, "creatinine": 1.0,
                       "urine_output": 50},
        "vitals_hours": 12,
        "predict": True,
    },
    # Fresh admission: <2h of data -> insufficient_data state (manual QA checklist)
    {
        "key": "kavita", "name": "Kavita Sharma", "age": 45, "sex": "F",
        "blood_type": "AB+", "ward": "ICU-1", "bed_number": "02",
        "assigned_to": "Dr. Khan",
        "conditions": [
            {"name": "UTI", "icd_code": "N39.0", "type": "critical"},
        ],
        "comorbidities": [],
        "medications": [],
        "vitals_start": None,
        "vitals_end": {"heart_rate": 104, "bp_systolic": 110, "bp_diastolic": 68,
                       "temperature": 38.1, "respiratory_rate": 22, "spo2": 97,
                       "wbc": 12.5, "lactate": 2.4, "creatinine": 1.2,
                       "urine_output": 40},
        "vitals_hours": 0,  # special-cased below: two readings 30 min apart
        "predict": False,
    },
]


def wipe(db) -> None:
    for stmt in (
        delete(Intervention),
        delete(InterventionWindow),
        delete(ProgressionState),
        delete(VitalReading),
        delete(PatientComorbidity),
        delete(PatientDisease),
        delete(Medication),
        delete(PatientAssignment),
        delete(User),
        delete(Clinician),
        delete(Patient),
    ):
        db.execute(stmt)
    db.flush()


def seed_neo4j_clinicians(clinician_rows) -> None:
    for c in clinician_rows:
        neo4j.run(cypher.MERGE_CLINICIAN, {
            "clinician_id": str(c.clinician_id), "name": c.name,
            "specialization": c.specialization, "is_available": bool(c.is_available),
            "current_patient_count": c.current_patient_count,
        })


def main() -> None:
    configure_logging()
    settings = get_settings()
    reset_engine()
    engine = get_engine()

    if engine.dialect.name != "postgresql":
        Base.metadata.create_all(engine)  # local/dev-without-docker convenience

    neo4j.connect()  # no-op when ONTOLOGY_BACKEND=postgres_fk

    from sqlalchemy.orm import Session
    db = Session(bind=engine)
    try:
        wipe(db)

        now = utcnow()

        clinicians = {}
        for spec in CLINICIANS:
            c = Clinician(**spec)
            db.add(c)
            db.flush()
            clinicians[spec["name"]] = c
        if neo4j.enabled:
            seed_neo4j_clinicians(list(clinicians.values()))

        # Demo login (08-security-spec.md §1: bcrypt, never logged plaintext)
        rao = clinicians["Dr. Rao"]
        user = User(
            email=settings.seed_clinician_email,
            password_hash=hash_password(settings.seed_clinician_password),
            name="Dr. Rao",
            role="clinician",
            clinician_id=rao.clinician_id,
        )
        db.add(user)

        created = {}
        for spec in PATIENTS:
            patient = Patient(
                name=spec["name"], age=spec["age"], sex=spec["sex"],
                blood_type=spec["blood_type"],
                admission_date=now - timedelta(days=2),
                ward=spec["ward"], bed_number=spec["bed_number"],
            )
            db.add(patient)
            db.flush()

            for cond in spec["conditions"]:
                db.add(PatientDisease(patient_id=patient.patient_id,
                                      disease_name=cond["name"],
                                      icd_code=cond["icd_code"],
                                      disease_type=cond["type"],
                                      diagnosed_at=now - timedelta(days=1),
                                      is_active=True))
            for com in spec["comorbidities"]:
                db.add(PatientComorbidity(patient_id=patient.patient_id,
                                          condition_name=com["name"],
                                          threshold_adjustment=com["threshold_adjustment"],
                                          adjustment_reason=com["adjustment_reason"]))
            for med in spec["medications"]:
                m = Medication(patient_id=patient.patient_id, name=med["name"],
                               dosage=med["dosage"], frequency=med["frequency"],
                               started_at=now - timedelta(days=1))
                db.add(m)
                db.flush()
                if neo4j.enabled:
                    neo4j.run(cypher.MERGE_MEDICATION_AND_LINK, {
                        "medication_id": str(m.medication_id), "name": m.name,
                        "dosage": m.dosage, "frequency": m.frequency,
                        "patient_id": str(patient.patient_id),
                    })

            assignee = clinicians[spec["assigned_to"]]
            db.add(PatientAssignment(patient_id=patient.patient_id,
                                     clinician_id=assignee.clinician_id))

            # Mirror patient + static links into the ontology graph
            if neo4j.enabled:
                neo4j.run(cypher.MERGE_PATIENT, {
                    "patient_id": str(patient.patient_id), "name": patient.name,
                    "age": patient.age, "sex": patient.sex, "ward": patient.ward,
                    "bed_number": patient.bed_number,
                    "blood_type": patient.blood_type,
                    "admission_date": patient.admission_date.isoformat(),
                })
                for cond in spec["conditions"]:
                    neo4j.run(cypher.MERGE_DISEASE_AND_LINK % "HAS_CONDITION", {
                        "name": cond["name"], "icd_code": cond["icd_code"],
                        "type": cond["type"],
                        "specialty": _specialty(cond["name"]),
                        "patient_id": str(patient.patient_id),
                    })
                for com in spec["comorbidities"]:
                    neo4j.run(cypher.MERGE_DISEASE_AND_LINK % "COMORBID_WITH", {
                        "name": com["name"], "icd_code": None, "type": "chronic",
                        "specialty": _specialty(com["name"]),
                        "patient_id": str(patient.patient_id),
                    })
                neo4j.run(cypher.ASSIGN_PATIENT_TO_CLINICIAN, {
                    "patient_id": str(patient.patient_id),
                    "clinician_id": str(assignee.clinician_id),
                })

            # Vitals time-series
            if spec["key"] == "kavita":
                series = []
                base = spec["vitals_end"]
                for minutes_ago in (30, 0):
                    row = dict(base)
                    row["timestamp"] = now - timedelta(minutes=minutes_ago)
                    series.append(row)
            else:
                series = interpolate_series(spec["vitals_start"], spec["vitals_end"],
                                            spec["vitals_hours"])
            for row in series:
                reading = VitalReading(
                    patient_id=patient.patient_id,
                    timestamp=row["timestamp"],
                    heart_rate=row["heart_rate"],
                    bp_systolic=row["bp_systolic"],
                    bp_diastolic=row["bp_diastolic"],
                    temperature=row["temperature"],
                    respiratory_rate=row["respiratory_rate"],
                    spo2=row["spo2"],
                    wbc=row["wbc"],
                    lactate=row["lactate"],
                    creatinine=row["creatinine"],
                    urine_output=row["urine_output"],
                )
                db.add(reading)
                db.flush()
                if neo4j.enabled:
                    neo4j.run(cypher.MERGE_VITAL_READING, {
                        "patient_id": str(patient.patient_id),
                        "reading_id": str(reading.reading_id),
                        "timestamp": row["timestamp"].isoformat(),
                        "heart_rate": row["heart_rate"],
                        "bp_systolic": row["bp_systolic"],
                        "bp_diastolic": row["bp_diastolic"],
                        "temperature": row["temperature"],
                        "respiratory_rate": row["respiratory_rate"],
                        "spo2": row["spo2"], "wbc": row["wbc"],
                        "lactate": row["lactate"],
                        "creatinine": row["creatinine"],
                        "urine_output": row["urine_output"],
                    })

            created[spec["key"]] = {"spec": spec, "patient": patient}

        # Hardcoded SIMILAR_TO example (PRD F7/F8 explicitly allows one)
        if neo4j.enabled:
            neo4j.run(cypher.MERGE_SIMILAR_TO, {
                "patient_a": str(created["ramesh"]["patient"].patient_id),
                "patient_b": str(created["arjun"]["patient"].patient_id),
            })

        # Persist ALL static seed data BEFORE running predictions so a
        # prediction failure can never roll the ontology seed back.
        db.commit()

        # Pre-run inference so the dashboard/alerts are populated for the demo
        results = {}
        for key, entry in created.items():
            if not entry["spec"]["predict"]:
                continue
            try:
                payload = run_sepsis_prediction(db, entry["patient"].patient_id)
                db.commit()
                results[key] = payload
            except InsufficientDataError as exc:
                db.rollback()
                results[key] = {"error": f"insufficient_data ({exc.hours_available}h)"}
            except Exception as exc:
                import traceback
                print(f"[seed] prediction failed for {key}:")
                traceback.print_exc()
                db.rollback()
                results[key] = {"error": f"{type(exc).__name__}: {exc}"}

        db.commit()

        # ---- console summary ----
        def pid(key):
            return str(created[key]["patient"].patient_id)

        print("=" * 74)
        print("MedIQ seed complete.")
        print(f"  Login: {settings.seed_clinician_email} / {settings.seed_clinician_password}")
        print(f"  Swagger: http://localhost:8000/docs")
        if neo4j.enabled:
            print(f"  Neo4j browser: http://localhost:7474 (neo4j)")
        else:
            print("  Ontology backend: postgres_fk fallback (ADR-002) — Neo4j skipped")
        print("-" * 74)
        for key, entry in created.items():
            p = entry["patient"]
            print(f"  {p.name:<14} {p.age}{p.sex} {p.ward}/{p.bed_number:<3}"
                  f" id={pid(key)}")
        print("-" * 74)
        print("Journey B contrast (PRD F4):")
        for key in ("ramesh", "sunita"):
            r = results.get(key, {})
            if "error" in r:
                print(f"  {key}: ERROR {r['error']}")
            else:
                print(f"  {created[key]['spec']['name']:<14} risk={r['risk_score']:>5}"
                      f"  threshold={r['threshold_used']}  window_open={r['window_open']}"
                      f"  ({r.get('threshold_adjustment_reason') or 'default'})")
        print("=" * 74)
    finally:
        db.close()


def _specialty(disease_name: str) -> str:
    from app.ontology.graph_service import specialty_for_disease
    return specialty_for_disease(disease_name)


if __name__ == "__main__":
    main()
