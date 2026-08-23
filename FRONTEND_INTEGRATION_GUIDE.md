# MedIQ — Full Project Overview & Frontend Integration Guide

**Everything a frontend agent needs to integrate with the MedIQ backend.**
Self-contained: architecture, auth, every endpoint with real request/response
JSON, WebSocket events, domain rules, demo dataset, and edge-case rules.
Backend spec source: `docs/05-api-spec.md` (implemented exactly).

---

## 1. What MedIQ is

An ontology-driven **sepsis early-warning system** (Smart India Hackathon 2026,
Team ByteSlay). ICU vitals stream in → once ≥2h of history exists the trained
model produces a 0–100 risk score + 6-hour trajectory → when risk crosses the
patient's **ontology-adjusted threshold** an intervention window opens with a
countdown → SHAP explains which vitals drive it → doctors log interventions.
The killer demo: a diabetic patient alerts at risk >55 while a non-diabetic at
the same score stays silent (default 65).

## 2. Final architecture

```
┌─────────────────────────── React + TS (Vite, :5173) ───────────────────────────┐
│  Login · Dashboard · PatientDetail(tabs) · AlertCenter · OntologyGraph(stretch) │
└───────────────┬─────────────────────────────────────────────┬──────────────────┘
                │ REST  /api/*  (Bearer JWT)                  │ WS /ws/*
                ▼                                             ▼
┌─────────────────────────── FastAPI (:8000) ────────────────────────────────────┐
│ api/      auth · patients · vitals · predictions · alerts · interventions ·    │
│           clinicians · scans · analytics · health · ws                         │
│ services/ prediction pipeline · alert routing/escalation                       │
│ ml/       ★trained XGBoost model (risk = P(sepsis)·100) · TreeSHAP explain ·   │
│           threshold calibration · window detection · surrogate fallback        │
│ ontology/ Neo4j traversals  ⇄  postgres_fk fallback (identical /graph JSON)    │
│ core/     JWT+Supabase auth · error envelope · WS manager · structured logs    │
└──────┬──────────────────────┬───────────────────────────────┬──────────────────┘
       ▼                      ▼                               ▼
 PostgreSQL          Neo4j (docker :7474/:7687)     trained model bundle
 (source of truth;   ontology graph traversal       checkpoints/sepsis_xgboost.pkl
 Supabase optional)                                 + model_config.json
```

**Key facts**
- All inference is **synchronous** (background task on vitals POST) — no job queue. POST responds instantly; the snapshot appears ~instantly after.
- `GET /predictions/sepsis` recomputes fresh but keeps an already-running countdown stable (server-owned `window_closes_at`).
- Trained model: XGBClassifier over trailing mean/std of 7 vitals (HR, O2Sat, Temp, SBP, MAP, DBP, Resp), AUROC ≈0.70, decision threshold 0.599. Falls back to a deterministic surrogate if the bundle is missing.
- Auth is dual-mode: **local JWT** (default, offline) or **Supabase** hosted auth when `SUPABASE_URL` is set in backend `.env` — the frontend code path is identical either way except `/refresh`.

## 3. Running the stack

```bash
cp .env.example .env        # fill JWT_SECRET etc. — see WHERE_TO_FIND_ENV_VALUES.md
docker compose up --build
docker compose exec backend python seed_data.py     # demo data + live predictions
```

| URL | Purpose |
|---|---|
| http://localhost:8000/docs | Swagger UI |
| http://localhost:8000/api/health | `{status, postgres, neo4j}` |
| http://localhost:7474 | Neo4j browser |

CORS is already open for `http://localhost:5173` (+127.0.0.1). Suggested Vite env:
```
VITE_API_BASE_URL=http://localhost:8000/api
VITE_WS_BASE_URL=ws://localhost:8000/ws
```

## 4. Auth contract

All `/api/*` routes except `GET /api/health` require `Authorization: Bearer <token>`.

