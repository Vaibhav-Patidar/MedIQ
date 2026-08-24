import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAlertsStore } from '../stores/alerts';
import { post } from '../lib/api';
import { formatCountdown } from '../lib/utils';
import type { ActiveAlert } from '../types';

export default function ActiveAlertsPanel({ compact }: { compact?: boolean }) {
  const alerts = useAlertsStore((s) => s.active);
  const removeAlert = useAlertsStore((s) => s.removeAlert);
  const navigate = useNavigate();
  const [, setTick] = useState(0);

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
    <div className="card" style={{ marginBottom: 32, padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--color-error)', fontSize: 24 }}>
            notifications_active
          </span>
          <div>
            <h2 className="font-headline-md" style={{ margin: 0 }}>
              Live Intervention Windows
            </h2>
            <p style={{ fontSize: 12, color: 'var(--color-on-surface-variant)', margin: '2px 0 0' }}>
              Active countdown timers requiring clinical bundle response
            </p>
          </div>
        </div>

        {compact && alerts.length > 5 && (
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/alerts')}>
            View All ({alerts.length})
          </button>
        )}
      </div>

      {displayed.length === 0 ? (
        <div className="empty-state" style={{ padding: '32px 16px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 36, color: 'var(--color-secondary)', marginBottom: 8, display: 'block' }}>
            verified_user
          </span>
          <strong>No active critical alert windows.</strong>
          <p style={{ fontSize: 13, color: 'var(--color-on-surface-variant)', marginTop: 4 }}>
            All patient sepsis trajectories are currently within safe baseline parameters.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {displayed.map((alert: ActiveAlert) => {
            const isCritical = alert.urgency === 'CRITICAL' || alert.urgency === 'HIGH';
            return (
              <div
                key={alert.window_id}
                onClick={() => navigate(`/patients/${alert.patient_id}`)}
                style={{
                  background: 'var(--color-surface-container-low)',
                  borderLeft: `4px solid ${isCritical ? 'var(--color-error)' : 'var(--color-moderate)'}`,
                  borderRadius: 'var(--radius-md)',
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  cursor: 'pointer',
                  transition: 'all var(--transition)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <strong style={{ fontSize: 15, color: 'var(--color-on-surface)' }}>
                      {alert.patient_name}
                    </strong>
                    <span className={`badge ${isCritical ? 'badge-critical' : 'badge-high'}`}>
                      {alert.urgency}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--color-on-surface-variant)', margin: 0 }}>
                    {alert.recommended_action || 'Initiate Sepsis-3 resuscitation bundle and evaluate lactate.'}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-on-surface-variant)', display: 'block' }}>
                      Time Remaining
                    </span>
                    <span className="text-mono" style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: isCritical ? 'var(--color-error)' : 'var(--color-on-surface)',
                    }}>
                      {formatCountdown(alert.window_closes_at)}
                    </span>
                  </div>

                  <button
                    className="btn btn-sm"
                    onClick={(e) => handleAcknowledge(alert.window_id, e)}
                    style={{
                      background: 'var(--color-surface-container-lowest)',
                      fontWeight: 600,
                    }}
                  >
                    Acknowledge
                  </button>

                  <button
                    className="btn btn-primary btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/patients/${alert.patient_id}`);
                    }}
                  >
                    Open Case →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
