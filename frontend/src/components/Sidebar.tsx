import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';

export default function Sidebar() {
  const user = useAuthStore((s) => s.user);
  const clearToken = useAuthStore((s) => s.clearToken);
  const navigate = useNavigate();

  function handleLogout() {
    clearToken();
    navigate('/login');
  }

  return (
    <aside className="sidebar">
      {/* ── Brand Logo ── */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">M</div>
        <span className="sidebar-logo-text">MedIQ</span>
      </div>

      {/* ── Nav Links ── */}
      <nav className="sidebar-nav">
        <NavLink
          to="/dashboard"
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        >
          <span className="material-symbols-outlined">emergency_home</span>
          <span>Triage Dashboard</span>
        </NavLink>

        <NavLink
          to="/alerts"
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        >
          <span className="material-symbols-outlined">notifications_active</span>
          <span>Alert Center</span>
        </NavLink>

        <NavLink
          to="/patients/new"
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        >
          <span className="material-symbols-outlined">person_add</span>
          <span>New Patient</span>
        </NavLink>
      </nav>

      {/* ── Footer ── */}
      <div className="sidebar-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-secondary)' }} />
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-on-surface-variant)' }}>
            Core Live Connection
          </span>
        </div>

        {user && (
          <div style={{
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface-container)',
            fontSize: 12,
            color: 'var(--color-on-surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontWeight: 600 }}>{user.name}</span>
            <span style={{ fontSize: 10, color: 'var(--color-on-surface-variant)', textTransform: 'uppercase' }}>
              {user.role}
            </span>
          </div>
        )}

        <button
          className="sidebar-link"
          onClick={handleLogout}
          style={{ color: 'var(--color-error)' }}
        >
          <span className="material-symbols-outlined">logout</span>
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
