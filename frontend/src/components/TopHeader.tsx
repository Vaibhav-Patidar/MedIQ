import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import { usePatientsStore } from '../stores/patients';
import type { PatientListItem } from '../types';

export default function TopHeader() {
  const user = useAuthStore((s) => s.user);
  const patients = usePatientsStore((s) => s.list);
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);

  const filteredPatients = searchQuery.trim()
    ? patients.filter((p: PatientListItem) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.ward.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.bed_number.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  return (
    <header className="top-header">
      {/* ── Search Bar ── */}
      <div className="top-header-search">
        <span className="material-symbols-outlined">search</span>
        <input
          type="text"
          placeholder="Search patients, clinicians, or wards..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setShowSearchResults(true);
          }}
          onFocus={() => setShowSearchResults(true)}
          onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
        />

        {/* Quick Search Dropdown */}
        {showSearchResults && filteredPatients.length > 0 && (
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            background: 'var(--color-surface-container-lowest)',
            border: '1px solid var(--color-outline-variant)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 50,
            overflow: 'hidden',
          }}>
            {filteredPatients.slice(0, 5).map((p: PatientListItem) => (
              <div
                key={p.patient_id}
                onClick={() => {
                  navigate(`/patients/${p.patient_id}`);
                  setSearchQuery('');
                  setShowSearchResults(false);
                }}
                style={{
                  padding: '10px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--color-surface-container)',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-container-low)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div>
                  <strong style={{ fontSize: 13, color: 'var(--color-on-surface)' }}>{p.name}</strong>
                  <span style={{ fontSize: 11, color: 'var(--color-on-surface-variant)', marginLeft: 8 }}>
                    {p.ward} • Bed {p.bed_number}
                  </span>
                </div>
                {p.current_risk_score !== null && (
                  <span className="text-mono" style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: p.current_risk_score >= 65 ? 'var(--color-error)' : 'var(--color-secondary)',
                  }}>
                    {p.current_risk_score.toFixed(0)}%
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Status & Profile Actions ── */}
      <div className="top-header-actions">
        <div className="connection-badge">
          <span className="pulse-dot" />
          <span>Core Live Stream Active</span>
        </div>

        <div className="user-profile-chip">
          <div className="user-avatar">
            {user?.name ? user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'DR'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-on-surface)', lineHeight: 1.2 }}>
              {user?.name || 'Dr. Rao'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--color-on-surface-variant)', lineHeight: 1 }}>
              Attending Clinician
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
