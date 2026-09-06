export type AccountStatus = 'pending' | 'approved' | 'rejected' | 'blocked';

export interface Account {
  email: string;
  status: AccountStatus;
}

/**
 * The shape `worker/http.ts` sends on failure. Carrying the machine-readable
 * `code` matters: the UI reacts differently to `pending_approval` (reassure,
 * do not offer a retry) than to `invalid_credentials` (let them try again).
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      // The JSON content type is what the Worker uses as its CSRF guard, so it
      // has to be set on every mutating call.
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'network', 'Could not reach the server. Check your connection.');
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // A non-JSON body means something upstream of the Worker answered.
  }

  if (!response.ok) {
    const error = (data as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'unknown',
      error?.message ?? 'Something went wrong. Try again.',
    );
  }

  return data as T;
}

export const api = {
  me: () => call<{ user: Account }>('/api/me'),

  login: (email: string, password: string) => call<{ user: Account }>('/api/login', { email, password }),

  logout: () => call<{ ok: true }>('/api/logout', {}),

  register: (input: { email: string; password: string; note: string; turnstileToken?: string }) =>
    call<{ message: string }>('/api/register', input),

  forgot: (email: string) => call<{ message: string }>('/api/forgot', { email }),

  reset: (token: string, password: string) => call<{ message: string }>('/api/reset', { token, password }),
};
