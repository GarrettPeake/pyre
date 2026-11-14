/**
 * Accounts for an app whose data lives behind secret links (Decklister's /<uuid>,
 * Pyre's plans): anyone can use a link without signing in, and anyone holding a link
 * nobody has claimed can protect it with an account, new or existing. A protected
 * link opens only in its owner's session.
 *
 * Accounts are a username and password, or GAuth (passkeys, for people GAuth gives a
 * role on the app). See ./README.md for the flows and how to adopt this in an app.
 *
 * This file stays light: Better Auth (./auth.ts) is imported only when a request
 * carries a session cookie or asks for an account endpoint.
 */
import type { Auth, AuthConfig } from "./auth";

export interface AccountsConfig extends AuthConfig {
  /** Whether a string is one of this app's link ids (checked before claiming one). */
  isLinkId(id: string): boolean;
  /** The page a link opens at, e.g. `/${id}`. */
  linkPath(id: string): string;
  /** A short label for a link in the account's list (a deck's or plan's name), if any. */
  describeLink?(id: string): Promise<string | null>;
}

export interface SignedInUser {
  id: string;
  name: string;
  username: string | null;
  method: "gauth" | "password";
}

export type LinkAccess =
  | { ok: true; owner: string | null }
  | { ok: false; response: Response };

/** Where GAuth posts its answers: the one cross-site POST there is (see crossOriginPost). */
export const GAUTH_ACS_PATH = "/api/auth/sso/saml2/sp/acs/gauth";
const TRIES_COOKIE = "acct_signin_tries";
const MAX_TRIES = 3;

const json = (status: number, body: unknown, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });

const redirect = (location: string, cookies: string[] = []) => {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
};

/** Each Set-Cookie on a response (the runtime has getSetCookie; older types may not). */
const setCookies = (headers: Headers): string[] => (headers as Headers & { getSetCookie(): string[] }).getSetCookie();

/** Whether the request carries a Better Auth session cookie (`__Secure-` prefixed over https). */
const hasSessionCookie = (req: Request) => (req.headers.get("Cookie") ?? "").includes("better-auth.session_token=");

/** A page of this app to come back to: a path, never another host, an API or a sign-in step. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001F]/.test(next)) return "/";
  if (/^\/(api|auth)(\/|\?|#|$)/.test(next)) return "/";
  return next;
}

const tries = (req: Request) => {
  const m = new RegExp(`(?:^|;\\s*)${TRIES_COOKIE}=(\\d+)`).exec(req.headers.get("Cookie") ?? "");
  return m ? Number(m[1]) : 0;
};
const triesCookie = (n: number, secure: boolean) =>
  `${TRIES_COOKIE}=${n === 0 ? "" : n}; Path=/auth; Max-Age=${n === 0 ? 0 : 60}; HttpOnly;${secure ? " Secure;" : ""} SameSite=Lax`;

/** Back to `next` with ?auth_error=<code>, for the page to explain (public/js/accounts). */
function withError(next: string, code: string): string {
  const url = new URL(next, "https://x");
  url.searchParams.set("auth_error", code.slice(0, 64));
  return url.pathname + url.search + url.hash;
}

