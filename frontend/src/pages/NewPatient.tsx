import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { post } from '../lib/api';
import type { PatientDetail, PatientCreate } from '../types';

export default function NewPatient() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState('M');
  const [bloodType, setBloodType] = useState('O+');
  const [admissionDate, setAdmissionDate] = useState(new Date().toISOString().slice(0, 16));
  const [ward, setWard] = useState('ICU-3');
  const [bedNumber, setBedNumber] = useState('12');

  const [conditions, setConditions] = useState<{ name: string; icd_code: string; type: string }[]>([
    { name: 'Sepsis', icd_code: 'A41.9', type: 'critical' },
  ]);

  const [comorbidityPreset, setComorbidityPreset] = useState('diabetes');

  const [medications, setMedications] = useState<{ name: string; dosage: string; frequency: string }[]>([
    { name: 'Norepinephrine', dosage: '0.1 mcg/kg/min', frequency: 'Continuous' },
  ]);

  function addCondition() {
    setConditions([...conditions, { name: '', icd_code: '', type: 'critical' }]);
  }

  function removeCondition(i: number) {
    setConditions(conditions.filter((_, idx) => idx !== i));
  }

  function updateCondition(i: number, field: string, value: string) {
    setConditions(conditions.map((c, idx) => idx === i ? { ...c, [field]: value } : c));
  }

  function addMedication() {
    setMedications([...medications, { name: '', dosage: '', frequency: 'BID' }]);
  }

  function removeMedication(i: number) {
    setMedications(medications.filter((_, idx) => idx !== i));
  }

  function updateMedication(i: number, field: string, value: string) {
    setMedications(medications.map((m, idx) => idx === i ? { ...m, [field]: value } : m));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const comorbidities: PatientCreate['comorbidities'] = [];
    if (comorbidityPreset === 'diabetes') {
      comorbidities.push({
        name: 'Diabetes Mellitus',
        threshold_adjustment: 55,
        adjustment_reason: 'diabetic_lactate_sensitivity',
      });
    } else if (comorbidityPreset === 'elderly') {
      comorbidities.push({
        name: 'Geriatric Risk (>65)',
        threshold_adjustment: 60,
        adjustment_reason: 'elderly_reduced_reserve',
      });
    }

    const body: PatientCreate = {
      name,
      age: parseInt(age, 10),
      sex,
      blood_type: bloodType,
      admission_date: new Date(admissionDate).toISOString(),
      ward,
      bed_number: bedNumber,
      conditions: conditions.filter((c) => c.name),
      comorbidities,
      medications: medications.filter((m) => m.name),
    };

    try {
      const result = await post<PatientDetail>('/patients', body);
      navigate(`/patients/${result.patient_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create patient record');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 840, margin: '0 auto' }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <p className="font-label-sm" style={{ color: 'var(--color-primary)', marginBottom: 4 }}>
          Clinical Intake &amp; Registry
        </p>
        <h1 className="font-display-lg" style={{ margin: 0 }}>
          Admit New Patient
        </h1>
        <p style={{ fontSize: 13, color: 'var(--color-on-surface-variant)', marginTop: 4 }}>
          Initialize patient graph entity, baseline conditions, and automated telemetry tracking
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* ── Section 1: Demographics ── */}
        <div className="card" style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <span className="material-symbols-outlined" style={{ color: 'var(--color-primary)' }}>
              person
            </span>
            <h3 className="font-headline-md" style={{ margin: 0 }}>
              Demographics &amp; Bed Assignment
            </h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
                className="form-input"
                placeholder="e.g. Ramesh Yadav"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Age</label>
              <input
                className="form-input"
                type="number"
                placeholder="e.g. 58"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Biological Sex</label>
              <select className="form-select" value={sex} onChange={(e) => setSex(e.target.value)}>
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Blood Type</label>
              <select className="form-select" value={bloodType} onChange={(e) => setBloodType(e.target.value)}>
                {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((bt) => (
                  <option key={bt} value={bt}>{bt}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Admission Timestamp</label>
              <input
                className="form-input"
                type="datetime-local"
                value={admissionDate}
                onChange={(e) => setAdmissionDate(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Admission Unit / Ward</label>
              <select className="form-select" value={ward} onChange={(e) => setWard(e.target.value)}>
                <option value="ICU-3">ICU-3 — Critical Care</option>
                <option value="ICU-2">ICU-2 — Sepsis & Respiratory</option>
                <option value="ICU-1">ICU-1 — Surgical Intensive</option>
                <option value="HDU-1">HDU-1 — High Dependency Unit</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Assigned Bed Number</label>
              <input
                className="form-input"
                placeholder="e.g. 12"
                value={bedNumber}
                onChange={(e) => setBedNumber(e.target.value)}
                required
              />
            </div>
          </div>
        </div>

        {/* ── Section 2: Clinical Diagnoses & ICD Codes ── */}
        <div className="card" style={{ padding: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--color-primary)' }}>
                diagnosis
              </span>
              <h3 className="font-headline-md" style={{ margin: 0 }}>
                Primary Diagnoses &amp; ICD-10
              </h3>
            </div>
            <button type="button" className="btn btn-sm btn-secondary" onClick={addCondition}>
              + Add Diagnosis
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {conditions.map((c, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 12, alignItems: 'center' }}>
                <div className="form-group">
                  <label className="form-label">Diagnosis Name</label>
                  <input
                    className="form-input"
                    placeholder="e.g. Sepsis / Severe Pneumonia"
                    value={c.name}
                    onChange={(e) => updateCondition(i, 'name', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">ICD-10 Code</label>
                  <input
                    className="form-input"
                    placeholder="A41.9"
                    value={c.icd_code}
                    onChange={(e) => updateCondition(i, 'icd_code', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Acuity</label>
                  <select
                    className="form-select"
                    value={c.type}
                    onChange={(e) => updateCondition(i, 'type', e.target.value)}
                  >
                    <option value="critical">Critical</option>
                    <option value="chronic">Chronic</option>
                  </select>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => removeCondition(i)}
                  style={{ alignSelf: 'flex-end', marginBottom: 2 }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ── Section 3: Comorbidity & Threshold Preset ── */}
        <div className="card" style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span className="material-symbols-outlined" style={{ color: 'var(--color-primary)' }}>
              tune
            </span>
            <div>
              <h3 className="font-headline-md" style={{ margin: 0 }}>
                Ontology Risk Threshold Tuning
              </h3>
              <p style={{ fontSize: 12, color: 'var(--color-on-surface-variant)', margin: '2px 0 0' }}>
                Automated threshold sensitivity adjustments based on patient comorbidities
              </p>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Comorbidity Rule Preset</label>
            <select
              className="form-select"
              value={comorbidityPreset}
              onChange={(e) => setComorbidityPreset(e.target.value)}
            >
              <option value="none">Standard Protocol (Default Threshold: 65%)</option>
              <option value="diabetes">Diabetes Mellitus (Adjusted Threshold: 55% — Lactate Sensitivity)</option>
              <option value="elderly">Geriatric Reserve / Age &gt; 65 (Adjusted Threshold: 60%)</option>
            </select>
          </div>
        </div>

        {/* ── Section 4: Initial Medications ── */}
        <div className="card" style={{ padding: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--color-primary)' }}>
                medication
              </span>
              <h3 className="font-headline-md" style={{ margin: 0 }}>
                Active Inpatient Medications
              </h3>
            </div>
            <button type="button" className="btn btn-sm btn-secondary" onClick={addMedication}>
              + Add Medication
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {medications.map((m, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr auto', gap: 12, alignItems: 'center' }}>
                <div className="form-group">
                  <label className="form-label">Drug Name</label>
                  <input
                    className="form-input"
                    placeholder="e.g. Norepinephrine"
                    value={m.name}
                    onChange={(e) => updateMedication(i, 'name', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Dosage</label>
                  <input
                    className="form-input"
                    placeholder="0.1 mcg/kg/min"
                    value={m.dosage}
                    onChange={(e) => updateMedication(i, 'dosage', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Frequency</label>
                  <select
                    className="form-select"
                    value={m.frequency}
                    onChange={(e) => updateMedication(i, 'frequency', e.target.value)}
                  >
                    <option value="Continuous">Continuous IV</option>
                    <option value="BID">BID (Twice Daily)</option>
                    <option value="TID">TID (Three Times)</option>
                    <option value="QID">QID (Four Times)</option>
                    <option value="Daily">Daily</option>
                    <option value="PRN">PRN (As Needed)</option>
                  </select>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => removeMedication(i)}
                  style={{ alignSelf: 'flex-end', marginBottom: 2 }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="error-banner">
            <span>{error}</span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => navigate('/dashboard')}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={loading}
          >
            {loading ? (
              'Creating Patient Graph Node…'
            ) : (
              <>
                <span className="material-symbols-outlined">person_add</span>
                <span>Admit &amp; Ingest to Telemetry Stream</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
