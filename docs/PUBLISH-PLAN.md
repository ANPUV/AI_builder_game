# Publishing AIfor.study — plan

**Status:** plan only, nothing built yet. Written 6 Sep 2026.

Today the game is a pure client-side React/Vite SPA (~6.6k lines) that saves to
`localStorage` and talks to no server. Publishing it means adding a backend for
the first time. This document is the plan for that.

## Decisions taken

| Decision | Choice |
| --- | --- |
| Hosting + backend | Cloudflare all-in — Worker with static assets, D1, KV |
| Login | Email + password |
| Saves | Stay in `localStorage`; no cloud sync yet |
| Gating | Landing + waitlist for the public; game only loads for approved sessions |
| Approval | Manual — you review each signup, approve via Claude Code |
| Domain | `aifor.study` |

## Architecture

```
                    aifor.study (Cloudflare DNS)
                              │
                    ┌─────────▼──────────┐
                    │  Worker (index.ts) │
                    └─────────┬──────────┘
          ┌───────────────────┼───────────────────┐
          │                   │                   │
   static assets          /api/*              /play/*
   (landing, auth UI)     auth endpoints      auth check → KV
   public                 D1: users,          game bundle
                          sessions            private
```

One Worker, one `wrangler.jsonc`, one `npx wrangler deploy`. No CORS, no second
vendor, no separate API host.

**Why the game lives in KV rather than in static assets:** anything Cloudflare
serves as a static asset is a public URL. To make "the bundle only loads for
approved sessions" true rather than cosmetic, the game has to be fetched
through code that can check a cookie. Two Vite builds — the public shell into
`dist/`, the game into `dist-game/` which a deploy script uploads to KV.

### Cost

| Item | Cost |
| --- | --- |
| Workers Paid plan | $5/mo |
| D1, KV, Turnstile, Web Analytics | free tier, comfortably |
| Resend (transactional email) | free to 3,000/mo |
| `aifor.study` domain | already yours |

**≈ $5/mo.** The paid plan is not optional-ish here — see the password note
below.

### The password-hashing constraint

The Workers runtime is not Node, so there is no `bcrypt` and no `argon2`. The
hash is PBKDF2-SHA256 via WebCrypto, which is native and fine, but an
OWASP-sized iteration count (~210k) burns real CPU — plausibly 50–150ms. The
**free plan caps a request at 10ms of CPU**; the paid plan gives 30s. So:

- Budget the $5/mo plan, or
- measure first (`wrangler tail` reports CPU time) and only pay if you exceed.

Do **not** solve this by lowering iterations into the weak range, and do **not**
hash on the client — client-side hashing makes the hash *become* the password.

This is the concrete cost of email+password over magic links. It is a fine cost
to pay; just pay it deliberately.

## Data model (D1)

```sql
CREATE TABLE users (
  id              TEXT PRIMARY KEY,          -- uuid v4
  email           TEXT NOT NULL UNIQUE,      -- stored lowercased, trimmed
  password_hash   TEXT NOT NULL,             -- pbkdf2$<iters>$<salt_b64>$<hash_b64>
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending|approved|rejected|blocked
  email_verified_at INTEGER,
  note            TEXT,                      -- "why do you want in?" from the form
  created_at      INTEGER NOT NULL,
  approved_at     INTEGER,
  reviewed_note   TEXT,                      -- your reason, for your own memory
  signup_country  TEXT,                      -- cf.country, no raw IP stored
  signup_ua       TEXT,
  last_login_at   INTEGER
);

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,              -- sha256 of the cookie value
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  last_seen_at INTEGER
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE email_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    TEXT NOT NULL,                  -- verify|reset
  expires_at INTEGER NOT NULL,
  used_at    INTEGER
);

CREATE TABLE auth_attempts (                 -- cheap rate limiting + audit
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  key       TEXT NOT NULL,                   -- "login:<email>" or "ip:<hash>"
  at        INTEGER NOT NULL,
  ok        INTEGER NOT NULL
);
CREATE INDEX auth_attempts_key_at ON auth_attempts(key, at);
```

Two things worth noticing: sessions store the **hash** of the cookie value, so
a database leak does not hand out live sessions; and signup records a country
and user-agent but not a raw IP, which keeps the GDPR surface small while still
giving you enough to spot a bot wave.

## Endpoints

| Method | Path | Does |
| --- | --- | --- |
| POST | `/api/register` | validate, Turnstile check, insert `pending`, email a verify link |
| GET | `/api/verify?token=` | mark `email_verified_at`, land on "you're in the queue" |
| POST | `/api/login` | verify password, refuse unless `approved`, set session cookie |
| POST | `/api/logout` | delete session, clear cookie |
| GET | `/api/me` | `{ email, status }` or 401 — the SPA gates on this |
| POST | `/api/forgot`, `/api/reset` | password reset (you own this because you own passwords) |
| GET | `/play`, `/play/assets/*` | session check → stream game bundle from KV |

