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
    <nav className="sidebar">
      <div className="sidebar-logo">
        <img src="/logo-icon.svg" alt="MedIQ" style={{ width: 32, height: 32 }} />
        <span>MedIQ</span>
      </div>
      <NavLink to="/dashboard" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
        </svg>
        Dashboard
      </NavLink>
      <NavLink to="/alerts" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        Alert Center
      </NavLink>
      <NavLink to="/patients/new" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        New Patient
      </NavLink>
      <div style={{ flex: 1 }} />
      {user && (
        <div style={{ padding: '8px 12px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
          {user.name}
        </div>
      )}
      <button className="sidebar-link" onClick={handleLogout}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        Logout
      </button>
    </nav>
  );
}

