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
    <div className="card" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--color-primary)' }}>
            add_chart
          </span>
          <div>
            <h3 className="font-headline-md" style={{ margin: 0 }}>
              Bedside Telemetry Entry
            </h3>
            <p style={{ fontSize: 12, color: 'var(--color-on-surface-variant)', margin: '2px 0 0' }}>
              Manual physiologic vital signs recording with immediate inference trigger
            </p>
          </div>
        </div>

        <button
          className="btn btn-sm btn-secondary"
          type="button"
          onClick={() => setCollapsed(!collapsed)}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            {collapsed ? 'add' : 'remove'}
          </span>
          <span>{collapsed ? 'Open Entry Form' : 'Collapse'}</span>
        </button>
      </div>

      {!collapsed && (
        <form onSubmit={handleSubmit} style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Measurement Timestamp</label>
              <input
                className="form-input"
                type="datetime-local"
                value={fields.timestamp}
                onChange={(e) => handleChange('timestamp', e.target.value)}
              />
            </div>

            {[
              { key: 'heart_rate', label: 'Heart Rate (bpm)' },
              { key: 'bp_systolic', label: 'BP Systolic (mmHg)' },
              { key: 'bp_diastolic', label: 'BP Diastolic (mmHg)' },
              { key: 'temperature', label: 'Temperature (°C)' },
              { key: 'respiratory_rate', label: 'Resp. Rate (/min)' },
              { key: 'spo2', label: 'SpO2 (%)' },
              { key: 'wbc', label: 'WBC (10^3/uL)' },
              { key: 'lactate', label: 'Lactate (mmol/L)' },
              { key: 'creatinine', label: 'Creatinine (mg/dL)' },
              { key: 'urine_output', label: 'Urine Output (mL)' },
            ].map(({ key, label }) => (
              <div className="form-group" key={key}>
                <label className="form-label">{label}</label>
                <input
                  className={`form-input ${errors[key] ? 'error' : ''}`}
                  type="number"
                  step="any"
                  placeholder="—"
                  value={(fields as Record<string, string>)[key]}
                  onChange={(e) => handleChange(key, e.target.value)}
                />
                {errors[key] && <span className="form-error">{errors[key]}</span>}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setCollapsed(true)}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={loading}
            >
              {loading ? (
                'Submitting Telemetry…'
              ) : (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>bolt</span>
                  <span>Record &amp; Trigger Prediction</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
