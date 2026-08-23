# MedIQ — Product Requirements Document (PRD)
## Smart India Hackathon 2026 | Team ByteSlay

**Scope of this PRD:** 3-day buildable prototype, not the full production system described in `mediq_architecture.md`. Where the prototype cuts a corner, it is called out explicitly under "Out of Scope."

---

## 1. Problem Statement

Sepsis kills within hours if intervention is delayed, and ICU staff are monitoring many patients at once, manually eyeballing vitals trends. There is no system that:
- Continuously turns raw vitals into a forward-looking risk trajectory
- Tells a doctor **when** the intervention window is open and **how long it stays open**
- Explains **why** the model thinks risk is rising, in clinical terms
- Adjusts its judgment based on a patient's other conditions (e.g. diabetes, age)

Doctors are already overloaded. A tool that silently produces a score nobody trusts or acts on is worse than no tool. MedIQ's job is to reduce cognitive load, not add another dashboard to check.

## 2. Who This Is For

**Primary user: ICU / ward doctor (clinician).** Views patient list, reacts to alerts, reviews SHAP explanation, logs the intervention taken.

**Secondary user (implicit, demo-only): Hospital administrator / judge persona.** Views the dashboard-level picture (how many patients, how many active windows) to understand system value at a glance.

MedIQ does not target patients or family members in this version.

## 3. Product Principle

> **We are not replacing doctors. We are lowering their workload and reaction time.**

The system never issues a diagnosis or instructs a treatment. It surfaces a risk trajectory, a time-bounded window, and the clinical reasoning (SHAP) behind it. The doctor decides and the doctor acts. Every screen's copy and CTA must respect this ("Review & Intervene," never "Treat now").

## 4. In-Scope Disease Module (Prototype)

**Primary: Sepsis** (emergency, hour-by-hour). This is the module that must work end-to-end and be demo-ready.

**Stretch: Alzheimer's / MRI progression view.** Build only after the Sepsis flow and the Ontology payoff are fully working. See Section 8 (Out of Scope) and ADR-001 in `07-ADRs.md` for the reasoning — you already have MRI data (ADNI + OASIS-3), so this is a "if time remains" feature, not a cut feature.

## 5. Core Features & User Stories

### F1 — Patient Ontology Object
**As a doctor**, when I open a patient, I want to see their vitals, conditions, medications, and assigned clinician together as one connected record, not separate forms, **so that** I understand the full clinical picture in one view.

Acceptance criteria:
- Patient record shows: demographics, active conditions (with comorbidity tags), current medications, assigned doctor, admission time.
- Data is sourced from a single Patient object/graph — the UI never has to join across disconnected forms.
- At least one comorbidity (Diabetes) visibly changes downstream behavior (see F4).

### F2 — Sepsis Vitals Ingestion & Risk Prediction
**As a doctor**, I want to enter or see incoming vitals for a patient, and have the system show me their current sepsis risk score and a 6-hour projected trajectory, **so that** I can catch deterioration before it becomes critical.

Acceptance criteria:
- Vitals (HR, BP sys/dia, Temp, RR, SpO2, WBC, Lactate, Creatinine, Urine output) can be entered or loaded from the PhysioNet-derived dataset.
- Once ≥ 2 hours of readings exist for a patient, a risk score (0–100) and 6-hour trajectory render.
- Chart clearly separates observed (solid) vs. predicted (dotted, with confidence band).
- If < 2 hours of data exist, the prediction card shows a disabled/insufficient-data state, not a broken chart.

### F3 — Intervention Window Detection & Countdown
**As a doctor**, when the model detects a window where intervention is still likely to help, I want an unmissable countdown so I know exactly how much time I have.

Acceptance criteria:
- When `window_open = true`, a high-contrast countdown (HH:MM:SS) renders and updates every second.
- Urgency level (LOW/MEDIUM/HIGH/CRITICAL) is shown as text, not color alone.
- If `window_closes_at` passes without action, state changes to "WINDOW CLOSED" — it does not silently disappear.
- Alert is routed to the assigned doctor; if unavailable, it is shown as escalated to another clinician (can be simulated for demo).

