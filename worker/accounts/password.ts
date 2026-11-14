/**
 * Password hashes: PBKDF2-SHA256 through WebCrypto (native, so cheap on Workers),
 * stored as `pbkdf2-sha256$<iterations>$<salt>$<base64 hash>`.
 *
 * The salt is a string fed to PBKDF2 as UTF-8, which is how the accounts made before
 * Better Auth (src/index.js before 2026-11) were hashed: their KV records move here as
 * they are, so those passwords keep working.
 */
const ALGORITHM = "pbkdf2-sha256";
/** The most Workers' WebCrypto allows. */
const ITERATIONS = 100_000;

async function derive(password: string, salt: string, iterations: number): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: encoder.encode(salt), iterations, hash: "SHA-256" }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

/** The stored form of a legacy record's salt and hash. */
export const legacyHash = (salt: string, hash: string) => `${ALGORITHM}$${ITERATIONS}$${salt}$${hash}`;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomUUID();
  return legacyHash(salt, await derive(password, salt, ITERATIONS));
}

export async function verifyPassword({ hash, password }: { hash: string; password: string }): Promise<boolean> {
  const parts = hash.split("$");
  if (parts.length !== 4 || parts[0] !== ALGORITHM) return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > ITERATIONS) return false;
  const actual = await derive(password, parts[2], iterations);
  const expected = parts[3];
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
