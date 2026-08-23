import os
import sys
import tempfile
from datetime import datetime, timedelta, timezone

import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)

# Test env BEFORE any app import: postgres_fk ontology (exercises the ADR-002
# fallback), throwaway SQLite database, fixed JWT secret.
_TMPDIR = tempfile.mkdtemp(prefix="mediq-tests-")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_TMPDIR}/mediq-test.db")
os.environ["ONTOLOGY_BACKEND"] = "postgres_fk"
os.environ["JWT_SECRET"] = "test-secret"
os.environ["JWT_EXPIRES_IN"] = "3600"
os.environ["MRI_UPLOAD_DIR"] = os.path.join(_TMPDIR, "uploads")
os.environ["MRI_MAX_UPLOAD_MB"] = "2"
os.environ.pop("SEPSIS_CHECKPOINT_PATH", None)  # force surrogate backend

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core.security import hash_password  # noqa: E402
from app.db import get_engine, reset_engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models.orm import (Base, Clinician, Patient, PatientAssignment,  # noqa: E402
                            PatientComorbidity, PatientDisease, User,
                            VitalReading)

TEST_EMAIL = "test@mediq.local"
TEST_PASSWORD = "test-pass"


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


BENIGN = dict(heart_rate=88, bp_systolic=124, bp_diastolic=78,
              temperature=36.8, respiratory_rate=16, spo2=98,
              wbc=8.0, lactate=1.5, creatinine=0.9, urine_output=60)
# Surrogate score lands at ~57.3: above diabetic 55, below default 65.
ELEVATED_57 = dict(heart_rate=114, bp_systolic=108, bp_diastolic=66,
                   temperature=38.8, respiratory_rate=25, spo2=96,
                   wbc=15.0, lactate=3.6, creatinine=1.35, urine_output=32)
# Surrogate score lands at ~71.7: crosses the DEFAULT threshold 65 -> HIGH window.
HIGH_RISK_72 = dict(heart_rate=118, bp_systolic=105, bp_diastolic=62,
                    temperature=39.2, respiratory_rate=26, spo2=96,
                    wbc=14.2, lactate=4.4, creatinine=1.5, urine_output=28)


def _mk_patient(db, name, age, sex, comorbidities=(), conditions=(), ward="ICU-T"):
    p = Patient(name=name, age=age, sex=sex, blood_type="O+",
                admission_date=utcnow() - timedelta(days=1), ward=ward,
                bed_number="01")
    db.add(p)
    db.flush()
    for c in conditions:
        db.add(PatientDisease(patient_id=p.patient_id, disease_name=c[0],
                              icd_code=c[1], disease_type=c[2],
                              diagnosed_at=utcnow(), is_active=True))
    for c in comorbidities:
        db.add(PatientComorbidity(patient_id=p.patient_id, condition_name=c[0],
                                  threshold_adjustment=c[1],
                                  adjustment_reason=c[2]))
    return p


def _add_readings(db, patient, offsets_hours, values=None):
    for h in offsets_hours:
        row = dict(values or BENIGN)
        ts = utcnow() - timedelta(hours=h)
        db.add(VitalReading(patient_id=patient.patient_id, timestamp=ts, **row))
    db.flush()


@pytest.fixture(scope="session")
def seeded_db():
    reset_engine()
    engine = get_engine()
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    db = factory()
    try:
        cc_unavailable = Clinician(name="Dr. Unavailable", specialization="Critical Care",
                                   is_available=False, current_patient_count=1)
        cc_available = Clinician(name="Dr. Available", specialization="Critical Care",
                                 is_available=True, current_patient_count=0)
        neuro = Clinician(name="Dr. Neuro", specialization="Neurology",
                          is_available=True, current_patient_count=0)
        db.add_all([cc_unavailable, cc_available, neuro])
        db.flush()

        user = User(email=TEST_EMAIL, password_hash=hash_password(TEST_PASSWORD),
                    name="Test Clinician", role="clinician",
                    clinician_id=cc_available.clinician_id)
        db.add(user)

        diab = _mk_patient(db, "Diab Test", 58, "F",
                           conditions=[("Sepsis", "A41.9", "critical")],
                           comorbidities=[("Diabetes", 55, "diabetic_lactate_sensitivity")])
        nondiab = _mk_patient(db, "NonDiab Test", 40, "M")
        routing = _mk_patient(db, "Routing Test", 60, "M",
                              conditions=[("Sepsis", "A41.9", "critical")])
        fresh = _mk_patient(db, "Fresh Test", 45, "F")

        _add_readings(db, diab, [4, 3, 2])
        _add_readings(db, nondiab, [4, 3, 2])
        _add_readings(db, routing, [4, 3, 2])
        _add_readings(db, fresh, [0.5])

        db.add(PatientAssignment(patient_id=diab.patient_id, clinician_id=cc_available.clinician_id))
        db.add(PatientAssignment(patient_id=nondiab.patient_id, clinician_id=cc_available.clinician_id))
        # assigned doctor deliberately UNAVAILABLE -> escalation target test
        db.add(PatientAssignment(patient_id=routing.patient_id, clinician_id=cc_unavailable.clinician_id))
        db.add(PatientAssignment(patient_id=fresh.patient_id, clinician_id=neuro.clinician_id))
        db.commit()

        yield {
            "diab": str(diab.patient_id),
            "nondiab": str(nondiab.patient_id),
            "routing": str(routing.patient_id),
            "fresh": str(fresh.patient_id),
            "user_id": str(user.user_id),
            "cc_unavailable": str(cc_unavailable.clinician_id),
            "cc_available": str(cc_available.clinician_id),
        }
    finally:
        db.close()


@pytest.fixture(scope="session")
def client(seeded_db):
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def auth_headers(client):
    resp = client.post("/api/auth/login",
                       json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def ws_token():
    from app.core.security import create_access_token

    token, _ = create_access_token(seeded_db_user_id(), "clinician")
    return token


def seeded_db_user_id():
    engine = get_engine()
    factory = sessionmaker(bind=engine)
    db = factory()
    try:
        from sqlalchemy import select
        user = db.scalar(select(User).where(User.email == TEST_EMAIL))
        return str(user.user_id)
    finally:
        db.close()
