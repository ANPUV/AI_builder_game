import { hashToken, randomToken } from './crypto';
import { readCookie, SESSION_COOKIE } from './http';
import type { Env, UserRow } from './types';

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

/** Refresh `last_seen_at` at most once an hour rather than on every request. */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

export async function createSession(env: Env, userId: string): Promise<string> {
  const token = randomToken();
  const now = Date.now();

  await env.DB.prepare(
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(await hashToken(token), userId, now, now + SESSION_TTL_SECONDS * 1000, now)
    .run();

  return token;
}

/**
 * Resolve the session cookie to a user, or null. Expired rows are deleted on
 * sight, which keeps the table tidy without a cron job.
 */
export async function currentUser(request: Request, env: Env): Promise<UserRow | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;

  const tokenHash = await hashToken(token);
  const row = await env.DB.prepare(
    `SELECT u.*, s.expires_at AS session_expires_at, s.last_seen_at AS session_last_seen_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`,
  )
    .bind(tokenHash)
    .first<UserRow & { session_expires_at: number; session_last_seen_at: number }>();

  if (!row) return null;

  const now = Date.now();
  if (row.session_expires_at <= now) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
    return null;
  }

  // An account revoked mid-session loses it immediately rather than at expiry.
  if (row.status !== 'approved') {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
    return null;
  }

  if (now - row.session_last_seen_at > TOUCH_INTERVAL_MS) {
    await env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?')
      .bind(now, tokenHash)
      .run();
  }

  return row;
}

export async function destroySession(request: Request, env: Env): Promise<void> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return;
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hashToken(token)).run();
}

/** Used after a password reset: every other device is signed out. */
export async function destroyAllSessions(env: Env, userId: string): Promise<void> {
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
}
