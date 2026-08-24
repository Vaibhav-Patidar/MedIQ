import { useState, type FormEvent } from 'react';
import { post } from '../lib/api';
import type { VitalPostResponse } from '../types';

interface Props {
  patientId: string;
  onVitalPosted: (triggered: boolean) => void;
}

export default function VitalsEntryForm({ patientId, onVitalPosted }: Props) {
  const [fields, setFields] = useState({
    timestamp: new Date().toISOString().slice(0, 16),
    heart_rate: '',
    bp_systolic: '',
    bp_diastolic: '',
    temperature: '',
    respiratory_rate: '',
    spo2: '',
    wbc: '',
    lactate: '',
    creatinine: '',
    urine_output: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(true);

  function handleChange(field: string, value: string) {
    setFields((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: '' }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    const body: Record<string, unknown> = {
      timestamp: new Date(fields.timestamp).toISOString(),
    };
    for (const [key, val] of Object.entries(fields)) {
      if (key === 'timestamp') continue;
      if (val !== '') {
        body[key] = key === 'temperature' || key === 'lactate' || key === 'creatinine' || key === 'urine_output' || key === 'wbc' || key === 'spo2'
          ? parseFloat(val)
          : parseInt(val, 10);
      }
    }

    try {
      const res = await post<VitalPostResponse>(`/patients/${patientId}/vitals`, body);
      onVitalPosted(res.prediction_triggered);
      // Reset form
      setFields((f) => ({
        ...f,
        heart_rate: '', bp_systolic: '', bp_diastolic: '', temperature: '',
        respiratory_rate: '', spo2: '', wbc: '', lactate: '', creatinine: '', urine_output: '',
        timestamp: new Date().toISOString().slice(0, 16),
      }));
      setCollapsed(true);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'details' in err) {
        const apiErr = err as { details: { loc: string[]; msg: string }[] };
        if (Array.isArray(apiErr.details)) {
          const fieldErrors: Record<string, string> = {};
          apiErr.details.forEach((d) => {
            const field = d.loc[d.loc.length - 1];
            fieldErrors[field] = d.msg;
          });
          setErrors(fieldErrors);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <button
        className="text-heading"
        style={{
          background: 'none', border: 'none', cursor: 'pointer', display: 'flex',
          alignItems: 'center', gap: 6, padding: 0, fontFamily: 'var(--font-sans)',
          fontWeight: 500, fontSize: 16, color: 'var(--color-text-primary)',
        }}
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? '＋' : '−'} Enter Vitals
      </button>
      {!collapsed && (
        <form onSubmit={handleSubmit} style={{ marginTop: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">Timestamp</label>
              <input
                className="form-input"
                type="datetime-local"
                value={fields.timestamp}
                onChange={(e) => handleChange('timestamp', e.target.value)}
              />
            </div>
            {[
              { key: 'heart_rate', label: 'HR (bpm)' },
              { key: 'bp_systolic', label: 'BP Sys' },
              { key: 'bp_diastolic', label: 'BP Dia' },
              { key: 'temperature', label: 'Temp (°C)' },
              { key: 'respiratory_rate', label: 'RR' },
              { key: 'spo2', label: 'SpO2' },
              { key: 'wbc', label: 'WBC' },
              { key: 'lactate', label: 'Lactate' },
              { key: 'creatinine', label: 'Creatinine' },
              { key: 'urine_output', label: 'Urine (mL)' },
            ].map(({ key, label }) => (
              <div className="form-group" key={key}>
                <label className="form-label">{label}</label>
                <input
                  className={`form-input ${errors[key] ? 'error' : ''}`}
                  type="number"
                  step="any"
                  value={(fields as Record<string, string>)[key]}
                  onChange={(e) => handleChange(key, e.target.value)}
                />
                {errors[key] && <span className="form-error">{errors[key]}</span>}
              </div>
            ))}
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 12 }}>
            {loading ? 'Submitting…' : 'Submit Vitals'}
          </button>
        </form>
      )}
    </div>
  );
}
