# MedIQ — Design Specification (design.md)

Master design and UX architecture specification for the MedIQ platform. Translates the medical ontology and predictive ML capabilities into a production-ready, clinical-grade interface. This is the finalized version of the design draft, aligned with `01-PRD.md` and `02-UX-flow-spec.md`.

---

## 1. Product Understanding

MedIQ is an ontology-driven medical intelligence platform, not a standard dashboard. It centers around a Patient Object (graph). The UI must seamlessly integrate manual vital inputs and MRI uploads, feed them into the ML models (TFT for Sepsis, CNN for Alzheimer's), and surface actionable data via risk scores, 6-hour trajectories, and intervention windows. The UI's job is to get predictions to the right clinician with SHAP-based explainability and to make logging an intervention effortless.

---

## 2. Design Language

**"Clinical Precision."** Merges the interconnectedness of Palantir-style data graphs with the high-stakes clarity of aviation interfaces.

- **Clinical Clarity:** Data must never be obscured by aesthetics.
- **Explainability First:** Every ML prediction must instantly answer "Why?" via SHAP value visualization.
- **Urgency Mapping:** The interface stays visually muted and calm (grays/blues) until an intervention window opens, at which point critical states (reds/ambers) break the visual plane to demand immediate action.
- **Contextual Density:** The ontology layer surfaces comorbidities, active medications, and assigned clinicians in the same view as the ML prediction — no multi-tab hunting.

---

## 3. Design System

### 3.1 Philosophy
Authoritative, transparent, frictionless. Communicates absolute certainty about *historical* data while clearly visualizing the *probability* of ML predictions. Not a generic SaaS tool, not a sci-fi HUD.

### 3.2 Principles
- **Information before decoration** — zero decorative graphics.
- **Risk is unmistakable** — critical thresholds break the baseline visual hierarchy.
- **Progressive disclosure** — risk score + window first; drill into the ontology graph and SHAP details on demand.
- **Context always accompanies predictions** — never show a score without patient history and comorbidities.
- **Action-oriented** — every alert states the recommended action and a way to log the intervention.

### 3.3 Visual Direction
- **Aesthetic:** Flat, high-contrast, structured.
- **Background:** Light `#F8FAFC`, dark `#0F172A`.
- **Surface:** Flat cards, 1px borders, no drop shadows.
- **Border radius:** Strict `4px`.
- **Density:** Compact — table rows `32px`–`40px`.
- **Hierarchy:** Driven by typography weight and color semantics, not floating layers.

### 3.4 Color System

**Core**
| Token | Hex | Use |
|---|---|---|
| Background | `#F8FAFC` | App background (Slate 50) |
| Surface | `#FFFFFF` | Cards |
| Surface Elevated | `#F1F5F9` | Nested/secondary panels (Slate 100) |
| Border | `#E2E8F0` | 1px card borders (Slate 200) |

**Typography**
| Token | Hex | Use |
|---|---|---|
| Text Primary | `#0F172A` | Critical data, patient names (Slate 900) |
| Text Secondary | `#475569` | Labels, headers, timestamps (Slate 600) |
| Text Muted | `#94A3B8` | Empty states, placeholders (Slate 400) — only on `#FFFFFF` backgrounds (AA contrast) |

**Risk & Clinical Semantics**
| Token | Hex | Use |
|---|---|---|
| Normal / Baseline | `#0F172A` | Standard text — do not color low risk green, avoids cognitive fatigue |
| Moderate / Warning | `#D97706` | Rising trajectories (Amber 600) |
| Critical / High Risk | `#DC2626` | Open intervention windows, critical vitals only (Red 600) |
| Information / Graph Nodes | `#0284C7` | Links, primary buttons, ontology nodes (Sky 600) |

### 3.5 Typography
- **Primary font:** Inter.
- **Numeric/Monospace font:** JetBrains Mono — exclusively for tabular clinical numbers, vitals, timestamps, prediction probabilities (tabular lining, no digit shift on live update).

| Element | Size | Weight |
|---|---|---|
| Patient Name / Major Risk Score | 32px | SemiBold 600 |
| Section Headings | 16px | Medium 500 |
| Body | 14px | Regular 400 |
| Labels / Captions | 12px, uppercase, tracking 0.05em | Medium 500 |
| Metrics (monospace) | 14px / 24px | Medium 500 |

---

## 4. Information Architecture

**1. Dashboard (doctor default view)**
- Purpose: triage hospital-wide active alerts and monitor patient list.
- Primary user: assigned doctor/clinician.
- Hierarchy: (1) Active Alerts Panel — WebSocket real-time, (2) Patient List with risk indicators, (3) Quick Stats.
- Empty state: "No active critical alerts. 42 patients stable."

**2. Patient Detail View (Sepsis / Alzheimer's)**
- Purpose: deep dive into one patient's data, predictions, and graph.
- Hierarchy: (1) Patient Header, (2) Current Risk Score & Intervention Timer, (3) Vitals Timeline / MRI View, (4) SHAP Explanation.
- Key components: Risk Trajectory Card, Intervention Window Timer, Brain Heatmap.

**3. Ontology Graph View**
- Purpose: visual exploration of the ontology/knowledge graph.
- Hierarchy: patient node at center, surrounded by diseases, medications, clinicians, similar patients.

**4. Alert Center**
- Purpose: log of open windows, acknowledged alerts, outcome logging.

---

## 5. Core User Flows

### Workflow A — Sepsis Prediction & Intervention
1. **Patient selection** — doctor clicks patient from Dashboard list → Patient Detail View loads.
2. **Vital entry/monitoring** — real-time vitals graph; monospace tables update via WebSocket.
3. **Model inference** — system detects 2+ hours of vitals, runs TFT model. Header shows "Processing Time-Series..." micro-state.
4. **Risk score & trajectory** — Risk Trajectory Card renders: line chart, historical merging into dotted 6-hour prediction, shaded confidence bands.
5. **Intervention window & alerts** — muted palette breaks; red "Intervention Window" countdown timer appears; alert routes via WebSocket.
6. **Explainability** — SHAP feature attribution renders as horizontal bar chart below the risk score (e.g., Lactate +28, HR +19).
7. **Action/escalation** — "Log Intervention" opens a modal; on submit, creates an Intervention record linked to the patient.

### Workflow B — Alzheimer's Progression View (stretch)
1. **MRI upload** — doctor selects Alzheimer's module, uploads NIfTI/DICOM. Progress bar → "Preprocessing (Skull Stripping & Registration)..." state.
2. **Inference** — 3D CNN extracts features; longitudinal network compares to previous scans.
3. **Visualization** — Brain Heatmap renders coronal/axial/sagittal views with Grad-CAM atrophy overlays.
4. **Progression & effectiveness** — current stage (MCI/Mild/Moderate/Severe), months to next stage, Treatment Effectiveness Score gauge (-1 to +1).

---

## 6. Component Inventory

**Patient & Context**
- **Patient Header** — full width; Text Primary for name/age; pill tags for comorbidities (e.g. "Diabetic," which dynamically adjusts model thresholds).
- **Ontology Node Explorer** — React Flow visualization. Nodes color-coded: Patient = Blue, Disease = Red, Medication = Green.

**Prediction & Explanations (Sepsis)**
- **Risk Score Display** — 48px JetBrains Mono. Color shifts Slate → Amber → Red by threshold.
- **Intervention Window Timer** — fixed banner/card, white text on `#DC2626`. Displays "Urgency: CRITICAL" + countdown clock.
- **SHAP Explanation Panel** — horizontal diverging bar chart. Risk-increasing vitals = red bars (right), protective = blue bars (left).

**Imaging & Progression (Alzheimer's)**
- **Brain Heatmap Viewer** — 3-pane viewer, slider to scrub timepoints. Overlay uses Viridis/Inferno scale.
- **Treatment Effectiveness Gauge** — semi-circle gauge, -1 to +1, marker for "Slowing Decline" vs "No Response."

**Alerts & Forms**
- **Outcome Logging Form** — modal, `POST /api/patients/{id}/interventions`. Dropdown for intervention type + notes textarea.

---

## 7. Data Visualization Rules

All charts must answer a clinical question instantly.

**Risk Trajectories (TFT output)**
- X-axis: Time (T-12h to T+6h). Y-axis: Risk Score (0–100).
- Solid Slate line = historical. Dotted Amber/Red line = predicted.
- Horizontal dashed threshold line at `y=65` (dynamically `y=55` for diabetic patients).
- Shaded translucent bands = quantile confidence intervals.

**SHAP Feature Importance**
- Explicit labels, not raw variable names ("Lactate: 4.2 mmol/L," not "lactate").
- Sorted strictly by absolute impact value.

**Brain Heatmaps (Grad-CAM)**
- Overlay seamlessly on grayscale MRI slice.
- Opacity slider to view raw scan beneath the prediction.

---

## 8. Responsive Design

| Breakpoint | Layout |
|---|---|
| Desktop (1440px+) | Full 3-column: Left global nav, Center patient context/charts, Right ontology context/active alerts |
| Laptop (1024px+) | 2-column; right column collapses into a toggleable side-drawer |
| Tablet (768px+) | Single column; cards stack; charts resize to 100% width; compact patient header |
| Mobile (<768px) | Optimized exclusively for **Alert Routing and Triage**. Large charts hidden behind "Tap to view." Intervention Timer and Risk Score dominate the viewport for fast action logging. |

---

## 9. Accessibility

- All text passes WCAG 2.1 AA. Text Muted (`#94A3B8`) only on `#FFFFFF`.
- **Never use color as the sole risk indicator** — critical alerts pair with an icon (⚠) and explicit text ("CRITICAL").
- Semantic HTML: `<time>` tags for all countdowns.
- All vital numbers and risk scores use tabular-lining monospace digits so live WebSocket updates don't shift layout.

---

## 10. UX States

- **Loading:** Skeleton loaders (Slate 100) matching target card dimensions. No spinners on main page loads.
- **Model processing:** Subtle indeterminate progress bar at top of Risk Trajectory Card: "Building time-series and running TFT inference..."
- **Prediction missing:** If <2 hours of vitals exist, prediction card is disabled/muted: "Insufficient data sequence. 2 hours of vitals required for Sepsis prediction."
- **Success:** Brief non-intrusive toast: "Intervention logged to patient graph."

---

## 11. Microinteractions

- **Window open:** Card border pulses `#DC2626` 3 times, then holds solid.
- **SHAP hover:** Hovering a SHAP bar highlights the corresponding vital row in the historical vitals table.
- **Graph exploration:** Clicking an ontology node smoothly centers it and fades non-connected nodes to 30% opacity.

---

## 12. Responsible Healthcare UX

- **Linguistic precision:** Never "Patient *will* develop Sepsis." Always "6-Hour Predicted Risk Trajectory: Rising" or "Model Confidence: 84%."
- **Data provenance:** Every prediction chart clearly marks the line between "Observed Vitals" (fact) and "TFT Forecast" (prediction).
- **Decision support, not decision-making:** The system identifies the window; the CTA is "Review & Intervene" — agency stays with the clinician.

---

## 13. Implementation Guidelines (for AI code generation / Stitch)

1. **Layout:** Strict CSS Grid. No random flexbox spacing. Standard gap `16px`, section gap `32px`.
2. **Borders & radius:** Exactly `border: 1px solid #E2E8F0`, `border-radius: 4px` for all cards. No exceptions.
3. **Typography:** Import Inter (sans) and JetBrains Mono (numbers). `font-variant-numeric: tabular-nums` on all data tables.
4. **Color variables:** Use exact hex codes from Section 3.4, mapped to CSS variables (e.g. `--color-critical: #DC2626`).
5. **Components:** Encapsulate `InterventionTimer`, `RiskTrajectoryChart`, `SHAPExplanationBar` as distinct, reusable components.
6. **Data mocking:** Mock data must use realistic clinical values (HR 110 bpm, Lactate 4.2 mmol/L), never lorem ipsum.

---

## 14. Anti-Vibe-Coding Rules (strictly prohibited)

- ❌ No glassmorphism — no `backdrop-filter: blur`, translucent backgrounds, or layered shadows.
- ❌ No gradients — no purple/blue "AI gradients." MedIQ is a clinical tool, not a consumer AI chatbot.
- ❌ No floating UI — cards sit securely on the layout grid, never appear to float.
- ❌ No meaningless animation — no bounce/elasticity/stagger on load. Instant or `150ms` linear fades only.
- ❌ No decorative charts — if a chart doesn't show TFT/CNN output, SHAP values, or historical vitals, don't render it.
- ❌ No lazy dark-mode inversion — if a dark mode exists, red/amber warnings must still hit WCAG AA on dark surfaces.
