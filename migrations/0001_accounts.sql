-- Accounts (src/accounts): Better Auth's tables, as `getMigrations` compiles them for
-- better-auth / @better-auth/sso 1.7.18 with the username plugin, the `roles` user
-- field and database rate limiting, plus protectedLink.
--
-- Plans stay in KV. The accounts made before this (KV user:<name> records, and the
-- plans' "owner" field) move here with scripts/migrate-legacy-accounts.mjs.
create table "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" integer not null, "image" text, "createdAt" date not null, "updatedAt" date not null, "roles" text, "username" text unique, "displayUsername" text);

create table "session" ("id" text not null primary key, "expiresAt" date not null, "token" text not null unique, "createdAt" date not null, "updatedAt" date not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade);

create table "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date not null, "updatedAt" date not null);

create table "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" date not null, "createdAt" date not null, "updatedAt" date not null);

-- Stays empty: GAuth is configured in code and registering providers is off.
create table "ssoProvider" ("id" text not null primary key, "issuer" text not null, "oidcConfig" text, "samlConfig" text, "userId" text not null references "user" ("id") on delete cascade, "providerId" text not null unique, "organizationId" text, "domain" text not null);

create table "rateLimit" ("id" text not null primary key, "key" text not null unique, "count" integer not null, "lastRequest" bigint not null);

create index "session_userId_idx" on "session" ("userId");

create index "account_userId_idx" on "account" ("userId");

create index "verification_identifier_idx" on "verification" ("identifier");

-- A secret link protected by an account: it opens only in that account's session.
-- No cascade: removing a user must not quietly reopen their links to anyone holding
-- the URL (deleting a user is refused while they protect links).
create table "protectedLink" ("id" text not null primary key, "userId" text not null references "user" ("id"), "createdAt" integer not null);

create index "protectedLink_userId_idx" on "protectedLink" ("userId");
