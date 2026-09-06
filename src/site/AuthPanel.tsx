import { useCallback, useState, type FormEvent } from 'react';
import { api, ApiError, type Account } from '../auth/api';
import Turnstile, { turnstileEnabled } from './Turnstile';

type Mode = 'register' | 'login' | 'forgot';

// Kept in step with MIN_PASSWORD_LENGTH in worker/security.ts, which is
// the check that actually decides.
const MIN_PASSWORD = 8;

export default function AuthPanel({
  initialMode = 'register',
  onSignedIn,
}: {
  initialMode?: Mode;
  onSignedIn: (account: Account) => void;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);

  return (
    <div className="auth panel" id="access">
      {mode !== 'forgot' && (
        <div className="auth-tabs">
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => setMode('register')}
          >
            Request access
          </button>
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
            Sign in
          </button>
        </div>
      )}

      {mode === 'register' && <RegisterForm onSwitchToLogin={() => setMode('login')} />}
      {mode === 'login' && <LoginForm onSignedIn={onSignedIn} onForgot={() => setMode('forgot')} />}
      {mode === 'forgot' && <ForgotForm onBack={() => setMode('login')} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function RegisterForm({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [note, setNote] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const onToken = useCallback((value: string) => setToken(value), []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (turnstileEnabled && !token) {
      setError('Just a moment — still checking you are human.');
      return;
    }

    setBusy(true);
    try {
      await api.register({ email, password, note, turnstileToken: token });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="done">
        <h3>You are in the queue</h3>
        <p>
          Your request has been added. Access is reviewed by hand, one at a time, so it will not be instant
          — you will get an email when your account opens.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      {error && <div className="notice error">{error}</div>}

      <div className="field">
        <label htmlFor="reg-email">Email</label>
        <input
          id="reg-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="reg-password">Password</label>
        <input
          id="reg-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="form-hint">
          At least {MIN_PASSWORD} characters. Length beats punctuation — a few plain words work well.
        </div>
      </div>

      <div className="field">
        <label htmlFor="reg-note">Why do you want in?</label>
        <textarea
          id="reg-note"
          value={note}
          maxLength={2000}
          placeholder="A sentence is plenty. This is what gets read when your request is reviewed."
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <Turnstile onToken={onToken} />

      <button type="submit" className="primary big" disabled={busy}>
        {busy ? 'Sending…' : 'Request access'}
      </button>

      <div className="form-foot">
        Already have an account?{' '}
        <button type="button" className="linkish" onClick={onSwitchToLogin}>
          Sign in
        </button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */

function LoginForm({
  onSignedIn,
  onForgot,
}: {
  onSignedIn: (account: Account) => void;
  onForgot: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ code: string; message: string } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setProblem(null);
    setBusy(true);
    try {
      const { user } = await api.login(email, password);
      onSignedIn(user);
    } catch (err) {
      setProblem(
        err instanceof ApiError
          ? { code: err.code, message: err.message }
          : { code: 'unknown', message: 'Something went wrong. Try again.' },
      );
    } finally {
      setBusy(false);
    }
  }

  // Waiting for review is not an error the user can act on, so it gets the
  // calm treatment rather than a red box telling them they did something wrong.
  if (problem?.code === 'pending_approval') {
    return (
      <div className="done">
        <h3>You are in the queue</h3>
        <p>
          Your request is waiting to be reviewed. Requests are read by a person, so this takes a little
          while. You will get an email the moment your account opens.
        </p>
        <div className="pending-actions">
          <button type="button" onClick={() => setProblem(null)}>
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      {problem && <div className="notice error">{problem.message}</div>}

      <div className="field">
        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="login-password">Password</label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <button type="submit" className="primary big" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>

      <div className="form-foot">
        <button type="button" className="linkish" onClick={onForgot}>
          Forgot your password?
        </button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */

function ForgotForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.forgot(email);
    } finally {
      // The endpoint answers the same way whether or not the address exists,
      // and so does this: showing anything else would rebuild the oracle the
      // server went to the trouble of closing.
      setSent(true);
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="done">
        <h3>Check your email</h3>
        <p>If that address has an account, a reset link is on its way. It is good for one hour.</p>
        <div className="pending-actions">
          <button type="button" onClick={onBack}>
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label htmlFor="forgot-email">Email</label>
        <input
          id="forgot-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="form-hint">We will send a link to set a new password.</div>
      </div>

      <button type="submit" className="primary big" disabled={busy}>
        {busy ? 'Sending…' : 'Send reset link'}
      </button>

      <div className="form-foot">
        <button type="button" className="linkish" onClick={onBack}>
          Back to sign in
        </button>
      </div>
    </form>
  );
}
