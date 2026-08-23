# MedIQ — API Specification

Base URL (local dev): `http://localhost:8000/api`
Auth: Bearer JWT in `Authorization` header, unless noted.
Content type: `application/json` unless uploading a file (`multipart/form-data`).

This is the contract the frontend builds against. If you change a shape here, update `03-design-spec.md` component consumers accordingly.

---

## 1. Authentication

### `POST /api/auth/login`
Request:
```json
{ "email": "doctor@mediq.local", "password": "string" }
```
Response `200`:
```json
{ "access_token": "jwt...", "token_type": "bearer", "expires_in": 3600,
  "user": { "id": "uuid", "name": "Dr. Rao", "role": "clinician" } }
```
Errors: `401` `{ "error": "invalid_credentials" }`

### `POST /api/auth/refresh`
Response `200`: same shape as login.

### `POST /api/auth/logout`
Response `204`.

---

## 2. Patients

### `GET /api/patients`
Query params: `?ward=ICU-3&risk_min=65` (optional filters).
Response `200`:
```json
[
  {
    "patient_id": "uuid",
    "name": "Ramesh Yadav",
    "age": 67,
    "sex": "M",
    "ward": "ICU-3",
    "bed_number": "12",
    "conditions": ["Sepsis"],
    "comorbidities": ["Diabetes"],
    "current_risk_score": 72.5,
    "window_open": true,
    "assigned_doctor": "Dr. Rao"
  }
]
```

### `POST /api/patients`
Request:
```json
{ "name": "string", "age": 0, "sex": "M", "blood_type": "O+",
  "admission_date": "2026-08-20T10:00:00Z", "ward": "ICU-3", "bed_number": "12",
  "conditions": ["Sepsis"], "comorbidities": ["Diabetes"] }
```
Response `201`: full patient object (see below).

### `GET /api/patients/{id}`
Response `200`:
```json
{
  "patient_id": "uuid",
  "name": "Ramesh Yadav", "age": 67, "sex": "M", "blood_type": "O+",
  "admission_date": "2026-08-20T10:00:00Z",
  "ward": "ICU-3", "bed_number": "12",
  "conditions": [{ "name": "Sepsis", "icd_code": "A41.9", "type": "critical" }],
  "comorbidities": [{ "name": "Diabetes", "adjustment": { "threshold": 55, "reason": "diabetic_lactate_sensitivity" } }],
  "medications": [{ "name": "Metformin", "dosage": "500mg", "frequency": "BID" }],
  "assigned_doctor": { "clinician_id": "uuid", "name": "Dr. Rao", "is_available": true }
}
```
Errors: `404 { "error": "patient_not_found" }`

### `PUT /api/patients/{id}`
Partial update, same shape as POST body. Response `200`: updated patient.

### `GET /api/patients/{id}/graph`
Ontology graph for React Flow rendering.
Response `200`:
```json
{
  "nodes": [
    { "id": "patient-uuid", "type": "Patient", "label": "Ramesh Yadav" },
    { "id": "disease-uuid", "type": "Disease", "label": "Sepsis" }
  ],
  "edges": [
    { "source": "patient-uuid", "target": "disease-uuid", "relation": "HAS_CONDITION" }
  ]
}
```

---

## 3. Vitals (Sepsis)

### `POST /api/patients/{id}/vitals`
Request:
```json
{
  "timestamp": "2026-08-21T12:00:00Z",
  "heart_rate": 118, "bp_systolic": 96, "bp_diastolic": 60,
  "temperature": 38.9, "respiratory_rate": 24, "spo2": 97,
  "wbc": 15.2, "lactate": 4.2, "creatinine": 1.6, "urine_output": 25.0
}
```
Response `201`: stored reading + `{ "prediction_triggered": true }` if ≥2h of data now exists.

### `GET /api/patients/{id}/vitals`
Query: `?from=...&to=...`
Response `200`: array of readings, same shape as POST body + `reading_id`.

### `GET /api/patients/{id}/vitals/latest`
Response `200`: last 12 hours of readings, ascending by timestamp.

---

## 4. Predictions

### `GET /api/patients/{id}/predictions/sepsis`
Response `200` — **this is the exact shape the Risk Trajectory Card and Intervention Timer consume:**
```json
{
  "risk_score": 72.5,
  "risk_score_change": "+3.2",
  "trajectory": [65, 68, 71, 74, 77, 79],
  "trajectory_confidence_band": { "lower": [60, 62, 64, 66, 68, 70], "upper": [70, 73, 77, 80, 84, 87] },
  "window_open": true,
  "window_closes_at": "2026-08-21T14:30:00Z",
  "hours_remaining": 3.5,
  "urgency": "HIGH",
  "threshold_used": 55,
  "threshold_adjustment_reason": "diabetic_lactate_sensitivity",
  "shap_explanation": [
    { "feature": "Lactate", "value": 4.2, "threshold": 2.0, "impact": "+28 points", "direction": "increase" },
    { "feature": "Heart rate", "value": 118, "threshold": 100, "impact": "+19 points", "direction": "increase" },
    { "feature": "SpO2", "value": 97, "threshold": 95, "impact": "-8 points", "direction": "normal" }
  ],
  "generated_at": "2026-08-21T12:05:00Z"
}
```
Notes:
- `window_closes_at` is `null` when `window_open = false` — frontend must hide the countdown in that case (see `02-UX-flow-spec.md` Section 5).
- `urgency` is one of `LOW | MEDIUM | HIGH | CRITICAL`.
- `shap_explanation` max 5 entries, sorted by absolute impact descending.

