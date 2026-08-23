import uuid
from datetime import datetime, timezone

from sqlalchemy import (JSON, Boolean, CHAR, CheckConstraint, Column, DateTime,
                        ForeignKey, Index, Integer, Numeric, String, Text, text)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, relationship
from sqlalchemy.types import TypeDecorator


class Base(DeclarativeBase):
    pass


class GUID(TypeDecorator):
    """Portable UUID: native UUID on PostgreSQL, CHAR(36) elsewhere (tests)."""
    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(UUID(as_uuid=True))
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        if dialect.name == "postgresql":
            return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))


class JSONType(TypeDecorator):
    """JSONB on PostgreSQL, plain JSON in test dialects."""
    impl = JSONB
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(JSONB())
        return dialect.type_descriptor(JSON())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def gen_uuid() -> uuid.UUID:
    return uuid.uuid4()


# ---------------------------------------------------------------------------
# Tables mirror backend/schema.sql == docs/06-database-spec.md Section 1.
# The only additive table beyond the spec is patient_assignments (see
# schema.sql deviation note — needed for clinician assignment/routing when
# ONTOLOGY_BACKEND=postgres_fk per ADR-002).
# ---------------------------------------------------------------------------


class Patient(Base):
    __tablename__ = "patients"

    patient_id = Column(GUID, primary_key=True, default=gen_uuid)
    name = Column(String(255), nullable=False)
    age = Column(Integer, nullable=False)
    sex = Column(CHAR(1), nullable=False)
    blood_type = Column(String(5))
    admission_date = Column(DateTime(timezone=True), nullable=False)
    ward = Column(String(100))
    bed_number = Column(String(20))
    created_at = Column(DateTime(timezone=True), default=utcnow)


class VitalReading(Base):
    __tablename__ = "vital_readings"
    __table_args__ = (
        Index("idx_vitals_patient_time", "patient_id", "timestamp"),
    )

    reading_id = Column(GUID, primary_key=True, default=gen_uuid)
    patient_id = Column(GUID, ForeignKey("patients.patient_id", ondelete="CASCADE"), nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=False)
    heart_rate = Column(Integer)
    bp_systolic = Column(Integer)
    bp_diastolic = Column(Integer)
    temperature = Column(Numeric(4, 1))
    respiratory_rate = Column(Integer)
    spo2 = Column(Numeric(4, 1))
    wbc = Column(Numeric(5, 1))
    lactate = Column(Numeric(4, 2))
    creatinine = Column(Numeric(4, 2))
    urine_output = Column(Numeric(6, 1))
    created_at = Column(DateTime(timezone=True), default=utcnow)


class PatientDisease(Base):
    __tablename__ = "patient_diseases"

    record_id = Column(GUID, primary_key=True, default=gen_uuid)
    patient_id = Column(GUID, ForeignKey("patients.patient_id", ondelete="CASCADE"), nullable=False)
    disease_name = Column(String(255), nullable=False)
    icd_code = Column(String(20))
    disease_type = Column(String(20), CheckConstraint("disease_type IN ('critical','chronic')"))
    diagnosed_at = Column(DateTime(timezone=True))
    is_active = Column(Boolean, default=True)


class PatientComorbidity(Base):
    __tablename__ = "patient_comorbidities"

    record_id = Column(GUID, primary_key=True, default=gen_uuid)
    patient_id = Column(GUID, ForeignKey("patients.patient_id", ondelete="CASCADE"), nullable=False)
    condition_name = Column(String(255), nullable=False)
    threshold_adjustment = Column(Integer)
    adjustment_reason = Column(String(255))


