"""Pydantic request/response schemas — shapes are the contract in
docs/05-api-spec.md and must not drift from it."""
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator


def iso_z(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- Auth (Section 1) -------------------------------------------------------


class LoginRequest(ApiModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=1024)


class UserPublic(ApiModel):
    id: str
    name: str | None = None
    role: str


class TokenResponse(ApiModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserPublic
    # additive, present only in Supabase mode (used by POST /api/auth/refresh)
    refresh_token: str | None = None


# --- Patients (Section 2) ---------------------------------------------------


class ConditionIn(BaseModel):
    name: str
    icd_code: str | None = None
    type: Literal["critical", "chronic"] | None = None


class ComorbidityIn(BaseModel):
    name: str
    threshold_adjustment: int | None = None
    adjustment_reason: str | None = None


class MedicationIn(BaseModel):
    name: str
    dosage: str | None = None
    frequency: str | None = None


class PatientCreateRequest(ApiModel):
    name: str = Field(min_length=1, max_length=255)
    age: int = Field(ge=0, le=130)
    sex: Literal["M", "F"]
    blood_type: str | None = Field(default=None, max_length=5)
    admission_date: datetime
    ward: str | None = Field(default=None, max_length=100)
    bed_number: str | None = Field(default=None, max_length=20)
    conditions: list[ConditionIn] = []
    comorbidities: list[ComorbidityIn] = []
    medications: list[MedicationIn] = []


PatientUpdateRequest = PatientCreateRequest


class AdjustmentOut(ApiModel):
    threshold: int
    reason: str


class ComorbidityOut(ApiModel):
    name: str
    adjustment: AdjustmentOut | None = None


class ConditionOut(ApiModel):
    name: str
    icd_code: str | None = None
    type: str | None = None


class MedicationOut(ApiModel):
    name: str
    dosage: str | None = None
    frequency: str | None = None


class AssignedDoctorOut(ApiModel):
    clinician_id: str
    name: str
    is_available: bool


class PatientDetailResponse(ApiModel):
    patient_id: str
    name: str
    age: int
    sex: str
    blood_type: str | None = None
    admission_date: datetime | None = None

    @field_serializer("admission_date")
    def _ser_admission(self, v: datetime | None) -> str | None:
        return iso_z(v)

    ward: str | None = None
    bed_number: str | None = None
    conditions: list[ConditionOut] = []
    comorbidities: list[ComorbidityOut] = []
    medications: list[MedicationOut] = []
    assigned_doctor: AssignedDoctorOut | None = None


class PatientListItem(ApiModel):
    patient_id: str
    name: str
    age: int
    sex: str
    ward: str | None = None
    bed_number: str | None = None
    conditions: list[str] = []
    comorbidities: list[str] = []
    current_risk_score: float | None = None
    window_open: bool = False
    assigned_doctor: str | None = None


class GraphNode(ApiModel):
    id: str
    type: str
    label: str


class GraphEdge(ApiModel):
    source: str
    target: str
    relation: str


class GraphResponse(ApiModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]


# --- Vitals (Section 3) ------------------------------------------------------

# Clinical-range sanity bounds (docs/08-security-spec.md Section 3)
HR_BOUNDS = (0, 300)
BP_SYS_BOUNDS = (0, 300)
BP_DIA_BOUNDS = (0, 200)
TEMP_BOUNDS = (25.0, 45.0)
RR_BOUNDS = (0, 80)
SPO2_BOUNDS = (0.0, 100.0)
WBC_BOUNDS = (0.0, 200.0)
LACTATE_BOUNDS = (0.0, 30.0)
CREATININE_BOUNDS = (0.0, 30.0)
URINE_BOUNDS = (0.0, 2000.0)


class VitalsRequest(ApiModel):
    timestamp: datetime
    heart_rate: int | None = Field(default=None, ge=HR_BOUNDS[0], le=HR_BOUNDS[1])
    bp_systolic: int | None = Field(default=None, ge=BP_SYS_BOUNDS[0], le=BP_SYS_BOUNDS[1])
    bp_diastolic: int | None = Field(default=None, ge=BP_DIA_BOUNDS[0], le=BP_DIA_BOUNDS[1])
    temperature: float | None = Field(default=None, ge=TEMP_BOUNDS[0], le=TEMP_BOUNDS[1])
    respiratory_rate: int | None = Field(default=None, ge=RR_BOUNDS[0], le=RR_BOUNDS[1])
    spo2: float | None = Field(default=None, ge=SPO2_BOUNDS[0], le=SPO2_BOUNDS[1])
    wbc: float | None = Field(default=None, ge=WBC_BOUNDS[0], le=WBC_BOUNDS[1])
    lactate: float | None = Field(default=None, ge=LACTATE_BOUNDS[0], le=LACTATE_BOUNDS[1])
    creatinine: float | None = Field(default=None, ge=CREATININE_BOUNDS[0], le=CREATININE_BOUNDS[1])
    urine_output: float | None = Field(default=None, ge=URINE_BOUNDS[0], le=URINE_BOUNDS[1])


class VitalsReadingResponse(VitalsRequest):
    reading_id: str

    @field_serializer("timestamp")
    def _ser_timestamp(self, v: datetime | None) -> str | None:
        return iso_z(v)


class VitalsPostResponse(VitalsReadingResponse):
    prediction_triggered: bool


# --- Predictions (Section 4) -------------------------------------------------


class ShapEntry(ApiModel):
    feature: str
    value: float
    threshold: float
    impact: str
    direction: Literal["increase", "normal"]


class ConfidenceBand(ApiModel):
    lower: list[float]
    upper: list[float]


class SepsisPredictionResponse(ApiModel):
    risk_score: float
    risk_score_change: str | None = None  # null on a patient's first prediction
    trajectory: list[float]
    trajectory_confidence_band: ConfidenceBand
    window_open: bool
    window_closes_at: str | None = None  # null when window_open == false (spec note)
    hours_remaining: float | None = None
    urgency: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    threshold_used: int
    # provided get_threshold() returns None for the default case
    threshold_adjustment_reason: str | None = None
    shap_explanation: list[ShapEntry]
    generated_at: str


class AlzheimersPredictionResponse(ApiModel):
    stage: str
    months_to_next_stage: int
    atrophy_rate_mm3_per_year: float
    treatment_effectiveness_score: float
    heatmap_url: str
    generated_at: str


# --- MRI scans (Section 5, stretch stub) -------------------------------------


class ScanCreatedResponse(ApiModel):
    scan_id: str
    processing_status: str


class ScanResponse(ApiModel):
    scan_id: str
    scan_date: datetime | None = None
    modality: str | None = None
    processing_status: str

    @field_serializer("scan_date")
    def _ser_scan_date(self, v: datetime | None) -> str | None:
        return iso_z(v)


# --- Intervention windows / alerts (Section 6) -------------------------------


class ActiveAlertItem(ApiModel):
    window_id: str
    patient_id: str
    patient_name: str
    urgency: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    hours_remaining: float
    window_closes_at: str | None = None

    @field_serializer("window_closes_at")
    def _ser_closes(self, v: Any) -> str | None:
        if isinstance(v, str):
            return v
        return iso_z(v)

    recommended_action: str | None = None


class AcknowledgeResponse(ApiModel):
    window_id: str
    acknowledged_at: str
    acknowledged_by: str


# --- Interventions (Section 7) -----------------------------------------------


class InterventionCreateRequest(ApiModel):
    type: str = Field(min_length=1, max_length=255)
    description: str = Field(default="", max_length=10000)
    performed_at: datetime
    window_id: str | None = None


class InterventionOutcomeRequest(ApiModel):
    outcome: Literal["improved", "no_change", "deteriorated"]


class InterventionResponse(ApiModel):
    intervention_id: str
    patient_id: str
    clinician_id: str | None = None
    window_id: str | None = None
    type: str
    description: str | None = None
    performed_at: datetime | None = None
    outcome: str | None = None
    outcome_recorded_at: datetime | None = None

    @field_serializer("performed_at", "outcome_recorded_at")
    def _ser_dt(self, v: datetime | None) -> str | None:
        return iso_z(v)


# --- Clinicians (Section 8) --------------------------------------------------


class ClinicianResponse(ApiModel):
    clinician_id: str
    name: str
    specialization: str | None = None
    is_available: bool
    current_patient_count: int


class AvailabilityUpdateRequest(ApiModel):
    is_available: bool


# --- Health (docs/11-observability-spec.md Section 3) ------------------------


class HealthResponse(ApiModel):
    status: Literal["ok", "degraded"]
    postgres: Literal["up", "down"]
    neo4j: Literal["up", "down"]


# --- WebSocket event envelopes (Section 10) ----------------------------------


class WsEvent(ApiModel):
    event: str
    data: dict[str, Any]
