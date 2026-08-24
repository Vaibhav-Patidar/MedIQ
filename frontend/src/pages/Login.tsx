import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { post } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import type { TokenResponse, LoginRequest } from '../types';

export default function Login() {
  const [email, setEmail] = useState('doctor@mediq.local');
  const [password, setPassword] = useState('');
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
        setError('Email or password is incorrect.');
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
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg)',
    }}>
      <div className="card" style={{ width: '100%', maxWidth: 400, padding: 32 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            MedIQ
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 4 }}>
            Ontology-driven sepsis early-warning system
          </p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label" htmlFor="email">Email</label>
            <input
              id="email"
              className="form-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="form-group" style={{ marginBottom: 8 }}>
            <label className="form-label" htmlFor="password">Password</label>
            <input
              id="password"
              className={`form-input ${error ? 'error' : ''}`}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            {error && <p className="form-error" style={{ marginTop: 4 }}>{error}</p>}
          </div>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            style={{ width: '100%', marginTop: 16 }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
