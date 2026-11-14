# Accounts for secret-link apps

Decklister's account system. It is copied as is into other apps whose data lives behind
a secret link: Pyre has the same files at `worker/accounts/` and `src/accounts/`. Change
them in one app, copy them to the other. It has two halves, and neither contains
anything app-specific:

| | |
|---|---|
| `src/accounts/` | The Worker half (TypeScript): Better Auth, GAuth over SAML, protected links. |
| `public/js/accounts/` | The browser half (plain ES modules, no framework): `accounts.js` (calls and the auto sign-in rules), `dialog.js` (the sign-in dialog), `accounts.css`, and `.d.ts` types for TypeScript apps. |

## What people can do

- **Use a link without an account.** The link (e.g. `/<uuid>`) is the secret: whoever
  holds it can read and write it.
- **Register with a username and password**, or **sign in** with one.
- **Protect a link** with an account, either a new one or an existing one. The first
  account to claim a link keeps it. From then on the link opens only in that
  account's session (401 without a session, 403 in someone else's). One account can
  protect any number of links.
- **Sign in with GAuth** (passkeys, https://auth.gpeake.com). This is only for people
  GAuth gives a role on the app. Nobody picks GAuth from a button. It happens in two
  cases:
  - **a) The session expired.** The browser last signed in with GAuth, and a protected
    link finds no session. It goes straight back to GAuth, which returns without a
    click while GAuth's own session is fresh. This doesn't happen if the person logged
    out, if the last GAuth attempt failed, or if an automatic attempt from this tab
    was recent.
  - **b) Someone types a GAuth email.** The dialog asks for a username or email first.
    An email that belongs to a GAuth account here goes to GAuth. Anything else gets
    the password form.

The two kinds of account never mix (GAuth's README, "Registering an app"):

- Password sign-in refuses GAuth accounts with `USE_GAUTH`.
- Sign-up takes only a username and a password. The email is a stand-in under
  `.invalid`, so nobody can claim a real address.
- A GAuth sign-in never attaches to an existing account by email.
- GAuth sessions last 12 hours and password sessions 30 days. Neither refreshes.

## The first GAuth sign-in

Discovery (case b) only knows emails of GAuth accounts that already exist here. A
person's first GAuth sign-in is one of two things:

- **Opening `/auth/gauth?next=/`.** This creates their account. The landing page's
  `/?signed-in` takes them to their link, or makes a new one.
- **Linking an existing password account:** `node scripts/link-gauth.mjs --remote
  --user <username> --gauth-id <GAuth user id> --email <GAuth email>`. Its links stay
  protected. Its password is removed.

## Endpoints

| | |
|---|---|
| `/api/auth/*` | Better Auth: `sign-in/username`, `sign-up/email` (send `username`, `password`), `sign-in/discover`, `sign-out`, SAML. |
| `GET /api/account` | `{ signedIn, user: { name, username, method }, links: [{ id, path, label, protectedAt }] }` |
| `POST /api/account/links {id}` | Protect a link with the signed-in account (409 if another account has it). |
| `GET /auth/gauth?next=` | Off to GAuth and back to `next`. After 3 tries in a minute, or if GAuth refuses, it comes back as `next?auth_error=<code>` instead. |
| `GET /auth/error` | Where Better Auth sends GAuth errors. Forwards to `next?auth_error=`. |

## Adopting it in an app

1. Copy `src/accounts/`, `public/js/accounts/`, `migrations/0001_accounts.sql` (as the
   app's next migration) and `scripts/link-gauth.mjs` (change the database name).
2. Install `better-auth@1.7.18`, `@better-auth/sso@1.7.18` and `zod`. Turn on the
   `nodejs_compat` flag.
3. Bindings and settings:
   - A D1 binding.
   - Vars: `APP_ORIGIN` (the one address, e.g. `https://pyre.gpeake.com`),
     `GAUTH_ORIGIN` and `GAUTH_CERTS` (from GAuth's app page).
   - Secret: `BETTER_AUTH_SECRET` (`openssl rand -hex 32`).
   - `run_worker_first` must cover `/api/*` and `/auth/*`.
4. In the Worker:
   ```js
   const accounts = createAccounts({ db: env.DB, appOrigin: env.APP_ORIGIN, secret: env.BETTER_AUTH_SECRET,
     gauthOrigin: env.GAUTH_ORIGIN, gauthCerts: env.GAUTH_CERTS,
     isLinkId, linkPath: (id) => `/app/${id}`, describeLink: async (id) => /* a name */ null });
   // first: redirect other hosts to APP_ORIGIN, then
   const refused = accounts.crossOriginPost(request); if (refused) return refused;
   const res = await accounts.route(request); if (res) return res;
   // every read/write of a link's data:
   const access = await accounts.access(request, id); if (!access.ok) return access.response;
   // deleting a link's data (owner only: access.owner === the signed-in user's id):
   await accounts.release(id);
   ```
5. In the page:
   - Load the link's data. On a 401/403 with `protected: true`:
     - if `mayAutoSignIn()` (and there's no error), call `autoSignIn(here)`;
     - otherwise call `openAccountDialog({ mode: 'locked', linkId, next: here,
       otherAccount })`.
   - A "Protect" button calls `openAccountDialog({ mode: 'protect', linkId, next: here })`.
     If the account is already signed in, call `protect(id)` instead.
   - On load:
     - read `takeAuthError()` and show it in the dialog;
     - once signed in, call `takePendingProtect(id)` and then `protect(id)` (this
       finishes a protect that went through GAuth).
   - Decklister's `public/js/auth.js` is the worked example; Pyre's `src/contexts/AuthContext.tsx`
     and `src/pages/AppPage.tsx` are the React one.
   - Theme it with `--acct-*` properties on `:root` (see the top of `accounts.css`).
6. Register the app in GAuth (Admin → Service providers → Add):
   - Entity ID: `<APP_ORIGIN>/api/auth/sso/saml2/sp/metadata?providerId=gauth`
   - ACS URL: `<APP_ORIGIN>/api/auth/sso/saml2/sp/acs/gauth`

   Then grant a role on it to the people who should use GAuth.

Tests: `test/accounts.test.ts` runs the Worker half against SQLite (`test/d1.ts`).
