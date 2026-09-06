import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../auth/api';

// Kept in step with MIN_PASSWORD_LENGTH in worker/security.ts, which is
// the check that actually decides.
const MIN_PASSWORD = 8;

/**
 * Reached from the emailed link, `/reset?token=…`. On success it sends the
 * user back to `/` rather than signing them in — the reset endpoint clears
 * every session for the account, so there is nothing to be signed in with.
 */
export default function ResetPage({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('Those two passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      await api.reset(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="site">
      <header className="site-header">
        <div className="site-brand">
          AIfor<span>.study</span>
        </div>
      </header>

      <main className="site-main">
        <div className="auth panel" style={{ marginTop: 40 }}>
          {done ? (
            <div className="done">
              <h3>Password changed</h3>
              <p>
                Every device that was signed in has been signed out. Use your new password from here.
              </p>
              <div className="pending-actions">
                <a href="/">
                  <button type="button" className="primary">
                    Go to sign in
                  </button>
                </a>
              </div>
            </div>
          ) : (
            <form onSubmit={submit}>
              <h3 style={{ margin: '0 0 16px', fontSize: 19 }}>Set a new password</h3>
              {error && <div className="notice error">{error}</div>}

              <div className="field">
                <label htmlFor="reset-password">New password</label>
                <input
                  id="reset-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={MIN_PASSWORD}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <div className="form-hint">At least {MIN_PASSWORD} characters.</div>
              </div>

              <div className="field">
                <label htmlFor="reset-confirm">Confirm it</label>
                <input
                  id="reset-confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>

              <button type="submit" className="primary big" disabled={busy}>
                {busy ? 'Saving…' : 'Change password'}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
