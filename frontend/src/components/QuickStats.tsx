import { usePatientsStore } from '../stores/patients';
import { useAlertsStore } from '../stores/alerts';

export default function QuickStats() {
  const patients = usePatientsStore((s) => s.list);
  const alerts = useAlertsStore((s) => s.active);

  const total = patients.length;
  const critical = patients.filter((p) => p.window_open || (p.current_risk_score !== null && p.current_risk_score >= 65)).length;
  const activeAlertsCount = alerts.length;

  return (
    <div className="grid-4" style={{ marginBottom: 32 }}>
      {/* ── Metric 1: Active Alerts ── */}
      <div className="card" style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--color-surface-container)',
        border: '1px solid var(--color-outline-variant)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <span className="font-label-md" style={{ color: 'var(--color-on-surface-variant)' }}>
            Active Alerts
          </span>
          <span className="material-symbols-outlined" style={{ color: 'var(--color-error)' }}>
            warning
          </span>
        </div>
        <div>
          <div className="font-headline-lg text-mono" style={{ fontSize: 32, fontWeight: 700, color: 'var(--color-on-surface)' }}>
            {activeAlertsCount}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--color-error)' }}>
              arrow_upward
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-error)' }}>
              {activeAlertsCount > 0 ? 'Urgent attention needed' : 'All clear'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Metric 2: Critical Patients (Primary Teal Highlight) ── */}
      <div className="card" style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--color-primary)',
        color: 'var(--color-on-primary)',
        border: '1px solid var(--color-primary)',
        boxShadow: '0 8px 24px rgba(13, 81, 74, 0.25)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <span className="font-label-md" style={{ color: 'rgba(255, 255, 255, 0.85)' }}>
            Critical Sepsis Risk
          </span>
          <span className="material-symbols-outlined" style={{ color: 'var(--color-secondary-container)' }}>
            masks
          </span>
        </div>
        <div>
          <div className="font-headline-lg text-mono" style={{ fontSize: 32, fontWeight: 700, color: '#ffffff' }}>
            {critical}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--color-secondary-container)' }}>
              emergency
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-secondary-container)' }}>
              {critical} cohort cases monitored
            </span>
          </div>
        </div>
      </div>

      {/* ── Metric 3: Avg Intervention Time ── */}
      <div className="card" style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--color-surface-container)',
        border: '1px solid var(--color-outline-variant)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <span className="font-label-md" style={{ color: 'var(--color-on-surface-variant)' }}>
            Intervention Window
          </span>
          <span className="material-symbols-outlined" style={{ color: 'var(--color-primary)' }}>
            timer
          </span>
        </div>
        <div>
          <div className="font-headline-lg text-mono" style={{ fontSize: 32, fontWeight: 700, color: 'var(--color-on-surface)' }}>
            14m
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--color-primary)' }}>
              check_circle
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-primary)' }}>
              Within target (15m window)
            </span>
          </div>
        </div>
      </div>

      {/* ── Metric 4: Monitored Bed Capacity ── */}
      <div className="card" style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--color-surface-container)',
        border: '1px solid var(--color-outline-variant)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <span className="font-label-md" style={{ color: 'var(--color-on-surface-variant)' }}>
            Bed Census
          </span>
          <span className="material-symbols-outlined" style={{ color: 'var(--color-primary)' }}>
            bed
          </span>
        </div>
        <div>
          <div className="font-headline-lg text-mono" style={{ fontSize: 32, fontWeight: 700, color: 'var(--color-on-surface)' }}>
            {total} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--color-on-surface-variant)' }}>/ 16 Beds</span>
          </div>
          <div style={{
            width: '100%',
            height: 6,
            borderRadius: 3,
            background: 'var(--color-surface-container-highest)',
            marginTop: 10,
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${Math.min((total / 16) * 100, 100)}%`,
              height: '100%',
              background: 'var(--color-primary)',
              borderRadius: 3,
            }} />
          </div>
        </div>
      </div>
    </div>
  );
}
