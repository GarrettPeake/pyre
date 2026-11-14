/**
 * Password hashes: PBKDF2-SHA256 through WebCrypto (native, so cheap on Workers),
 * stored as `<algorithm>$<iterations>$<salt>$<base64 hash>`. Two algorithms, which
 * differ only in how the salt string becomes bytes:
 *
 * - `pbkdf2-sha256`: the salt is fed to PBKDF2 as UTF-8. New hashes use this, and so
 *   did the accounts made before Better Auth in Decklister and Pyre (their KV records
 *   move here as they are, so those passwords keep working).
 * - `pbkdf2-sha256-b64salt`: the salt is base64 of the salt bytes, as Calendizer's
 *   accounts before Better Auth stored it. Only read, never written.
 */
const ALGORITHM = "pbkdf2-sha256";
const ALGORITHM_B64_SALT = "pbkdf2-sha256-b64salt";
/** The most Workers' WebCrypto allows. */
const ITERATIONS = 100_000;

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

/** The salt bytes a stored salt stands for, or null if it isn't valid for its algorithm. */
function saltBytes(algorithm: string, salt: string): Uint8Array | null {
  if (algorithm === ALGORITHM) return new TextEncoder().encode(salt);
  if (algorithm !== ALGORITHM_B64_SALT) return null;
  try {
    return Uint8Array.from(atob(salt), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** The stored form of a legacy record's salt and hash (salt fed as UTF-8). */
export const legacyHash = (salt: string, hash: string) => `${ALGORITHM}$${ITERATIONS}$${salt}$${hash}`;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomUUID();
  return legacyHash(salt, await derive(password, new TextEncoder().encode(salt), ITERATIONS));
}

export async function verifyPassword({ hash, password }: { hash: string; password: string }): Promise<boolean> {
  const parts = hash.split("$");
  if (parts.length !== 4) return false;
  const salt = saltBytes(parts[0], parts[2]);
  const iterations = Number(parts[1]);
  if (!salt || !Number.isInteger(iterations) || iterations < 1 || iterations > ITERATIONS) return false;
  const actual = await derive(password, salt, iterations);
  const expected = parts[3];
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
