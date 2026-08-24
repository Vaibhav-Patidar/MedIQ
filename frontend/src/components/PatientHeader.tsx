import type { PatientDetail } from '../types';
import { reasonLabel, formatDate } from '../lib/utils';

export default function PatientHeader({ patient }: { patient: PatientDetail }) {
  const doctor = patient.assigned_doctor;

  return (
    <div className="card" style={{ marginBottom: 'var(--gap)' }}>
      <div className="flex-row" style={{ flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 4 }}>
            {patient.name}
          </h1>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
            {patient.age}{patient.sex ? `/${patient.sex}` : ''} · {patient.blood_type || '—'} · {patient.ward}/{patient.bed_number} · Admitted {formatDate(patient.admission_date)}
          </p>
        </div>
        {doctor && (
          <div style={{ textAlign: 'right', fontSize: 13 }}>
            <span className="text-label">Assigned Doctor</span>
            <p style={{ marginTop: 2, fontWeight: 500 }}>
              <span className={`availability-dot ${doctor.is_available ? 'available' : 'unavailable'}`} />
              {doctor.name}
            </p>
          </div>
        )}
      </div>
      <div className="flex-row" style={{ marginTop: 12, flexWrap: 'wrap', gap: 6 }}>
        {patient.conditions.map((c, i) => (
          <span key={i} className={`pill ${c.type === 'critical' ? 'pill-critical' : 'pill-chronic'}`}>
            {c.name} {c.icd_code ? `(${c.icd_code})` : ''}
          </span>
        ))}
        {patient.comorbidities.map((c, i) => (
          <span key={`co-${i}`} className="pill" style={{ gap: 4 }}>
            {c.name}
            {c.adjustment && (
              <span className="threshold-badge" style={{ marginLeft: 6 }}>
                Threshold adjusted: {reasonLabel(c.adjustment.reason)} — alert at {c.adjustment.threshold}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
