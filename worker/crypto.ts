/**
 * Password hashing and token handling.
 *
 * The Workers runtime is not Node: there is no bcrypt and no argon2. WebCrypto
 * PBKDF2-SHA256 is what is actually available, and at a high iteration count it
 * is an acceptable choice (OWASP names 600k for PBKDF2-HMAC-SHA256; we run
 * 210k, which is their floor and a deliberate trade against Workers CPU time).
 *
 * This costs real CPU per login. The Workers *free* plan caps a request at
 * 10ms of CPU and this will exceed that — the paid plan's 30s is why
 * docs/PUBLISH-PLAN.md budgets $5/mo. Do not "fix" a CPU limit by lowering
 * ITERATIONS, and never hash on the client: a client-side hash simply becomes
 * the password.
 */

const ITERATIONS = 210_000;
const KEY_BYTES = 32;
const SALT_BYTES = 16;

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

/** Encoded as `pbkdf2$sha256$<iterations>$<salt b64>$<hash b64>`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2$sha256$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

/**
 * The iteration count is read back out of the stored string rather than taken
 * from the constant, so raising ITERATIONS later does not lock out everyone
 * who registered before the change.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') return false;

  const iterations = Number(parts[2]);
  if (!Number.isInteger(iterations) || iterations < 1000 || iterations > 5_000_000) return false;

  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = fromBase64(parts[3]);
    expected = fromBase64(parts[4]);
  } catch {
    return false;
  }

  const actual = await pbkdf2(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}

/** Compares in time proportional to length only, never to how much matched. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** URL-safe secret for cookies and email links. 32 bytes of CSPRNG output. */
export function randomToken(bytes = 32): string {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  return toBase64(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * What actually goes in the database. Tokens are high-entropy random values,
 * so a plain SHA-256 is the right primitive here — this is lookup-key hashing,
 * not password hashing, and it must stay fast.
 */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function uuid(): string {
  return crypto.randomUUID();
}
