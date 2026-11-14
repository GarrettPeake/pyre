/**
 * Pyre's API. Plans live in KV under their id, a UUID that is also the plan's secret
 * link (/app/<id>). Anyone holding a link can use the plan, unless an account has
 * protected it: then only that account's session can (worker/accounts, D1).
 *
 * KV also holds share:<id> records (read-only links to a plan) and, from before
 * accounts moved to D1, user:<name> records. Only UUIDs are ever read or written as
 * plans, so those can't be reached through the plan endpoints.
 */
import { createAccounts, type Accounts } from "./accounts";

interface Env {
  FINANCIAL_PLANS: KVNamespace;
  DB: D1Database;
  APP_ORIGIN: string;
  GAUTH_ORIGIN: string;
  GAUTH_CERTS: string;
  BETTER_AUTH_SECRET?: string;
}

/** A saved plan, as the page sends it. Ownership isn't part of it (it's in D1). */
interface SavedPlanData {
  simulationName?: string;
  lastModified?: string;
  owner?: unknown;
  [key: string]: unknown;
}

const PLAN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isPlanId(id: unknown): id is string {
  return typeof id === "string" && PLAN_ID.test(id);
}

/** The most a saved plan may weigh (real plans are a few tens of kB). */
const MAX_PLAN_BYTES = 2 * 1024 * 1024;

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

const accountsByEnv = new WeakMap<Env, Accounts>();
function accountsFor(env: Env): Accounts {
  let accounts = accountsByEnv.get(env);
  if (!accounts) {
    accounts = createAccounts({
      db: env.DB,
      appOrigin: env.APP_ORIGIN,
      secret: env.BETTER_AUTH_SECRET,
      gauthOrigin: env.GAUTH_ORIGIN,
      gauthCerts: env.GAUTH_CERTS,
      isLinkId: isPlanId,
      linkPath: (id) => `/app/${id}`,
      describeLink: async (id) => {
        const plan = (await env.FINANCIAL_PLANS.get(id, { type: "json" })) as SavedPlanData | null;
        return typeof plan?.simulationName === "string" ? plan.simulationName : null;
      },
    });
    accountsByEnv.set(env, accounts);
  }
  return accounts;
}

/** A plan as stored, without the "owner" field accounts kept in KV before D1. */
function withoutOwner(plan: SavedPlanData): SavedPlanData {
  const rest = { ...plan };
  delete rest.owner;
  return rest;
}

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const route = url.pathname;
  const method = request.method;

  // One address: sessions and GAuth's answers belong to APP_ORIGIN.
  if (env.APP_ORIGIN && url.origin !== env.APP_ORIGIN) {
    return Response.redirect(env.APP_ORIGIN + route + url.search, 301);
  }

  const accounts = accountsFor(env);
  const refused = accounts.crossOriginPost(request);
  if (refused) return refused;
  const accountResponse = await accounts.route(request);
  if (accountResponse) return accountResponse;

  // GET /api/get_plan/:id. 404 means a new plan (the page starts it from defaults).
  if (route.startsWith("/api/get_plan/") && method === "GET") {
    const id = route.slice("/api/get_plan/".length);
    if (!isPlanId(id)) return json({ error: "That isn't a plan." }, 400);
    const access = await accounts.access(request, id);
    if (!access.ok) return access.response;
    const plan = (await env.FINANCIAL_PLANS.get(id, { type: "json" })) as SavedPlanData | null;
    const protectedHeader = { "X-Link-Protected": access.owner ? "1" : "0" };
    if (plan === null) return json({ error: "Plan not found" }, 404, protectedHeader);
    return json(withoutOwner(plan), 200, protectedHeader);
  }

  // POST /api/save_plan/:id
  if (route.startsWith("/api/save_plan/") && method === "POST") {
    const id = route.slice("/api/save_plan/".length);
    if (!isPlanId(id)) return json({ error: "That isn't a plan." }, 400);
    const access = await accounts.access(request, id);
    if (!access.ok) return access.response;
    const text = await request.text();
    if (text.length > MAX_PLAN_BYTES) return json({ error: "That plan is too large." }, 413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: "That isn't JSON." }, 400);
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return json({ error: "That isn't a plan." }, 400);
    }
    const plan = { ...withoutOwner(body as SavedPlanData), lastModified: new Date().toISOString() };
    await env.FINANCIAL_PLANS.put(id, JSON.stringify(plan));
    return json({ success: true });
  }

  // DELETE /api/plans/:id: the owner of a protected plan deletes it.
  if (route.startsWith("/api/plans/") && method === "DELETE") {
    const id = route.slice("/api/plans/".length);
    if (!isPlanId(id)) return json({ error: "That isn't a plan." }, 400);
    const access = await accounts.access(request, id);
    if (!access.ok) return access.response;
    if (!access.owner) return json({ error: "Only a plan protected by your account can be deleted." }, 403);
    await env.FINANCIAL_PLANS.delete(id);
    await accounts.release(id);
    return json({ success: true });
  }

  // POST /api/create_share/:id: a read-only link to the plan, for whoever may use it.
  if (route.startsWith("/api/create_share/") && method === "POST") {
    const id = route.slice("/api/create_share/".length);
    if (!isPlanId(id)) return json({ error: "That isn't a plan." }, 400);
    const access = await accounts.access(request, id);
    if (!access.ok) return access.response;
    if ((await env.FINANCIAL_PLANS.get(id)) === null) return json({ error: "Plan not found" }, 404);
    const shareId = crypto.randomUUID();
    await env.FINANCIAL_PLANS.put(`share:${shareId}`, id);
    return json({ shareId });
  }

  // GET /api/get_share/:shareId: the plan, read-only. Holding a share link is enough.
  if (route.startsWith("/api/get_share/") && method === "GET") {
    const shareId = route.slice("/api/get_share/".length);
    if (!isPlanId(shareId)) return json({ error: "Share link not found" }, 404);
    const planId = await env.FINANCIAL_PLANS.get(`share:${shareId}`);
    if (planId === null || !isPlanId(planId)) return json({ error: "Share link not found" }, 404);
    const plan = (await env.FINANCIAL_PLANS.get(planId, { type: "json" })) as SavedPlanData | null;
    if (plan === null) return json({ error: "Plan no longer exists" }, 404);
    return json(withoutOwner(plan));
  }

  if (route.startsWith("/api/")) return json({ error: "Not found" }, 404);
  // Anything else falls through to the page.
  return new Response(null, { status: 404 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handle(request, env);
    } catch (error) {
      console.error("Uncaught exception:", error);
      return json({ error: "Something went wrong." }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
