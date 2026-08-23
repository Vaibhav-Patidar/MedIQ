-- MedIQ PostgreSQL schema — exact DDL from docs/06-database-spec.md Section 1.
-- Applied automatically by the postgres container's init script (ADR-007: no Alembic).

-- Core patient record
CREATE TABLE patients (
    patient_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    age INTEGER NOT NULL,
    sex CHAR(1) NOT NULL,
    blood_type VARCHAR(5),
    admission_date TIMESTAMPTZ NOT NULL,
    ward VARCHAR(100),
    bed_number VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vital signs time series
CREATE TABLE vital_readings (
    reading_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(patient_id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL,
    heart_rate INTEGER,
    bp_systolic INTEGER,
    bp_diastolic INTEGER,
    temperature DECIMAL(4,1),
    respiratory_rate INTEGER,
    spo2 DECIMAL(4,1),
    wbc DECIMAL(5,1),
    lactate DECIMAL(4,2),
    creatinine DECIMAL(4,2),
    urine_output DECIMAL(6,1),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_vitals_patient_time ON vital_readings(patient_id, timestamp);

-- Disease / condition records
CREATE TABLE patient_diseases (
    record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(patient_id) ON DELETE CASCADE,
    disease_name VARCHAR(255) NOT NULL,
    icd_code VARCHAR(20),
    disease_type VARCHAR(20) CHECK (disease_type IN ('critical','chronic')),
    diagnosed_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE
);

-- Comorbidities as first-class rows so threshold logic can query them directly
CREATE TABLE patient_comorbidities (
    record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(patient_id) ON DELETE CASCADE,
    condition_name VARCHAR(255) NOT NULL,   -- e.g. 'Diabetes', 'Hypertension'
    threshold_adjustment INTEGER,           -- e.g. 55 (overrides default 65)
    adjustment_reason VARCHAR(255)          -- e.g. 'diabetic_lactate_sensitivity'
);

-- ML prediction results (append-only snapshot log)
CREATE TABLE progression_states (
    state_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(patient_id) ON DELETE CASCADE,
    disease_name VARCHAR(255) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    risk_score DECIMAL(5,2),
    stage VARCHAR(100),
    confidence DECIMAL(4,3),
    trajectory JSONB,             -- array of hourly predictions
    shap_values JSONB,            -- feature attributions
    threshold_used INTEGER,
    window_open BOOLEAN DEFAULT FALSE,
    window_closes_at TIMESTAMPTZ
);
CREATE INDEX idx_progression_patient_time ON progression_states(patient_id, timestamp DESC);

-- Intervention windows (separate from progression_states so acknowledgement has its own lifecycle)
CREATE TABLE intervention_windows (
    window_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(patient_id) ON DELETE CASCADE,
    progression_state_id UUID REFERENCES progression_states(state_id),
    urgency VARCHAR(20) CHECK (urgency IN ('LOW','MEDIUM','HIGH','CRITICAL')),
    opens_at TIMESTAMPTZ,
    closes_at TIMESTAMPTZ,
    recommended_action TEXT,
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by UUID
);

-- Intervention records (what the doctor actually did)
-- NOTE: moved AFTER clinicians relative to docs/06-database-spec.md Section 1
-- because its FK references clinicians(clinician_id); the doc's original
-- statement order breaks when applied as a one-shot init script (the table
-- definitions themselves are unchanged).
CREATE TABLE clinicians (
    clinician_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    specialization VARCHAR(100),
    is_available BOOLEAN DEFAULT TRUE,
    current_patient_count INTEGER DEFAULT 0
);

CREATE TABLE interventions (
    intervention_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(patient_id) ON DELETE CASCADE,
    clinician_id UUID REFERENCES clinicians(clinician_id),
    window_id UUID REFERENCES intervention_windows(window_id),
    intervention_type VARCHAR(255),
    description TEXT,
    performed_at TIMESTAMPTZ,
    outcome VARCHAR(50) CHECK (outcome IN ('improved','no_change','deteriorated')),
    outcome_recorded_at TIMESTAMPTZ
);

-- MRI scans (stretch)
CREATE TABLE mri_scans (
    scan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(patient_id) ON DELETE CASCADE,
    scan_date TIMESTAMPTZ NOT NULL,
    modality VARCHAR(50),
    raw_file_path TEXT,
    preprocessed_file_path TEXT,
    processing_status VARCHAR(50) DEFAULT 'pending'
);

-- Clinicians table is created before interventions (FK dependency; see note above).

-- Medications
CREATE TABLE medications (
    medication_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(patient_id) ON DELETE CASCADE,
    name VARCHAR(255),
    dosage VARCHAR(100),
    frequency VARCHAR(100),
    started_at TIMESTAMPTZ,
    stopped_at TIMESTAMPTZ
);

-- Auth (minimal — see 08-security-spec.md)
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'clinician',
    clinician_id UUID REFERENCES clinicians(clinician_id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------
-- DEVIATION FLAG (deliberate, additive only — see ADR-002 fallback):
-- schema.sql above matches docs/06-database-spec.md exactly. The table
-- below is an EXTRA operational table so that ONTOLOGY_BACKEND=postgres_fk
-- mode can still answer "who is this patient's assigned doctor?" and
-- reassign on escalation without Neo4j. No specified table was modified.
-- ------------------------------------------------------------------
CREATE TABLE patient_assignments (
    patient_id UUID PRIMARY KEY REFERENCES patients(patient_id) ON DELETE CASCADE,
    clinician_id UUID NOT NULL REFERENCES clinicians(clinician_id),
    assigned_at TIMESTAMPTZ DEFAULT NOW()
);

-- docs/06-database-spec.md Section 4: uniqueness constraints mirrored in Neo4j
-- (created at backend startup when ONTOLOGY_BACKEND=neo4j):
--   CREATE CONSTRAINT ON (p:Patient) ASSERT p.patient_id IS UNIQUE;
--   CREATE CONSTRAINT ON (c:Clinician) ASSERT c.clinician_id IS UNIQUE;
