import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { post } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import type { TokenResponse, LoginRequest } from '../types';

export default function Login() {
  const [email, setEmail] = useState('doctor@mediq.local');
  const [password, setPassword] = useState('');
  const [selectedWard, setSelectedWard] = useState('icu-3');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const setToken = useAuthStore((s) => s.setToken);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await post<TokenResponse>('/auth/login', { email, password } as LoginRequest, true);
      setToken(res.access_token, res.user);
      navigate('/dashboard');
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err) {
        setError('Clinician ID or passcode is incorrect.');
      } else {
        setError('Unable to connect to the server.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg)',
      position: 'relative',
      overflow: 'hidden',
      padding: 24,
    }}>
      {/* ── Ambient Background Glow Blobs ── */}
      <div style={{
        position: 'absolute',
        top: '-10%',
        right: '-10%',
        width: 480,
        height: 480,
        borderRadius: '50%',
        background: 'rgba(45, 105, 98, 0.08)',
        filter: 'blur(80px)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute',
        bottom: '-10%',
        left: '-10%',
        width: 420,
        height: 420,
        borderRadius: '50%',
        background: 'rgba(173, 239, 229, 0.15)',
        filter: 'blur(80px)',
        pointerEvents: 'none',
      }} />

      {/* ── Login Card ── */}
      <div className="card-elevated" style={{
        width: '100%',
        maxWidth: 440,
        padding: '40px 36px',
        position: 'relative',
        zIndex: 10,
        background: 'var(--color-surface-container-lowest)',
        border: '1px solid var(--color-outline-variant)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-lg)',
      }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: 'var(--radius-lg)',
            background: 'var(--color-primary)',
            color: 'var(--color-on-primary)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
            fontWeight: 700,
            fontFamily: 'var(--font-display)',
            boxShadow: '0 8px 20px rgba(13, 81, 74, 0.25)',
            marginBottom: 16,
          }}>
            M
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 600, color: 'var(--color-on-surface)', margin: 0 }}>
            MedIQ Portal
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-on-surface-variant)', marginTop: 4 }}>
            Clinical Access Verification
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Clinician ID */}
          <div className="form-group">
            <label className="form-label" htmlFor="email">Clinician ID / Email</label>
            <div style={{ position: 'relative' }}>
              <span className="material-symbols-outlined" style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-outline)',
                fontSize: 18,
              }}>
                badge
              </span>
              <input
                id="email"
                className="form-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="doctor@mediq.local"
                style={{ paddingLeft: 40 }}
              />
            </div>
          </div>

          {/* Passcode */}
          <div className="form-group">
            <label className="form-label" htmlFor="password">Passcode</label>
            <div style={{ position: 'relative' }}>
              <span className="material-symbols-outlined" style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-outline)',
                fontSize: 18,
              }}>
                lock
              </span>
              <input
                id="password"
                className={`form-input ${error ? 'error' : ''}`}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                style={{ paddingLeft: 40, paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-outline)',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
            {error && <p className="form-error" style={{ marginTop: 4 }}>{error}</p>}
          </div>

          {/* Ward Selection */}
          <div className="form-group">
            <label className="form-label" htmlFor="ward">Assigned Shift Ward</label>
            <div style={{ position: 'relative' }}>
              <span className="material-symbols-outlined" style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-outline)',
                fontSize: 18,
              }}>
                location_on
              </span>
              <select
                id="ward"
                className="form-select"
                value={selectedWard}
                onChange={(e) => setSelectedWard(e.target.value)}
                style={{ paddingLeft: 40 }}
              >
                <option value="icu-3">ICU-3 — Critical Care</option>
                <option value="icu-2">ICU-2 — Respiratory & Sepsis</option>
                <option value="icu-1">ICU-1 — Surgical Intensive</option>
                <option value="hdu-1">HDU-1 — High Dependency Unit</option>
              </select>
            </div>
          </div>

          {/* Remember Me & Support */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: 'var(--color-on-surface-variant)' }}>
              <input type="checkbox" defaultChecked style={{ accentColor: 'var(--color-primary)' }} />
              <span>Remember shift device</span>
            </label>
            <span style={{ color: 'var(--color-primary)', fontWeight: 600, cursor: 'pointer' }}>
              Support Desk
            </span>
          </div>

          {/* Submit */}
          <button
            className="btn btn-primary btn-lg"
            type="submit"
            disabled={loading}
            style={{ width: '100%', marginTop: 8 }}
          >
            {loading ? (
              <span>Authenticating…</span>
            ) : (
              <>
                <span>Authenticate Session</span>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* ── System Status Footer ── */}
      <div style={{
        marginTop: 24,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 18px',
        borderRadius: 'var(--radius-full)',
        background: 'var(--color-surface-container-high)',
        boxShadow: 'var(--shadow-sm)',
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--color-on-surface-variant)',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-secondary)' }} />
        <span>Core Systems Operational • HL7 Stream Active</span>
      </div>
    </div>
  );
}
