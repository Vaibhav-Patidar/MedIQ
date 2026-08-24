import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAlertsStore } from '../stores/alerts';
import { post } from '../lib/api';
import { urgencyClass, formatCountdown } from '../lib/utils';
import type { ActiveAlert } from '../types';

export default function ActiveAlertsPanel({ compact }: { compact?: boolean }) {
  const alerts = useAlertsStore((s) => s.active);
  const removeAlert = useAlertsStore((s) => s.removeAlert);
  const navigate = useNavigate();
  const [, setTick] = useState(0);

  // tick every second for countdown
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleAcknowledge = useCallback(async (windowId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await post(`/windows/${windowId}/acknowledge`);
      removeAlert(windowId);
    } catch {
      // silently fail
    }
  }, [removeAlert]);

  const displayed = compact ? alerts.slice(0, 5) : alerts;

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div className="flex-row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 className="text-heading">Active Alerts</h2>
        {compact && alerts.length > 5 && (
          <button className="btn btn-sm" onClick={() => navigate('/alerts')}>
            View All ({alerts.length})
          </button>
        )}
      </div>
      {displayed.length === 0 ? (
        <div className="empty-state">
          No active critical alerts.
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Patient</th>
                <th>Urgency</th>
                <th>Time Left</th>
                <th>Recommended Action</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((alert: ActiveAlert) => (
                <tr
                  key={alert.window_id}
                  className="clickable"
                  onClick={() => navigate(`/patients/${alert.patient_id}`)}
                >
                  <td style={{ fontWeight: 500 }}>{alert.patient_name}</td>
                  <td>
                    <span className={`badge badge-${urgencyClass(alert.urgency)}`}>
                      ⚠ {alert.urgency}
                    </span>
                  </td>
                  <td className="text-mono" style={{ fontSize: 13 }}>
                    {formatCountdown(alert.window_closes_at)}
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--color-text-secondary)', maxWidth: 300 }}>
                    {alert.recommended_action}
                  </td>
                  <td>
                    <button
                      className="btn btn-sm"
                      onClick={(e) => handleAcknowledge(alert.window_id, e)}
                    >
                      Acknowledge
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
