const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Auth responses must never sit in a shared cache.
      'Cache-Control': 'no-store',
      ...SECURITY_HEADERS,
      ...headers,
    },
  });
}

/**
 * Every failure the client sees goes through here, so error shapes stay
 * uniform and nothing accidentally leaks a stack or a SQL message.
 */
export function fail(status: number, code: string, message: string, extra: Record<string, unknown> = {}): Response {
  return json({ error: { code, message, ...extra } }, status);
}

export const SESSION_COOKIE = 'aifs_session';

export function sessionCookie(token: string, maxAgeSeconds: number): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ].join('; ');
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

/**
 * Parse a JSON body defensively. Requiring the JSON content-type is also the
 * CSRF guard: a cross-origin HTML form cannot set it, and anything that can
 * is already subject to preflight.
 */
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const type = request.headers.get('Content-Type') ?? '';
  if (!type.toLowerCase().includes('application/json')) return null;
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function str(body: Record<string, unknown>, key: string, max = 10_000): string {
  const value = body[key];
  return typeof value === 'string' ? value.slice(0, max) : '';
}
