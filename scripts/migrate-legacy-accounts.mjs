// Moves the accounts made before worker/accounts (KV `user:<username>` records, whose
// plans carried an "owner" field) into D1 as password accounts, each protecting the
// plans in its planIds. Passwords keep working: the PBKDF2 hashes move as they are,
// re-encoded from base64url to the base64 worker/accounts/password.ts compares.
//   node scripts/migrate-legacy-accounts.mjs --local|--remote [--dry-run]
// KV is only read, never changed. Run it again safely: accounts and plans already in
// D1 are skipped (INSERT OR IGNORE on the username, the account row and each plan).
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const PLAN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** base64url without padding (the old worker's hashes) to base64 with padding. */
export function toBase64(b64url) {
  const b64 = String(b64url).replaceAll("-", "+").replaceAll("_", "/");
  return b64 + "=".repeat((4 - (b64.length % 4)) % 4);
}

/**
 * The SQL that moves legacy records, `[{ username, passwordHash, salt, createdAt, planIds }]`,
 * into D1 for an app at `appOrigin` (whose host names the stand-in emails).
 */
export function legacySql(records, appOrigin) {
  const host = new URL(appOrigin).hostname;
  const statements = [];
  for (const r of records) {
    const username = String(r.username).toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(username) || !r.passwordHash || !r.salt || String(r.salt).includes("$")) {
      throw new Error(`Legacy account ${JSON.stringify(r.username)} is malformed`);
    }
    const planIds = (r.planIds ?? []).filter((id) => PLAN_ID.test(id));
    const userId = `legacy_${username}`;
    const ms = Date.parse(r.createdAt) || Date.now();
    const at = new Date(ms).toISOString();
    statements.push(
      `INSERT OR IGNORE INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt", "username", "displayUsername") ` +
        `VALUES (${q(userId)}, ${q(username)}, ${q(`${username}@users.${host}.invalid`)}, 0, ${q(at)}, ${q(at)}, ${q(username)}, ${q(username)});`,
      `INSERT OR IGNORE INTO "account" ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt") ` +
        `SELECT ${q(`legacy_${randomUUID()}`)}, "id", 'credential', "id", ${q(`pbkdf2-sha256$100000$${r.salt}$${toBase64(r.passwordHash)}`)}, ${q(at)}, ${q(at)} ` +
        `FROM "user" WHERE "id" = ${q(userId)} AND NOT EXISTS (SELECT 1 FROM "account" WHERE "userId" = ${q(userId)});`,
      ...planIds.map(
        (id) =>
          `INSERT OR IGNORE INTO "protectedLink" ("id", "userId", "createdAt") ` +
          `SELECT ${q(id.toLowerCase())}, "id", ${ms} FROM "user" WHERE "id" = ${q(userId)};`,
      ),
    );
  }
  return statements.join("\n");
}

async function main() {
  const target = process.argv.includes("--remote") ? "--remote" : process.argv.includes("--local") ? "--local" : undefined;
  if (!target) {
    console.error("usage: node scripts/migrate-legacy-accounts.mjs --local|--remote [--dry-run]");
    process.exit(2);
  }
  const wrangler = (args) => execFileSync("npx", ["wrangler", ...args], { stdio: ["ignore", "pipe", "inherit"] }).toString();
  const keys = JSON.parse(wrangler(["kv", "key", "list", "--binding", "FINANCIAL_PLANS", target, "--prefix", "user:"]));
  const records = keys.map(({ name }) => JSON.parse(wrangler(["kv", "key", "get", "--binding", "FINANCIAL_PLANS", target, name])));
  console.log(`${records.length} legacy account(s): ${records.map((r) => `${r.username} -> ${(r.planIds ?? []).join(", ") || "no plans"}`).join("; ") || "none"}`);
  if (records.length === 0 || process.argv.includes("--dry-run")) return;

  const appOrigin = target === "--remote" ? "https://pyre.gpeake.com" : "http://localhost:5173";
  const dir = mkdtempSync(join(tmpdir(), "pyre-legacy-"));
  try {
    const file = join(dir, "legacy.sql");
    // Holds password hashes: readable by this user only, removed right after.
    writeFileSync(file, legacySql(records, appOrigin), { mode: 0o600 });
    wrangler(["d1", "execute", "pyre", target, "--yes", "--file", file]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("Moved. KV is unchanged.");
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
