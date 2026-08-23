# MedIQ — UX / User Flow Specification

Companion to `01-PRD.md` and `03-design-spec.md`. This document defines navigation, screens, states, and journeys. Visual styling lives in the design spec; this file is about *structure and behavior*.

---

## 1. Navigation Structure

```
App
├── /login                     Auth screen
├── /dashboard                 Default landing view after login
├── /patients/:id              Patient Detail View
│   ├── (tab) overview         Vitals timeline + risk card (Sepsis)
│   ├── (tab) imaging          MRI progression (Alzheimer's, stretch)
│   ├── (tab) graph            Ontology graph view (stretch)
│   └── (tab) history          Intervention history
└── /alerts                    Alert Center
```

Global left nav (persistent, per design spec Reference 1): Dashboard, Alert Center, Patients (search), logout. No breadcrumb needed at this depth.

## 2. Screens

### 2.1 Login
- Single form: email/username + password.
- No self-signup for demo — accounts are seeded.
- On failure: inline error under the field, not a toast (avoid alert fatigue pattern this early).

### 2.2 Dashboard
Purpose: triage. First thing a doctor sees.

Layout order (top to bottom / left to right per design spec IA):
1. **Active Alerts Panel** — real-time list of open intervention windows, hospital-wide, sorted by urgency then time-remaining ascending.
2. **Patient List** — table with columns: Name, Age, Ward/Bed, Condition(s), Current Risk Score (color+icon), Assigned Doctor.
3. **Quick Stats** — total patients, active windows count, stable count.

### 2.3 Patient Detail View
Purpose: everything about one patient in one place — no multi-tab hunting for related data.

Sub-sections (per PRD F1–F6):
1. **Patient Header** — name, age, sex, comorbidity pills, assigned doctor, admission time.
2. **Current Risk Score & Intervention Timer** — the single most important element on the page.
3. **Vitals Timeline / Risk Trajectory Chart** — historical (solid) + predicted (dotted, banded).
4. **SHAP Explanation Panel** — diverging bar chart under the risk card.
5. **Intervention History** — chronological log of past actions + outcomes.
6. (tab) **MRI / Imaging view** — stretch.
7. (tab) **Ontology Graph** — stretch.

### 2.4 Alert Center
- All open windows (hospital-wide), acknowledged alerts, and the outcome logging form entry point.
- This is effectively the Active Alerts Panel expanded to full-page with filters (by urgency, by ward).

---

## 3. Core User Journeys

### Journey A — Sepsis Prediction & Intervention (primary demo path)

| Step | User Action | System Response | Screen State |
|---|---|---|---|
| 1 | Doctor logs in | Redirect to Dashboard | Dashboard loads with skeleton → populated |
| 2 | Doctor clicks a patient in Active Alerts or Patient List | Navigate to `/patients/:id` | Patient Detail loads (skeleton → populated) |
| 3 | Doctor views vitals timeline | If <2h data: show insufficient-data state. Else: risk card renders | Insufficient-data OR Populated |
| 4 | System detects window open | Countdown card appears, pulses red 3x, alert pushed to Alert Center via WebSocket | Window-open state |
| 5 | Doctor reviews SHAP panel | Bar chart renders top 3–5 features | Populated |
| 6 | Doctor clicks "Review & Intervene" | Modal opens: intervention type, notes | Modal state |
| 7 | Doctor submits | Toast: "Intervention logged to patient graph." Modal closes, history list updates | Success toast + updated history |

### Journey B — Comorbidity-Adjusted Alert (the ontology payoff, must be demoable)

| Step | User Action | System Response |
|---|---|---|
| 1 | Doctor opens a diabetic patient | Patient Header shows "Diabetic" pill |
| 2 | Risk score crosses 55 (not 65) | Window opens; UI shows small inline label "Threshold adjusted: Diabetic — alert at 55" next to the risk score |
| 3 | Doctor compares to a non-diabetic patient at the same score | Non-diabetic patient at risk 58 shows **no** window open — demonstrates the contrast live |

### Journey C — Alzheimer's Progression (stretch)

| Step | User Action | System Response |
|---|---|---|
| 1 | Doctor opens Imaging tab | Upload/select control shown |
| 2 | Doctor uploads/selects 2 scans | Progress bar → "Preprocessing (Skull Stripping & Registration)..." state |
| 3 | Processing completes | Heatmap renders, stage + atrophy rate + effectiveness gauge shown |

### Journey D — Alert Acknowledgement from Alert Center

| Step | User Action | System Response |
|---|---|---|
| 1 | Doctor opens Alert Center | List of all open windows hospital-wide |
| 2 | Doctor clicks "Acknowledge" on an alert | `POST /api/windows/{id}/acknowledge`; row moves to "Acknowledged" section |
| 3 | Doctor clicks through to patient | Navigates to Patient Detail, continues Journey A from step 5 |

---

## 4. States (apply across all screens unless noted)

| State | Behavior |
|---|---|
| **Loading (initial page load)** | Skeleton loaders matching card dimensions. No spinners for full-page loads. |
| **Loading (inference in progress)** | Indeterminate progress bar at top of Risk Trajectory Card + text: "Building time-series and running TFT inference..." |
| **Empty** | Dashboard: "No active critical alerts. N patients stable." Patient list: "No patients assigned." |
| **Insufficient data** | Prediction card disabled/muted: "Insufficient data sequence. 2 hours of vitals required for Sepsis prediction." |
| **Error (API failure)** | Inline error banner on the affected card only — never a full-page crash. Retry button where applicable. |
| **Permission denied** | Not applicable in prototype (single role: doctor) — reserved for future RBAC; if hit, redirect to Dashboard with a toast. |
| **Success** | Non-intrusive toast, auto-dismiss after ~4s (e.g., "Intervention logged to patient graph."). |
| **Window open (critical)** | Palette breaks from muted to red/amber per design spec; pulse animation 3x then holds solid. |
| **Window closed (missed)** | Countdown replaced with static "WINDOW CLOSED" label — never just disappears silently. |
| **WebSocket disconnected** | Small persistent indicator ("Live updates paused — reconnecting...") rather than silently going stale. |

---

## 5. Out-of-band / Edge Cases to Handle in Prototype

- `window_closes_at = null` → hide countdown entirely (do not show "Invalid Date").
- Multiple patients with open windows simultaneously → Active Alerts Panel sorts by urgency first, time-remaining second.
- Doctor navigates away mid-countdown → countdown continues to tick on return (compute from server timestamp, not client-local elapsed time).
- SHAP panel with fewer than 3 features (edge dataset case) → render what's available, do not pad with placeholders.
