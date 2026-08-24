/* ============================================================
   MedIQ TypeScript Types
   Matches: FRONTEND_INTEGRATION_GUIDE.md §6 exact JSON shapes
   ============================================================ */

// ---- Auth ----
export interface LoginRequest {
  email: string;
  password: string;
}

export interface UserPublic {
  id: string;
  name: string;
  role: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string | null;
  user: UserPublic;
}

// ---- Error Envelope (§5) ----
export interface ErrorEnvelope {
  error: string;
  message: string;
  details: Record<string, unknown> | ValidationError[];
  hours_available?: number;
  hours_required?: number;
}

export interface ValidationError {
  loc: string[];
  msg: string;
  type: string;
}

// ---- Patient List Item (GET /patients) ----
export interface PatientListItem {
  patient_id: string;
  name: string;
  age: number;
  sex: string;
  ward: string;
  bed_number: string;
  conditions: string[];
  comorbidities: string[];
  current_risk_score: number | null;
  window_open: boolean;
  assigned_doctor: string | null;
}

// ---- Patient Detail (GET /patients/{id}) ----
export interface PatientDetail {
  patient_id: string;
  name: string;
  age: number;
  sex: string;
  blood_type: string;
  admission_date: string;
  ward: string;
  bed_number: string;
  conditions: Condition[];
  comorbidities: Comorbidity[];
  medications: Medication[];
  assigned_doctor: AssignedDoctor | null;
}

export interface Condition {
  name: string;
  icd_code: string;
  type: string; // 'critical' | 'chronic'
}

export interface Comorbidity {
  name: string;
  adjustment: ComorbidityAdjustment | null;
}

export interface ComorbidityAdjustment {
  threshold: number;
  reason: string;
}

export interface Medication {
  name: string;
  dosage: string;
  frequency: string;
}

export interface AssignedDoctor {
  clinician_id: string;
  name: string;
  is_available: boolean;
}

// ---- Vitals ----
export interface VitalReading {
  reading_id: string;
  patient_id?: string;
  timestamp: string;
  heart_rate: number | null;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  temperature: number | null;
  respiratory_rate: number | null;
  spo2: number | null;
  wbc: number | null;
  lactate: number | null;
  creatinine: number | null;
  urine_output: number | null;
}

export interface VitalPostResponse {
  reading_id: string;
  prediction_triggered: boolean;
}

// ---- Predictions (§6 Predictions) ----
export interface ShapFeature {
  feature: string;
  value: number;
  threshold: number;
  impact: string;       // e.g. "+145 points"
  direction: string;    // "increase" | "normal"
}

export interface SepsisPrediction {
  risk_score: number;
  risk_score_change: string | null;       // "+3.2", null = first
  trajectory: number[];                    // [now, +1h, ..., +5h]
  trajectory_confidence_band: {
    lower: number[];
    upper: number[];
  };
  window_open: boolean;
  window_closes_at: string | null;        // ISO timestamp or null
  hours_remaining: number | null;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  threshold_used: number;
  threshold_adjustment_reason: string | null;
  shap_explanation: ShapFeature[];
  generated_at: string;
}

// ---- Alerts / Windows ----
export interface ActiveAlert {
  window_id: string;
  patient_id: string;
  patient_name: string;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  hours_remaining: number;
  window_closes_at: string;
  recommended_action: string;
}

export interface AcknowledgeResponse {
  window_id: string;
  acknowledged_at: string;
  acknowledged_by: string;
}

export interface WindowHistory {
  window_id: string;
  patient_id: string;
  patient_name?: string;
  urgency: string;
  hours_remaining: number | null;
  window_closes_at: string | null;
  recommended_action: string;
}

// ---- Interventions ----
export interface Intervention {
  intervention_id: string;
  patient_id: string;
  clinician_id: string | null;
  window_id: string | null;
  type: string;
  description: string;
  performed_at: string;
  outcome: string | null;
  outcome_recorded_at: string | null;
}

export interface InterventionCreate {
  type: 'medication_change' | 'procedure' | 'dosage_change' | 'other';
  description: string;
  performed_at: string;
  window_id?: string | null;
}

// ---- Graph (React Flow ready) ----
export interface GraphNode {
  id: string;
  type: string;   // Patient, Disease, Clinician, Medication, etc.
  label: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ---- WebSocket Events (§7) ----
export interface WSEvent<T = unknown> {
  event: string;
  data: T;
}

// ---- Patient Create ----
export interface PatientCreate {
  name: string;
  age: number;
  sex: string;
  blood_type: string;
  admission_date: string;
  ward: string;
  bed_number: string;
  conditions: { name: string; icd_code: string; type: string }[];
  comorbidities: {
    name: string;
    threshold_adjustment?: number;
    adjustment_reason?: string;
  }[];
  medications: { name: string; dosage: string; frequency: string }[];
}