### F4 — Comorbidity-Adjusted Thresholds (The Ontology Payoff)
**As a doctor**, I want the system to already know that a diabetic patient needs a lower alert threshold, **so that** I don't have to manually account for it every time.

Acceptance criteria:
- At least one diabetic patient in the demo dataset triggers a window at risk_score > 55 instead of the default > 65.
- The UI explicitly surfaces this adjustment (e.g., a small label: "Threshold adjusted: Diabetic — 55" ) so the judge/doctor can see the ontology is doing real work, not decoration.

### F5 — SHAP Explainability
**As a doctor**, I want to see which vitals are driving the risk score, **so that** I trust the number and know what to look at first.

Acceptance criteria:
- Top 3 (max 5) SHAP features render as a horizontal diverging bar chart.
- Each feature shows: name, actual value, expected/threshold value, point contribution, and direction (increasing/protective).
- Sorted by absolute impact.

### F6 — Intervention Logging & Outcome Feedback Loop (visual only for demo)
**As a doctor**, after I act on an alert, I want to log what I did, **so that** there's a record and (eventually) the system learns from outcomes.

Acceptance criteria:
- "Log Intervention" opens a form: intervention type (dropdown), free-text notes, timestamp.
- On submit, a toast confirms "Intervention logged to patient graph."
- Logged intervention appears in the patient's Intervention History list.
- Outcome tracking (auto-checking vitals 24–48h later) is **out of scope for the demo** — a hardcoded/manual outcome field is acceptable.

### F7 — Ontology Graph View (stretch)
**As a doctor/judge**, I want to visually see the patient as a graph node connected to diseases, medications, clinicians, and similar patients, **so that** the "ontology" concept is tangible, not just backend plumbing.

Acceptance criteria (if time permits):
- React Flow graph, patient node at center.
- Clicking a node expands/highlights its direct connections.

### F8 — MRI / Alzheimer's Progression View (stretch, only after F1–F6 work)
**As a doctor**, I want to upload/select two MRI scans for a patient and see stage, atrophy rate, and treatment effectiveness, **so that** I can track long-term chronic decline too.

Acceptance criteria (if time permits):
- Two scans render side-by-side with a heatmap overlay.
- Stage classification (MCI/Mild/Moderate/Severe) and months-to-next-stage shown.
- Treatment effectiveness gauge (-1 to +1).

## 6. Success Metrics (Demo Context)

Since this is a 3-day hackathon prototype, "success" is measured by demo integrity, not production KPIs:
- End-to-end flow (vitals in → risk score → window → SHAP → log intervention) completes with zero broken states in front of judges.
- The comorbidity example (F4) is visibly different from the default case — this is the single most important thing to nail, because it is the entire thesis of the "ontology" pitch.
- No screen shows a raw error, undefined value, or infinite spinner.

## 7. Data Sources

| Data | Source | Format Needed |
|---|---|---|
| Sepsis vitals (time-series) | PhysioNet / CinC Challenge 2019 | Converted to PSV internally for TFT model input |
| MRI (Alzheimer's, stretch) | ADNI, OASIS-3 | NIfTI/DICOM, preprocessed |
| Patient demographics, conditions, medications, ontology metadata | **Synthetic / hand-authored** (no real registry available) | JSON seed data matching the Patient/Disease/Medication schema in `06-database-spec.md` |

Doctors, clinicians, and hospital context (ward, bed, availability) are also synthetic/seeded — there is no real hospital system integration in the prototype.

## 8. Out of Scope (Explicit)

- Full model retraining pipeline / outcome-driven learning loop
- HL7 FHIR integration with real hospital systems
- Kubernetes / multi-hospital deployment
- SMS/email alert delivery (in-app + WebSocket only)
- Authentication beyond a basic login (no RBAC hierarchy, no audit-grade access control)
- Real-time multi-device sync guarantees
- Alzheimer's module, if time does not permit after Sepsis + Ontology are demo-solid (team's explicit call, see ADR-001)

## 9. Constraints

- **Timeline: 3 days** to a working prototype (not the 3-week plan in the architecture doc — this PRD supersedes that timeline for the hackathon).
- Team of 6, roles per `mediq_architecture.md` Section 13.
- No paid infrastructure — self-hosted / free-tier services only.
