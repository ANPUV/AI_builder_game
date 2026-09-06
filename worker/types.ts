export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;

  // Secrets — set with `wrangler secret put`, never in wrangler.jsonc.
  RESEND_API_KEY?: string;
  TURNSTILE_SECRET?: string;

  // Plain vars, safe to keep in wrangler.jsonc.
  APP_URL: string;
  MAIL_FROM: string;
  ADMIN_EMAIL: string;
}

export type UserStatus = 'pending' | 'approved' | 'rejected' | 'blocked';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  status: UserStatus;
  email_verified_at: number | null;
  note: string | null;
  created_at: number;
  approved_at: number | null;
  reviewed_note: string | null;
  signup_country: string | null;
  signup_ua: string | null;
  last_login_at: number | null;
}

export interface SessionRow {
  token_hash: string;
  user_id: string;
  created_at: number;
  expires_at: number;
  last_seen_at: number;
}
