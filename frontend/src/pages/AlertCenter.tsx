import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post } from '../lib/api';
import { useAlertsStore } from '../stores/alerts';
import { useAlertSocket } from '../hooks/useAlertSocket';
import { formatCountdown } from '../lib/utils';
import type { ActiveAlert } from '../types';

export default function AlertCenter() {
  const setActive = useAlertsStore((s) => s.setActive);
  const alerts = useAlertsStore((s) => s.active);
  const removeAlert = useAlertsStore((s) => s.removeAlert);
  const [loading, setLoading] = useState(true);
  const [filterUrgency, setFilterUrgency] = useState<string>('all');
  const [escalatedAlert, setEscalatedAlert] = useState<ActiveAlert | null>(null);
  const [showToast, setShowToast] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const navigate = useNavigate();

  useAlertSocket();

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const data = await get<ActiveAlert[]>('/alerts/active');
        setActive(data);
      } catch { /* handled */ }
      setLoading(false);
    }
    load();
  }, [setActive]);

  const handleAcknowledge = useCallback(async (windowId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await post(`/windows/${windowId}/acknowledge`);
      removeAlert(windowId);
      setShowToast('Alert successfully acknowledged and logged to clinical audit trail.');
      setTimeout(() => setShowToast(null), 3000);
    } catch {
      // silently fail
    }
  }, [removeAlert]);

  const handleEscalate = (alert: ActiveAlert, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEscalatedAlert(alert);
  };

  const confirmEscalation = (specialist: string) => {
    if (!escalatedAlert) return;
    setShowToast(`Emergency escalation paged to ${specialist} for patient ${escalatedAlert.patient_name}`);
    setTimeout(() => setShowToast(null), 3500);
    setEscalatedAlert(null);
  };

  const filteredAlerts = alerts.filter((a) => {
    if (filterUrgency === 'all') return true;
    return a.urgency.toLowerCase() === filterUrgency.toLowerCase();
  });

  const criticalAlerts = filteredAlerts.filter((a) => a.urgency === 'CRITICAL');
  const highAlerts = filteredAlerts.filter((a) => a.urgency !== 'CRITICAL');

  if (loading) {
    return (
      <div className="flex-col" style={{ gap: 20 }}>
        <div className="skeleton" style={{ height: 80 }} />
        <div className="skeleton" style={{ height: 200 }} />
        <div className="skeleton" style={{ height: 200 }} />
      </div>
    );
  }

  return (
    <div className="flex-col" style={{ gap: 32, position: 'relative' }}>
      {/* Ambient error glow */}
      <div style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: 380,
        height: 380,
        borderRadius: '50%',
        background: 'rgba(186, 26, 26, 0.04)',
        filter: 'blur(80px)',
        pointerEvents: 'none',
      }} />

      {/* ── Page Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--color-error)', marginBottom: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-error)', animation: 'pulseDot 1.5s infinite' }} />
            <span className="font-label-sm" style={{ color: 'var(--color-error)' }}>Active Clinical Alerts</span>
          </div>
          <h1 className="font-display-lg" style={{ margin: 0 }}>
            Cohort Monitoring
          </h1>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-on-surface-variant)' }}>
            Urgency:
          </span>
          <select
            className="form-select"
            value={filterUrgency}
            onChange={(e) => setFilterUrgency(e.target.value)}
            style={{ width: 'auto', padding: '6px 14px', fontSize: 13 }}
          >
            <option value="all">All Active Alerts ({alerts.length})</option>
            <option value="critical">Critical Only</option>
            <option value="high">High Only</option>
          </select>
        </div>
      </div>

      {filteredAlerts.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px 24px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--color-secondary)', marginBottom: 12, display: 'block' }}>
            check_circle
          </span>
          <h3 className="font-headline-md" style={{ margin: '0 0 6px' }}>
            No Active Early-Warning Alerts
          </h3>
          <p style={{ fontSize: 14, color: 'var(--color-on-surface-variant)', margin: '0 auto', maxWidth: 440 }}>
            All monitored sepsis trajectories in your assigned units are currently operating within safe baseline limits.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {/* ── CRITICAL SECTION ── */}
          {criticalAlerts.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <span className="badge badge-critical" style={{ fontSize: 12, padding: '4px 12px' }}>
                  CRITICAL ALERTS
                </span>
                <div style={{ flex: 1, height: 1, background: 'var(--color-outline-variant)' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {criticalAlerts.map((alert) => (
                  <div
                    key={alert.window_id}
                    onClick={() => navigate(`/patients/${alert.patient_id}`)}
                    className="card-elevated"
                    style={{
                      padding: 24,
                      borderLeft: '5px solid var(--color-error)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 20,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 18, flex: 1, minWidth: 280 }}>
                      <div style={{
                        width: 52,
                        height: 52,
                        borderRadius: 'var(--radius-lg)',
                        background: 'var(--color-error-container)',
                        color: 'var(--color-on-error-container)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 28 }}>monitor_heart</span>
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                          <h3 className="font-headline-md" style={{ margin: 0, fontSize: 18 }}>
                            {alert.patient_name} — High Risk Sepsis
                          </h3>
                          <span className="badge badge-critical">
                            {formatCountdown(alert.window_closes_at)}
                          </span>
                        </div>
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-on-surface-variant)' }}>
                          {alert.recommended_action || 'Immediate resuscitation bundle initiation and blood culture required.'}
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={(e) => handleAcknowledge(alert.window_id, e)}
                        style={{ border: '1px solid var(--color-outline-variant)' }}
                      >
                        Acknowledge
                      </button>

                      <button
                        className="btn btn-sm btn-danger"
                        onClick={(e) => handleEscalate(alert, e)}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>priority_high</span>
                        Escalate
                      </button>

                      <button
                        className="btn btn-sm btn-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/patients/${alert.patient_id}`);
                        }}
                      >
                        Open Workspace →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── HIGH / MEDIUM SECTION ── */}
          {highAlerts.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <span className="badge badge-high" style={{ fontSize: 12, padding: '4px 12px' }}>
                  ELEVATED RISK NOTIFICATIONS
                </span>
                <div style={{ flex: 1, height: 1, background: 'var(--color-outline-variant)' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
                {highAlerts.map((alert) => (
                  <div
                    key={alert.window_id}
                    onClick={() => navigate(`/patients/${alert.patient_id}`)}
                    className="card"
                    style={{
                      padding: 20,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          background: 'var(--color-tertiary-container)',
                          color: 'var(--color-on-tertiary-container)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>bloodtype</span>
                        </div>
                        <strong style={{ fontSize: 15 }}>{alert.patient_name}</strong>
                      </div>
                      <span className="text-mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-tertiary)' }}>
                        {formatCountdown(alert.window_closes_at)}
                      </span>
                    </div>

                    <p style={{ margin: 0, fontSize: 13, color: 'var(--color-on-surface-variant)', flex: 1 }}>
                      {alert.recommended_action}
                    </p>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8, borderTop: '1px solid var(--color-surface-container)' }}>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={(e) => handleAcknowledge(alert.window_id, e)}
                      >
                        Acknowledge
                      </button>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/patients/${alert.patient_id}`);
                        }}
                      >
                        View Case
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Escalation Modal ── */}
      {escalatedAlert && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="material-symbols-outlined" style={{ color: 'var(--color-error)', fontSize: 24 }}>
                  emergency_share
                </span>
                <h3 className="font-headline-md" style={{ margin: 0 }}>
                  Page Rapid Response Specialist
                </h3>
              </div>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setEscalatedAlert(null)}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: 14, color: 'var(--color-on-surface-variant)', marginBottom: 20 }}>
              Initiating code sepsis escalation for <strong>{escalatedAlert.patient_name}</strong>. Select the responding specialist team:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {[
                { name: 'Dr. Arjun Rao', role: 'ICU Critical Care Lead', phone: 'Ext 4812' },
                { name: 'Dr. Sarah Chen', role: 'Infectious Disease Specialist', phone: 'Ext 9104' },
                { name: 'Rapid Response Team Alpha', role: 'Floor Code Team', phone: 'Speed Dial 99' },
              ].map((spec) => (
                <div
                  key={spec.name}
                  onClick={() => confirmEscalation(spec.name)}
                  style={{
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-surface-container-low)',
                    border: '1px solid var(--color-outline-variant)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    transition: 'all var(--transition)',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-container-high)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-surface-container-low)')}
                >
                  <div>
                    <strong style={{ fontSize: 14, display: 'block' }}>{spec.name}</strong>
                    <span style={{ fontSize: 12, color: 'var(--color-on-surface-variant)' }}>{spec.role}</span>
                  </div>
                  <span className="badge badge-neutral text-mono">{spec.phone}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => setEscalatedAlert(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast Notification ── */}
      {showToast && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          background: 'var(--color-primary)',
          color: 'var(--color-on-primary)',
          padding: '14px 20px',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          zIndex: 100,
          fontSize: 13,
          fontWeight: 600,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>check_circle</span>
          <span>{showToast}</span>
        </div>
      )}
    </div>
  );
}
