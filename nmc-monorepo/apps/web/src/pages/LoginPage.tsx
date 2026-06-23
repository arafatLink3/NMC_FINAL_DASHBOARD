// Login page — talks to the Fastify server via @nmc/api-client.
// Offers two flows: sign in (email or username + password) and
// self-service signup (must use a @link3.net email). The default
// admin (`admin@link3.net` / `admin123`) is seeded by the server.

import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

type Mode = 'login' | 'signup';

export function LoginPage() {
  const { login, signup, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isLink3 = useMemo(() => email.toLowerCase().endsWith('@link3.net'), [email]);
  const passwordOk = password.length >= 8;
  const signupValid = isLink3 && passwordOk;
  const loginValid = email.length > 0 && password.length > 0;

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (mode === 'login') {
        await login(email, password);
        const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
        navigate(from ?? '/dashboard', { replace: true });
      } else {
        await signup(email, password, displayName.trim() || undefined);
        navigate('/dashboard', { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : (mode === 'login' ? 'Login failed' : 'Signup failed'));
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: 'var(--bg)' }}>
      <form className="card" style={{ width: 380, maxWidth: '100%' }} onSubmit={onSubmit}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg, var(--primary), #8b5cf6)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800 }}>N</div>
          <h2 style={{ margin: 0 }}>NMC Portal</h2>
        </div>

        <div role="tablist" aria-label="auth mode" style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--surface-2, rgba(0,0,0,0.05))', borderRadius: 8, marginBottom: 12 }}>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            onClick={() => switchMode('login')}
            style={{
              flex: 1,
              padding: '8px 10px',
              borderRadius: 6,
              border: 'none',
              background: mode === 'login' ? 'var(--surface, #fff)' : 'transparent',
              color: mode === 'login' ? 'var(--text, #111)' : 'var(--muted, #666)',
              fontWeight: mode === 'login' ? 600 : 500,
              cursor: 'pointer',
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            onClick={() => switchMode('signup')}
            style={{
              flex: 1,
              padding: '8px 10px',
              borderRadius: 6,
              border: 'none',
              background: mode === 'signup' ? 'var(--surface, #fff)' : 'transparent',
              color: mode === 'signup' ? 'var(--text, #111)' : 'var(--muted, #666)',
              fontWeight: mode === 'signup' ? 600 : 500,
              cursor: 'pointer',
            }}
          >
            Create account
          </button>
        </div>

        <p className="muted" style={{ marginTop: 0 }}>
          {mode === 'login'
            ? 'Sign in to access the dashboard.'
            : 'Create a new operator account. Use your @link3.net email address.'}
        </p>

        <div className="row" style={{ gap: 12 }}>
          <div className="col-12">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              placeholder={mode === 'signup' ? 'you@link3.net' : 'admin@link3.net'}
            />
          </div>
          {mode === 'signup' && (
            <div className="col-12">
              <label>Display name <span className="muted" style={{ fontSize: 12 }}>(optional)</span></label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                maxLength={120}
              />
            </div>
          )}
          <div className="col-12">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'signup' ? 8 : 1}
            />
            {mode === 'signup' && (
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Min 8 characters. Use your @link3.net email — other domains are rejected.
              </div>
            )}
          </div>
          {error && (
            <div className="col-12" style={{ color: 'var(--danger)', fontSize: 13 }}>
              {error}
            </div>
          )}
          {mode === 'signup' && email.length > 0 && !isLink3 && (
            <div className="col-12" style={{ color: 'var(--danger)', fontSize: 12 }}>
              Email must end with <code>@link3.net</code>.
            </div>
          )}
          <div className="col-12">
            <button
              className="btn"
              type="submit"
              disabled={loading || (mode === 'signup' ? !signupValid : !loginValid)}
              style={{ width: '100%' }}
            >
              {loading
                ? (mode === 'login' ? 'Signing in…' : 'Creating account…')
                : (mode === 'login' ? 'Sign in' : 'Create account')}
            </button>
          </div>
        </div>

        <div className="muted" style={{ marginTop: 12, fontSize: 12 }}>
          {mode === 'login' ? (
            <>
              New here? <a href="#" onClick={(e) => { e.preventDefault(); switchMode('signup'); }}>Create an account</a>.
              <br />
              Default admin: <code>admin@link3.net</code> / <code>admin123</code> (override via{' '}
              <code>tsx server/src/bin/seed-users.ts &lt;email&gt; &lt;password&gt;</code>).
            </>
          ) : (
            <>
              Already have an account? <a href="#" onClick={(e) => { e.preventDefault(); switchMode('login'); }}>Sign in</a>.
            </>
          )}
        </div>
      </form>
    </div>
  );
}