Errors: `409 { "error": "insufficient_data", "hours_available": 1.2, "hours_required": 2 }` — frontend renders the insufficient-data state, not a blank chart.

### `GET /api/patients/{id}/predictions/alzheimers` (stretch)
Response `200`:
```json
{
  "stage": "Mild AD",
  "months_to_next_stage": 8,
  "atrophy_rate_mm3_per_year": 420,
  "treatment_effectiveness_score": 0.35,
  "heatmap_url": "/static/heatmaps/scan-uuid.png",
  "generated_at": "2026-08-21T12:05:00Z"
}
```

### `GET /api/patients/{id}/predictions/history`
Response `200`: array of past prediction snapshots (same shape as above entries), for trend/audit view.

---

## 5. MRI Scans (stretch)

### `POST /api/patients/{id}/scans`
`multipart/form-data`: `file`, `scan_date`.
Response `202`:
```json
{ "scan_id": "uuid", "processing_status": "pending" }
```

### `GET /api/patients/{id}/scans`
Response `200`: array of `{ scan_id, scan_date, modality, processing_status }`.

### `GET /api/patients/{id}/scans/{scan_id}`
Response `200`: scan metadata + results once `processing_status = "complete"`.

---

## 6. Intervention Windows

### `GET /api/alerts/active`
Response `200`:
```json
[
  { "window_id": "uuid", "patient_id": "uuid", "patient_name": "Ramesh Yadav",
    "urgency": "CRITICAL", "hours_remaining": 1.2, "window_closes_at": "2026-08-21T14:30:00Z",
    "recommended_action": "Administer broad-spectrum antibiotics; reassess in 1h" }
]
```
Sort: urgency desc, then `hours_remaining` asc (see `02-UX-flow-spec.md`).

### `GET /api/patients/{id}/windows`
Same item shape, scoped to one patient (history included).

### `POST /api/windows/{id}/acknowledge`
Response `200`: `{ "window_id": "uuid", "acknowledged_at": "..." , "acknowledged_by": "clinician_id" }`

---

## 7. Interventions

### `POST /api/patients/{id}/interventions`
Request:
```json
{ "type": "medication_change", "description": "Started IV antibiotics, increased fluids",
  "performed_at": "2026-08-21T13:00:00Z" }
```
Response `201`: created intervention + triggers toast per design spec.

### `PUT /api/interventions/{id}/outcome`
Request: `{ "outcome": "improved" }` (`improved | no_change | deteriorated`)
Response `200`: updated intervention.

### `GET /api/patients/{id}/interventions`
Response `200`: array, most recent first.

---

## 8. Clinicians

### `GET /api/clinicians`
Response `200`: `[{ "clinician_id", "name", "specialization", "is_available", "current_patient_count" }]`

### `PUT /api/clinicians/{id}/availability`
Request: `{ "is_available": false }`
Response `200`: updated clinician.

---

## 9. Analytics **[HACKATHON: optional, only if time remains]**
- `GET /api/analytics/sepsis-outcomes`
- `GET /api/analytics/alzheimers-progression`
- `GET /api/analytics/intervention-efficacy`

Not required for the core demo; skip unless Days 1–2 finish early.

---

## 10. WebSocket Endpoints

### `WS /ws/alerts`
Server pushes on window open/close/escalation:
```json
{ "event": "window_opened", "data": { "...same shape as /api/alerts/active item..." } }
```

### `WS /ws/patients/{id}/vitals`
Server pushes on new vitals ingestion:
```json
{ "event": "vitals_update", "data": { "...same shape as vitals GET item..." } }
```

---

## 11. Error Format (consistent across all endpoints)
```json
{ "error": "machine_readable_code", "message": "human readable string", "details": {} }
```

| Code | HTTP Status | Meaning |
|---|---|---|
| `invalid_credentials` | 401 | login failed |
| `unauthorized` | 401 | missing/expired token |
| `forbidden` | 403 | role not permitted (reserved, not used in prototype's single-role setup) |
| `patient_not_found` | 404 | bad patient id |
| `insufficient_data` | 409 | <2h vitals for prediction |
| `validation_error` | 422 | Pydantic schema failure |
| `rate_limited` | 429 | see below |
| `internal_error` | 500 | unhandled |

## 12. Rate Limits **[HACKATHON: relaxed]**
- Production target (per architecture doc intent): 100 req/min per user on mutating endpoints.
- Hackathon: not enforced, but the API should not crash under demo load — basic FastAPI + Uvicorn default concurrency is sufficient for a single-judge demo session.

## 13. OpenAPI
FastAPI auto-generates OpenAPI/Swagger at `/docs` and `/openapi.json` — use this as the living, testable source of truth; this document is the human-readable contract that must stay in sync with it.
