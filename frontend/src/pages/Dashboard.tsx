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

  // Connect to alert WebSocket
  useAlertSocket();

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
        <div className="grid-3">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
        <div className="skeleton skeleton-card" style={{ height: 200 }} />
        <div className="skeleton skeleton-card" style={{ height: 300 }} />
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
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Dashboard</h1>
      <QuickStats />
      <ActiveAlertsPanel compact />
      <PatientList />
    </div>
  );
}