export function createAccounts(config: AccountsConfig) {
  let auth: Promise<Auth | null> | null = null;
  const secure = config.appOrigin.startsWith("https:");

  /** Better Auth, or null when it can't be set up (a missing secret, say). */
  function loadAuth(): Promise<Auth | null> {
    auth ??= import("./auth")
      .then(({ buildAuth }) => buildAuth(config))
      .catch((error) => {
        console.error("Accounts unavailable", String(error));
        auth = null;
        return null;
      });
    return auth;
  }

  async function userOf(req: Request): Promise<SignedInUser | null> {
    if (!hasSessionCookie(req)) return null;
    const a = await loadAuth();
    if (!a) return null;
    try {
      const result = await a.api.getSession({ headers: req.headers });
      if (!result) return null;
      const u = result.user as typeof result.user & { username?: string | null; displayUsername?: string | null };
      const gauth = await config.db
        .prepare(`SELECT 1 FROM "account" WHERE "userId" = ? AND "providerId" = 'gauth' LIMIT 1`)
        .bind(u.id)
        .first();
      return { id: u.id, name: u.displayUsername || u.name, username: u.username ?? null, method: gauth ? "gauth" : "password" };
    } catch (error) {
      console.error("Session check failed", String(error));
      return null;
    }
  }

  async function ownerOf(linkId: string): Promise<string | null> {
    return (await config.db.prepare(`SELECT "userId" FROM "protectedLink" WHERE "id" = ?`).bind(linkId).first<string>("userId")) ?? null;
  }

  /**
   * Whether this request may use the link: anyone may use an unprotected one; a
   * protected one needs its owner's session (401 without a session, 403 in someone
   * else's). The JSON says `protected: true` so the page knows to ask for a sign-in.
   */
  async function access(req: Request, linkId: string): Promise<LinkAccess> {
    const owner = await ownerOf(linkId);
    if (!owner) return { ok: true, owner: null };
    const user = await userOf(req);
    if (!user) return { ok: false, response: json(401, { error: "Sign in to open this link.", protected: true }) };
    if (user.id !== owner) return { ok: false, response: json(403, { error: "This link belongs to another account.", protected: true, otherAccount: true }) };
    return { ok: true, owner };
  }

  /**
   * Unprotect a link, for an app deleting it. It checks nothing: call access() first
   * and make sure the requester owns the link.
   */
  async function release(linkId: string): Promise<void> {
    await config.db.prepare(`DELETE FROM "protectedLink" WHERE "id" = ?`).bind(linkId).run();
  }

  /** GET /api/account: who is signed in, and the links they've protected. */
  async function account(req: Request): Promise<Response> {
    const user = await userOf(req);
    if (!user) return json(200, { signedIn: false });
    const { results } = await config.db
      .prepare(`SELECT "id", "createdAt" FROM "protectedLink" WHERE "userId" = ? ORDER BY "createdAt" DESC`)
      .bind(user.id)
      .all<{ id: string; createdAt: number }>();
    const links = await Promise.all(
      results.map(async (r) => ({
        id: r.id,
        path: config.linkPath(r.id),
        label: (await config.describeLink?.(r.id).catch(() => null)) ?? null,
        protectedAt: r.createdAt,
      })),
    );
    return json(200, { signedIn: true, user: { name: user.name, username: user.username, method: user.method }, links });
  }

  /**
   * POST /api/account/links {id}: protect a link with the signed-in account. Holding
   * the link is what proves the right to it (it's the secret); the first account to
   * claim it keeps it.
   */
  async function claim(req: Request): Promise<Response> {
    const user = await userOf(req);
    if (!user) return json(401, { error: "Sign in first." });
    const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
    const id = body?.id;
    if (typeof id !== "string" || !config.isLinkId(id)) return json(400, { error: "That isn't a link." });
    await config.db
      .prepare(`INSERT INTO "protectedLink" ("id", "userId", "createdAt") VALUES (?, ?, ?) ON CONFLICT ("id") DO NOTHING`)
      .bind(id, user.id, Date.now())
      .run();
    const owner = await ownerOf(id);
    if (owner !== user.id) return json(409, { error: "Another account already protects this link." });
    return json(200, { id, path: config.linkPath(id) });
  }

  /**
   * GET /auth/gauth?next=<path>: off to GAuth, coming back to `next`. Started on the
   * server (Better Auth's POST /sign-in/sso), so it's one redirect with nothing to
   * click. A few quick tries without a session, or GAuth saying no, end in
   * `next?auth_error=<code>` instead of another round, so a broken sign-in can't loop.
   */
  async function startGAuth(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const next = safeNext(url.searchParams.get("next"));
    const n = url.searchParams.get("retry") === "1" ? 0 : tries(req);
    if (n >= MAX_TRIES) return redirect(withError(next, "too_many_tries"), [triesCookie(0, secure)]);
    const a = await loadAuth();
    if (!a) return redirect(withError(next, "unavailable"));
    const headers = new Headers({ "Content-Type": "application/json", Origin: config.appOrigin });
    for (const name of ["Cookie", "CF-Connecting-IP", "User-Agent"]) {
      const value = req.headers.get(name);
      if (value) headers.set(name, value);
    }
    const res = await a.handler(
      new Request(`${config.appOrigin}/api/auth/sign-in/sso`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          providerId: "gauth",
          callbackURL: next,
          // Better Auth adds ?error=<code> (or &error=); /auth/error takes it back to `next`.
          errorCallbackURL: `/auth/error?next=${encodeURIComponent(next)}`,
        }),
      }),
    );
    const data = res.ok ? ((await res.json().catch(() => null)) as { url?: unknown } | null) : null;
    if (typeof data?.url !== "string") {
      console.error("Starting GAuth sign-in failed", res.status);
      return redirect(withError(next, res.status === 429 ? "too_many_tries" : "unavailable"));
    }
    // The relay state cookie ties GAuth's answer to this browser.
    return redirect(data.url, [...setCookies(res.headers), triesCookie(n + 1, secure)]);
  }

  /** GET /auth/error?error=<code>&next=<path>: a GAuth sign-in that didn't work, back to the page. */
  function gauthError(req: Request): Response {
    const url = new URL(req.url);
    return redirect(withError(safeNext(url.searchParams.get("next")), url.searchParams.get("error") || "failed"), [triesCookie(0, secure)]);
  }

  /**
   * The account routes: /api/auth/* (Better Auth), /api/account, /api/account/links,
   * /auth/gauth, /auth/error. Null for anything else.
   */
  async function route(req: Request): Promise<Response | null> {
    const { pathname } = new URL(req.url);
    if (pathname.startsWith("/api/auth/")) {
      const a = await loadAuth();
      if (!a) return json(503, { error: "Accounts are unavailable right now." });
      return a.handler(req);
    }
    if (pathname === "/api/account" && req.method === "GET") return account(req);
    if (pathname === "/api/account/links" && req.method === "POST") return claim(req);
    if (pathname === "/auth/gauth" && req.method === "GET") return startGAuth(req);
    if (pathname === "/auth/error" && req.method === "GET") return gauthError(req);
    if (pathname === "/api/account" || pathname.startsWith("/api/account/") || pathname.startsWith("/auth/")) {
      return json(404, { error: "Not found" });
    }
    return null;
  }

  /**
   * A state-changing request from another origin, refused before anything else
   * runs. On a *.gpeake.com host every other *.gpeake.com site is "same-site", so
   * SameSite=Lax alone would let them post here with the session cookie. GAuth's
   * answer is the one cross-site POST there is: Better Auth checks it (a signed
   * assertion answering a request this browser started).
   */
  function crossOriginPost(req: Request): Response | null {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return null;
    if (new URL(req.url).pathname === GAUTH_ACS_PATH) return null;
    const origin = req.headers.get("Origin");
    const site = req.headers.get("Sec-Fetch-Site");
    const foreign = origin ? origin !== config.appOrigin : site !== null && site !== "same-origin" && site !== "none";
    return foreign ? json(403, { error: "Cross-origin request refused." }) : null;
  }

  return { route, access, userOf, crossOriginPost, release };
}

export type Accounts = ReturnType<typeof createAccounts>;