Session cookie: `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=30d`.

## Security checklist

- **Turnstile on the register form.** Free, Cloudflare-native. Spam signups
  cost you review time, which is the scarcest thing in this design.
- **Email verification before review.** Even with manual approval, verify the
  address first so your queue holds real people, not typos.
- **Rate limit** `/api/login` and `/api/register` — per email and per IP hash,
  via `auth_attempts`, plus a WAF rate-limiting rule as a second layer.
- **Generic errors.** "Email or password is incorrect" for every login failure.
  Register always answers "check your email" whether or not the address exists.
- **CSRF:** `SameSite=Lax` plus requiring `Content-Type: application/json` on
  every mutating request.
- **Secrets** via `wrangler secret put` (`RESEND_API_KEY`, `TURNSTILE_SECRET`).
  Never in the repo, never in `wrangler.jsonc`.
- **Never log** request bodies on auth routes.

## Phases

### Phase 0 — repo and pipeline (½ day)

The project currently sits at `AI builder game/AI builder game/` with a sibling
`__MACOSX/` — flatten that first, it will otherwise be baked into the repo
forever.

1. Flatten the directory, delete `__MACOSX/`.
2. `git init`, first commit, push to a **private** GitHub repo.
3. `npm i -D wrangler`, add `wrangler.jsonc` with the assets binding.
4. `npx wrangler deploy` → verify on the `*.workers.dev` URL.

Deploy to `workers.dev` only at this stage. Do **not** attach `aifor.study`
until the gate exists, or the game is briefly public at its real address.

### Phase 1 — auth backend (1–2 days)

D1 database, schema migration, the endpoints above, Resend wired up with
domain verification (SPF + DKIM records on `aifor.study`). Test every path
against a local `wrangler dev --remote`.

### Phase 2 — landing page and auth UI (1 day)

A real landing page: what the game is, a screenshot or two, the signup form
with the "why do you want in?" field, and login. This is the public face of
`aifor.study`, so it is worth more than a form on a white page. The existing
`index.html` becomes the shell; the game moves behind `/play`.

### Phase 3 — the hard gate (½ day)

Second Vite entry building the game to `dist-game/`, a deploy script that
uploads those files to KV, and the `/play/*` Worker route that checks the
session before serving. Response headers `Cache-Control: private, no-store`.

### Phase 4 — admin tooling (2–3 h)

`tools/admin.mjs`, wrapping `wrangler d1 execute`:

```bash
node tools/admin.mjs pending           # table of unreviewed signups
node tools/admin.mjs approve <email>   # flips status, sends the welcome email
node tools/admin.mjs reject <email> --reason "..."
node tools/admin.mjs stats
```

Then `.claude/commands/review-signups.md` so that typing `/review-signups` in
Claude Code pulls the pending queue, summarises it, and flags the things worth
flagging — disposable-domain addresses, empty notes, several signups from one
country in one minute. You say yes or no per person; approving sends mail to a
stranger, so it gets confirmed each time rather than batched silently.

### Phase 5 — launch (½ day)

Nameservers to Cloudflare, custom domain on the Worker, `www` redirect,
Cloudflare Web Analytics (cookieless, so no consent banner), privacy policy and
terms, and a data-deletion route — you are storing emails and password hashes,
which makes you a data controller.

**Roughly 4–5 focused days.**

## Deliberately not doing yet

- **Cloud saves.** Add once people actually play. It is the natural next step
  and the schema above leaves room for it.
- **OAuth / Google sign-in.** Would remove the password surface entirely; keep
  it in the back pocket.
- **A playable demo tier.** Better funnel, but it needs the content split and
  a soft gate, which contradicts the hard gate you asked for. Revisit if
  waitlist conversion is poor.

## Open questions

1. Where is `aifor.study` registered? Nameservers need to move to Cloudflare.
2. Do you want a signup notification email per registration, or will you just
   run `/review-signups` when you feel like it?
3. Is the waitlist capped? A cap changes the landing copy ("50 spots") and
   gives you a reason to say no.

---

## Phase 0 status — 6 Sep 2026

**Done:**

- Flattened the nested `AI builder game/AI builder game/` layout; deleted the
  2,744 AppleDouble files in `__MACOSX/`.
- `git init` on `main`, two commits, clean tree. `.gitignore` now covers
  `.wrangler/`, `.dev.vars` and `.env*` — the secret files, before any secret
  exists to leak. `.gitattributes` normalises line endings to LF.