### `POST /api/auth/login`
```json
// request
{ "email": "doctor@mediq.local", "password": "mediq-demo" }
// 200
{
  "access_token": "<jwt>",
  "token_type": "bearer",
  "expires_in": 3600,
  "refresh_token": null,            // string ONLY when backend runs Supabase mode
  "user": { "id": "uuid", "name": "Dr. Rao", "role": "clinician" }
}
// 401 → { "error": "invalid_credentials", ... }
```

### `POST /api/auth/refresh`
- Local mode: no body needed; requires Bearer token; returns a fresh TokenResponse.
- Supabase mode: body `{ "refresh_token": "<string>" }`; returns new pair.

### `POST /api/auth/logout` → `204` (stateless; client discards token)

### WebSocket auth
Connect with `ws://localhost:8000/ws/alerts?token=<jwt>` (or send subprotocol
`["bearer","<jwt>"]`). Invalid/expired ⇒ server closes with code **4401**.

## 5. Error envelope (every failure)

```json
{ "error": "machine_readable_code", "message": "human readable", "details": {} }
```

| Code | HTTP | When |
|---|---|---|
| `invalid_credentials` | 401 | bad login |
| `unauthorized` | 401 | missing/expired token |
| `forbidden` | 403 | reserved (single role today) |
| `patient_not_found` | 404 | bad patient id |
| `not_found` | 404 | other missing resources |
| `insufficient_data` | 409 | <2h vitals — see §7 |
| `validation_error` | 422 | Pydantic failure (`details` = array of `{loc,msg,type}`) |
| `internal_error` | 500 | unhandled (traceback never leaks) |

The 409 additionally carries flat `hours_available` / `hours_required` on the body.

## 6. Endpoints reference (real shapes from the running API)

### Patients

**`GET /api/patients?ward=ICU-3&risk_min=65`** (both filters optional)
```json
[{
  "patient_id": "uuid", "name": "Ramesh Yadav", "age": 67, "sex": "M",
  "ward": "ICU-3", "bed_number": "12",
  "conditions": ["Sepsis"],              // strings on LIST…
  "comorbidities": ["Diabetes"],
  "current_risk_score": 75.6,            // null if never predicted
  "window_open": false,
  "assigned_doctor": "Dr. Rao"           // string or null
}]
```

**`GET /api/patients/{id}`** (detail — objects here!)
```json
{
  "patient_id": "uuid", "name": "Ramesh Yadav", "age": 67, "sex": "M",
  "blood_type": "B+", "admission_date": "2026-08-21T14:04:51Z",
  "ward": "ICU-3", "bed_number": "12",
  "conditions": [{ "name": "Sepsis", "icd_code": "A41.9", "type": "critical" }],
  "comorbidities": [{
    "name": "Diabetes",
    "adjustment": { "threshold": 55, "reason": "diabetic_lactate_sensitivity" }
  }],
  "medications": [{ "name": "Metformin", "dosage": "500mg", "frequency": "BID" }],
  "assigned_doctor": { "clinician_id": "uuid", "name": "Dr. Rao", "is_available": true }
}
```
> `comorbidities[].adjustment` is `null` unless an override exists — that's your
> PRD-F4 pill: `"Threshold adjusted: Diabetic — alert at {threshold}"`.

**`POST /api/patients`** → 201, same shape as detail. Body:
```json
{ "name": "...", "age": 60, "sex": "M", "blood_type": "O+",
  "admission_date": "2026-08-23T10:00:00Z", "ward": "ICU-3", "bed_number": "12",
  "conditions": [{ "name": "Sepsis", "icd_code": "A41.9", "type": "critical" }],
  "comorbidities": [{ "name": "Diabetes", "threshold_adjustment": 55,
                      "adjustment_reason": "diabetic_lactate_sensitivity" }],
  "medications": [{ "name": "...", "dosage": "500mg", "frequency": "BID" }] }
```
**`PUT /api/patients/{id}`** — same body (replaces conditions/comorbidities/medications). → 200 detail.

