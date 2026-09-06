import { fail } from './http';
import { forgot, login, logout, me, register, reset, verify } from './routes';
import type { Env } from './types';

type Handler = (request: Request, env: Env) => Promise<Response>;

/** `${method} ${path}` — flat, explicit, and no router dependency to audit. */
const ROUTES: Record<string, Handler> = {
  'POST /api/register': register,
  'GET /api/verify': verify,
  'POST /api/login': login,
  'POST /api/logout': logout,
  'GET /api/me': me,
  'POST /api/forgot': forgot,
  'POST /api/reset': reset,
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Only /api/* reaches the Worker (run_worker_first in wrangler.jsonc);
    // anything else is a static asset. Being explicit costs one comparison
    // and means a config slip fails loudly instead of serving oddities.
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    const handler = ROUTES[`${request.method} ${url.pathname}`];
    if (!handler) {
      const methodMismatch = Object.keys(ROUTES).some((key) => key.endsWith(` ${url.pathname}`));
      return methodMismatch
        ? fail(405, 'method_not_allowed', 'Wrong method for this endpoint.')
        : fail(404, 'not_found', 'No such endpoint.');
    }

    try {
      return await handler(request, env);
    } catch (error) {
      // The client gets nothing useful; the detail goes to the tail log.
      console.error(`[api] ${request.method} ${url.pathname} failed`, error);
      return fail(500, 'internal_error', 'Something broke on our side.');
    }
  },
} satisfies ExportedHandler<Env>;