- Node upgraded 20.17.0 → **24.19.0 LTS** system-wide (winget
  `OpenJS.NodeJS.LTS`); fnm removed entirely. The machine was on 20.17.0, which
  **Wrangler hard-refuses** (needs ≥22) and Vite 7 only warns about (wants
  ≥22.12). One Node, no version manager, nothing to activate per shell.
- `wrangler` installed, `wrangler.jsonc` written and validated by
  `--dry-run`. `npm audit` clean.
- Deploy target: **`beta.aifor.study`**, static assets only.

**Blocked on you (both need your Cloudflare credentials):**

1. `npm run cf:login` — interactive browser OAuth.
2. `aifor.study` nameservers must point at Cloudflare before the custom domain
   on `beta.` will bind.

Then `npm run deploy`.

### Before beta goes up: put Cloudflare Access in front of it

`beta.aifor.study` with no gate is the whole game, public, at a real address on
your real domain — the thing Phase 0 was supposed to avoid by staying on
`workers.dev`. A beta subdomain is less discoverable, not private.

**Cloudflare Zero Trust → Access → Add an application**, self-hosted,
`beta.aifor.study`, policy = allow your email only. Free to 50 users, email
one-time-code, no code to write, and it comes off in one click when the real
gate ships in Phase 3. Do this *before* the first deploy, not after.

### Why fnm was dropped (6 Sep 2026)

fnm was tried first and abandoned. Its shell hook cannot work under **Windows
PowerShell 5.1**: `fnm env` puts a *junction* on `PATH`, and PS 5.1 will not
resolve native commands through a junction'd `PATH` entry. The result is
silent and confusing — fnm prints "Using Node v24.20.0" while `node -v` still
answers `v20.17.0`, because lookup fell through to `C:\Program Files
odejs`.
Developer Mode was already on and every junction was valid; the mechanism
itself is the problem.

System Node plus `engines` in `package.json` is the simpler contract here.

### A stale dev server was holding the old tree

A `npm run dev` from before the flatten was still running out of
`AI builder game/AI builder game/`. It was what blocked moving `src`, deleting
the empty nested directory, and later `npm ci` (an `EPERM` on
`esbuild.exe`). Stopped. If file operations in this repo start failing with
`EPERM` or "resource busy", look for a dev server first.


## Phase 1 status — 6 Sep 2026

Auth backend built and **tested end to end against a local D1** (29 checks).
Not deployed — that still needs the Cloudflare login.

| File | Holds |
| --- | --- |
| `migrations/0001_init.sql` | users, sessions, email_tokens, auth_attempts |
| `worker/crypto.ts` | PBKDF2 hashing, token generation, constant-time compare |
| `worker/session.ts` | cookie sessions, lazy expiry, revocation |
| `worker/security.ts` | validation, rate limiting, Turnstile |
| `worker/email.ts` | Resend, with a dev mode that logs instead of sending |
| `worker/routes.ts` | the seven handlers |
| `worker/index.ts` | router |
| `tools/check-secrets.mjs` | pre-deploy guard, wired into `npm run deploy` |

### What the tests established

Validation, the verify and reset flows, single-use tokens, enumeration
resistance, rate limiting (cuts in at the 11th attempt), mid-session
revocation, routing, and security headers all behave. Two results worth
recording:

- **Login costs ~200ms.** That is PBKDF2 doing its job, and it confirms the
  free plan's 10ms CPU cap is not survivable here. Budget the $5/mo plan.
- **Timing is flat at ~0.21s** whether the address exists or not, so the dummy
  hash on the unknown-user path genuinely closes that oracle.

### Carried into Phase 4

Revocation is *lazy*: blocking an account deletes its session the next time
that session is used, not at the moment of blocking. The security property
holds — a blocked user cannot use the session — but the row lingers. The admin
CLI must `DELETE FROM sessions WHERE user_id = ?` when it blocks or rejects
someone, rather than relying on the lazy path.

### Before this can deploy

1. `npm run cf:login`
2. `npm run db:create` → paste the real `database_id` into `wrangler.jsonc`
3. `npm run db:migrate` (remote)
4. Resend account, `aifor.study` domain verified (SPF + DKIM), then
   `npx wrangler secret put RESEND_API_KEY`
5. Turnstile widget, then `npx wrangler secret put TURNSTILE_SECRET`
6. `npm run check:secrets` must pass — it refuses the placeholder database id
   and missing secrets

Steps 4 and 5 are what stop the quiet-degradation modes: with no Resend key
mail is only logged, and with no Turnstile secret the bot check passes
everything. Both are deliberate for local dev and both are dangerous in
production, which is what the guard is for.


## Phase 2 status — 6 Sep 2026

Landing page and auth UI built, verified in a browser against local D1. The
remote database is created and migrated; nothing is deployed yet.

