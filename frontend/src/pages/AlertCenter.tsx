import { useEffect, useState } from 'react';
import { get } from '../lib/api';
import { useAlertsStore } from '../stores/alerts';
import { useAlertSocket } from '../hooks/useAlertSocket';
import ActiveAlertsPanel from '../components/ActiveAlertsPanel';
import type { ActiveAlert } from '../types';

export default function AlertCenter() {
  const setActive = useAlertsStore((s) => s.setActive);
  const alerts = useAlertsStore((s) => s.active);
  const [loading, setLoading] = useState(true);
  const [filterUrgency, setFilterUrgency] = useState<string>('');
  const [filterWard, setFilterWard] = useState<string>('');

  useAlertSocket();

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

  // Extract unique wards from alert patient names (we don't have ward in alert data,
  // so filter is based on urgency only in this view)
  const urgencies = [...new Set(alerts.map((a) => a.urgency))];

  if (loading) {
    return (
      <div className="flex-col">
        <div className="skeleton skeleton-card" style={{ height: 300 }} />
      </div>
    );
  }

  return (
    <div className="flex-col">
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Alert Center</h1>

      {/* Filters */}
      <div className="flex-row" style={{ marginBottom: 'var(--gap)', gap: 12 }}>
        <div className="form-group" style={{ minWidth: 150 }}>
          <label className="form-label">Urgency</label>
          <select
            className="form-input"
            value={filterUrgency}
            onChange={(e) => setFilterUrgency(e.target.value)}
          >
            <option value="">All</option>
            {urgencies.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ minWidth: 150 }}>
          <label className="form-label">Ward</label>
          <input
            className="form-input"
            type="text"
            placeholder="Filter by ward…"
            value={filterWard}
            onChange={(e) => setFilterWard(e.target.value)}
          />
        </div>
      </div>

      <ActiveAlertsPanel />
    </div>
  );
}
