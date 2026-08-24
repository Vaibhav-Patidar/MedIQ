import { usePatientsStore } from '../stores/patients';

export default function QuickStats() {
  const patients = usePatientsStore((s) => s.list);
  const total = patients.length;
  const openWindows = patients.filter((p) => p.window_open).length;
  const stable = total - openWindows;

  return (
    <div className="grid-3" style={{ marginBottom: 'var(--gap)' }}>
      <div className="card" style={{ textAlign: 'center' }}>
        <p className="text-label">Total Patients</p>
        <p className="text-metric-lg" style={{ marginTop: 4 }}>{total}</p>
      </div>
      <div className="card" style={{ textAlign: 'center' }}>
        <p className="text-label">Open Windows</p>
        <p className="text-metric-lg" style={{ marginTop: 4, color: openWindows > 0 ? 'var(--color-critical)' : 'var(--color-text-primary)' }}>
          {openWindows}
        </p>
      </div>
      <div className="card" style={{ textAlign: 'center' }}>
        <p className="text-label">Stable</p>
        <p className="text-metric-lg" style={{ marginTop: 4, color: 'var(--color-success)' }}>
          {stable}
        </p>
      </div>
    </div>
  );
}
