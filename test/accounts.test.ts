import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { createAccounts, safeNext } from "../worker/accounts/index.ts";
import { hashPassword, verifyPassword } from "../worker/accounts/password.ts";
// @ts-expect-error: a plain .mjs script
import { legacySql } from "../scripts/migrate-legacy-accounts.mjs";
import { d1, migratedDb } from "./d1.ts";

const ORIGIN = "https://pyre.test";
const CERTS = /"GAUTH_CERTS": ("[^"]+")/.exec(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"))![1];
const CERTS_PEM: string = JSON.parse(CERTS);

let sqlite: ReturnType<typeof migratedDb>;
let accounts: ReturnType<typeof createAccounts>;
let ip = 0;
let browsers = 0;

beforeEach(() => {
  sqlite = migratedDb();
  accounts = createAccounts({
    db: d1(sqlite),
    appOrigin: ORIGIN,
    secret: "test-secret-test-secret-test-secret-0123456789",
    gauthOrigin: "https://auth.test",
    gauthCerts: CERTS_PEM,
    isLinkId: (id) => /^[A-Za-z0-9_-]{1,100}$/.test(id),
    linkPath: (id) => `/${id}`,
    describeLink: async (id) => `plan ${id}`,
  });
  ip++;
});

/** A browser: keeps its cookies, sends this origin. */
function browser() {
  const jar = new Map<string, string>();
  const addr = `10.0.${ip}.${++browsers}`;
  const send = async (path: string, init: RequestInit & { json?: unknown } = {}) => {
    const headers = new Headers(init.headers);
    headers.set("Origin", ORIGIN);
    headers.set("CF-Connecting-IP", addr);
    if (jar.size) headers.set("Cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
    if (init.json !== undefined) headers.set("Content-Type", "application/json");
    const req = new Request(ORIGIN + path, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body });
    const res = (await accounts.route(req)) ?? new Response("not an account route", { status: 599 });
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(";");
      const [k, v] = pair.split("=");
      if (attrs.some((a) => /max-age=0\b/i.test(a.trim())) || v === "") jar.delete(k);
      else jar.set(k, v);
    }
    return res;
  };
  const request = (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set("Origin", ORIGIN);
    if (jar.size) headers.set("Cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
    return new Request(ORIGIN + path, { ...init, headers });
  };
  return { send, request, jar };
}

const register = (b: ReturnType<typeof browser>, username: string, password = "correct horse") =>
  b.send("/api/auth/sign-up/email", { method: "POST", json: { username, password, email: "", name: "" } });

describe("passwords", () => {
  it("hash and verify", async () => {
    const hash = await hashPassword("hunter22");
    expect(hash).toMatch(/^pbkdf2-sha256\$100000\$[0-9a-f-]{36}\$[A-Za-z0-9+/=]{44}$/);
    expect(await verifyPassword({ hash, password: "hunter22" })).toBe(true);
    expect(await verifyPassword({ hash, password: "hunter23" })).toBe(false);
    expect(await verifyPassword({ hash: "scrypt:abc", password: "hunter22" })).toBe(false);
  });

  it("reads the hashes made before Better Auth (src/index.js, 2026-01)", async () => {
    // What the old hashPassword(password, salt) stored, with a UUID salt.
    const salt = "6f1c3c64-2d1e-4a8e-9a55-0d3b1d1b2f00";
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode("old pw"), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" }, key, 256);
    const old = btoa(String.fromCharCode(...new Uint8Array(bits)));
    expect(await verifyPassword({ hash: `pbkdf2-sha256$100000$${salt}$${old}`, password: "old pw" })).toBe(true);
  });
  it("reads Calendizer's hashes from before Better Auth (base64 salt bytes)", async () => {
    // What Calendizer's api/src/auth.ts stored: 16 random salt bytes, base64.
    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const salt = btoa(String.fromCharCode(...saltBytes));
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("calendar pw"), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: saltBytes, iterations: 100000, hash: "SHA-256" }, key, 256);
    const old = btoa(String.fromCharCode(...new Uint8Array(bits)));
    expect(await verifyPassword({ hash: `pbkdf2-sha256-b64salt$100000$${salt}$${old}`, password: "calendar pw" })).toBe(true);
    expect(await verifyPassword({ hash: `pbkdf2-sha256-b64salt$100000$${salt}$${old}`, password: "calendar px" })).toBe(false);
    // The same salt read as UTF-8 is a different salt.
    expect(await verifyPassword({ hash: `pbkdf2-sha256$100000$${salt}$${old}`, password: "calendar pw" })).toBe(false);
    expect(await verifyPassword({ hash: `pbkdf2-sha256-b64salt$100000$not base64!$${old}`, password: "calendar pw" })).toBe(false);
  });
});

