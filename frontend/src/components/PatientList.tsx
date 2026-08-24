import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePatientsStore } from '../stores/patients';
import { riskClass } from '../lib/utils';

export default function PatientList() {
  const patients = usePatientsStore((s) => s.list);
  const navigate = useNavigate();
  const [selectedWard, setSelectedWard] = useState<string>('all');
  const [minRisk, setMinRisk] = useState<number>(0);

  const filteredPatients = patients.filter((p) => {
    if (selectedWard !== 'all' && p.ward.toLowerCase() !== selectedWard.toLowerCase()) {
      return false;
    }
    if (minRisk > 0 && (p.current_risk_score === null || p.current_risk_score < minRisk)) {
      return false;
    }
    return true;
  });

  const uniqueWards = Array.from(new Set(patients.map((p) => p.ward)));

  return (
    <div className="card" style={{ padding: 28 }}>
      {/* ── Header & Filters Bar ── */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 16,
        marginBottom: 24,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ color: 'var(--color-primary)' }}>
              group
            </span>
            <h2 className="font-headline-md" style={{ margin: 0 }}>
              Cohort Triage Registry
            </h2>
          </div>
          <p style={{ fontSize: 13, color: 'var(--color-on-surface-variant)', margin: '2px 0 0' }}>
            Real-time streaming telemetry and early-warning scores across hospital units
          </p>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Ward Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-on-surface-variant)' }}>
              Ward:
            </span>
            <select
              className="form-select"
              value={selectedWard}
              onChange={(e) => setSelectedWard(e.target.value)}
              style={{ width: 'auto', padding: '6px 12px', fontSize: 13 }}
            >
              <option value="all">All Hospital Wards</option>
              {uniqueWards.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          </div>

          {/* Risk Filter Buttons */}
          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { label: 'All Risk', val: 0 },
              { label: 'High (≥55%)', val: 55 },
              { label: 'Critical (≥70%)', val: 70 },
            ].map((rf) => (
              <button
                key={rf.val}
                onClick={() => setMinRisk(rf.val)}
                className={`btn btn-sm ${minRisk === rf.val ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: 12 }}
              >
                {rf.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Patient</th>
              <th>Location</th>
              <th>Diagnoses & Comorbidities</th>
              <th>Sepsis Risk Score</th>
              <th>Window Status</th>
              <th>Attending Physician</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredPatients.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--color-outline)' }}>
                  No patients match the selected filter criteria.
                </td>
              </tr>
            ) : (
              filteredPatients.map((p) => {
                const isHighRisk = p.current_risk_score !== null && p.current_risk_score >= 65;
                const riskVal = p.current_risk_score !== null ? p.current_risk_score : 0;

                return (
                  <tr
                    key={p.patient_id}
                    onClick={() => navigate(`/patients/${p.patient_id}`)}
                    style={{ cursor: 'pointer', transition: 'background 0.15s ease' }}
                  >
                    {/* Patient Name + Avatar */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 38,
                          height: 38,
                          borderRadius: '50%',
                          background: isHighRisk ? 'var(--color-error-container)' : 'var(--color-surface-container-high)',
                          color: isHighRisk ? 'var(--color-on-error-container)' : 'var(--color-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: 13,
                        }}>
                          {p.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <strong style={{ fontSize: 14, color: 'var(--color-on-surface)', display: 'block' }}>
                            {p.name}
                          </strong>
                          <span style={{ fontSize: 12, color: 'var(--color-on-surface-variant)' }}>
                            {p.age}Y • {p.sex}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Location */}
                    <td>
                      <span className="badge badge-neutral" style={{ fontWeight: 600 }}>
                        {p.ward} • Bed {p.bed_number}
                      </span>
                    </td>

                    {/* Conditions */}
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 280 }}>
                        {p.conditions.map((c, i) => (
                          <span
                            key={i}
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: 12,
                              background: 'var(--color-surface-container-high)',
                              color: 'var(--color-on-surface)',
                            }}
                          >
                            {c}
                          </span>
                        ))}
                        {p.comorbidities.map((c, i) => (
                          <span
                            key={`com-${i}`}
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: 12,
                              background: 'rgba(217, 119, 6, 0.12)',
                              color: '#b45309',
                            }}
                          >
                            + {c}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Sepsis Risk Score + Bar */}
                    <td>
                      {p.current_risk_score !== null ? (
                        <div style={{ width: 140 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                            <span
                              className={`text-mono ${riskClass(p.current_risk_score)}`}
                              style={{
                                fontSize: 16,
                                fontWeight: 700,
                                color: isHighRisk ? 'var(--color-error)' : 'var(--color-on-surface)',
                              }}
                            >
                              {p.current_risk_score.toFixed(1)}%
                            </span>
                            <span style={{ fontSize: 10, color: 'var(--color-on-surface-variant)' }}>
                              {isHighRisk ? 'CRITICAL' : 'NORMAL'}
                            </span>
                          </div>
                          <div style={{
                            width: '100%',
                            height: 6,
                            borderRadius: 3,
                            background: 'var(--color-surface-container-highest)',
                            overflow: 'hidden',
                          }}>
                            <div style={{
                              width: `${Math.min(riskVal, 100)}%`,
                              height: '100%',
                              background: isHighRisk ? 'var(--color-error)' : 'var(--color-primary)',
                              borderRadius: 3,
                            }} />
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--color-outline)', fontSize: 13 }}>Pending vitals</span>
                      )}
                    </td>

                    {/* Window */}
                    <td>
                      {p.window_open ? (
                        <span className="badge badge-critical" style={{ animation: 'pulseDot 2s infinite' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>warning</span>
                          OPEN
                        </span>
                      ) : (
                        <span className="badge badge-stable">
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>
                          CLOSED
                        </span>
                      )}
                    </td>

                    {/* Doctor */}
                    <td>
                      <span style={{ fontSize: 13, color: 'var(--color-on-surface-variant)' }}>
                        {p.assigned_doctor || 'Unassigned'}
                      </span>
                    </td>

                    {/* Action */}
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/patients/${p.patient_id}`);
                        }}
                        style={{ color: 'var(--color-primary)', fontWeight: 600 }}
                      >
                        Workspace →
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
