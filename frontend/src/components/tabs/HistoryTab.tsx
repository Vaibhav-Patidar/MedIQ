import { useEffect, useState } from 'react';
import { get, put } from '../../lib/api';
import type { Intervention, WindowHistory, SepsisPrediction } from '../../types';
import { formatDateTime } from '../../lib/utils';

export default function HistoryTab({ patientId }: { patientId: string }) {
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [windows, setWindows] = useState<WindowHistory[]>([]);
  const [predictions, setPredictions] = useState<SepsisPrediction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [intv, wins, preds] = await Promise.all([
          get<Intervention[]>(`/patients/${patientId}/interventions`),
          get<WindowHistory[]>(`/patients/${patientId}/windows`),
          get<SepsisPrediction[]>(`/patients/${patientId}/predictions/history`),
        ]);
        setInterventions(intv);
        setWindows(wins);
        setPredictions(preds);
      } catch { /* handled by envelope */ }
      setLoading(false);
    }
    load();
  }, [patientId]);

  async function recordOutcome(interventionId: string, outcome: string) {
    try {
      const updated = await put<Intervention>(`/interventions/${interventionId}/outcome`, { outcome });
      setInterventions((prev) =>
        prev.map((i) => (i.intervention_id === interventionId ? updated : i))
      );
    } catch { /* handled */ }
  }

  if (loading) {
    return <div className="skeleton" style={{ height: 240, borderRadius: 'var(--radius-lg)' }} />;
  }

  return (
    <div className="flex-col" style={{ gap: 24 }}>
      {/* ── Interventions Log ── */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--color-primary)' }}>
            clinical_notes
          </span>
          <h3 className="font-headline-md" style={{ margin: 0 }}>
            Clinical Intervention Log
          </h3>
        </div>

        {interventions.length === 0 ? (
          <div className="empty-state">No clinical interventions logged for this stay.</div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Clinical Action / Protocol</th>
                  <th>Timestamp</th>
                  <th>Patient Outcome</th>
                  <th>Record Outcome</th>
                </tr>
              </thead>
              <tbody>
                {interventions.map((intv) => (
                  <tr key={intv.intervention_id}>
                    <td>
                      <span className="badge badge-neutral" style={{ fontWeight: 600 }}>
                        {intv.type.replace('_', ' ')}
                      </span>
                    </td>
                    <td style={{ maxWidth: 320, fontSize: 13 }}>{intv.description}</td>
                    <td className="text-mono" style={{ fontSize: 12 }}>{formatDateTime(intv.performed_at)}</td>
                    <td>
                      {intv.outcome ? (
                        <span className={`badge ${intv.outcome === 'improved' ? 'badge-stable' : intv.outcome === 'deteriorated' ? 'badge-critical' : 'badge-high'}`}>
                          {intv.outcome}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-outline)', fontSize: 12 }}>Pending Evaluation</span>
                      )}
                    </td>
                    <td>
                      {!intv.outcome && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-sm btn-secondary" onClick={() => recordOutcome(intv.intervention_id, 'improved')}>
                            Improved
                          </button>
                          <button className="btn btn-sm btn-ghost" onClick={() => recordOutcome(intv.intervention_id, 'no_change')}>
                            Stable
                          </button>
                          <button className="btn btn-sm btn-danger" onClick={() => recordOutcome(intv.intervention_id, 'deteriorated')}>
                            Deteriorated
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Window History ── */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--color-primary)' }}>
            timer
          </span>
          <h3 className="font-headline-md" style={{ margin: 0 }}>
            Intervention Window History
          </h3>
        </div>

        {windows.length === 0 ? (
          <div className="empty-state">No past intervention alert windows.</div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Window Token</th>
                  <th>Urgency Level</th>
                  <th>Expiry Timestamp</th>
                  <th>Recommended Care Bundle</th>
                </tr>
              </thead>
              <tbody>
                {windows.map((w) => (
                  <tr key={w.window_id}>
                    <td className="text-mono" style={{ fontSize: 12, fontWeight: 600 }}>
                      #{w.window_id.slice(0, 8).toUpperCase()}
                    </td>
                    <td>
                      <span className={`badge badge-${w.urgency?.toLowerCase() === 'critical' ? 'critical' : 'high'}`}>
                        {w.urgency}
                      </span>
                    </td>
                    <td className="text-mono" style={{ fontSize: 12 }}>
                      {w.window_closes_at ? formatDateTime(w.window_closes_at) : '—'}
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--color-on-surface-variant)' }}>
                      {w.recommended_action}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Prediction Snapshots ── */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--color-primary)' }}>
            analytics
          </span>
          <h3 className="font-headline-md" style={{ margin: 0 }}>
            Model Inference Snapshot History
          </h3>
        </div>

        {predictions.length === 0 ? (
          <div className="empty-state">No inference snapshots available.</div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Generated At</th>
                  <th>Risk Score</th>
                  <th>Score Delta</th>
                  <th>Urgency</th>
                  <th>Window Status</th>
                  <th>Threshold</th>
                </tr>
              </thead>
              <tbody>
                {predictions.map((p, i) => (
                  <tr key={i}>
                    <td className="text-mono" style={{ fontSize: 12 }}>{formatDateTime(p.generated_at)}</td>
                    <td className="text-mono" style={{
                      fontWeight: 700,
                      color: p.risk_score >= 65 ? 'var(--color-error)' : 'var(--color-on-surface)',
                    }}>
                      {p.risk_score.toFixed(1)}%
                    </td>
                    <td className="text-mono" style={{ fontSize: 12 }}>{p.risk_score_change || '—'}</td>
                    <td>
                      <span className={`badge ${p.urgency === 'CRITICAL' ? 'badge-critical' : p.urgency === 'HIGH' ? 'badge-high' : 'badge-stable'}`}>
                        {p.urgency}
                      </span>
                    </td>
                    <td>
                      {p.window_open ? (
                        <span className="badge badge-critical">Active Window</span>
                      ) : (
                        <span className="badge badge-neutral">Closed</span>
                      )}
                    </td>
                    <td className="text-mono" style={{ fontSize: 12 }}>{p.threshold_used}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