class ProgressionState(Base):
    __tablename__ = "progression_states"
    __table_args__ = (
        Index("idx_progression_patient_time", "patient_id", text("timestamp DESC")),
    )

    state_id = Column(GUID, primary_key=True, default=gen_uuid)
    patient_id = Column(GUID, ForeignKey("patients.patient_id", ondelete="CASCADE"), nullable=False)
    disease_name = Column(String(255), nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=False)
    risk_score = Column(Numeric(5, 2))
    stage = Column(String(100))
    confidence = Column(Numeric(4, 3))
    trajectory = Column(JSONType)
    shap_values = Column(JSONType)
    threshold_used = Column(Integer)
    window_open = Column(Boolean, default=False)
    window_closes_at = Column(DateTime(timezone=True))

    windows = relationship("InterventionWindow", back_populates="progression_state")


class InterventionWindow(Base):
    __tablename__ = "intervention_windows"

    window_id = Column(GUID, primary_key=True, default=gen_uuid)
    patient_id = Column(GUID, ForeignKey("patients.patient_id", ondelete="CASCADE"), nullable=False)
    progression_state_id = Column(GUID, ForeignKey("progression_states.state_id"))
    urgency = Column(String(20), CheckConstraint("urgency IN ('LOW','MEDIUM','HIGH','CRITICAL')"))
    opens_at = Column(DateTime(timezone=True))
    closes_at = Column(DateTime(timezone=True))
    recommended_action = Column(Text)
    acknowledged_at = Column(DateTime(timezone=True))
    acknowledged_by = Column(GUID)

    progression_state = relationship("ProgressionState", back_populates="windows")


class Intervention(Base):
    __tablename__ = "interventions"

    intervention_id = Column(GUID, primary_key=True, default=gen_uuid)
    patient_id = Column(GUID, ForeignKey("patients.patient_id", ondelete="CASCADE"), nullable=False)
    clinician_id = Column(GUID, ForeignKey("clinicians.clinician_id"))
    window_id = Column(GUID, ForeignKey("intervention_windows.window_id"))
    intervention_type = Column(String(255))
    description = Column(Text)
    performed_at = Column(DateTime(timezone=True))
    outcome = Column(String(50), CheckConstraint("outcome IN ('improved','no_change','deteriorated')"))
    outcome_recorded_at = Column(DateTime(timezone=True))


class MRIScan(Base):
    __tablename__ = "mri_scans"

    scan_id = Column(GUID, primary_key=True, default=gen_uuid)
    patient_id = Column(GUID, ForeignKey("patients.patient_id", ondelete="CASCADE"), nullable=False)
    scan_date = Column(DateTime(timezone=True), nullable=False)
    modality = Column(String(50))
    raw_file_path = Column(Text)
    preprocessed_file_path = Column(Text)
    processing_status = Column(String(50), default="pending")


class Clinician(Base):
    __tablename__ = "clinicians"

    clinician_id = Column(GUID, primary_key=True, default=gen_uuid)
    name = Column(String(255), nullable=False)
    specialization = Column(String(100))
    is_available = Column(Boolean, default=True)
    current_patient_count = Column(Integer, default=0)


class Medication(Base):
    __tablename__ = "medications"

    medication_id = Column(GUID, primary_key=True, default=gen_uuid)
    patient_id = Column(GUID, ForeignKey("patients.patient_id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255))
    dosage = Column(String(100))
    frequency = Column(String(100))
    started_at = Column(DateTime(timezone=True))
    stopped_at = Column(DateTime(timezone=True))


class User(Base):
    __tablename__ = "users"

    user_id = Column(GUID, primary_key=True, default=gen_uuid)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(Text, nullable=False)  # bcrypt; never logged
    name = Column(String(255))
    role = Column(String(50), default="clinician")
    clinician_id = Column(GUID, ForeignKey("clinicians.clinician_id"))
    created_at = Column(DateTime(timezone=True), default=utcnow)


class PatientAssignment(Base):
    """Additive helper table (see schema.sql deviation note / ADR-002 fallback)."""
    __tablename__ = "patient_assignments"

    patient_id = Column(GUID, ForeignKey("patients.patient_id", ondelete="CASCADE"), primary_key=True)
    clinician_id = Column(GUID, ForeignKey("clinicians.clinician_id"), nullable=False)
    assigned_at = Column(DateTime(timezone=True), default=utcnow)
