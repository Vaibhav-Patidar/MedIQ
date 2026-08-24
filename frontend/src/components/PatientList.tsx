import { useNavigate } from 'react-router-dom';
import { usePatientsStore } from '../stores/patients';
import { riskClass } from '../lib/utils';

export default function PatientList() {
  const patients = usePatientsStore((s) => s.list);
  const navigate = useNavigate();

  return (
    <div className="card">
      <h2 className="text-heading" style={{ marginBottom: 12 }}>Patients</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Age</th>
              <th>Ward / Bed</th>
              <th>Conditions</th>
              <th>Risk Score</th>
              <th>Window</th>
              <th>Assigned Doctor</th>
            </tr>
          </thead>
          <tbody>
            {patients.map((p) => (
              <tr
                key={p.patient_id}
                className="clickable"
                onClick={() => navigate(`/patients/${p.patient_id}`)}
              >
                <td style={{ fontWeight: 500 }}>{p.name}</td>
                <td>{p.age}{p.sex ? `/${p.sex}` : ''}</td>
                <td>{p.ward}/{p.bed_number}</td>
                <td>
                  {p.conditions.map((c, i) => (
                    <span key={i} className="pill" style={{ marginRight: 4 }}>
                      {c}
                    </span>
                  ))}
                </td>
                <td>
                  {p.current_risk_score !== null ? (
                    <span className={`text-mono ${riskClass(p.current_risk_score)}`} style={{ fontWeight: 600 }}>
                      {p.current_risk_score.toFixed(1)}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                  )}
                </td>
                <td>
                  {p.window_open ? (
                    <span className="badge badge-critical">⚠ OPEN</span>
                  ) : (
                    <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>Closed</span>
                  )}
                </td>
                <td style={{ color: 'var(--color-text-secondary)' }}>
                  {p.assigned_doctor || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
