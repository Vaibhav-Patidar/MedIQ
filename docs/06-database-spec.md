# MedIQ — Database / Data Model Specification

Two stores: **PostgreSQL** (structured, source of truth for records) and **Neo4j** (ontology/graph — relationships, traversal, similarity). See `04-tech-spec.md` Section 5 for the hackathon fallback if Neo4j setup time runs out.

---

## 1. PostgreSQL Schema

```sql
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

-- Clinicians
CREATE TABLE clinicians (
    clinician_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    specialization VARCHAR(100),
    is_available BOOLEAN DEFAULT TRUE,
    current_patient_count INTEGER DEFAULT 0
);

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
```

## 2. Relationships (Postgres FK summary)

```
patients 1---* vital_readings
patients 1---* patient_diseases
patients 1---* patient_comorbidities
patients 1---* progression_states
patients 1---* intervention_windows
patients 1---* interventions
patients 1---* mri_scans
patients 1---* medications
clinicians 1---* interventions
intervention_windows 1---* interventions (via window_id)
progression_states 1---* intervention_windows
users 1---1 clinicians (optional link for login-mapped clinicians)
```

## 3. Neo4j Ontology Schema

**Nodes:** `Patient`, `VitalReading`, `Disease`, `ProgressionState`, `InterventionWindow`, `Intervention`, `Clinician`, `MRIScan`, `Medication` — properties mirror the Postgres columns above (Neo4j is the traversal/relationship layer; Postgres remains the durable structured record per `04-tech-spec.md`).

**Edges:**
```
(Patient)-[HAS_VITAL]->(VitalReading)
(Patient)-[HAS_CONDITION]->(Disease)
(Patient)-[COMORBID_WITH]->(Disease)
(Patient)-[IN_PROGRESSION]->(ProgressionState)
(ProgressionState)-[OPENS_WINDOW]->(InterventionWindow)
(InterventionWindow)-[ASSIGNED_TO]->(Clinician)
(Patient)-[RECEIVED]->(Intervention)
(Intervention)-[PERFORMED_BY]->(Clinician)
(Patient)-[ON_MEDICATION]->(Medication)
(Patient)-[HAS_SCAN]->(MRIScan)
(Patient)-[SIMILAR_TO]->(Patient)   // populated by clustering, hardcode 1 example for demo per PRD F8's analogue
```

**Core Cypher patterns:**
```cypher
// Full patient context for ML input
MATCH (p:Patient {patient_id: $id})
OPTIONAL MATCH (p)-[:HAS_CONDITION]->(d:Disease)
OPTIONAL MATCH (p)-[:ON_MEDICATION]->(m:Medication)
OPTIONAL MATCH (p)-[:ASSIGNED_TO]->(c:Clinician)
RETURN p, collect(d) as diseases, collect(m) as medications, c

// Find available doctor when assigned doctor is unavailable
MATCH (p:Patient {patient_id: $id})-[:HAS_CONDITION]->(d:Disease)
MATCH (c:Clinician {specialization: d.specialty, is_available: true})
ORDER BY c.current_patient_count ASC
LIMIT 1
RETURN c

// Similar patients who responded to treatment
MATCH (p:Patient {patient_id: $id})-[:SIMILAR_TO]->(similar:Patient)
MATCH (similar)-[:RECEIVED]->(i:Intervention {outcome: 'improved'})
RETURN similar, i
ORDER BY i.performed_at DESC
LIMIT 5
```

## 4. Indexes & Constraints

- `vital_readings(patient_id, timestamp)` — composite index, hot path for trajectory queries.
- `progression_states(patient_id, timestamp DESC)` — latest prediction lookups.
- `users.email` UNIQUE.
- Neo4j: uniqueness constraint on `Patient.patient_id`, `Clinician.clinician_id` — `CREATE CONSTRAINT ON (p:Patient) ASSERT p.patient_id IS UNIQUE;`

## 5. Migrations

- **[HACKATHON]** Use a single `schema.sql` applied via Docker Compose init script rather than a full migration tool (Alembic) — 3 days doesn't justify migration tooling overhead. If the team has bandwidth, Alembic is the production-grade choice (note as ADR if adopted later).

## 6. Data Lifecycle

- `vital_readings`: append-only, never updated. Retained for the session's demo dataset (no retention policy needed for hackathon).
- `progression_states`: append-only snapshot log — powers both the live card and `predictions/history`.
- `interventions.outcome`: null until manually logged (outcome auto-tracking is out of scope, per PRD Section 8).
- Synthetic ontology data (patient demographics, comorbidities, clinicians) is seeded once via a seed script (`seed_data.py` / `seed_data.sql`) — not generated at runtime.