**`GET /api/patients/{id}/graph`** — React Flow ready:
```json
{ "nodes": [ { "id": "015c…", "type": "Patient", "label": "Ramesh Yadav" },
             { "id": "Sepsis", "type": "Disease", "label": "Sepsis" } ],
  "edges": [ { "source": "015c…", "target": "Sepsis", "relation": "HAS_CONDITION" } ] }
```
Node types: `Patient, Disease, Clinician, Medication, VitalReading,
ProgressionState, InterventionWindow, Intervention`. Relations: `HAS_CONDITION,
COMORBID_WITH, ON_MEDICATION, ASSIGNED_TO, IN_PROGRESSION, OPENS_WINDOW,
RECEIVED, PERFORMED_BY, HAS_VITAL, SIMILAR_TO`. (Identical JSON whether the
backend serves Neo4j or its Postgres fallback.)

### Vitals

**`POST /api/patients/{id}/vitals`**
```json
{ "timestamp": "2026-08-23T12:00:00Z",
  "heart_rate": 118, "bp_systolic": 96, "bp_diastolic": 60,
  "temperature": 38.9, "respiratory_rate": 24, "spo2": 97,
  "wbc": 15.2, "lactate": 4.2, "creatinine": 1.6, "urine_output": 25.0 }
```
→ `201` stored reading + `reading_id` + `"prediction_triggered": bool`.
Bounds enforced (else 422): HR 0–300 · SBP 0–300 · DBP 0–200 · Temp 25–45 ·
RR 0–80 · SpO2 0–100 · WBC 0–200 · Lactate 0–30 · Creatinine 0–30 · Urine 0–2000.

**`GET /api/patients/{id}/vitals?from=<ISO>&to=<ISO>`** → array of readings
(each has `reading_id`), ascending by timestamp.
**`GET /api/patients/{id}/vitals/latest`** → last 12 hours, ascending.

### Predictions

**`GET /api/patients/{id}/predictions/sepsis`** ← *the Risk Trajectory Card*
```json
{
  "risk_score": 75.6,
  "risk_score_change": "-0.0",             // signed string; null on first-ever prediction
  "trajectory": [75.6, 83.6, 91.6, 99.6, 100.0, 100.0],
  "trajectory_confidence_band": {
    "lower": [71.6, 78.1, 84.6, 91.1, 90.0, 88.5],
    "upper": [79.6, 89.1, 98.6, 100.0, 100.0, 100.0]
  },
  "window_open": true,
  "window_closes_at": "2026-08-23T20:54:08.022081+00:00",  // NULL when closed!
  "hours_remaining": 6.0,                                   // NULL when closed
  "urgency": "HIGH",
  "threshold_used": 55,
  "threshold_adjustment_reason": "diabetic_lactate_sensitivity",  // null = default
  "shap_explanation": [
    { "feature": "Temperature", "value": 39.2, "threshold": 38.0,
      "impact": "+145 points", "direction": "increase" },
    { "feature": "SpO2", "value": 96.0, "threshold": 95,
      "impact": "-39 points", "direction": "normal" }
  ],
  "generated_at": "2026-08-23T14:54:08.022081+00:00"
}
```
Errors: **409** `{error:"insufficient_data", message, details:{hours_available,
hours_required}, hours_available, hours_required}` — render the disabled state,
never a blank chart.

**`GET /api/patients/{id}/predictions/history`** → array of snapshots (same keys),
newest first.
**`GET /api/patients/{id}/predictions/alzheimers`** → fixed mock (stretch stub).

### Alerts / windows

**`GET /api/alerts/active`** — hospital-wide open+unacknowledged, pre-sorted
(urgency desc, time-left asc):
```json
[{ "window_id": "uuid", "patient_id": "uuid", "patient_name": "Devika Menon",
   "urgency": "HIGH", "hours_remaining": 5.18,
   "window_closes_at": "2026-08-23T20:04:52Z",
   "recommended_action": "Administer broad-spectrum antibiotics; reassess in 1h" }]
```
**`GET /api/patients/{id}/windows`** — same items, full history for one patient.
**`POST /api/windows/{id}/acknowledge`** →
`{ "window_id", "acknowledged_at": ISO, "acknowledged_by": "uuid" }`

