/**
 * Better Auth for the accounts module (./index.ts loads this with import(), so a
 * request that doesn't touch an account never evaluates Better Auth or the SAML
 * libraries).
 *
 * Two kinds of account, never both on one user (GAuth's README, "Registering an app"):
 * - password accounts: a username and a password, made by anyone. Better Auth wants
 *   an email on every user, so theirs is a stand-in under `.invalid` (never a real
 *   address, so it can't collide with a GAuth one);
 * - GAuth accounts (https://auth.gpeake.com, passkeys over SAML): an account row with
 *   providerId "gauth", keyed on the permanent GAuth user id. Made on first sign-in,
 *   or by linking an existing account (scripts/link-gauth.mjs). Password sign-in
 *   refuses them (USE_GAUTH), so a password can never get around their passkeys.
 *
 * Configured as GAuth's admin snippet says, for better-auth / @better-auth/sso
 * 1.7.18; recheck on upgrade.
 */
import { sso } from "@better-auth/sso";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, createAuthMiddleware } from "better-auth/api";
import { username } from "better-auth/plugins";
import * as z from "zod";
import { hashPassword, verifyPassword } from "./password";

export const GAUTH_PROVIDER = "gauth";
/** GAuth sessions end on schedule, so disabling someone in GAuth reaches the app within this. */
const GAUTH_SESSION_SECONDS = 60 * 60 * 12;
/** Password accounts have nothing upstream to defer to: a month, like most sites. */
const PASSWORD_SESSION_SECONDS = 60 * 60 * 24 * 30;
/** Where password sessions are made (anything else, GAuth's answer included, gets the short one). */
const PASSWORD_PATHS = new Set(["/sign-in/username", "/sign-up/email"]);
export const USERNAME = /^[a-zA-Z0-9_]{3,30}$/;

export interface AuthConfig {
  db: D1Database;
  /** This app's origin, e.g. https://decklister.gpeake.com. */
  appOrigin: string;
  secret: string | undefined;
  /** GAuth's origin, e.g. https://auth.gpeake.com. */
  gauthOrigin: string | undefined;
  /** GAuth's signing certificate(s), PEM, all in one string. */
  gauthCerts: string | undefined;
}

/** The PEM certificates in a string (a var can't hold a list). */
export const parseCerts = (pems: string | undefined) =>
  (pems ?? "").match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];

/** Where GAuth must send sign-ins, and what it knows this app as: register both in GAuth. */
export const gauthEndpoints = (appOrigin: string) => ({
  entityId: `${appOrigin}/api/auth/sso/saml2/sp/metadata?providerId=${GAUTH_PROVIDER}`,
  acsUrl: `${appOrigin}/api/auth/sso/saml2/sp/acs/${GAUTH_PROVIDER}`,
});

/** The stand-in email of a password account. */
export const standInEmail = (appOrigin: string, name: string) => `${name.toLowerCase()}@users.${new URL(appOrigin).hostname}.invalid`;

type Adapter = {
  findOne: <T>(q: { model: string; where: { field: string; value: string }[] }) => Promise<T | null>;
};

/** The user an email (anything with an @) or a username names, if any. */
async function findUser(adapter: Adapter, identifier: string): Promise<{ id: string } | null> {
  const value = identifier.trim().toLowerCase();
  if (!value) return null;
  return adapter.findOne<{ id: string }>({ model: "user", where: [{ field: value.includes("@") ? "email" : "username", value }] });
}

export async function signsInWithGAuth(adapter: Adapter, userId: string): Promise<boolean> {
  const row = await adapter.findOne({ model: "account", where: [{ field: "userId", value: userId }, { field: "providerId", value: GAUTH_PROVIDER }] });
  return row !== null;
}

/** Password sign-in endpoints, and the field each names the account by. */
const PASSWORD_SIGN_IN: Record<string, "email" | "username"> = { "/sign-in/email": "email", "/sign-in/username": "username" };