| File | Holds |
| --- | --- |
| `src/Root.tsx` | the gate — loading, landing, or game |
| `src/auth/api.ts` | typed client, carries the error `code` through |
| `src/auth/useAuth.ts` | one `/api/me` on mount decides what the page is |
| `src/site/Landing.tsx` | the public pitch |
| `src/site/AuthPanel.tsx` | register / sign in / forgot |
| `src/site/ResetPage.tsx` | `/reset?token=` |
| `src/site/Turnstile.tsx` | renders only when a site key is configured |

**Password minimum is 8**, matching NIST's floor for user-chosen secrets. The
server is the check that decides (`MIN_PASSWORD_LENGTH` in
`worker/security.ts`); the forms mirror it.

### Two traps the game's stylesheet set

- **Its class namespace is flat**, and `.hint`, `.card` and `.field` are all
  taken. `.hint` is a `position: absolute` canvas tooltip, so an unscoped rule
  did not lose a specificity fight — it teleported the password hint to the
  corner of the viewport. Every rule in `site.css` is now scoped under `.site`.
  **Keep the prefix when adding rules.**
- **`html`, `body` and `#root` are all `height: 100%`** with `body` overflow
  hidden. Right for a canvas, wrong for a page you scroll: the whole chain has
  to be undone, not just the overflow, or content spills out of a fixed box
  instead of laying out.

### The game is now a lazy chunk

A signed-out visitor downloads 207kB rather than 358kB and never fetches the
game. This is a **build split, not a security boundary** — the chunk is still a
public URL to anyone who reads the manifest. It is what makes Phase 3 cheap.

`src/main.tsx` loads its dev console with a dynamic import for the same reason;
a static one would pull the whole engine back into the shell.

### Gotcha for later: local D1 is keyed by database_id

Changing `database_id` in `wrangler.jsonc` gives you a **fresh, unmigrated
local database** — the old local state is still on disk under the old id. If
the API starts answering "no such table", run `npm run db:migrate:local`.

### Still before deploy

Resend key and Turnstile secret (`npm run check:secrets` enforces both), the
`beta.aifor.study` DNS, and the Cloudflare Access policy in front of it.


## Email verification removed — 6 Sep 2026

Registration no longer sends a confirmation link. A signup goes straight into
the review queue, and **approving by hand is what stands in for proving the
address**. `GET /api/verify` is gone; login gates on `status = 'approved'`
alone.

**What this costs.** Addresses are unproven, so:

- A typo'd address means the approval mail bounces and that person silently
  never gets in. Watch for bounces in Resend.
- Someone can register an address they do not own. They cannot *use* it — the
  password is theirs, but the mail goes to the real owner, who will be
  confused rather than compromised.
- The queue contains addresses that may not be real, so reviewing costs
  slightly more attention.

Turnstile and the per-IP rate limit are what remain between the form and a
spam wave. Both matter more now than they did with verification in front.

The admin notice mail says the address is unverified, so this is visible at the
moment of review rather than only in this document.

`users.email_verified_at` is **kept but unused** — nullable, always null for
new rows. Leaving the column costs nothing and means re-enabling verification
later is a code change rather than a migration.


## Email off for now — 6 Sep 2026

No Resend account yet. The code stays; it is inert without a key, and the app
no longer promises mail it cannot send.

**Two switches, and they must agree:**

| Switch | Where | Turns on |
| --- | --- | --- |
| `RESEND_API_KEY` | Worker secret | actually sending mail |
| `VITE_EMAIL_ENABLED=true` | `.env` | the reset link, and "watch your inbox" copy |

`npm run check:secrets` cross-checks them: it **blocks** a deploy where the
flag is on but the key is missing (the app would offer a reset that goes
nowhere) and warns when the key is set but the flag is not.

**What is off right now:**

- Approving somebody tells them nothing. They find out by trying to sign in
  again, which is what the pending screen now says. The Worker picks that
  wording from whether `RESEND_API_KEY` exists, so it corrects itself.
- The forgot-password link is hidden. A forgotten password can only be fixed
  by you — Phase 4's CLI should grow a `set-password` command for that.

**To turn email on later:** verify `aifor.study` in Resend (two DNS records in
the Cloudflare zone, already yours), `npx wrangler secret put RESEND_API_KEY`,
set `VITE_EMAIL_ENABLED=true` in `.env`, rebuild. No code change.

### check:secrets no longer blocks on missing secrets

Missing secrets are now a deliberate choice, so they warn loudly and let the
deploy through. Only genuine breakage stops it: the placeholder database id,
being logged out, or the two email switches disagreeing.

It also calls `node_modules/wrangler/bin/wrangler.js` directly rather than
going through `npx` — Node 24 on Windows refuses to spawn a `.cmd` without a
shell, and `shell: true` concatenates arguments unescaped.
