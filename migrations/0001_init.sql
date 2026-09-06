-- Phase 1: accounts, sessions, and the manual approval queue.
--
-- Two deliberate choices worth not undoing later:
--   * sessions and email tokens store the SHA-256 of the secret, never the
--     secret. A dump of this database hands out no live sessions.
--   * signup records a country and user-agent but no raw IP, which is enough
--     to spot a bot wave without turning the table into a GDPR liability.

CREATE TABLE users (
  id                TEXT PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE,   -- lowercased, trimmed
  password_hash     TEXT NOT NULL,          -- pbkdf2$sha256$<iters>$<salt>$<hash>
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected', 'blocked')),
  email_verified_at INTEGER,
  note              TEXT,                   -- "why do you want in?" from signup
  created_at        INTEGER NOT NULL,
  approved_at       INTEGER,
  reviewed_note     TEXT,                   -- your own reason, for your memory
  signup_country    TEXT,
  signup_ua         TEXT,
  last_login_at     INTEGER
);

CREATE INDEX users_status_created ON users (status, created_at);

CREATE TABLE sessions (
  token_hash   TEXT PRIMARY KEY,            -- sha256 hex of the cookie value
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE INDEX sessions_user ON sessions (user_id);
CREATE INDEX sessions_expires ON sessions (expires_at);

CREATE TABLE email_tokens (
  token_hash TEXT PRIMARY KEY,              -- sha256 hex of the emailed token
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose    TEXT NOT NULL CHECK (purpose IN ('verify', 'reset')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER
);

CREATE INDEX email_tokens_user ON email_tokens (user_id, purpose);

-- Rate limiting and a thin audit trail. `key` is "login:<email>",
-- "register:<iphash>" and so on, so one table serves every limiter.
CREATE TABLE auth_attempts (
  id  INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  at  INTEGER NOT NULL,
  ok  INTEGER NOT NULL
);

CREATE INDEX auth_attempts_key_at ON auth_attempts (key, at);