/**
 * `/sign-in/discover`, the USE_GAUTH rule, and sign-up by username alone.
 *
 * Discovery says "gauth" only for an account linked to GAuth; anything else, an
 * address nobody uses included, gets "password". So it reveals which addresses use
 * GAuth here, not which accounts exist.
 */
const accountRules = (appOrigin: string) =>
  ({
    id: "account-rules",
    endpoints: {
      discoverSignIn: createAuthEndpoint(
        "/sign-in/discover",
        { method: "POST", body: z.object({ identifier: z.string().max(320) }) },
        async (ctx) => {
          const adapter = ctx.context.adapter as unknown as Adapter;
          const user = await findUser(adapter, ctx.body.identifier);
          const gauth = user !== null && (await signsInWithGAuth(adapter, user.id));
          return ctx.json(gauth ? { method: "gauth" as const } : { method: "password" as const });
        },
      ),
    },
    hooks: {
      before: [
        {
          // A password can't get into a GAuth account.
          matcher: (ctx) => ctx.path !== undefined && ctx.path in PASSWORD_SIGN_IN,
          handler: createAuthMiddleware(async (ctx) => {
            const field = PASSWORD_SIGN_IN[ctx.path ?? ""];
            const identifier = (ctx.body as Record<string, unknown> | undefined)?.[field ?? ""];
            if (typeof identifier !== "string") return;
            const adapter = ctx.context.adapter as unknown as Adapter;
            const user = await findUser(adapter, identifier);
            if (user && (await signsInWithGAuth(adapter, user.id))) {
              throw new APIError("FORBIDDEN", { code: "USE_GAUTH", message: "This account signs in with GAuth." });
            }
          }),
        },
        {
          // Sign-up takes a username and a password, nothing else. The email is
          // always the stand-in, so nobody can sign up as a real address (which
          // would also block that address's GAuth sign-in: accounts never link by email).
          matcher: (ctx) => ctx.path === "/sign-up/email",
          handler: createAuthMiddleware(async (ctx) => {
            const body = (ctx.body ?? {}) as Record<string, unknown>;
            const name = body.username;
            if (typeof name !== "string" || !USERNAME.test(name)) {
              throw new APIError("BAD_REQUEST", { code: "INVALID_USERNAME", message: "Usernames are 3–30 letters, numbers or underscores." });
            }
            // In place: the endpoint reads this same object.
            for (const key of Object.keys(body)) if (key !== "username" && key !== "password") delete body[key];
            Object.assign(body, { name, displayUsername: name, email: standInEmail(appOrigin, name) });
          }),
        },
        {
          // Emails come from GAuth or are stand-ins; nobody changes them here.
          matcher: (ctx) => ctx.path === "/update-user",
          handler: createAuthMiddleware(async (ctx) => {
            const body = (ctx.body ?? {}) as Record<string, unknown>;
            if ("email" in body || "username" in body) {
              throw new APIError("BAD_REQUEST", { message: "That can't be changed." });
            }
          }),
        },
      ],
    },
    rateLimit: [{ pathMatcher: (path: string) => path === "/sign-in/discover", window: 60, max: 20 }],
  }) satisfies BetterAuthPlugin;

/** Better Auth's Location for a GAuth sign-in this app turns away. */
export const GAUTH_REFUSED = "/auth/error?error=no_role";

