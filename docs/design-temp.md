# MedIQ Design Specification (design.md)

This document serves as the master design and UX architecture specification for the MedIQ platform. It translates the medical ontology and predictive ML capabilities[cite: 1] into a production-ready, clinical-grade interface.

---

## STEP 1 — PRODUCT UNDERSTANDING
*Acknowledgment of `idea.md` Core Mechanics:*
MedIQ is an ontology-driven medical intelligence platform, not a standard dashboard[cite: 1]. It centers around a Patient Object (graph)[cite: 1]. The UI must seamlessly integrate manual vital inputs and MRI uploads[cite: 1], feed them into the ML models (TFT for Sepsis, CNN for Alzheimer's)[cite: 1], and surface actionable data via risk scores, 6-hour trajectories, and intervention windows[cite: 1]. The ultimate goal of the UI is to ensure predictions reach the right clinician with SHAP-based explainability and facilitate the logging of interventions[cite: 1].

---

## STEP 2 — DRIBBBLE REFERENCE ANALYSIS

### Reference 1: Hospital Management Dashboard
*   **KEEP:**
    *   High information density suitable for clinical overviews.
    *   Clear, persistent left-side navigation for hospital-wide context.
    *   Strict grid system for patient lists.
*   **ADAPT:**
    *   Generic health metric cards → Adapt into MedIQ's "Active Alerts Panel" and "Intervention Windows"[cite: 1].
*   **AVOID:**
    *   Wasted whitespace in critical view areas.
    *   Decorative charts that do not communicate actionable clinical thresholds.

### Reference 2: Patient Health Dashboard
*   **KEEP:**
    *   Prominent Patient Header showing demographic context.
    *   Longitudinal timeline views for vital signs.
*   **ADAPT:**
    *   Standard vital timelines → MedIQ's 6-hour risk trajectory with SHAP explanations and confidence bands[cite: 1].
*   **AVOID:**
    *   "Soft" or low-contrast text for critical numbers.
    *   Neon/glow effects on charts which reduce professional trust.

### Reference 3: Patient Dashboard Customization Widgets
*   **KEEP:**
    *   Modular, card-based architecture that separates distinct data types.
    *   Clear visual boundaries between different information domains.
*   **ADAPT:**
    *   Drag-and-drop customizability → Replace with a fixed, strictly prioritized layout based on the active disease module (Sepsis vs. Alzheimer's)[cite: 1]. Clinicians need predictability over customization in emergencies.
*   **AVOID:**
    *   Heavy drop shadows and floating layers (glassmorphism).

---

## STEP 3 — SYNTHESIS & DESIGN LANGUAGE

The MedIQ design language is **"Clinical Precision."** It merges the deep interconnectedness of Palantir-style data graphs[cite: 1] with the high-stakes clarity of aviation interfaces. 

*   **Clinical Clarity:** Data must never be obscured by aesthetics.
*   **Explainability First:** Every ML prediction must instantly answer "Why?" via SHAP value visualization[cite: 1].
*   **Urgency Mapping:** The interface remains visually muted and calm (grays/blues) until an intervention window opens[cite: 1], at which point critical states (reds/ambers) break the visual plane to demand immediate action.
*   **Contextual Density:** Using the Medical Ontology Layer[cite: 1], the UI surfaces comorbidities, active medications, and assigned clinicians in the same view as the ML prediction[cite: 1], avoiding multi-tab navigation.

---

## STEP 4 — DEFINING THE MEDIQ DESIGN SYSTEM

### 1. Design Philosophy
The interface should feel authoritative, transparent, and frictionless. It communicates absolute certainty about *historical* data while clearly visualizing the *probability* of ML predictions. It must NOT feel like a generic SaaS tool or a futuristic sci-fi HUD. It balances clinical seriousness with modern software ergonomics.

### 2. Design Principles
*   **Information before decoration:** Zero decorative graphics. Every pixel serves clinical understanding.
*   **Risk is unmistakable:** Critical thresholds break the baseline visual hierarchy.
*   **Progressive disclosure of complexity:** Show the risk score and intervention window first[cite: 1]; allow drill-down into the Neo4j ontology graph and SHAP details[cite: 1].
*   **Context always accompanies predictions:** Predictions are never shown without patient history and comorbidity data[cite: 1].
*   **Action-oriented:** Every alert must explicitly state the recommended action and offer a way to log the intervention[cite: 1].

### 3. Visual Direction
*   **Aesthetic:** Flat, high-contrast, structured.
*   **Background Style:** Solid colors (light theme: `#F8FAFC`, dark theme: `#0F172A`).
*   **Surface Style:** Flat cards with 1px borders, no drop shadows.
*   **Border Radius:** Strict `4px` (subtle rounding, maintains structured feel).
*   **Density:** Compact. Table rows should be `32px` or `40px` high.
*   **Hierarchy:** Driven entirely by typography weight and color semantics, not by floating layers.

### 4. Color System (Hex Values)

**Core System:**
*   **Background:** `#F8FAFC` (Slate 50)
*   **Surface:** `#FFFFFF` (White)
*   **Surface Elevated:** `#F1F5F9` (Slate 100)
*   **Border:** `#E2E8F0` (Slate 200)

**Typography:**
*   **Text Primary:** `#0F172A` (Slate 900) - For critical data, patient names.
*   **Text Secondary:** `#475569` (Slate 600) - For labels, table headers, timestamps.
*   **Text Muted:** `#94A3B8` (Slate 400) - For empty states, placeholder text.

**Risk & Clinical Semantics:**
*   **Normal / Baseline (Low Risk):** `#0F172A` (Standard text, avoid coloring normal states green to reduce cognitive fatigue).
*   **Moderate / Warning:** `#D97706` (Amber 600) - Used for rising trajectories.
*   **Critical / High Risk:** `#DC2626` (Red 600) - Used exclusively for open intervention windows and critical vitals[cite: 1].
*   **Information / Graph Nodes:** `#0284C7` (Sky 600) - Used for links, primary buttons, and medical ontology nodes[cite: 1].

### 5. Typography
*   **Primary Font:** *Inter* (Optimized for UI legibility).
*   **Secondary/Monospace Font:** *JetBrains Mono* (Exclusively for tabular clinical numbers, vitals, timestamps, and prediction probabilities to ensure tabular lining).
*   **Scale:**
    *   **Patient Name / Major Risk Score:** `32px`, SemiBold (`600`).
    *   **Section Headings:** `16px`, Medium (`500`).
    *   **Body:** `14px`, Regular (`400`).
    *   **Labels/Captions:** `12px`, Medium (`500`), Uppercase, Tracking `0.05em`.
    *   **Metrics (Monospace):** `14px` and `24px`, Medium (`500`).

---

## STEP 5 — INFORMATION ARCHITECTURE

**1. Dashboard (Doctor Default View)**[cite: 1]
*   *Purpose:* Triage hospital-wide active alerts and monitor patient list.
*   *Primary User:* Assigned Doctor / Clinician.
*   *Hierarchy:* 1. Active Alerts Panel (WebSocket real-time)[cite: 1], 2. Patient List with risk indicators[cite: 1], 3. Quick Stats[cite: 1].
*   *Empty State:* "No active critical alerts. 42 patients stable."

**2. Patient Detail View (Sepsis / Alzheimer's)**[cite: 1]
*   *Purpose:* Deep dive into a specific patient's data, model predictions, and graph[cite: 1].
*   *Hierarchy:* 1. Patient Header (Name, age, assigned doctor, comorbidities)[cite: 1]. 2. Current Risk Score & Intervention Timer[cite: 1]. 3. Vitals Timeline / MRI View[cite: 1]. 4. SHAP Explanation[cite: 1].
*   *Important Components:* Risk Trajectory Card, Intervention Window Timer, Brain Heatmap[cite: 1].

**3. Ontology Graph View**[cite: 1]
*   *Purpose:* Visual exploration of the Neo4j knowledge graph[cite: 1].
*   *Hierarchy:* Patient node at center[cite: 1], surrounded by connected diseases, medications, clinicians, and similar patients[cite: 1].

**4. Alert Center**[cite: 1]
*   *Purpose:* Log of all open windows, acknowledged alerts, and outcome logging[cite: 1].

---

## STEP 6 — CORE USER FLOWS

### Workflow A: Sepsis Prediction & Intervention[cite: 1]

1.  **Patient Selection:** Doctor clicks patient from the Dashboard list.
    *   *UI:* Patient Detail View loads.
2.  **Vital Entry / Monitoring:** Doctor views the real-time vitals graph[cite: 1].
    *   *UI:* Monospace tables update via WebSocket.
3.  **Model Inference:** System detects 2+ hours of vitals and runs the TFT model[cite: 1].
    *   *System Response:* "Processing Time-Series..." micro-state in header.
4.  **Risk Score & Trajectory:** Model outputs risk score and 6-hour trajectory[cite: 1].
    *   *UI:* Risk Trajectory Card renders. A line chart showing historical data merging into a dotted line for the 6-hour prediction, surrounded by shaded confidence bands[cite: 1].
5.  **Intervention Window & Alerts:** The model flags an open intervention window[cite: 1].
    *   *UI:* The UI breaks its muted palette. A red "Intervention Window" countdown timer appears[cite: 1]. Alert routes to the doctor's screen via WebSocket[cite: 1].
6.  **Explainability:** Doctor checks why the risk is rising.
    *   *UI:* SHAP feature attribution renders as a horizontal bar chart below the risk score[cite: 1] (e.g., Lactate [+28 points], HR [+19 points][cite: 1]).
7.  **Action / Escalation:** Doctor acts and logs the outcome.
    *   *UI:* Doctor clicks "Log Intervention". A modal opens to record the action, which creates an Intervention node in the Neo4j graph[cite: 1].

### Workflow B: Alzheimer's Progression View[cite: 1]

1.  **MRI Upload:** Doctor selects Alzheimer's module and uploads a NIfTI/DICOM file[cite: 1].
    *   *UI:* Upload progress bar, followed by "Preprocessing (Skull Stripping & Registration)..." state[cite: 1].
2.  **Inference:** 3D CNN extracts features and longitudinal network compares to previous scans[cite: 1].
3.  **Visualization:**
    *   *UI:* Brain Heatmap renders coronal/axial/sagittal views with Grad-CAM atrophy overlays[cite: 1].
4.  **Progression & Effectiveness:**
    *   *UI:* Renders current stage (MCI/Mild/Moderate/Severe)[cite: 1], months to next stage[cite: 1], and a gauge showing the Treatment Effectiveness Score (-1 to +1)[cite: 1].

---

## STEP 7 — COMPONENT INVENTORY

### Patient & Context
*   **Patient Header:** Spans full width. Contains `Text Primary` for Name/Age. Includes pill-shaped tags for comorbidities (e.g., "Diabetic" which dynamically adjusts model thresholds[cite: 1]).
*   **Ontology Node Explorer:** A React Flow visualization component[cite: 1]. Nodes are color-coded (Patient = Blue, Disease = Red, Medication = Green).

### Prediction & Explanations (Sepsis)[cite: 1]
*   **Risk Score Display:** Massive typography (`48px` JetBrains Mono). Color shifts from Slate to Amber to Red based on threshold.
*   **Intervention Window Timer:** Fixed banner/card. High contrast (White text on `#DC2626` background). Displays "Urgency: CRITICAL" and a countdown clock[cite: 1].
*   **SHAP Explanation Panel:** Horizontal diverging bar chart. Vitals driving risk up are red bars (right), vitals protecting are blue bars (left)[cite: 1].

### Imaging & Progression (Alzheimer's)[cite: 1]
*   **Brain Heatmap Viewer:** 3-pane image viewer. Includes a slider to scrub between timepoints (historical vs. current). Heatmap overlay uses a strict "Viridis" or "Inferno" color scale for clinical accuracy.
*   **Treatment Effectiveness Gauge:** A semi-circle gauge displaying the -1 to +1 score[cite: 1], with a clear marker indicating "Slowing Decline" vs "No Response".

### Alerts & Forms[cite: 1]
*   **Outcome Logging Form:** Simple form modal triggering an API `POST` to `/api/patients/{id}/interventions`[cite: 1]. Includes dropdown for intervention type and text area for notes[cite: 1].

---

## STEP 8 — DATA VISUALIZATION RULES

All charts must answer a clinical question instantly. 

*   **Risk Trajectories (TFT Output):**[cite: 1]
    *   *X-Axis:* Time (T-12h to T+6h).
    *   *Y-Axis:* Risk Score (0-100).
    *   *Lines:* Solid Slate line for historical vitals. Dotted Amber/Red line for predicted trajectory[cite: 1].
    *   *Thresholds:* A horizontal dashed line at `y=65` (or dynamically adjusted to `y=55` for diabetic patients[cite: 1]).
    *   *Uncertainty:* Shaded translucent bands representing the model's quantile outputs (confidence intervals)[cite: 1].
*   **SHAP Feature Importance:**[cite: 1]
    *   Must use explicit labels, not just variable names (e.g., "Lactate: 4.2 mmol/L" not just "lactate").
    *   Sort strictly by absolute impact value.
*   **Brain Heatmaps (Grad-CAM):**[cite: 1]
    *   Heatmap must overlay the grayscale MRI slice seamlessly.
    *   Include an opacity slider so the clinician can view the raw scan beneath the prediction.

---

## STEP 9 — RESPONSIVE DESIGN

*   **Desktop (1440px+):** Full 3-column layout. Left: Global Nav. Center: Patient Context & Charts. Right: Ontology Context & Active Alerts.
*   **Laptop (1024px+):** 2-column layout. The Right column (Alerts/Ontology) collapses into a toggleable side-drawer.
*   **Tablet (768px+):** Single column. Cards stack vertically. Charts resize to 100% width. Patient Header becomes compact.
*   **Mobile (<768px):** The UI is optimized exclusively for **Alert Routing and Triage**. Large charts are hidden behind "Tap to view" buttons. The Intervention Timer and Risk Score dominate the viewport to facilitate immediate action logging[cite: 1].

---

## STEP 10 — ACCESSIBILITY

*   **Contrast:** All text must pass WCAG 2.1 AA. `Text Muted` (`#94A3B8`) must only be used on `#FFFFFF` backgrounds.
*   **Color Blindness:** *Never use color as the sole indicator of risk.* Critical alerts must be accompanied by an icon (e.g., ⚠️ Triangle) and explicit text ("CRITICAL").
*   **Semantic HTML:** Use proper `<time>` tags for all intervention window countdowns.
*   **Data Readability:** All vital numbers and risk scores must use tabular lining (monospace digits) to prevent numbers shifting horizontally as they update via WebSocket.

---

## STEP 11 — UX STATES

*   **Loading:** Skeleton loaders (Slate 100) matching the exact dimensions of the target cards. No spinning wheels for main page loads.
*   **Model Processing (Inference):** A subtle indeterminate progress bar at the top of the Risk Trajectory Card with text: *Building time-series and running TFT inference...*
*   **Prediction Missing/Unavailable:** If `< 2 hours` of vitals exist, disable the prediction card with a muted message: *Insufficient data sequence. 2 hours of vitals required for Sepsis prediction.*[cite: 1]
*   **Success (Outcome Logged):** A brief, non-intrusive toast notification: *Intervention logged to patient graph.*[cite: 1]

---

## STEP 12 — MICROINTERACTIONS

*   **Window Open:** When an Intervention Window opens[cite: 1], the card's border pulses subtly in `#DC2626` (Red) 3 times, then holds solid. 
*   **SHAP Hover:** Hovering over a SHAP bar[cite: 1] highlights the corresponding vital sign row in the patient's historical vitals table.
*   **Graph Exploration:** In the React Flow ontology view[cite: 1], clicking a node smoothly centers it and fades non-connected nodes to 30% opacity.

---

## STEP 13 — RESPONSIBLE HEALTHCARE UX

*   **Linguistic Precision:** The UI must never say "Patient *will* develop Sepsis." It must say "6-Hour Predicted Risk Trajectory: Rising" or "Model Confidence: 84%."
*   **Data Provenance:** Every prediction chart must clearly mark the line separating "Observed Vitals" (historical fact) from "TFT Forecast" (prediction)[cite: 1].
*   **Decision Support, not Decision Making:** The system identifies the window[cite: 1], but the CTA is "Review & Intervene," leaving agency with the clinician.

---

## STEP 14 — STITCH IMPLEMENTATION GUIDELINES

**To Google Stitch / AI Code Generator:**
1.  **Layout:** Implement a strict CSS Grid. Do not use random flexbox spacing. Standard gap is `16px`, section gap is `32px`.
2.  **Borders & Radius:** Use exactly `border: 1px solid #E2E8F0` and `border-radius: 4px` for all cards. No exceptions.
3.  **Typography:** Import 'Inter' for sans-serif and 'JetBrains Mono' for numbers. Apply `font-variant-numeric: tabular-nums` to all data tables.
4.  **Color Variables:** Use the exact Hex codes defined in Step 4. Map them to CSS variables (e.g., `--color-critical: #DC2626`).
5.  **Components:** Encapsulate the `InterventionTimer`, `RiskTrajectoryChart`, and `SHAPExplanationBar` as distinct, reusable React components.
6.  **Data Mocking:** If writing mockup data, ensure it represents realistic clinical values (e.g., HR: 110 bpm, Lactate 4.2 mmol/L[cite: 1]), not generic lorem ipsum.

---

## STEP 15 — ANTI-VIBE-CODING RULES

**Strictly Prohibited Styles:**
*   ❌ **No Glassmorphism:** Do not use `backdrop-filter: blur`, translucent backgrounds, or layered shadows.
*   ❌ **No Gradients:** Do not use purple/blue "AI gradients" anywhere. MedIQ is a clinical tool, not a consumer AI chatbot.
*   ❌ **No Floating UI:** Cards must not "float" over backgrounds. Everything must sit securely on the layout grid.
*   ❌ **No Meaningless Animations:** Avoid bounce, elasticity, or stagger animations on page load. Use instant or `150ms` linear fades.
*   ❌ **No Decorative Charts:** If a chart doesn't display TFT/CNN data, SHAP values, or historical vitals[cite: 1], do not render it. No random pie charts to fill space.
*   ❌ **No Dark Mode "Hacking":** Do not invert colors lazily. If generating a dark mode, red/amber warnings must still maintain WCAG AA contrast against dark surfaces.