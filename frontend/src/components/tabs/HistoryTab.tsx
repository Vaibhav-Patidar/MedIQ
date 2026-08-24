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
    return <div className="skeleton skeleton-card" style={{ height: 200 }} />;
  }

  return (
    <div className="flex-col">
      {/* Interventions */}
      <div className="card">
        <h2 className="text-heading" style={{ marginBottom: 12 }}>Intervention Log</h2>
        {interventions.length === 0 ? (
          <div className="empty-state">No interventions logged.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Performed At</th>
                  <th>Outcome</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {interventions.map((intv) => (
                  <tr key={intv.intervention_id}>
                    <td><span className="badge badge-info">{intv.type.replace('_', ' ')}</span></td>
                    <td style={{ maxWidth: 300, fontSize: 13 }}>{intv.description}</td>
                    <td className="text-mono" style={{ fontSize: 12 }}>{formatDateTime(intv.performed_at)}</td>
                    <td>
                      {intv.outcome ? (
                        <span className={`badge ${intv.outcome === 'improved' ? 'badge-success' : intv.outcome === 'deteriorated' ? 'badge-critical' : 'badge-medium'}`}>
                          {intv.outcome}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>Pending</span>
                      )}
                    </td>
                    <td>
                      {!intv.outcome && (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-sm" onClick={() => recordOutcome(intv.intervention_id, 'improved')}>Improved</button>
                          <button className="btn btn-sm" onClick={() => recordOutcome(intv.intervention_id, 'no_change')}>No Change</button>
                          <button className="btn btn-sm" onClick={() => recordOutcome(intv.intervention_id, 'deteriorated')}>Deteriorated</button>
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

      {/* Window History */}
      <div className="card">
        <h2 className="text-heading" style={{ marginBottom: 12 }}>Window History</h2>
        {windows.length === 0 ? (
          <div className="empty-state">No intervention windows recorded.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Window ID</th>
                  <th>Urgency</th>
                  <th>Closes At</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {windows.map((w) => (
                  <tr key={w.window_id}>
                    <td className="text-mono" style={{ fontSize: 11 }}>{w.window_id.slice(0, 8)}</td>
                    <td><span className={`badge badge-${w.urgency?.toLowerCase() || 'low'}`}>{w.urgency}</span></td>
                    <td className="text-mono" style={{ fontSize: 12 }}>{w.window_closes_at ? formatDateTime(w.window_closes_at) : '—'}</td>
                    <td style={{ fontSize: 13 }}>{w.recommended_action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Prediction Snapshots */}
      <div className="card">
        <h2 className="text-heading" style={{ marginBottom: 12 }}>Prediction Snapshots</h2>
        {predictions.length === 0 ? (
          <div className="empty-state">No prediction history.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Generated At</th>
                  <th>Risk Score</th>
                  <th>Change</th>
                  <th>Urgency</th>
                  <th>Window</th>
                  <th>Threshold</th>
                </tr>
              </thead>
              <tbody>
                {predictions.map((p, i) => (
                  <tr key={i}>
                    <td className="text-mono" style={{ fontSize: 12 }}>{formatDateTime(p.generated_at)}</td>
                    <td className="text-mono" style={{ fontWeight: 600 }}>{p.risk_score.toFixed(1)}</td>
                    <td className="text-mono">{p.risk_score_change || '—'}</td>
                    <td><span className={`badge badge-${p.urgency.toLowerCase()}`}>{p.urgency}</span></td>
                    <td>{p.window_open ? 'Open' : 'Closed'}</td>
                    <td className="text-mono">{p.threshold_used}</td>
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
