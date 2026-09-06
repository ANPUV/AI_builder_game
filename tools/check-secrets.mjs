#!/usr/bin/env node
/**
 * Pre-deploy guard.
 *
 * Both Turnstile and Resend degrade *quietly* when unconfigured — that is
 * deliberate, so local development needs no accounts. The cost of that choice
 * is that a production deploy missing a secret looks perfectly healthy while
 * running with no bot protection and sending no mail. This asserts otherwise.
 *
 *   node tools/check-secrets.mjs
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const REQUIRED = {
  RESEND_API_KEY: 'transactional email (verification, approval, password reset)',
  TURNSTILE_SECRET: 'bot protection on the registration form',
};

function run(args) {
  return execFileSync('npx', ['wrangler', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
}

const problems = [];

// 1. The D1 binding must point at a real database, not the checked-in placeholder.
const config = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
if (config.includes('PLACEHOLDER_RUN_DB_CREATE')) {
  problems.push('wrangler.jsonc still has the placeholder database_id — run `npm run db:create` and paste the real id in.');
}

// 2. Every required secret must actually be set on the deployed Worker.
let secrets = [];
try {
  secrets = JSON.parse(run(['secret', 'list', '--format', 'json'])).map((s) => s.name);
} catch (error) {
  const message = String(error.stderr || error.message || '');
  if (/not authenticated|CLOUDFLARE_API_TOKEN|wrangler login/i.test(message)) {
    problems.push('Not authenticated with Cloudflare — run `npm run cf:login`.');
  } else {
    problems.push(`Could not list secrets: ${message.trim().split('\n')[0]}`);
  }
}

for (const [name, why] of Object.entries(REQUIRED)) {
  if (!secrets.includes(name)) {
    problems.push(`Missing secret ${name} (${why}) — set it with: npx wrangler secret put ${name}`);
  }
}

if (problems.length) {
  console.error('\nNot ready to deploy:\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('');
  process.exit(1);
}

console.log('Secrets and database binding look right.');
