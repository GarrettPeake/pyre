import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../index";
import { d1, migratedDb } from "../../test/d1";

const ORIGIN = "https://pyre.test";
const CERTS: string = JSON.parse(/"GAUTH_CERTS": ("[^"]+")/.exec(readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8"))![1]);

const PLAN = "3f8b2c1a-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const OTHER_PLAN = "7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d";
const SHARE = "0e1d2c3b-4a59-4687-b6a5-948372615040";

function memoryKV() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string, options?: { type?: "json" | "text" }) => {
      const value = store.get(key);
      if (value === undefined) return null;
      return options?.type === "json" ? JSON.parse(value) : value;
    }),
    put: vi.fn(async (key: string, value: string) => void store.set(key, value)),
    delete: vi.fn(async (key: string) => void store.delete(key)),
    store,
  };
}

let kv: ReturnType<typeof memoryKV>;
let env: Parameters<typeof worker.fetch>[1];
let ip = 0;

beforeEach(() => {
  kv = memoryKV();
  env = {
    FINANCIAL_PLANS: kv as unknown as KVNamespace,
    DB: d1(migratedDb()),
    APP_ORIGIN: ORIGIN,
    GAUTH_ORIGIN: "https://auth.test",
    GAUTH_CERTS: CERTS,
    BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0123456789",
  };
});

/** A browser on pyre.test: keeps its cookies and sends this origin. */
function browser() {
  const jar = new Map<string, string>();
  const addr = `10.1.0.${++ip}`;
  return async (path: string, init: RequestInit & { json?: unknown; origin?: string } = {}) => {
    const headers = new Headers(init.headers);
    headers.set("Origin", init.origin ?? ORIGIN);
    headers.set("CF-Connecting-IP", addr);
    if (jar.size) headers.set("Cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
    let body = init.body;
    if (init.json !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(init.json);
    }
    const res = await worker.fetch(new Request(ORIGIN + path, { ...init, headers, body }), env);
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(";");
      const [k, v] = pair.split("=");
      if (attrs.some((a) => /max-age=0\b/i.test(a.trim())) || v === "") jar.delete(k);
      else jar.set(k, v);
    }
    return res;
  };
}

/** A browser signed in to a new password account. */
async function signedIn(username: string) {
  const send = browser();
  const res = await send("/api/auth/sign-up/email", { method: "POST", json: { username, password: "correct horse", email: "", name: "" } });
  expect(res.status).toBe(200);
  return send;
}

const plan = (name = "My Plan") => ({ simulationName: name, currentAge: 30, retirementAge: 62, globalInit: "cash = 1", graphs: [], blocks: [] });