describe("password accounts", () => {
  it("sign up takes a username and password, and the email is always the stand-in", async () => {
    const b = browser();
    const res = await b.send("/api/auth/sign-up/email", {
      method: "POST",
      json: { username: "Alice_1", password: "correct horse", email: "garrett@example.com", name: "x", roles: ["owner"] },
    });
    expect(res.status).toBe(200);
    const row = sqlite.prepare(`SELECT * FROM "user"`).get() as Record<string, unknown>;
    expect(row).toMatchObject({ username: "alice_1", displayUsername: "Alice_1", name: "Alice_1", email: "alice_1@users.pyre.test.invalid", roles: null });
    const me = await (await b.send("/api/account")).json();
    expect(me).toEqual({ signedIn: true, user: { name: "Alice_1", username: "alice_1", method: "password" }, links: [] });
  });

  it("refuses bad usernames, taken usernames and short passwords", async () => {
    expect((await register(browser(), "a b")).status).toBe(400);
    expect((await register(browser(), "ab")).status).toBe(400);
    expect((await register(browser(), "bob", "short")).status).toBe(400);
    expect((await register(browser(), "bob")).status).toBe(200);
    expect((await register(browser(), "BOB")).status).toBe(400);
  });

  it("signs in by username with a month-long session", async () => {
    await register(browser(), "carol");
    const b = browser();
    const bad = await b.send("/api/auth/sign-in/username", { method: "POST", json: { username: "carol", password: "wrong horse" } });
    expect(bad.status).toBe(401);
    const ok = await b.send("/api/auth/sign-in/username", { method: "POST", json: { username: "Carol", password: "correct horse" } });
    expect(ok.status).toBe(200);
    const session = sqlite.prepare(`SELECT "expiresAt" FROM "session" ORDER BY "createdAt" DESC LIMIT 1`).get() as { expiresAt: string };
    const days = (new Date(session.expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);
  });

  it("with signUp, sign-up needs the invite code (and with no code, nobody signs up)", async () => {
    const make = (signUp: { inviteCode?: string }) =>
      createAccounts({
        db: d1(sqlite),
        appOrigin: ORIGIN,
        secret: "test-secret-test-secret-test-secret-0123456789",
        gauthOrigin: "https://auth.test",
        gauthCerts: CERTS,
        isLinkId: () => false,
        linkPath: (id) => `/${id}`,
        signUp,
      });
    const signUp = async (json: Record<string, unknown>) => {
      const res = await accounts.route(
        new Request(ORIGIN + "/api/auth/sign-up/email", {
          method: "POST",
          headers: { Origin: ORIGIN, "Content-Type": "application/json", "CF-Connecting-IP": `10.9.${ip}.${++browsers}` },
          body: JSON.stringify({ password: "correct horse", email: "", name: "", ...json }),
        }),
      );
      return { status: res!.status, code: ((await res!.json()) as { code?: string }).code };
    };
    accounts = make({ inviteCode: "OPEN-SESAME" });
    expect(await signUp({ username: "nina" })).toEqual({ status: 403, code: "INVALID_INVITE" });
    expect(await signUp({ username: "nina", invite: "open-sesame" })).toEqual({ status: 403, code: "INVALID_INVITE" });
    expect((await signUp({ username: "nina", invite: " OPEN-SESAME " })).status).toBe(200);
    accounts = make({});
    expect(await signUp({ username: "oscar", invite: "" })).toEqual({ status: 403, code: "SIGN_UP_CLOSED" });
    expect(await signUp({ username: "oscar", invite: "OPEN-SESAME" })).toEqual({ status: 403, code: "SIGN_UP_CLOSED" });
    const users = sqlite.prepare(`SELECT "username" FROM "user"`).all();
    expect(users).toEqual([{ username: "nina" }]);
  });

  it("can't change its email or username afterwards", async () => {
    const b = browser();
    await register(b, "dave");
    expect((await b.send("/api/auth/update-user", { method: "POST", json: { email: "x@example.com" } })).status).toBe(400);
    expect((await b.send("/api/auth/update-user", { method: "POST", json: { username: "eve" } })).status).toBe(400);
  });
});

describe("GAuth accounts", () => {
  beforeEach(() => {
    const now = new Date().toISOString();
    sqlite.exec(`INSERT INTO "user" ("id","name","email","emailVerified","createdAt","updatedAt") VALUES ('g1','Garrett','owner@example.com',1,'${now}','${now}')`);
    sqlite.exec(`INSERT INTO "account" ("id","accountId","providerId","userId","createdAt","updatedAt") VALUES ('a1','gauth-user-1','gauth','g1','${now}','${now}')`);
  });

  it("discovery sends a GAuth address to GAuth and everything else to the password form", async () => {
    await register(browser(), "frank");
    const b = browser();
    const discover = async (identifier: string) =>
      (await (await b.send("/api/auth/sign-in/discover", { method: "POST", json: { identifier } })).json()).method;
    expect(await discover(" Owner@Example.com ")).toBe("gauth");
    expect(await discover("nobody@example.com")).toBe("password");
    expect(await discover("frank")).toBe("password");
    expect(await discover("frank@users.pyre.test.invalid")).toBe("password");
  });

  it("a password can't get into a GAuth account (USE_GAUTH)", async () => {
    // Even one that somehow has a password row too.
    sqlite.exec(`UPDATE "user" SET "username" = 'garrett' WHERE "id" = 'g1'`);
    sqlite.exec(`INSERT INTO "account" ("id","accountId","providerId","userId","password","createdAt","updatedAt") VALUES ('a2','g1','credential','g1','${await hashPassword("correct horse")}','x','x')`);
    const res = await browser().send("/api/auth/sign-in/username", { method: "POST", json: { username: "garrett", password: "correct horse" } });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("USE_GAUTH");
  });

  it("/auth/gauth starts a GAuth sign-in coming back to the page, and stops after a few tries", async () => {
    const b = browser();
    for (let i = 0; i < 3; i++) {
      const res = await b.send("/auth/gauth?next=%2Fabc%3Fx%3D1", { headers: { Origin: "" } });
      expect(res.status).toBe(302);
      const to = new URL(res.headers.get("Location")!);
      expect(to.origin + to.pathname).toBe("https://auth.test/saml/sso");
      expect(to.searchParams.get("SAMLRequest")).toBeTruthy();
    }
    const stuck = await b.send("/auth/gauth?next=%2Fabc%3Fx%3D1");
    expect(stuck.headers.get("Location")).toBe("/abc?x=1&auth_error=too_many_tries");
    // A deliberate retry starts over.
    expect(new URL((await b.send("/auth/gauth?next=%2Fabc&retry=1")).headers.get("Location")!).origin).toBe("https://auth.test");
  });

  it("GAuth's errors go back to the page", async () => {
    const res = await browser().send("/auth/error?next=%2Fabc&error=no_role");
    expect(res.headers.get("Location")).toBe("/abc?auth_error=no_role");
    const evil = await browser().send("/auth/error?next=%2F%2Fevil.example&error=x");
    expect(evil.headers.get("Location")).toBe("/?auth_error=x");
  });
});

describe("protected links", () => {
  it("anyone can use an unprotected link; a protected one needs its owner", async () => {
    const owner = browser();
    await register(owner, "gina");
    const stranger = browser();
    await register(stranger, "hank");
    const anon = browser();

    expect(await accounts.access(anon.request("/api/link1"), "link1")).toEqual({ ok: true, owner: null });

    expect((await anon.send("/api/account/links", { method: "POST", json: { id: "link1" } })).status).toBe(401);
    const claimed = await owner.send("/api/account/links", { method: "POST", json: { id: "link1" } });
    expect(claimed.status).toBe(200);
    expect(await claimed.json()).toEqual({ id: "link1", path: "/link1" });
    // Claiming again is fine; someone else can't.
    expect((await owner.send("/api/account/links", { method: "POST", json: { id: "link1" } })).status).toBe(200);
    expect((await stranger.send("/api/account/links", { method: "POST", json: { id: "link1" } })).status).toBe(409);
    expect((await owner.send("/api/account/links", { method: "POST", json: { id: "../x" } })).status).toBe(400);

    const a = await accounts.access(anon.request("/api/link1"), "link1");
    expect(a.ok).toBe(false);
    if (!a.ok) expect([a.response.status, (await a.response.json()).protected]).toEqual([401, true]);
    const s = await accounts.access(stranger.request("/api/link1"), "link1");
    expect(s.ok).toBe(false);
    if (!s.ok) expect([s.response.status, (await s.response.json()).otherAccount]).toEqual([403, true]);
    const o = await accounts.access(owner.request("/api/link1"), "link1");
    expect(o.ok).toBe(true);

    const me = await (await owner.send("/api/account")).json();
    expect(me.links).toEqual([expect.objectContaining({ id: "link1", path: "/link1", label: "plan link1" })]);

    // Signed out, it's locked again.
    await owner.send("/api/auth/sign-out", { method: "POST" });
    expect((await accounts.access(owner.request("/api/link1"), "link1")).ok).toBe(false);
  });

  it("release() unprotects a link (for an app deleting it)", async () => {
    const owner = browser();
    await register(owner, "ivy");
    await owner.send("/api/account/links", { method: "POST", json: { id: "gone" } });
    expect((await accounts.access(browser().request("/api/gone"), "gone")).ok).toBe(false);
    await accounts.release("gone");
    expect(await accounts.access(browser().request("/api/gone"), "gone")).toEqual({ ok: true, owner: null });
    expect((await (await owner.send("/api/account")).json()).links).toEqual([]);
  });
});

describe("legacy accounts", () => {
  it("move into D1 with their passwords and plans, and moving twice changes nothing", async () => {
    // What the old worker's hashPassword(password, salt) stored: base64url, both of them.
    const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const salt = b64url(new Uint8Array([251, 255, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]));
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode("legacy password"), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" }, key, 256);
    const plan = "2d0d093d-973e-4fdb-b0a2-552bcdf93854";
    const records = [{ username: "gpeake", salt, passwordHash: b64url(new Uint8Array(bits)), createdAt: "2026-02-14T07:51:58.545Z", planIds: [plan, "user:x"] }];
    sqlite.exec(legacySql(records, ORIGIN));
    sqlite.exec(legacySql(records, ORIGIN));
    expect(sqlite.prepare(`SELECT count(*) AS n FROM "account"`).get()).toEqual({ n: 1 });

    const b = browser();
    const wrong = await b.send("/api/auth/sign-in/username", { method: "POST", json: { username: "gpeake", password: "legacy passworD" } });
    expect(wrong.status).toBe(401);
    const res = await b.send("/api/auth/sign-in/username", { method: "POST", json: { username: "gpeake", password: "legacy password" } });
    expect(res.status).toBe(200);
    const me = await (await b.send("/api/account")).json();
    expect(me.user).toEqual({ name: "gpeake", username: "gpeake", method: "password" });
    expect(me.links.map((l: { id: string }) => l.id)).toEqual([plan]);
    expect((await accounts.access(b.request("/api/x"), plan)).ok).toBe(true);
    expect((await accounts.access(browser().request("/api/x"), plan)).ok).toBe(false);
  });
});

describe("requests from elsewhere", () => {
  const req = (method: string, headers: Record<string, string>, path = "/api/abc") => new Request(ORIGIN + path, { method, headers });
  it("refuses cross-origin writes, except GAuth's answer", () => {
    expect(accounts.crossOriginPost(req("PUT", { Origin: ORIGIN }))).toBeNull();
    expect(accounts.crossOriginPost(req("GET", { Origin: "https://evil.test" }))).toBeNull();
    expect(accounts.crossOriginPost(req("PUT", { Origin: "https://other.gpeake.com" }))?.status).toBe(403);
    expect(accounts.crossOriginPost(req("POST", { "Sec-Fetch-Site": "same-site" }))?.status).toBe(403);
    expect(accounts.crossOriginPost(req("POST", { Origin: "https://auth.test" }, "/api/auth/sso/saml2/sp/acs/gauth"))).toBeNull();
  });

  it("only comes back to pages of this app", () => {
    expect(safeNext("/abc?x=1")).toBe("/abc?x=1");
    for (const bad of [null, "", "abc", "//evil", "/\\evil", "/api/x", "/auth/gauth", "/a\nb"]) expect(safeNext(bad)).toBe("/");
  });
});
