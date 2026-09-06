import { hashToken } from './crypto';
import type { Env } from './types';

/**
 * Deliberately permissive. Email syntax validation is a famous tar pit, and
 * the address is proved by the verification mail regardless — so this only
 * rejects what is obviously not an address, and lets delivery decide the rest.
 */
export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length < 3 || email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) return null;
  return email;
}

/**
 * Length is the only rule. Composition rules ("one symbol, one digit") push
 * people toward `Password1!` and are no longer recommended by NIST; a 12
 * character floor buys far more than a character-class checklist.
 */
export function passwordProblem(password: string): string | null {
  if (password.length < 12) return 'Password must be at least 12 characters.';
  if (password.length > 512) return 'Password must be 512 characters or fewer.';
  return null;
}

/** Never store a raw IP; the hash is enough to rate limit and to spot a wave. */
export async function clientKey(request: Request): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  return (await hashToken(ip)).slice(0, 32);
}

export interface RateLimit {
  limit: number;
  windowMs: number;
}

/**
 * Counts recent attempts under `key`. Not perfectly atomic — two requests can
 * race the same window — which is the right trade for a limiter whose job is
 * blunting brute force rather than exact accounting. Cloudflare WAF rate
 * limiting rules sit in front of this as the second layer.
 */
export async function tooManyAttempts(env: Env, key: string, { limit, windowMs }: RateLimit): Promise<boolean> {
  const since = Date.now() - windowMs;
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM auth_attempts WHERE key = ? AND at > ?')
    .bind(key, since)
    .first<{ n: number }>();
  return (row?.n ?? 0) >= limit;
}

export async function recordAttempt(env: Env, key: string, ok: boolean): Promise<void> {
  await env.DB.prepare('INSERT INTO auth_attempts (key, at, ok) VALUES (?, ?, ?)')
    .bind(key, Date.now(), ok ? 1 : 0)
    .run();
}

/** Successful login clears the failure budget for that key. */
export async function clearAttempts(env: Env, key: string): Promise<void> {
  await env.DB.prepare('DELETE FROM auth_attempts WHERE key = ?').bind(key).run();
}

/** Housekeeping: drop attempt rows nothing will read again. */
export async function pruneAttempts(env: Env, olderThanMs = 24 * 60 * 60 * 1000): Promise<void> {
  await env.DB.prepare('DELETE FROM auth_attempts WHERE at < ?').bind(Date.now() - olderThanMs).run();
}

/**
 * Cloudflare Turnstile. Registration is the endpoint that costs *your* time to
 * review, so it is the one worth defending from bots.
 *
 * With no secret configured the check passes — that is what makes local
 * development workable. It also means a missing production secret silently
 * disables the defence, so `npm run check:secrets` asserts it before deploy.
 */
export async function turnstileOk(env: Env, token: string, request: Request): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;

  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) form.append('remoteip', ip);

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    // A Turnstile outage should not become a signup outage.
    return true;
  }
}