describe("plans anyone can use (not protected)", () => {
  it("a new plan is a 404 until it's saved, then reads back", async () => {
    const send = browser();
    const missing = await send(`/api/get_plan/${PLAN}`);
    expect(missing.status).toBe(404);
    expect(missing.headers.get("X-Link-Protected")).toBe("0");

    const saved = await send(`/api/save_plan/${PLAN}`, { method: "POST", json: plan() });
    expect(saved.status).toBe(200);
    const res = await send(`/api/get_plan/${PLAN}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Link-Protected")).toBe("0");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject(plan());
    expect(body.lastModified).toBeDefined();
  });

  it("plans are independent of each other", async () => {
    const send = browser();
    await send(`/api/save_plan/${PLAN}`, { method: "POST", json: plan("one") });
    await send(`/api/save_plan/${OTHER_PLAN}`, { method: "POST", json: plan("two") });
    expect((await (await send(`/api/get_plan/${PLAN}`)).json()).simulationName).toBe("one");
    expect((await (await send(`/api/get_plan/${OTHER_PLAN}`)).json()).simulationName).toBe("two");
  });

  it("upper-case ids work", async () => {
    const send = browser();
    await send(`/api/save_plan/${PLAN.toUpperCase()}`, { method: "POST", json: plan() });
    expect((await send(`/api/get_plan/${PLAN.toUpperCase()}`)).status).toBe(200);
  });

  it("the old owner field is neither returned nor saved (ownership is in D1)", async () => {
    kv.store.set(PLAN, JSON.stringify({ ...plan(), owner: "someone" }));
    const send = browser();
    expect(await (await send(`/api/get_plan/${PLAN}`)).json()).not.toHaveProperty("owner");
    await send(`/api/save_plan/${PLAN}`, { method: "POST", json: { ...plan(), owner: "me" } });
    expect(JSON.parse(kv.store.get(PLAN)!)).not.toHaveProperty("owner");
  });

  it("refuses what isn't a plan", async () => {
    const send = browser();
    expect((await send(`/api/save_plan/${PLAN}`, { method: "POST", body: "{not json", headers: { "Content-Type": "application/json" } })).status).toBe(400);
    expect((await send(`/api/save_plan/${PLAN}`, { method: "POST", json: [1, 2] })).status).toBe(400);
    expect((await send(`/api/save_plan/${PLAN}`, { method: "POST", json: { big: "x".repeat(2 * 1024 * 1024) } })).status).toBe(413);
    expect(kv.store.has(PLAN)).toBe(false);
  });

  it("only takes the right methods", async () => {
    const send = browser();
    expect((await send(`/api/save_plan/${PLAN}`)).status).toBe(404);
    expect((await send(`/api/get_plan/${PLAN}`, { method: "POST", json: plan() })).status).toBe(404);
    expect((await send(`/api/nothing`)).status).toBe(404);
  });

  it("can't be deleted (only a protected plan's owner deletes)", async () => {
    kv.store.set(PLAN, JSON.stringify(plan()));
    const send = await signedIn("dora");
    expect((await send(`/api/plans/${PLAN}`, { method: "DELETE" })).status).toBe(403);
    expect(kv.store.has(PLAN)).toBe(true);
  });
});

describe("keys that are not plan ids", () => {
  it("never reads or writes user or share records as plans", async () => {
    const user = { username: "alice", passwordHash: "h", salt: "s", planIds: [] };
    kv.store.set("user:alice", JSON.stringify(user));
    kv.store.set(`share:${SHARE}`, PLAN);
    const send = browser();
    for (const path of ["get_plan/user:alice", `get_plan/share:${SHARE}`, "get_plan/", "get_plan/..%2Fuser:alice"]) {
      expect((await send(`/api/${path}`)).status).toBe(400);
    }
    for (const path of ["save_plan/user:alice", "create_share/user:alice"]) {
      expect((await send(`/api/${path}`, { method: "POST", json: { username: "alice", passwordHash: "mine", salt: "mine" } })).status).toBe(400);
    }
    expect((await send("/api/plans/user:alice", { method: "DELETE" })).status).toBe(400);
    expect(JSON.parse(kv.store.get("user:alice")!)).toEqual(user);
  });
});

describe("protected plans", () => {
  it("open only in the owner's session", async () => {
    const anyone = browser();
    await anyone(`/api/save_plan/${PLAN}`, { method: "POST", json: plan("mine") });

    const owner = await signedIn("erin");
    expect((await owner("/api/account/links", { method: "POST", json: { id: PLAN } })).status).toBe(200);

    const anon = await anyone(`/api/get_plan/${PLAN}`);
    expect(anon.status).toBe(401);
    expect(await anon.json()).toMatchObject({ protected: true });
    const overwrite = await anyone(`/api/save_plan/${PLAN}`, { method: "POST", json: plan("theirs") });
    expect(overwrite.status).toBe(401);

    const stranger = await signedIn("fred");
    const other = await stranger(`/api/get_plan/${PLAN}`);
    expect(other.status).toBe(403);
    expect(await other.json()).toMatchObject({ protected: true, otherAccount: true });
    expect((await stranger(`/api/plans/${PLAN}`, { method: "DELETE" })).status).toBe(403);
    expect((await stranger("/api/account/links", { method: "POST", json: { id: PLAN } })).status).toBe(409);

    const mine = await owner(`/api/get_plan/${PLAN}`);
    expect(mine.status).toBe(200);
    expect(mine.headers.get("X-Link-Protected")).toBe("1");
    expect((await mine.json()).simulationName).toBe("mine");
    expect((await owner(`/api/save_plan/${PLAN}`, { method: "POST", json: plan("renamed") })).status).toBe(200);

    // The account lists it under the plan's name.
    const me = await (await owner("/api/account")).json();
    expect(me.links).toEqual([expect.objectContaining({ id: PLAN, path: `/app/${PLAN}`, label: "renamed" })]);
  });

  it("only plan ids can be protected", async () => {
    const owner = await signedIn("gail");
    expect((await owner("/api/account/links", { method: "POST", json: { id: "user:gail" } })).status).toBe(400);
  });

  it("the owner deletes one, which also unprotects its id", async () => {
    const owner = await signedIn("hugo");
    await owner(`/api/save_plan/${PLAN}`, { method: "POST", json: plan() });
    await owner("/api/account/links", { method: "POST", json: { id: PLAN } });
    expect((await owner(`/api/plans/${PLAN}`, { method: "DELETE" })).status).toBe(200);
    expect(kv.store.has(PLAN)).toBe(false);
    expect((await (await owner("/api/account")).json()).links).toEqual([]);
    expect((await browser()(`/api/get_plan/${PLAN}`)).status).toBe(404);
  });

  it("a signed-in account protects a new plan before it's ever saved", async () => {
    const owner = await signedIn("iris");
    await owner("/api/account/links", { method: "POST", json: { id: PLAN } });
    expect((await owner(`/api/get_plan/${PLAN}`)).status).toBe(404);
    expect((await browser()(`/api/save_plan/${PLAN}`, { method: "POST", json: plan() })).status).toBe(401);
    expect((await owner(`/api/save_plan/${PLAN}`, { method: "POST", json: plan() })).status).toBe(200);
  });
});

describe("share links", () => {
  it("give a read-only copy of the plan to anyone holding them", async () => {
    const send = browser();
    await send(`/api/save_plan/${PLAN}`, { method: "POST", json: plan("shared") });
    const res = await send(`/api/create_share/${PLAN}`, { method: "POST" });
    expect(res.status).toBe(200);
    const { shareId } = await res.json();
    expect(kv.store.get(`share:${shareId}`)).toBe(PLAN);
    const shared = await browser()(`/api/get_share/${shareId}`);
    expect(shared.status).toBe(200);
    expect((await shared.json()).simulationName).toBe("shared");
    // Read-only: there's no writing through a share id.
    expect((await browser()(`/api/save_plan/${shareId}`, { method: "POST", json: plan("x") })).status).toBe(200);
    expect((await (await browser()(`/api/get_share/${shareId}`)).json()).simulationName).toBe("shared");
  });

  it("of a protected plan, only its owner makes them; they still work for anyone", async () => {
    const owner = await signedIn("jack");
    await owner(`/api/save_plan/${PLAN}`, { method: "POST", json: plan("private") });
    await owner("/api/account/links", { method: "POST", json: { id: PLAN } });
    expect((await browser()(`/api/create_share/${PLAN}`, { method: "POST" })).status).toBe(401);
    const { shareId } = await (await owner(`/api/create_share/${PLAN}`, { method: "POST" })).json();
    expect((await (await browser()(`/api/get_share/${shareId}`)).json()).simulationName).toBe("private");
  });

  it("404 for unknown shares, unknown plans and deleted plans", async () => {
    const send = browser();
    expect((await send(`/api/create_share/${PLAN}`, { method: "POST" })).status).toBe(404);
    expect((await send(`/api/get_share/${SHARE}`)).status).toBe(404);
    expect((await send("/api/get_share/not-a-share")).status).toBe(404);
    kv.store.set(`share:${SHARE}`, PLAN);
    expect((await send(`/api/get_share/${SHARE}`)).status).toBe(404);
  });
});

describe("the edges", () => {
  it("refuses writes from other sites", async () => {
    const send = browser();
    const res = await send(`/api/save_plan/${PLAN}`, { method: "POST", json: plan(), origin: "https://evil.gpeake.com" });
    expect(res.status).toBe(403);
    expect(kv.store.has(PLAN)).toBe(false);
  });

  it("sends other hosts to the one address", async () => {
    const res = await worker.fetch(new Request(`https://other.test/app/${PLAN}?x=1`), env);
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe(`${ORIGIN}/app/${PLAN}?x=1`);
  });

  it("answers 500 when storage fails", async () => {
    kv.get.mockRejectedValueOnce(new Error("KV down"));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    expect((await browser()(`/api/get_plan/${PLAN}`)).status).toBe(500);
  });
});