export function buildAuth(config: AuthConfig) {
  const { appOrigin } = config;
  const certs = parseCerts(config.gauthCerts);
  if (!config.secret) throw new Error("BETTER_AUTH_SECRET is not set");
  if (!appOrigin || !config.gauthOrigin || certs.length === 0) throw new Error("APP_ORIGIN / GAUTH_ORIGIN / GAUTH_CERTS are not set");
  const { entityId } = gauthEndpoints(appOrigin);

  const auth = betterAuth({
    appName: new URL(appOrigin).hostname,
    baseURL: appOrigin,
    basePath: "/api/auth",
    secret: config.secret,
    database: config.db,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      password: { hash: hashPassword, verify: verifyPassword },
    },
    // The cookie lasts as long as the longest session; databaseHooks below shortens
    // GAuth's in the database, which is what counts. No refresh: sessions end on schedule.
    session: { expiresIn: PASSWORD_SESSION_SECONDS, disableSessionRefresh: true },
    databaseHooks: {
      session: {
        create: {
          before: async (session, ctx) => {
            const seconds = ctx?.path && PASSWORD_PATHS.has(ctx.path) ? PASSWORD_SESSION_SECONDS : GAUTH_SESSION_SECONDS;
            return { data: { ...session, expiresAt: new Date(Date.now() + seconds * 1000) } };
          },
        },
      },
    },
    // A GAuth sign-in attaches only to the account it created (keyed on the permanent
    // GAuth user id) or one linked on purpose, never to a user with the same email.
    account: { accountLinking: { disableImplicitLinking: true } },
    // GAuth's roles for this app, kept for the record; only the server sets them.
    user: { additionalFields: { roles: { type: "string[]", required: false, input: false } } },
    rateLimit: { enabled: true, storage: "database", customRules: { "/sign-in/sso": { window: 60, max: 10 } } },
    // Cookies stay host-only (Better Auth's default); never crossSubDomainCookies.
    advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
    plugins: [
      username({ minUsernameLength: 3, maxUsernameLength: 30, usernameValidator: (name) => USERNAME.test(name) }),
      accountRules(appOrigin),
      sso({
        // GAuth is the only identity provider. Nobody can register another one
        // through the API (which would let them sign in as anyone).
        providersLimit: 0,
        defaultSSO: [
          {
            providerId: GAUTH_PROVIDER,
            // Don't turn on domainVerification for this provider: it would make
            // GAuth trusted for every address at this domain.
            domain: new URL(appOrigin).hostname,
            samlConfig: {
              // In Better Auth this names the app (the service provider), not GAuth.
              issuer: entityId,
              entryPoint: `${config.gauthOrigin}/saml/sso`,
              idpMetadata: { entityID: `${config.gauthOrigin}/saml/metadata`, cert: certs },
              spMetadata: { entityID: entityId },
              wantAssertionsSigned: true,
              identifierFormat: "urn:oasis:names:tc:SAML:2.0:nameid-format:persistent",
              mapping: {
                email: "email",
                emailVerified: "emailVerified",
                // Chosen by the person: render it as text.
                name: "displayName",
                extraFields: { roles: "roles" },
              },
              // Required by the types; only used in metadata Better Auth generates.
              callbackUrl: `${appOrigin}/`,
            },
          },
        ],
        // Answers must match a request this app sent (no unsolicited sign-ins), and
        // carry their validity window, with at most a minute of clock difference.
        saml: { enableInResponseToValidation: true, allowIdpInitiated: false, requireTimestamps: true, clockSkew: 60_000 },
        // Safe because accounts never link on email (disableImplicitLinking).
        trustEmailVerified: true,
        // Roles, email and name change in GAuth, so copy them at every sign-in.
        provisionUserOnEveryLogin: true,
        provisionUser: async ({ user, userInfo, provider }) => {
          if (provider.providerId !== GAUTH_PROVIDER) return;
          // One role arrives as a string, several as an array.
          const raw = userInfo.roles;
          const roles = (Array.isArray(raw) ? raw : [raw]).filter((r): r is string => typeof r === "string" && r !== "");
          const ctx = await auth.$context;
          if (roles.length === 0) {
            // GAuth sends no answer for someone without a role here; don't take one anyway.
            await ctx.internalAdapter.deleteUserSessions(user.id);
            throw new APIError("FOUND", undefined, { Location: GAUTH_REFUSED });
          }
          // If the new email belongs to another user, the update fails and so does
          // the sign-in, rather than merging them.
          await ctx.internalAdapter.updateUser(user.id, {
            roles,
            email: String(userInfo.email),
            emailVerified: userInfo.emailVerified === true || userInfo.emailVerified === "true",
            name: String(userInfo.name ?? userInfo.email),
          });
        },
      }),
    ],
  });
  return auth;
}

export type Auth = ReturnType<typeof buildAuth>;
