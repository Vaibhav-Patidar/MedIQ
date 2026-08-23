# MedIQ — Master System Architecture
## Smart India Hackathon 2026 | Team ByteSlay

---

## Table of Contents

1. [What We Are Building](#1-what-we-are-building)
2. [The Core Insight — Why Ontology Changes Everything](#2-the-core-insight)
3. [Full System Architecture](#3-full-system-architecture)
4. [Layer-by-Layer Breakdown](#4-layer-by-layer-breakdown)
5. [Disease Modules — Sepsis and Alzheimer's](#5-disease-modules)
6. [Data Flow — End to End](#6-data-flow-end-to-end)
7. [Technology Stack](#7-technology-stack)
8. [Database Design](#8-database-design)
9. [API Design](#9-api-design)
10. [ML Model Architecture](#10-ml-model-architecture)
11. [Frontend Architecture](#11-frontend-architecture)
12. [What to Build for SIH Demo](#12-what-to-build-for-sih-demo)
13. [Team Responsibilities](#13-team-responsibilities)
14. [Timeline](#14-timeline)

---

## 1. What We Are Building

MedIQ is a medical intelligence platform that predicts disease progression and detects intervention windows for critical and chronic conditions — starting with Sepsis and Alzheimer's disease.

The difference from a basic ML prediction tool is the addition of a **Medical Ontology Layer** — borrowed from how Palantir Gotham/Foundry works — that turns raw patient data into a connected knowledge graph. This graph gives the ML models far richer context, makes predictions explainable, and routes the right action to the right clinician at the right time.

**In plain terms:** Most hospital AI tools tell you a number. MedIQ tells you what to do about it, why, and who should do it — within the intervention window.

---

## 2. The Core Insight

### Current Flow (Pipeline Approach)
```
Doctor enters data --> Convert to PSV/format --> ML Model --> Prediction score
```

This is a pipeline. It works but it is blind. The model sees numbers, not a patient.

### MedIQ Flow (Ontology-Driven Platform)
```
Doctor enters data --> Patient Object (graph) --> Context-enriched ML input --> Prediction + Action
```

The ontology layer holds the PATIENT as the central object — with all their conditions, medications, history, comorbidities, assigned doctor, and bed — linked together. The ML model reads from this graph, not a flat file.

### What This Unlocks

| Capability | Pipeline Approach | MedIQ Ontology Approach |
|---|---|---|
| Comorbidity awareness | No | Yes — Diabetes adjusts Sepsis dosing |
| Cross-disease patterns | No | Yes — Sepsis accelerates Alzheimer's |
| Intervention routing | No | Yes — Alerts correct available doctor |
| Outcome learning | No | Yes — Tracks what worked, retrains |
| Multi-patient patterns | No | Yes — Links similar patients |
| Explainability | Score only | SHAP + context explanation |

---

## 3. Full System Architecture

```
+------------------------------------------------------------------+
|                        FRONTEND (React)                          |
|   Doctor Dashboard  |  Patient Graph View  |  Alert Center       |
+------------------------------------------------------------------+
                              |
                        REST API / WebSocket
                              |
+------------------------------------------------------------------+
|                     BACKEND (FastAPI)                            |
|   Auth  |  Patient API  |  Prediction API  |  Alert Engine       |
+------------------------------------------------------------------+
                              |
         +--------------------+--------------------+
         |                    |                    |
+----------------+  +------------------+  +------------------+
| ONTOLOGY LAYER |  |   ML LAYER       |  |  ACTION LAYER    |
| (Neo4j Graph)  |  | Sepsis TFT Model |  | Alert Router     |
|                |  | Alzheimer's CNN  |  | Intervention Log |
| Patient        |  | SHAP Explainer   |  | Outcome Tracker  |
| Disease        |  | Window Detector  |  | Feedback Loop    |
| Vitals         |  +------------------+  +------------------+
| Treatment      |
| Doctor         |
| Comorbidity    |
+----------------+
         |
+------------------------------------------------------------------+
|                     DATA LAYER                                   |
|  PostgreSQL (structured) | Neo4j (graph) | MinIO (MRI scans)     |
+------------------------------------------------------------------+
```

---

## 4. Layer-by-Layer Breakdown

### Layer 1 — Data Ingestion Layer

This is where raw clinical data enters the system. Doctors do not deal with file formats. The system handles all transformations internally.

**Inputs accepted:**
- Vital signs entered manually via form (HR, BP, Temp, RR, SpO2, WBC, Lactate, Creatinine)
- MRI scan upload (DICOM or NIfTI format)
- Lab results (manual entry or HL7 FHIR if hospital system supports it)
- Medication history
- Doctor notes (free text, optional)

**What happens:**
- Vitals are validated and timestamped
- Vitals series is assembled into the time-series format the TFT model needs
- MRI scans are preprocessed (skull stripping, registration, normalization)
- All inputs are attached to the central Patient Object in the ontology graph

**Key principle:** The PSV file format your current design uses is an internal artifact. Doctors never see it. The system creates it automatically from the Patient Object before feeding the model.

---

### Layer 2 — Medical Ontology Layer

This is the core differentiator. It is a property graph stored in Neo4j. Think of it as a living knowledge map of every patient, their conditions, their history, and their relationships to other entities in the hospital.

**Objects (Nodes) in the Graph:**

```
Patient
  - patient_id
  - name, age, sex
  - blood_type
  - admission_date
  - current_ward, bed_number

VitalReading
  - timestamp
  - HR, BP_systolic, BP_diastolic
  - temperature, RR, SpO2
  - WBC, lactate, creatinine

Disease
  - disease_id
  - name (Sepsis, Alzheimer's, Diabetes, etc.)
  - icd_code
  - disease_type (critical / chronic)

ProgressionState
  - timestamp
  - stage
  - risk_score
  - confidence
  - predicted_trajectory

InterventionWindow
  - window_id
  - opens_at, closes_at
  - urgency_level (LOW / MEDIUM / HIGH / CRITICAL)
  - recommended_action

Intervention
  - intervention_id
  - type (medication, procedure, dosage change)
  - performed_at
  - performed_by
  - outcome_recorded

Clinician
  - clinician_id
  - name, specialization
  - current_availability
  - current_patient_load

MRIScan
  - scan_id
  - scan_date
  - modality
  - file_path
  - preprocessed_path

Medication
  - medication_id
  - name, dosage, frequency
  - started_at, stopped_at
```

**Relationships (Edges) in the Graph:**

```
(Patient)-[HAS_VITAL]->(VitalReading)
(Patient)-[HAS_CONDITION]->(Disease)
(Patient)-[IN_PROGRESSION]->(ProgressionState)
(ProgressionState)-[OPENS_WINDOW]->(InterventionWindow)
(InterventionWindow)-[ASSIGNED_TO]->(Clinician)
(Patient)-[RECEIVED]->(Intervention)
(Intervention)-[PERFORMED_BY]->(Clinician)
(Patient)-[ON_MEDICATION]->(Medication)
(Patient)-[HAS_SCAN]->(MRIScan)
(Patient)-[COMORBID_WITH]->(Disease)
(Patient)-[SIMILAR_TO]->(Patient)  // populated by ML clustering
```

**Why this matters:** When the Sepsis model runs, it does not just get a flat array of numbers. It gets the full patient context: "67-year-old male, diabetic, currently on Metformin and Lisinopril, admitted 14 hours ago, assigned doctor currently unavailable." The model and the action layer both use this context.

---

### Layer 3 — ML Intelligence Layer

Two disease-specific models, both feeding from and writing back to the ontology.

#### Sepsis Model (Temporal Fusion Transformer)

The TFT is chosen because sepsis is a time-series problem. The patient's vitals over the last 2+ hours are a sequence, and the model learns temporal patterns — not just the current snapshot.

**Input features (per timestep):**
- HR, BP systolic, BP diastolic, temperature, RR, SpO2, WBC, lactate, creatinine, urine output

**Static context (from ontology):**
- Age, sex, comorbidities, current medications, hours since admission

**Outputs:**
- Sepsis risk score (0-100) for current moment
- Predicted trajectory for next 6 hours (hourly risk scores)
- Intervention window: open/closed, time remaining if open
- SHAP feature attribution: which vitals are driving the score

**Intervention window detection logic:**
The window is defined as the period where the risk score is above threshold AND the rate of rise is within a range where intervention is still effective. The model outputs window_open=True/False and hours_remaining. This is the core clinical insight — acting too early is wasteful, acting too late is fatal.

#### Alzheimer's Model (CNN + Longitudinal Tracker)

Alzheimer's is a spatial + longitudinal problem. Single MRI scans matter less than the change between scans over months or years.

**Input:**
- Preprocessed MRI volumes (skull-stripped, registered to MNI template)
- Multiple timepoints — the model expects at least 2 scans for progression detection

**Processing pipeline:**
- 3D CNN extracts hippocampal volume, cortical thickness, white matter changes
- Longitudinal comparison quantifies rate of atrophy between timepoints
- Treatment response module: if patient is on medication, computes whether atrophy rate changed after treatment started

**Outputs:**
- Current Alzheimer's stage (MCI / Mild / Moderate / Severe)
- Projected progression timeline (months to next stage)
- Treatment effectiveness score (positive = treatment is slowing decline)
- Brain region heatmap showing where atrophy is concentrated

---

### Layer 4 — Action Layer

Predictions are useless if they do not reach the right person in time. The action layer closes this gap.

**Alert Router:**
- When an intervention window opens, the system checks the assigned doctor's availability (pulled from the ontology — Clinician node)
- If unavailable, it escalates to the next available specialist of the correct type
- Alerts are sent via in-app notification, and optionally SMS/email
- Alert contains: patient name, condition, risk score, window time remaining, recommended action, SHAP explanation

**Intervention Logger:**
- Doctor receives alert and logs what action they took
- This creates an Intervention node in the ontology, linked to the patient
- Over time this builds a dataset of: what interventions were performed and what the outcome was

**Outcome Tracker:**
- 24-48 hours after an intervention, the system checks whether vitals improved
- This outcome is written back to the Intervention node
- Aggregated across all patients, this feeds the model retraining pipeline

**Feedback Loop:**
- Monthly retraining: the model is retrained on real cases where outcomes are known
- The ontology's SIMILAR_TO edges are recomputed to surface new patient clusters

---

## 5. Disease Modules

### Sepsis Module — Full Flow

```
STEP 1: Data Entry
Doctor opens Sepsis monitoring screen.
Enters vitals every 30-60 minutes for the patient.
System automatically assembles the time-series.

STEP 2: Ontology Update
Each vital entry creates a new VitalReading node.
VitalReading is linked to Patient via HAS_VITAL edge.
Patient's comorbidities and medications are already in the graph.

STEP 3: ML Inference
When 2+ hours of vitals exist, the TFT model runs.
Input: time-series from VitalReading nodes + static context from Patient node.
The PSV conversion happens internally here — doctors never see it.
Output: risk score, 6-hour trajectory, intervention window status, SHAP values.

STEP 4: Ontology Write-back
A new ProgressionState node is created with the output.
If window is open, an InterventionWindow node is created.
Urgency is computed from window duration and risk score.

STEP 5: Action
Alert is routed to assigned doctor (or next available if busy).
Alert shows: risk score, trajectory graph, time remaining, SHAP explanation.
Doctor logs action. Intervention node is created.

STEP 6: Outcome
System monitors next 12-24 hours of vitals.
If vitals improve: intervention marked effective.
This data point joins the retraining pool.
```

**Comorbidity adjustments the ontology enables:**
- Diabetic patients: lactate threshold adjusted, antibiotic dosing flagged for review
- Elderly patients (>65): lower threshold for window opening
- Immunocompromised: faster escalation to CRITICAL urgency

---

### Alzheimer's Module — Full Flow

```
STEP 1: MRI Upload
Doctor uploads MRI scan for patient.
System accepts DICOM or NIfTI.
Scan is linked to Patient via HAS_SCAN edge.
Date of scan is recorded.

STEP 2: Preprocessing Pipeline
Skull stripping (FSL BET or DeepBET)
Registration to MNI152 standard template
Intensity normalization
If multiple scans exist: longitudinal registration between timepoints

STEP 3: ML Inference
3D CNN extracts volumetric features per region.
Hippocampal volume, entorhinal cortex thickness, ventricular volume are key markers.
If 2+ scans: longitudinal model computes atrophy rate.
If medication was started between scans: treatment response is computed.

STEP 4: Output
Current stage classification.
Projected months to next stage.
Treatment effectiveness score.
Brain region heatmap (which areas are deteriorating fastest).

STEP 5: Ontology Write-back
ProgressionState node created with stage and trajectory.
If progression is faster than expected: InterventionWindow opens.
Intervention here could mean: medication change, caregiver escalation, specialist referral.

STEP 6: Contextual Enrichment (ontology advantage)
System checks if patient lives alone (caregiver node in graph).
If yes: social care alert is added alongside clinical alert.
System checks if similar patients in the database responded to a particular treatment.
This population-level insight is shown to the doctor.
```

---

## 6. Data Flow — End to End

### Sepsis Data Flow

```
[Doctor UI]
     |
     | POST /api/vitals {patient_id, HR, BP, Temp, RR, SpO2, WBC, lactate, creatinine, timestamp}
     v
[FastAPI Backend]
     |
     | 1. Validate and store VitalReading in PostgreSQL
     | 2. Create VitalReading node in Neo4j, link to Patient
     | 3. Check if 2+ hours of readings exist
     |    If yes: trigger inference job
     v
[ML Service (Python, separate microservice)]
     |
     | 1. Query Neo4j for all VitalReadings for this patient (last 12 hours)
     | 2. Query Patient node for static features (age, sex, comorbidities, medications)
     | 3. Assemble TFT input tensor
     | 4. Run inference
     | 5. Run SHAP explainer
     | 6. Compute intervention window
     v
[Ontology Write-back]
     |
     | Create ProgressionState node
     | Create InterventionWindow node if window is open
     v
[Action Layer]
     |
     | Query Clinician node for patient's assigned doctor
     | Check availability
     | Route alert
     v
[Doctor receives alert on dashboard / SMS]
     |
     | Doctor logs action
     v
[Intervention node created in Neo4j]
```

### Alzheimer's Data Flow

```
[Doctor UI]
     |
     | POST /api/scans {patient_id, file: MRI_scan.dcm, scan_date}
     v
[FastAPI Backend]
     |
     | 1. Store raw scan in MinIO (object storage)
     | 2. Create MRIScan node in Neo4j
     | 3. Trigger preprocessing job
     v
[Preprocessing Service]
     |
     | 1. Skull stripping
     | 2. MNI registration
     | 3. Normalization
     | 4. Store preprocessed volume in MinIO
     | 5. If multiple scans exist: longitudinal registration
     v
[ML Service]
     |
     | 1. Load preprocessed volume(s) from MinIO
     | 2. Run 3D CNN for feature extraction
     | 3. Run longitudinal model if 2+ scans
     | 4. Run treatment response module if medication started between scans
     | 5. Generate brain region heatmap (Grad-CAM)
     v
[Ontology Write-back + Action Layer]
     |
     | Same as Sepsis: ProgressionState, InterventionWindow, Alert routing
```

---

## 7. Technology Stack

### Backend

| Component | Technology | Why |
|---|---|---|
| API Framework | FastAPI (Python) | Fast, async, automatic docs, ML-friendly |
| ML Runtime | PyTorch + HuggingFace | TFT and CNN models |
| Graph Database | Neo4j | Native property graph, Cypher queries |
| Relational DB | PostgreSQL | Structured patient records, audit logs |
| Object Storage | MinIO | MRI scan storage, self-hosted S3-compatible |
| Task Queue | Celery + Redis | Async ML jobs, alert dispatch |
| Containerization | Docker + Docker Compose | Reproducible deployments |

### ML/Data Science

| Component | Technology | Why |
|---|---|---|
| Sepsis Model | Temporal Fusion Transformer (PyTorch Forecasting) | Best-in-class multi-horizon time-series |
| Alzheimer's Model | 3D ResNet / DenseNet (MONAI framework) | Medical imaging standard library |
| Explainability | SHAP (shap library) | Per-feature attribution, clinician-friendly |
| Preprocessing | FSL / ANTs / nibabel | MRI preprocessing standard tools |
| Data Validation | Pydantic | Schema enforcement on all inputs |

### Frontend

| Component | Technology | Why |
|---|---|---|
| Framework | React + TypeScript | Component reuse, type safety |
| State Management | Zustand | Lightweight, no Redux boilerplate |
| Charts | Recharts + D3 | Trajectory graphs, heatmaps |
| Graph Visualization | React Flow | Ontology patient graph view |
| UI Components | Tailwind CSS + Radix UI | Fast, accessible components |
| Real-time | WebSockets (FastAPI native) | Live vitals and alerts |

### Infrastructure

| Component | Technology | Why |
|---|---|---|
| Reverse Proxy | Nginx | SSL termination, routing |
| Orchestration | Docker Compose (dev) / K8s (prod) | Scalable deployment |
| Monitoring | Prometheus + Grafana | System health, model performance |
| CI/CD | GitHub Actions | Automated testing and deployment |

---

## 8. Database Design

### PostgreSQL Schema (Structured Data)

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
    patient_id UUID REFERENCES patients(patient_id),
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

-- Disease records
CREATE TABLE patient_diseases (
    record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(patient_id),
    disease_name VARCHAR(255) NOT NULL,
    icd_code VARCHAR(20),
    disease_type VARCHAR(20),  -- 'critical' or 'chronic'
    diagnosed_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE
);

-- ML prediction results
CREATE TABLE progression_states (
    state_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(patient_id),
    disease_name VARCHAR(255) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    risk_score DECIMAL(5,2),
    stage VARCHAR(100),
    confidence DECIMAL(4,3),
    trajectory JSONB,  -- array of hourly predictions
    shap_values JSONB, -- feature attributions
    window_open BOOLEAN DEFAULT FALSE,
    window_closes_at TIMESTAMPTZ
);

-- Intervention records
CREATE TABLE interventions (
    intervention_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(patient_id),
    clinician_id UUID,
    progression_state_id UUID REFERENCES progression_states(state_id),
    intervention_type VARCHAR(255),
    description TEXT,
    performed_at TIMESTAMPTZ,
    outcome VARCHAR(50),   -- 'improved', 'no_change', 'deteriorated'
    outcome_recorded_at TIMESTAMPTZ
);

-- MRI scans
CREATE TABLE mri_scans (
    scan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(patient_id),
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
```

### Neo4j Graph Schema (Ontology)

The relational database holds the structured data. Neo4j holds the relationships and is used for:
- Querying the full patient context in a single graph traversal
- Finding similar patients (SIMILAR_TO edges)
- Alert routing (traversing Clinician availability)
- Cross-disease pattern detection

**Core Cypher patterns used by the system:**

```cypher
// Get full patient context for ML input
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

// Find similar patients who responded to treatment
MATCH (p:Patient {patient_id: $id})-[:SIMILAR_TO]->(similar:Patient)
MATCH (similar)-[:RECEIVED]->(i:Intervention {outcome: 'improved'})
RETURN similar, i
ORDER BY i.performed_at DESC
LIMIT 5
```

---

## 9. API Design

### Core Endpoints

```
Authentication
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout

Patients
GET    /api/patients                        -- list all patients
POST   /api/patients                        -- create new patient
GET    /api/patients/{id}                   -- get patient with ontology context
PUT    /api/patients/{id}                   -- update patient
GET    /api/patients/{id}/graph             -- get patient's ontology graph (for UI)

Vitals (Sepsis)
POST   /api/patients/{id}/vitals            -- add vital reading
GET    /api/patients/{id}/vitals            -- get vitals history
GET    /api/patients/{id}/vitals/latest     -- get last 12 hours

MRI Scans (Alzheimer's)
POST   /api/patients/{id}/scans             -- upload MRI scan
GET    /api/patients/{id}/scans             -- list scans
GET    /api/patients/{id}/scans/{scan_id}   -- get scan with results

Predictions
GET    /api/patients/{id}/predictions/sepsis          -- latest sepsis prediction
GET    /api/patients/{id}/predictions/alzheimers      -- latest Alzheimer's prediction
GET    /api/patients/{id}/predictions/history         -- all prediction history

Intervention Windows
GET    /api/alerts/active                   -- all open intervention windows (hospital-wide)
GET    /api/patients/{id}/windows           -- windows for specific patient
POST   /api/windows/{id}/acknowledge        -- doctor acknowledges alert

Interventions
POST   /api/patients/{id}/interventions     -- log an intervention
PUT    /api/interventions/{id}/outcome      -- record outcome
GET    /api/patients/{id}/interventions     -- history

Clinicians
GET    /api/clinicians                      -- list clinicians with availability
PUT    /api/clinicians/{id}/availability    -- update availability status

Analytics (for hospital-level view)
GET    /api/analytics/sepsis-outcomes       -- aggregate outcomes data
GET    /api/analytics/alzheimers-progression -- population-level trends
GET    /api/analytics/intervention-efficacy  -- which interventions work best
```

### WebSocket Endpoints

```
WS /ws/alerts                    -- real-time alert stream for doctor's dashboard
WS /ws/patients/{id}/vitals      -- real-time vitals stream for patient monitoring
```

---

## 10. ML Model Architecture

### Sepsis Model — Temporal Fusion Transformer

```
Input Shape: (batch_size, sequence_length, num_features)
             sequence_length = variable (up to 24 hours of readings)
             num_features = 10 vital signs

Static Context:
  - age (normalized)
  - sex (binary)
  - comorbidity flags (diabetes, hypertension, immunocompromised, etc.)
  - hours since admission

TFT Architecture:
  1. Variable Selection Network — learns which vitals matter most
  2. LSTM Encoder — processes historical sequence
  3. LSTM Decoder — generates future sequence
  4. Temporal Self-Attention — captures long-range dependencies
  5. Quantile Outputs — produces prediction intervals, not just point estimates

Outputs:
  - risk_score[t]        : risk at current timestep
  - risk_score[t+1..t+6] : predicted risk for next 6 hours (with confidence bands)
  - window_open          : boolean
  - window_hours_left    : float

Training Data:
  - PhysioNet/CinC Challenge 2019 dataset (Reyna et al.)
  - 40,000+ ICU patient records
  - Sepsis labels with timestamped onset

Threshold Calibration:
  - Default alert threshold: risk_score > 65
  - Adjusted per patient: diabetic patients alert at > 55
  - Elderly patients (>65 years): alert at > 60
```

### Alzheimer's Model — 3D CNN + Longitudinal Network

```
Input: 3D MRI Volume (shape: 1 x 182 x 218 x 182 after MNI registration)

Stage 1 — Feature Extraction (3D ResNet-18, MONAI implementation):
  - Input: single preprocessed MRI volume
  - Output: feature vector of size 512
  - Key regions: hippocampus, entorhinal cortex, amygdala, lateral ventricles

Stage 2 — Segmentation (optional, for visualization):
  - 3D U-Net for ROI segmentation
  - Produces brain region mask used for heatmap generation
  - Grad-CAM applied to highlight atrophy regions

Stage 3 — Longitudinal Comparison (when 2+ scans available):
  - Input: feature vectors from all timepoints
  - Siamese-style network computes delta between timepoints
  - Output: atrophy_rate (mm3/year for hippocampal volume)
  - Normalized against age-matched healthy controls

Stage 4 — Classification Head:
  - MCI / Mild AD / Moderate AD / Severe AD
  - Months to next stage (regression output)

Stage 5 — Treatment Response Module:
  - Input: atrophy_rate_before and atrophy_rate_after medication start
  - Output: treatment_effectiveness_score (-1 to +1)
  - Positive = treatment is slowing atrophy
  - Negative = treatment not helping, flag for review

Training Data:
  - ADNI (Alzheimer's Disease Neuroimaging Initiative) dataset
  - 2,000+ subjects, longitudinal scans over 2-10 years
```

### SHAP Explainability Layer

Both models produce SHAP values that are displayed to clinicians.

```python
# For Sepsis TFT model
explainer = shap.DeepExplainer(model, background_data)
shap_values = explainer.shap_values(patient_input)

# Output presented to doctor:
# "High risk primarily driven by:
#  1. Lactate: 4.2 mmol/L (expected < 2.0)  [+28 points]
#  2. Heart rate: 118 bpm (elevated, rising)  [+19 points]
#  3. Temperature: 38.9 C (elevated)          [+12 points]
#  Protective: SpO2 normal at 97%             [-8 points]"
```

---

## 11. Frontend Architecture

### Screen Structure

```
App
├── Auth
│   └── Login Screen
├── Dashboard (default view for doctor)
│   ├── Active Alerts Panel (real-time, WebSocket)
│   ├── Patient List with risk indicators
│   └── Quick Stats (hospital-wide)
├── Patient Detail View
│   ├── Patient Header (name, age, conditions, assigned doctor)
│   ├── Vitals Timeline (Sepsis patients)
│   │   ├── Real-time vitals graph
│   │   ├── Risk score trajectory
│   │   ├── Intervention window countdown
│   │   └── SHAP explanation card
│   ├── MRI Progression View (Alzheimer's patients)
│   │   ├── Brain heatmap (current scan)
│   │   ├── Longitudinal atrophy chart
│   │   ├── Stage timeline
│   │   └── Treatment effectiveness gauge
│   ├── Ontology Graph View (the Palantir-inspired view)
│   │   ├── Patient node at center
│   │   ├── Connected: Diseases, Medications, Interventions, Clinicians
│   │   └── Click any node to expand its connections
│   └── Intervention History
└── Alert Center
    ├── All open intervention windows
    ├── Acknowledged alerts
    └── Outcome logging form
```

### Key UI Components

**Risk Trajectory Card (Sepsis)**
Shows the current risk score as a large number with color coding (green/amber/red), plus a sparkline showing the 6-hour predicted trajectory. Below it, a horizontal bar chart showing which vitals are driving the score (SHAP values).

**Intervention Window Timer**
A prominent countdown display that appears when a window is open. Shows hours:minutes remaining, urgency level, and the recommended action. Designed to be unmissable.

**Brain Heatmap (Alzheimer's)**
Coronal/axial/sagittal views of the MRI with colored overlay showing atrophy intensity. Slider to compare current scan against previous scan from any timepoint.

**Ontology Graph (Patient Graph View)**
Interactive graph using React Flow. The patient is the central node. Concentric rings: conditions (inner), medications and vitals (middle), clinicians and interventions (outer). Color-coded by type. Click any node for detail panel.

---

## 12. What to Build for SIH Demo

The full system described here is production-grade. For the hackathon demo, build a working vertical slice that demonstrates the core innovation. Here is the prioritized build list:

### Must Build (Core Demo — 3 weeks)

**1. Patient Ontology Object**
A patient record that holds vitals, conditions, medications, and assigned doctor as connected data — not separate forms.

**2. Sepsis Prediction Flow**
Doctor enters vitals, system runs TFT model (can use pre-trained PhysioNet model), shows risk score + 6-hour trajectory + SHAP explanation.

**3. Intervention Window Detection**
When risk crosses threshold and rate of rise is detected, a countdown timer appears. Routes alert to correct available doctor.

**4. One Comorbidity Adjustment**
Show that a diabetic patient gets a different threshold. This is the ontology payoff — one concrete example of context changing the prediction.

**5. Alzheimer's Progression View**
Upload two MRI scans. Show stage classification, atrophy rate between scans, treatment effectiveness score.

### Good to Have (If Time Permits)

**6. Ontology Graph Visualization**
The patient graph view in React Flow. Visually impressive for judges and shows the architecture clearly.

**7. Outcome Logging**
Doctor logs what intervention they took. System stores it. Shows the feedback loop even if retraining is not implemented.

**8. Population-Level Insight**
"3 similar patients with this profile responded well to X intervention." Hardcode one example if needed — the concept is the point.

### Do Not Attempt for Demo

- Full model retraining pipeline
- HL7 FHIR integration
- Kubernetes deployment
- Multi-hospital support

---

## 13. Team Responsibilities

| Member | Primary Responsibility | Secondary |
|---|---|---|
| Bhumika Jain | Frontend (React, Dashboard, Charts) | UI/UX design |
| Vaibhav Patidar | ML Models (TFT Sepsis model) | Data pipeline |
| Anirudh Tandon | Backend (FastAPI, API design) | Auth, WebSockets |
| Aryan Sharma | ML Models (Alzheimer's CNN, MONAI) | SHAP explainability |
| Parth Agarwal | Database (PostgreSQL + Neo4j) | Ontology design |
| Kamal Kumar Kasaudhan | DevOps (Docker, deployment) | Alert system, integration |

---

## 14. Timeline

### Week 1 — Foundation
- Set up project repository, Docker Compose environment
- PostgreSQL schema created and migrated
- Neo4j instance running with basic patient graph schema
- FastAPI project structure with auth and patient CRUD endpoints
- React app scaffolded with routing and component structure
- ML environments set up, datasets downloaded (PhysioNet, ADNI subset)

### Week 2 — Core Features
- Sepsis vital entry form and API working end to end
- TFT model integrated (can use pre-trained weights initially)
- Risk score and trajectory displayed in frontend
- SHAP values computed and displayed
- MRI upload and preprocessing pipeline working
- Alzheimer's CNN producing stage classification

### Week 3 — Integration and Polish
- Intervention window detection logic implemented
- Alert routing through ontology (doctor availability check)
- Comorbidity adjustment for diabetic patients demonstrated
- Ontology graph visualization built in React Flow
- End-to-end demo flow rehearsed and polished
- Presentation slide deck aligned with this architecture document

---

## References

- Reyna, M. et al. Early Prediction of Sepsis from Clinical Data: The PhysioNet Challenge 2019. Critical Care Medicine (2020).
- Lim, B. et al. Temporal Fusion Transformers for Interpretable Multi-horizon Time Series Forecasting. International Journal of Forecasting (2021).
- Lundberg, S. and Lee, S. A Unified Approach to Interpreting Model Predictions (SHAP). NeurIPS (2017).
- Jack, C. et al. The Alzheimer's Disease Neuroimaging Initiative (ADNI): MRI methods. Journal of Magnetic Resonance Imaging (2008).
- MONAI Consortium. MONAI: Medical Open Network for AI. GitHub (2020).
- Palantir Technologies. Palantir Foundry Platform Documentation. palantir.com (2023).

---

*MedIQ — Team ByteSlay — Smart India Hackathon 2026*
