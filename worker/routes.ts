import { hashPassword, hashToken, randomToken, uuid, verifyPassword } from './crypto';
import { approvedEmail, resetEmail, signupNotice } from './email';
import { clearedSessionCookie, fail, json, readJson, sessionCookie, str } from './http';
import {
  clearAttempts,
  clientKey,
  normalizeEmail,
  passwordProblem,
  pruneAttempts,
  recordAttempt,
  tooManyAttempts,
  turnstileOk,
} from './security';
import { createSession, currentUser, destroyAllSessions, destroySession, SESSION_TTL_SECONDS } from './session';
import type { Env, UserRow } from './types';

const RESET_TTL_MS = 60 * 60 * 1000;

/**
 * Registration answers this whether the address is new, already queued, or
 * already a full account. Anything else turns the form into an oracle for
 * "does this person have an account here".
 */
const REGISTER_REPLY = {
  ok: true,
  message: 'Your request is in the queue.',
};

export async function register(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  if (!body) return fail(400, 'bad_request', 'Expected a JSON body.');

  const email = normalizeEmail(str(body, 'email', 320));
  const password = str(body, 'password', 512);
  const note = str(body, 'note', 2000).trim();

  if (!email) return fail(400, 'invalid_email', 'That does not look like an email address.');

  const problem = passwordProblem(password);
  if (problem) return fail(400, 'weak_password', problem);

  const ipKey = `register:${await clientKey(request)}`;
  if (await tooManyAttempts(env, ipKey, { limit: 5, windowMs: 60 * 60 * 1000 })) {
    return fail(429, 'rate_limited', 'Too many signups from here. Try again in an hour.');
  }
  await recordAttempt(env, ipKey, true);

  if (!(await turnstileOk(env, str(body, 'turnstileToken', 4000), request))) {
    return fail(403, 'challenge_failed', 'Could not verify you are human. Reload and try again.');
  }

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>();

  // Never touch the stored password for an address that already exists —
  // otherwise this endpoint would let anyone reset a pending account by
  // "registering" it again. Nothing else happens either: re-registering must
  // not be a way to nudge the review queue.
  if (existing) return json(REGISTER_REPLY);

  const id = uuid();
  await env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, status, note, created_at, signup_country, signup_ua)
     VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)`,
  )
    .bind(
      id,
      email,
      await hashPassword(password),
      note || null,
      Date.now(),
      (request as { cf?: { country?: string } }).cf?.country ?? null,
      (request.headers.get('User-Agent') ?? '').slice(0, 300) || null,
    )
    .run();

  // Straight into the review queue: the address is unproven, and approving by
  // hand is what stands in for proving it.
  await signupNotice(env, email, note || null);

  return json(REGISTER_REPLY);
}

export async function login(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  if (!body) return fail(400, 'bad_request', 'Expected a JSON body.');

  const email = normalizeEmail(str(body, 'email', 320));
  const password = str(body, 'password', 512);
  if (!email || !password) return fail(400, 'invalid_credentials', 'Email or password is incorrect.');

  const emailKey = `login:${email}`;
  const ipKey = `login-ip:${await clientKey(request)}`;
  const limited =
    (await tooManyAttempts(env, emailKey, { limit: 10, windowMs: 15 * 60 * 1000 })) ||
    (await tooManyAttempts(env, ipKey, { limit: 30, windowMs: 15 * 60 * 1000 }));
  if (limited) return fail(429, 'rate_limited', 'Too many attempts. Wait 15 minutes and try again.');

  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();

  // Hash even when there is no such user, so response time does not answer
  // "is this address registered" for an attacker with a stopwatch.
  const stored = user?.password_hash ?? DUMMY_HASH;
  const passwordOk = await verifyPassword(password, stored);

  if (!user || !passwordOk) {
    await recordAttempt(env, emailKey, false);
    await recordAttempt(env, ipKey, false);
    return fail(401, 'invalid_credentials', 'Email or password is incorrect.');
  }

  // Account state is only revealed once the password proved ownership.
  if (user.status === 'pending') {
    // Do not promise mail we cannot send. With no Resend key configured the
    // only way someone learns they were approved is by trying again.
    return fail(
      403,
      'pending_approval',
      env.RESEND_API_KEY
        ? 'Your account is waiting to be reviewed. You will get an email when it opens.'
        : 'Your account is waiting to be reviewed. Try signing in again in a day or so.',
    );
  }
  if (user.status !== 'approved') {
    return fail(403, 'not_approved', 'This account cannot sign in.');
  }

  await clearAttempts(env, emailKey);
  await env.DB.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(Date.now(), user.id).run();

  const token = await createSession(env, user.id);
  await pruneAttempts(env);

  return json({ ok: true, user: publicUser(user) }, 200, {
    'Set-Cookie': sessionCookie(token, SESSION_TTL_SECONDS),
  });
}

export async function logout(request: Request, env: Env): Promise<Response> {
  await destroySession(request, env);
  return json({ ok: true }, 200, { 'Set-Cookie': clearedSessionCookie() });
}

export async function me(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  if (!user) return fail(401, 'unauthenticated', 'Not signed in.');
  return json({ user: publicUser(user) });
}

export async function forgot(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  if (!body) return fail(400, 'bad_request', 'Expected a JSON body.');

  const email = normalizeEmail(str(body, 'email', 320));
  const reply = json({ ok: true, message: 'If that address has an account, a reset link is on its way.' });
  if (!email) return reply;

  const key = `forgot:${email}`;
  if (await tooManyAttempts(env, key, { limit: 5, windowMs: 60 * 60 * 1000 })) return reply;
  await recordAttempt(env, key, true);

  const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>();
  if (user) {
    await issueEmailToken(env, user.id, 'reset', RESET_TTL_MS, (token) => resetEmail(env, email, token));
  }

  return reply;
}

export async function reset(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  if (!body) return fail(400, 'bad_request', 'Expected a JSON body.');

  const token = str(body, 'token', 500);
  const password = str(body, 'password', 512);

  const problem = passwordProblem(password);
  if (problem) return fail(400, 'weak_password', problem);

  const tokenHash = await hashToken(token);
  const row = await env.DB.prepare(
    `SELECT user_id, expires_at, used_at FROM email_tokens WHERE token_hash = ? AND purpose = 'reset'`,
  )
    .bind(tokenHash)
    .first<{ user_id: string; expires_at: number; used_at: number | null }>();

  if (!row || row.used_at || row.expires_at < Date.now()) {
    return fail(400, 'invalid_token', 'That reset link has expired or already been used.');
  }

  await env.DB.batch([
    env.DB.prepare('UPDATE email_tokens SET used_at = ? WHERE token_hash = ?').bind(Date.now(), tokenHash),
    env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(password), row.user_id),
  ]);

  // Whoever held the old password loses every device.
  await destroyAllSessions(env, row.user_id);

  return json({ ok: true, message: 'Password changed. Sign in with it.' }, 200, {
    'Set-Cookie': clearedSessionCookie(),
  });
}

/** Approval lives in the admin CLI, but the welcome mail belongs with the others. */
export async function sendApproval(env: Env, email: string): Promise<boolean> {
  return approvedEmail(env, email);
}

function publicUser(user: UserRow) {
  return { email: user.email, status: user.status };
}

async function issueEmailToken(
  env: Env,
  userId: string,
  purpose: 'reset',
  ttlMs: number,
  sendWith: (token: string) => Promise<boolean>,
): Promise<void> {
  // One live token per purpose, so an old link in an old mail stops working.
  await env.DB.prepare('DELETE FROM email_tokens WHERE user_id = ? AND purpose = ?').bind(userId, purpose).run();

  const token = randomToken();
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO email_tokens (token_hash, user_id, purpose, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(await hashToken(token), userId, purpose, now, now + ttlMs)
    .run();

  await sendWith(token);
}

/**
 * A real PBKDF2 hash of a value nobody knows, used to spend the same CPU on a
 * login for an address that does not exist. The password here is irrelevant —
 * what matters is that verifying against it costs the same as a real check.
 *
 * The iteration count MUST match ITERATIONS in crypto.ts. verifyPassword
 * rejects anything outside its accepted range before deriving any bits, so a
 * stale value here would return false instantly and hand back exactly the
 * timing signal this exists to remove.
 */
const DUMMY_HASH =
  'pbkdf2$sha256$100000$AAAAAAAAAAAAAAAAAAAAAA==$Y2Fubm90bWF0Y2hhbnl0aGluZ2hlcmUxMjM0NTY3OA==';
