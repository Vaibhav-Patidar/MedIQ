"""All Cypher lives here, parameterized only ($params) — never string-interpolated
patient input (docs/08-security-spec.md Section 4)."""

# Uniqueness constraints (docs/06-database-spec.md Section 4)
CREATE_PATIENT_CONSTRAINT = (
    "CREATE CONSTRAINT patient_id_unique IF NOT EXISTS "
    "FOR (p:Patient) REQUIRE p.patient_id IS UNIQUE"
)
CREATE_CLINICIAN_CONSTRAINT = (
    "CREATE CONSTRAINT clinician_id_unique IF NOT EXISTS "
    "FOR (c:Clinician) REQUIRE c.clinician_id IS UNIQUE"
)

# Full patient context for ML input (docs/06-database-spec.md Section 3)
PATIENT_CONTEXT = """
MATCH (p:Patient {patient_id: $id})
OPTIONAL MATCH (p)-[:HAS_CONDITION]->(d:Disease)
OPTIONAL MATCH (p)-[:ON_MEDICATION]->(m:Medication)
OPTIONAL MATCH (p)-[:ASSIGNED_TO]->(c:Clinician)
RETURN p, collect(d) as diseases, collect(m) as medications, c
"""

# Find available doctor when assigned doctor is unavailable
FIND_AVAILABLE_CLINICIAN = """
MATCH (p:Patient {patient_id: $id})-[:HAS_CONDITION]->(d:Disease)
MATCH (c:Clinician {specialization: d.specialty, is_available: true})
ORDER BY c.current_patient_count ASC
LIMIT 1
RETURN c
"""

# Similar patients who responded to treatment
SIMILAR_PATIENTS = """
MATCH (p:Patient {patient_id: $id})-[:SIMILAR_TO]->(similar:Patient)
MATCH (similar)-[:RECEIVED]->(i:Intervention {outcome: 'improved'})
RETURN similar, i
ORDER BY i.performed_at DESC
LIMIT 5
"""

# --- Ontology graph for /patients/{id}/graph (React Flow shape) --------------
PATIENT_GRAPH = """
MATCH (p:Patient {patient_id: $id})
OPTIONAL MATCH (p)-[r1:HAS_CONDITION|COMORBID_WITH|ON_MEDICATION|ASSIGNED_TO|HAS_VITAL|HAS_SCAN]->(n1)
OPTIONAL MATCH (p)-[:IN_PROGRESSION]->(ps:ProgressionState)
OPTIONAL MATCH (ps)-[r2:OPENS_WINDOW]->(iw:InterventionWindow)
OPTIONAL MATCH (p)-[r3:RECEIVED]->(i:Intervention)
WITH p,
     collect(DISTINCT {node: n1, rel: type(r1)}) AS direct,
     collect(DISTINCT {node: ps, rel: 'IN_PROGRESSION'}) AS progressions,
     collect(DISTINCT {node: iw, rel: 'OPENS_WINDOW'}) AS windows,
     collect(DISTINCT {node: i, rel: 'RECEIVED'}) AS interventions
OPTIONAL MATCH (p)-[sim:SIMILAR_TO]->(sp:Patient)
RETURN p, direct, progressions, windows, interventions,
       collect({node: sp, rel: 'SIMILAR_TO'}) AS similar
"""

# --- Writes (mirror of the Postgres rows; Neo4j is the traversal layer) ------

MERGE_PATIENT = """
MERGE (p:Patient {patient_id: $patient_id})
SET p.name = $name, p.age = $age, p.sex = $sex, p.ward = $ward,
    p.bed_number = $bed_number, p.blood_type = $blood_type,
    p.admission_date = $admission_date
RETURN p
"""

MERGE_DISEASE_AND_LINK = """
MERGE (d:Disease {name: $name})
ON CREATE SET d.icd_code = $icd_code, d.disease_type = $type, d.specialty = $specialty
WITH d MATCH (p:Patient {patient_id: $patient_id})
MERGE (p)-[r:%s]->(d)
"""

MERGE_MEDICATION_AND_LINK = """
MERGE (m:Medication {medication_id: $medication_id})
SET m.name = $name, m.dosage = $dosage, m.frequency = $frequency
WITH m MATCH (p:Patient {patient_id: $patient_id})
MERGE (p)-[:ON_MEDICATION]->(m)
"""

MERGE_VITAL_READING = """
MATCH (p:Patient {patient_id: $patient_id})
MERGE (v:VitalReading {reading_id: $reading_id})
SET v.timestamp = $timestamp, v.heart_rate = $heart_rate,
    v.bp_systolic = $bp_systolic, v.bp_diastolic = $bp_diastolic,
    v.temperature = $temperature, v.respiratory_rate = $respiratory_rate,
    v.spo2 = $spo2, v.wbc = $wbc, v.lactate = $lactate,
    v.creatinine = $creatinine, v.urine_output = $urine_output
MERGE (p)-[:HAS_VITAL]->(v)
"""

MERGE_PROGRESSION_STATE = """
MATCH (p:Patient {patient_id: $patient_id})
MERGE (ps:ProgressionState {state_id: $state_id})
SET ps.risk_score = $risk_score, ps.window_open = $window_open,
    ps.window_closes_at = $window_closes_at, ps.timestamp = $timestamp
MERGE (p)-[:IN_PROGRESSION]->(ps)
RETURN ps
"""

MERGE_WINDOW_AND_LINK = """
MATCH (ps:ProgressionState {state_id: $state_id})
MERGE (iw:InterventionWindow {window_id: $window_id})
SET iw.urgency = $urgency, iw.opens_at = $opens_at, iw.closes_at = $closes_at,
    iw.recommended_action = $recommended_action
MERGE (ps)-[:OPENS_WINDOW]->(iw)
RETURN iw
"""

ASSIGN_WINDOW_TO_CLINICIAN = """
MATCH (iw:InterventionWindow {window_id: $window_id})
MATCH (c:Clinician {clinician_id: $clinician_id})
MERGE (iw)-[:ASSIGNED_TO]->(c)
RETURN c
"""

MERGE_CLINICIAN = """
MERGE (c:Clinician {clinician_id: $clinician_id})
SET c.name = $name, c.specialization = $specialization,
    c.is_available = $is_available, c.current_patient_count = $current_patient_count
RETURN c
"""

ASSIGN_PATIENT_TO_CLINICIAN = """
MATCH (p:Patient {patient_id: $patient_id})
MATCH (c:Clinician {clinician_id: $clinician_id})
MERGE (p)-[:ASSIGNED_TO]->(c)
RETURN p, c
"""

MERGE_INTERVENTION_AND_LINK = """
MATCH (p:Patient {patient_id: $patient_id})
MERGE (i:Intervention {intervention_id: $intervention_id})
SET i.type = $type, i.description = $description, i.performed_at = $performed_at,
    i.outcome = $outcome
MERGE (p)-[:RECEIVED]->(i)
WITH i
OPTIONAL MATCH (c:Clinician {clinician_id: $clinician_id})
FOREACH (_ IN CASE WHEN c IS NULL THEN [] ELSE [1] END |
  MERGE (i)-[:PERFORMED_BY]->(c)
)
RETURN i
"""

MERGE_SIMILAR_TO = """
MATCH (a:Patient {patient_id: $patient_a})
MATCH (b:Patient {patient_id: $patient_b})
MERGE (a)-[:SIMILAR_TO]->(b)
"""
