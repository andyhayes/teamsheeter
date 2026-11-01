import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { db } from '../lib/supabase';

/** Passwordless sign-in: an emailed magic link, or the code in the same email. */
export function LoginPage() {
  const { session } = useAuth();
  const [params] = useSearchParams();
  const next = params.get('next') || '/';
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session) return <Navigate to={next} replace />;

  const send = async () => {
    setBusy(true);
    setError(null);
    const { error } = await db().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}${next}` },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    const { error } = await db().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setError(error.message);
  };

  return (
    <main className="auth-page">
      <section className="card auth-card">
        <h1>
          <span aria-hidden>⚽</span> Teamsheeter
        </h1>
        {!sent ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <p className="muted">Sign in with your email. We'll send you a link, so there's no password to remember.</p>
            <label className="field">
              <span>Email</span>
              <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
            <button className="primary wide" disabled={busy || !email.includes('@')}>
              {busy ? 'Sending…' : 'Email me a sign-in link'}
            </button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              verify();
            }}
          >
            <p>
              Check <b>{email}</b> for a sign-in link. Opening it signs you in here.
            </p>
            <p className="muted small">If the link opens in a different browser, type the code from the email instead:</p>
            <label className="field">
              <span>Code</span>
              <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
            </label>
            <button className="primary wide" disabled={busy || code.trim().length < 6}>
              {busy ? 'Checking…' : 'Sign in'}
            </button>
            <button type="button" className="link" onClick={() => setSent(false)}>
              Use a different email
            </button>
          </form>
        )}
        {error && <p className="error-box">{error}</p>}
      </section>
    </main>
  );
}
