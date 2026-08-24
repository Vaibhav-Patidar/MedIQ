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
  const [ward, setWard] = useState('ICU-1');
  const [bedNumber, setBedNumber] = useState('');

  // Conditions
  const [conditions, setConditions] = useState<{ name: string; icd_code: string; type: string }[]>([
    { name: 'Sepsis', icd_code: 'A41.9', type: 'critical' },
  ]);

  // Comorbidity preset
  const [comorbidityPreset, setComorbidityPreset] = useState('none');

  // Medications
  const [medications, setMedications] = useState<{ name: string; dosage: string; frequency: string }[]>([]);

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
        name: 'Diabetes',
        threshold_adjustment: 55,
        adjustment_reason: 'diabetic_lactate_sensitivity',
      });
    } else if (comorbidityPreset === 'elderly') {
      comorbidities.push({
        name: 'Elderly >65',
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
      setError(err instanceof Error ? err.message : 'Failed to create patient');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>New Patient</h1>
      <form onSubmit={handleSubmit}>
        <div className="card flex-col" style={{ marginBottom: 'var(--gap)' }}>
          <h2 className="text-heading">Patient Information</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Age</label>
              <input className="form-input" type="number" value={age} onChange={(e) => setAge(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Sex</label>
              <select className="form-input" value={sex} onChange={(e) => setSex(e.target.value)}>
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Blood Type</label>
              <select className="form-input" value={bloodType} onChange={(e) => setBloodType(e.target.value)}>
                {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((bt) => (
                  <option key={bt} value={bt}>{bt}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Admission Date</label>
              <input className="form-input" type="datetime-local" value={admissionDate} onChange={(e) => setAdmissionDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Ward</label>
              <input className="form-input" value={ward} onChange={(e) => setWard(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Bed Number</label>
              <input className="form-input" value={bedNumber} onChange={(e) => setBedNumber(e.target.value)} required />
            </div>
          </div>
        </div>

        {/* Conditions */}
        <div className="card flex-col" style={{ marginBottom: 'var(--gap)' }}>
          <div className="flex-row" style={{ justifyContent: 'space-between' }}>
            <h2 className="text-heading">Conditions</h2>
            <button type="button" className="btn btn-sm" onClick={addCondition}>+ Add</button>
          </div>
          {conditions.map((c, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px auto', gap: 8, alignItems: 'end' }}>
              <div className="form-group">
                <label className="form-label">Name</label>
                <input className="form-input" value={c.name} onChange={(e) => updateCondition(i, 'name', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">ICD Code</label>
                <input className="form-input" value={c.icd_code} onChange={(e) => updateCondition(i, 'icd_code', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-input" value={c.type} onChange={(e) => updateCondition(i, 'type', e.target.value)}>
                  <option value="critical">Critical</option>
                  <option value="chronic">Chronic</option>
                </select>
              </div>
              <button type="button" className="btn btn-sm" onClick={() => removeCondition(i)} style={{ marginBottom: 4 }}>×</button>
            </div>
          ))}
        </div>

        {/* Comorbidities */}
        <div className="card flex-col" style={{ marginBottom: 'var(--gap)' }}>
          <h2 className="text-heading">Comorbidities</h2>
          <div className="form-group">
            <label className="form-label">Preset</label>
            <select className="form-input" value={comorbidityPreset} onChange={(e) => setComorbidityPreset(e.target.value)}>
              <option value="none">None</option>
              <option value="diabetes">Diabetes (threshold 55, reason: diabetic_lactate_sensitivity)</option>
              <option value="elderly">Elderly &gt;65 (threshold 60, reason: elderly_reduced_reserve)</option>
            </select>
          </div>
        </div>

        {/* Medications */}
        <div className="card flex-col" style={{ marginBottom: 'var(--gap)' }}>
          <div className="flex-row" style={{ justifyContent: 'space-between' }}>
            <h2 className="text-heading">Medications</h2>
            <button type="button" className="btn btn-sm" onClick={addMedication}>+ Add</button>
          </div>
          {medications.map((m, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px auto', gap: 8, alignItems: 'end' }}>
              <div className="form-group">
                <label className="form-label">Name</label>
                <input className="form-input" value={m.name} onChange={(e) => updateMedication(i, 'name', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Dosage</label>
                <input className="form-input" value={m.dosage} onChange={(e) => updateMedication(i, 'dosage', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Frequency</label>
                <select className="form-input" value={m.frequency} onChange={(e) => updateMedication(i, 'frequency', e.target.value)}>
                  <option value="BID">BID</option>
                  <option value="TID">TID</option>
                  <option value="QID">QID</option>
                  <option value="daily">Daily</option>
                  <option value="PRN">PRN</option>
                </select>
              </div>
              <button type="button" className="btn btn-sm" onClick={() => removeMedication(i)} style={{ marginBottom: 4 }}>×</button>
            </div>
          ))}
        </div>

        {error && <div className="error-banner" style={{ marginBottom: 12 }}>{error}</div>}

        <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
          {loading ? 'Creating…' : 'Create Patient'}
        </button>
      </form>
    </div>
  );
}