### Interventions

**`POST /api/patients/{id}/interventions`** body
`{ "type": "medication_change", "description": "free text",
   "performed_at": "ISO", "window_id": "uuid|null" }` → 201:
```json
{ "intervention_id":"uuid","patient_id":"uuid","clinician_id":"uuid|null",
  "window_id":null,"type":"medication_change","description":"sample",
  "performed_at":"2026-08-23T18:00:00Z","outcome":null,"outcome_recorded_at":null }
```
**`PUT /api/interventions/{id}/outcome`** body `{ "outcome": "improved" }`
(`improved|no_change|deteriorated`) → 200 updated.
**`GET /api/patients/{id}/interventions`** → array, newest first.

### Clinicians

**`GET /api/clinicians`** → `[{ clinician_id, name, specialization,
is_available, current_patient_count }]`
**`PUT /api/clinicians/{id}/availability`** body `{ "is_available": false }` → updated item.
Flipping the assigned doctor to unavailable is what triggers live escalation demos.

### MRI scans (stub) · Analytics (stubs)

- `POST /api/patients/{id}/scans` multipart fields `file` (.nii/.nii.gz/.dcm only)
  + `scan_date` → `202 {scan_id, processing_status:"pending"}` (stays pending forever).
  Oversize/wrong-ext → 422 envelope.
- `GET .../scans`, `GET .../scans/{scan_id}` → metadata lists/detail.
- `GET /api/analytics/sepsis-outcomes|alzheimers-progression|intervention-efficacy` → `[]`.

### Health

`GET /api/health` (no auth) → `{ "status": "ok"|"degraded", "postgres": "up"|"down", "neo4j": "up"|"down" }`

## 7. WebSocket events

Envelope always `{ "event": "...", "data": {...} }`.

| Channel | Events | `data` shape |
|---|---|---|
| `/ws/alerts?token=` | `window_opened` · `escalated` · `window_closed` | identical to ActiveAlertItem |
| `/ws/patients/{id}/vitals?token=` | `vitals_update` | one stored reading (same as vitals GET item) |

