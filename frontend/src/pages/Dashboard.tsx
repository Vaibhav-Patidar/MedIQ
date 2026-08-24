import { useEffect, useState } from 'react';
import { get } from '../lib/api';
import { usePatientsStore } from '../stores/patients';
import { useAlertsStore } from '../stores/alerts';
import { useAlertSocket } from '../hooks/useAlertSocket';
import ActiveAlertsPanel from '../components/ActiveAlertsPanel';
import PatientList from '../components/PatientList';
import QuickStats from '../components/QuickStats';
import type { PatientListItem, ActiveAlert } from '../types';

export default function Dashboard() {
  const setList = usePatientsStore((s) => s.setList);
  const setActive = useAlertsStore((s) => s.setActive);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());

  // Connect to alert WebSocket
  useAlertSocket();

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [patients, alerts] = await Promise.all([
          get<PatientListItem[]>('/patients'),
          get<ActiveAlert[]>('/alerts/active'),
        ]);
        setList(patients);
        setActive(alerts);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [setList, setActive]);

  if (loading) {
    return (
      <div className="flex-col">
        <div className="grid-4">
          <div className="skeleton" style={{ height: 120 }} />
          <div className="skeleton" style={{ height: 120 }} />
          <div className="skeleton" style={{ height: 120 }} />
          <div className="skeleton" style={{ height: 120 }} />
        </div>
        <div className="skeleton" style={{ height: 200 }} />
        <div className="skeleton" style={{ height: 400 }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-banner">
        <span>{error}</span>
        <button className="btn btn-sm" onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="flex-col">
      {/* ── Page Header Section ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 }}>
        <div>
          <p className="font-label-md" style={{ color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
            System Live Telemetry
          </p>
          <h1 className="font-display-lg" style={{ margin: 0 }}>
            Triage Dashboard
          </h1>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--color-surface-container-high)',
          padding: '8px 18px',
          borderRadius: 'var(--radius-full)',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--color-on-surface-variant)',
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-secondary)' }} />
          <span>Live Data Stream</span>
          <span style={{ color: 'var(--color-outline)' }}>|</span>
          <span className="text-mono">{currentTime}</span>
        </div>
      </div>

      {/* ── Key Metrics Cards ── */}
      <QuickStats />

      {/* ── Live Alerts & Intervention Windows ── */}
      <ActiveAlertsPanel compact />

      {/* ── Patient Cohort Table ── */}
      <PatientList />
    </div>
  );
}
