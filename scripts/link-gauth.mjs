// Moves an existing password account to GAuth sign-in, keeping its protected links.
// GAuth sign-ins never attach to an existing account by email, so it has to be linked
// here first.
//   node scripts/link-gauth.mjs --local|--remote --user <username> --gauth-id <GAuth user id> --email <GAuth email>
// The GAuth user id is the permanent id GAuth sends as the NameID (GAuth admin > Users).
// Afterwards the account signs in only through GAuth (typing that email in the sign-in
// dialog goes there): its password is removed and its sessions end. Undo by deleting the
// account row with providerId 'gauth' and having the person set a password again.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
};
const target = process.argv.includes("--remote") ? "--remote" : process.argv.includes("--local") ? "--local" : undefined;
const username = arg("--user")?.trim().toLowerCase();
const gauthId = arg("--gauth-id")?.trim();
const email = arg("--email")?.trim().toLowerCase();
if (!target || !username || !gauthId || !email?.includes("@")) {
  console.error("usage: node scripts/link-gauth.mjs --local|--remote --user <username> --gauth-id <GAuth user id> --email <GAuth email>");
  process.exit(2);
}

const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const d1 = (args) =>
  execFileSync("npx", ["wrangler", "d1", "execute", "pyre", target, "--yes", ...args], {
    stdio: ["ignore", "pipe", "inherit"],
  }).toString();

const [{ results }] = JSON.parse(
  d1([
    "--json",
    "--command",
    `SELECT u."id",
       COALESCE((SELECT "userId" FROM "account" WHERE "providerId" = 'gauth' AND "accountId" = ${q(gauthId)}), '') AS "holder",
       COALESCE((SELECT "id" FROM "user" WHERE "email" = ${q(email)}), '') AS "emailHolder",
       (SELECT count(*) FROM "protectedLink" WHERE "userId" = u."id") AS "links"
     FROM "user" u WHERE u."username" = ${q(username)}`,
  ]),
);
const row = results[0];
if (!row) {
  console.error(`No account with username ${username}.`);
  process.exit(1);
}
for (const [holder, what] of [[row.holder, `GAuth user ${gauthId}`], [row.emailHolder, email]]) {
  if (holder && holder !== row.id) {
    console.error(`${what} already belongs to another account (${holder}). Move its links first, or delete it.`);
    process.exit(1);
  }
}

const now = new Date().toISOString();
const sql = `
DELETE FROM "account" WHERE "userId" = ${q(row.id)} AND "providerId" = 'gauth';
INSERT INTO "account" ("id", "accountId", "providerId", "userId", "createdAt", "updatedAt")
VALUES (${q(`gauth_${randomUUID()}`)}, ${q(gauthId)}, 'gauth', ${q(row.id)}, ${q(now)}, ${q(now)});
UPDATE "user" SET "email" = ${q(email)}, "emailVerified" = 1, "updatedAt" = ${q(now)} WHERE "id" = ${q(row.id)};
DELETE FROM "account" WHERE "userId" = ${q(row.id)} AND "providerId" = 'credential';
DELETE FROM "session" WHERE "userId" = ${q(row.id)};
`;

const dir = mkdtempSync(join(tmpdir(), "pyre-link-"));
try {
  const file = join(dir, "link.sql");
  writeFileSync(file, sql, { mode: 0o600 });
  d1(["--file", file]);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`Linked ${username} (${row.id}, ${row.links} protected link(s)) to GAuth user ${gauthId} (${target.slice(2)}). It now signs in with GAuth only.`);
