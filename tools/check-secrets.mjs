#!/usr/bin/env node
/**
 * Pre-deploy check.
 *
 * Turnstile and Resend both degrade *quietly* when unconfigured — deliberate,
 * so local development needs no accounts. The cost is that a deploy missing a
 * secret looks perfectly healthy while sending no mail and running no bot
 * check. This makes that visible.
 *
 * Only things that are certainly broken stop a deploy. Missing secrets are a
 * choice — see docs/PUBLISH-PLAN.md, where email is deliberately off for now —
 * so they warn loudly and let you through.
 *
 *   node tools/check-secrets.mjs
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const WRANGLER = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));

function run(args) {
  // Run wrangler's entry point with this Node directly. Going through npx
  // needs a shell on Windows (Node refuses to spawn a .cmd without one), and
  // shell:true concatenates arguments unescaped.
  return execFileSync(process.execPath, [WRANGLER, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** Read a key out of .env without adding a dotenv dependency. */
function envValue(key) {
  const url = new URL('../.env', import.meta.url);
  if (!existsSync(url)) return null;
  for (const line of readFileSync(url, 'utf8').split('\n')) {
    const match = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`));
    if (match) return match[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

const blockers = [];
const warnings = [];

// --- things that are simply broken -----------------------------------------

const config = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
if (config.includes('PLACEHOLDER_RUN_DB_CREATE')) {
  blockers.push('wrangler.jsonc still has the placeholder database_id — run `npm run db:create` and paste the real id in.');
}

let secrets = null;
try {
  secrets = JSON.parse(run(['secret', 'list', '--format', 'json'])).map((s) => s.name);
} catch (error) {
  const message = String(error.stderr || error.message || '');
  if (/not authenticated|CLOUDFLARE_API_TOKEN|wrangler login/i.test(message)) {
    blockers.push('Not authenticated with Cloudflare — run `npm run cf:login`.');
  } else if (/does not exist|not found|10007/i.test(message)) {
    // Nothing deployed yet, so there is no secret store to read. That is the
    // expected state for a first deploy, not a problem.
    secrets = [];
    warnings.push('Nothing deployed yet — this will be the first deploy, so no secrets exist to check.');
  } else {
    warnings.push(`Could not list secrets: ${message.trim().split('\n')[0]}`);
  }
}

// --- things that are a choice ----------------------------------------------

if (secrets) {
  const hasResend = secrets.includes('RESEND_API_KEY');
  const hasTurnstile = secrets.includes('TURNSTILE_SECRET');
  const emailFlag = envValue('VITE_EMAIL_ENABLED') === 'true';
  const siteKey = envValue('VITE_TURNSTILE_SITE_KEY');

  if (!hasTurnstile) {
    warnings.push(
      'No TURNSTILE_SECRET: the registration form has no bot protection. Since email\n' +
        '    verification was removed, this is the only thing guarding your review queue.\n' +
        '    Set it with: npx wrangler secret put TURNSTILE_SECRET',
    );
  } else if (!siteKey) {
    warnings.push(
      'TURNSTILE_SECRET is set but VITE_TURNSTILE_SITE_KEY is missing from .env, so the\n' +
        '    widget never renders and no token is ever sent. Half a Turnstile is none.',
    );
  }

  if (!hasResend) {
    warnings.push(
      'No RESEND_API_KEY: approval mail and password resets are inert. Approving somebody\n' +
        '    tells them nothing — they find out by trying to sign in again. Forgotten\n' +
        '    passwords can only be fixed by you. This is the current intended setup.',
    );
    if (emailFlag) {
      blockers.push('VITE_EMAIL_ENABLED=true but the Worker has no RESEND_API_KEY — the app would offer a password reset that silently goes nowhere.');
    }
  } else if (!emailFlag) {
    warnings.push(
      'RESEND_API_KEY is set but VITE_EMAIL_ENABLED is not "true" in .env, so the\n' +
        '    password-reset link stays hidden and the copy still says "try again later".',
    );
  }
}

// --- report ----------------------------------------------------------------

if (warnings.length) {
  console.warn('\nDeploying with these gaps:\n');
  for (const warning of warnings) console.warn(`  - ${warning}`);
}

if (blockers.length) {
  console.error('\nCannot deploy:\n');
  for (const blocker of blockers) console.error(`  - ${blocker}`);
  console.error('');
  process.exit(1);
}

console.log(warnings.length ? '\nNothing broken. Continuing.\n' : 'Secrets and database binding look right.');
