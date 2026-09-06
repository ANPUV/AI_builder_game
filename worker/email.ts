import type { Env } from './types';

/**
 * Transactional mail via Resend.
 *
 * Sending never throws into a request handler. A registration that succeeded
 * but whose confirmation mail bounced off a provider outage should still be a
 * registration — the user can ask for another link. Failures are logged (with
 * no address in the message) and swallowed.
 *
 * With no API key configured, mail is logged rather than sent, so local
 * development needs no account and no live domain.
 */
async function send(env: Env, to: string, subject: string, text: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log(`[email:dev] to=${to} subject=${subject}\n${text}`);
    return true;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: env.MAIL_FROM, to, subject, text }),
    });

    if (!res.ok) {
      console.error(`[email] send failed status=${res.status} subject=${subject}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[email] send threw', error instanceof Error ? error.message : 'unknown');
    return false;
  }
}

export function verifyEmail(env: Env, to: string, token: string): Promise<boolean> {
  const link = `${env.APP_URL}/api/verify?token=${encodeURIComponent(token)}`;
  return send(
    env,
    to,
    'Confirm your email for AIfor.study',
    [
      'Thanks for asking for a place in the AIfor.study beta.',
      '',
      'Confirm this address:',
      link,
      '',
      'That puts you in the queue. Access is reviewed by hand, so it will not',
      'be instant — you will get another mail when your account is opened.',
      '',
      'If you did not ask for this, ignore it and nothing happens.',
    ].join('\n'),
  );
}

export function approvedEmail(env: Env, to: string): Promise<boolean> {
  return send(
    env,
    to,
    "You're in — AIfor.study",
    [
      'Your AIfor.study account is open. Sign in and start building:',
      env.APP_URL,
      '',
      'It is a game about running an AI company: wire up providers, retrieval,',
      'agents and compliance, and watch the business run.',
      '',
      'If something breaks, replying to this mail reaches a person.',
    ].join('\n'),
  );
}

export function resetEmail(env: Env, to: string, token: string): Promise<boolean> {
  const link = `${env.APP_URL}/reset?token=${encodeURIComponent(token)}`;
  return send(
    env,
    to,
    'Reset your AIfor.study password',
    [
      'Someone asked to reset the password for this address.',
      '',
      link,
      '',
      'The link is good for one hour and can be used once.',
      'If it was not you, ignore this — nothing has changed.',
    ].join('\n'),
  );
}

/** A heads-up to you, so the review queue is not something you must remember to poll. */
export function signupNotice(env: Env, email: string, note: string | null): Promise<boolean> {
  return send(
    env,
    env.ADMIN_EMAIL,
    `AIfor.study: new signup (${email})`,
    [`${email} verified their address and is waiting for review.`, '', `Note: ${note || '(none given)'}`, '', 'Review with: /review-signups'].join('\n'),
  );
}