`escalated` fires when the assigned doctor was unavailable and routing reassigned
— treat it exactly like `window_opened` (plus optionally toast "Escalated to Dr. X"
using `data.patient_name` + patient detail's new `assigned_doctor`).

## 8. Domain rules the UI must encode

1. **Countdown visibility**: render the timer iff `window_open === true && window_closes_at !== null`. Compute remaining client-side from `window_closes_at` (server timestamp), re-sync on each fetch. On expiry show static **"WINDOW CLOSED"** — never silently hide.
2. **Threshold badge**: when `threshold_adjustment_reason` is non-null show
   `"Threshold adjusted: Diabetic — alert at {threshold_used}"` (map reason codes → copy:
   `diabetic_lactate_sensitivity`, `elderly_reduced_reserve`). `null` ⇒ default, no badge.
3. **Trajectory chart**: `trajectory[i]` = forecast hour i (i=0 = now); plot solid up to now, dotted beyond, shaded band between lower/upper arrays (same length).
4. **SHAP diverging bars**: sort as delivered (already abs-desc, max 5); positive impact → red "increases risk"; negative/"normal" → green/blue protective. Impact strings like `"+145 points"`.
5. **Urgency**: text always shown, not color-only — LOW grey · MEDIUM amber · HIGH orange/red · CRITICAL red+pulse.
6. **Insufficient data**: on 409 show *"Insufficient data sequence. 2 hours of vitals required for Sepsis prediction."*
7. **`risk_score_change` null** (first prediction) → display "—" or "new".
8. Toast copy on intervention success: **"Intervention logged to patient graph."**

## 9. Screens → endpoints map

| Screen | Calls | Live updates |
|---|---|---|
| Login | `POST /auth/login` | — |
| Dashboard | `GET /patients`, `GET /alerts/active`, quick stats from those two arrays | WS `/ws/alerts` |
| Patient Detail – Overview | `GET /patients/{id}`, `.../vitals/latest`, `.../predictions/sepsis` | WS `vitals:{id}` channel |
| Patient Detail – History tab | `.../interventions`, `.../windows`, `.../predictions/history` | — |
| Review & Intervene modal | `POST .../interventions` | — |
| Alert Center | `GET /alerts/active`, `POST /windows/{id}/acknowledge` | WS `/ws/alerts` |
| Graph tab | `GET /patients/{id}/graph` | — |
| Imaging tab (stretch) | scans endpoints | — |
| Admin-ish | `GET/PUT /clinicians` | — |

## 10. Seeded demo dataset (after `python seed_data.py`)

Login: `doctor@mediq.local` / `mediq-demo` (user "Dr. Rao", Critical Care).

| Patient | Age/Sex | Ward | Expected state (trained model) |
|---|---|---|---|
| Ramesh Yadav | 67 M | ICU-3/12 | risk ≈75.6 rising → **window OPEN @55**, HIGH, escalated story (seeded Dr. Mehta unavailable → auto-rerouted to Dr. Rao) |
| Sunita Devi | 58 F | ICU-2/04 | risk ≈77.9 but forecast receding → **NO window** @65 (Journey B control) |
| Arjun Patel | 72 M | General-1/22 | elderly threshold 60, risk low → quiet/stable |
| Kavita Sharma | 45 F | ICU-1/02 | only ~1h vitals → **409 insufficient_data** demo |
| Devika Menon | 75 M | HDU-1/14 | real PhysioNet septic case → risk ≈84, **window OPEN**, HIGH |
| Raghav Kulkarni | 75 M | HDU-1/15 | real case, pre-onset window → ≈38 quiet |
| Meera Joshi | 59 M | HDU-1/16 | real never-septic control → ≈1 |

Clinicians: Dr. Rao + Dr. Iyer + Dr. Khan available; **Dr. Mehta unavailable**
(the escalation trigger). Re-running seed resets everything deterministically.

## 11. Edge cases & UX states checklist

- Skeletons on first load; no spinners for page loads.
- Every list can be empty → friendly empty states ("No active critical alerts. N patients stable.").
- Errors are per-card inline banners using the envelope's `message`; add Retry where sensible.
- WS drop → persistent "Live updates paused — reconnecting…" chip; reconnect with same token; on 4401 redirect to login.
- Countdown continues correctly across navigation (server timestamps).
- Fewer than 3 SHAP features → render what exists, don't pad.
- Multiple open windows → Active Alerts order arrives pre-sorted; trust it.

## 12. Recent backend changes (final state)

1. **Trained XGBoost model integrated** (`checkpoints/sepsis_xgboost.pkl`) — real scores; SHAP via native TreeSHAP; deterministic surrogate fallback if weights absent.
2. **Supabase support (opt-in)** — set `SUPABASE_URL/ANON_KEY` in backend `.env`: login/refresh proxy there, tokens verified via JWKS/HS256, users auto-provisioned. Frontend flow unchanged; only `/refresh` needs `{refresh_token}` then.
3. **PhysioNet sample patients** added to seed (see §10).
4. Env cleanup — see `.env.example` + `WHERE_TO_FIND_ENV_VALUES.md`.
5. Fixes: SHAP populated in xgboost mode; tests can't touch the live DB; Neo4j driver lazily reconnects.

Stub behaviors by design: Alzheimer's prediction = fixed mock; MRI scans stay `pending`; analytics = `[]`. Out of scope: RBAC hierarchy, email/SMS, multi-tenancy.

---

*Backend lives in `backend/` (FastAPI). Deeper docs: `PROJECT_OVERVIEW.md`,
`docs/05-api-spec.md` (contract), `docs/02-UX-flow-spec.md` (states/journeys),
`WHERE_TO_FIND_ENV_VALUES.md` (secrets).*
