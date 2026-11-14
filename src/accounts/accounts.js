// ========================================
// Accounts, in the browser: the server half is src/accounts (see its README).
//
// No framework and nothing app-specific, so any app on src/accounts can import it
// (Pyre does). The sign-in dialog is ./dialog.js.
//
// Sign-in goes to GAuth by itself in two cases:
//  a) this browser last signed in with GAuth and finds its session gone (expired):
//     mayAutoSignIn() says so, and the app calls signInWithGAuth(here). GAuth comes
//     straight back while its own session is fresh, so that takes no clicks;
//  b) someone types an email that belongs to a GAuth account here (discover()).
// Three things stop (a), each leaving the dialog instead: the last GAuth sign-in
// came back with an error (?auth_error=, which also forgets GAuth), an automatic
// attempt from this tab is still recent (so it can't loop), or the person logged out
// (which sticks until they sign in again).
// ========================================

const METHOD_KEY = 'accounts.signInMethod';
const SIGNED_OUT_KEY = 'accounts.signedOut';
const ATTEMPT_KEY = 'accounts.gauthAutoAttemptAt';
const PENDING_PROTECT_KEY = 'accounts.pendingProtect';
/** Long enough to cover a GAuth round trip, short enough not to be noticed later. */
const RETRY_AFTER_MS = 2 * 60 * 1000;

/** What ?auth_error=<code> means, for people. */
export const AUTH_ERRORS = {
    no_role: "GAuth doesn't give your account access to this site.",
    too_many_tries: "Signing in with GAuth didn't complete. Try again?",
    unavailable: 'Signing in is unavailable right now. Try again in a minute.',
};

// Storage can be unavailable (some private modes) or throw; then it's as if empty.
function read(storage, key) {
    try { return storage().getItem(key); } catch { return null; }
}
function write(storage, key, value) {
    try {
        if (value === null) storage().removeItem(key);
        else storage().setItem(key, value);
    } catch {
        // Nothing to do: the guard just doesn't hold.
    }
}
const local = () => window.localStorage;
const session = () => window.sessionStorage;

async function call(path, { method = 'GET', body } = {}) {
    const res = await fetch(path, {
        method,
        credentials: 'same-origin',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
}

/** A sentence for a failed call (Better Auth's messages are fine to show). */
function messageOf(result, fallback) {
    if (result.status === 429) return 'Too many attempts. Wait a minute and try again.';
    return (result.data && (result.data.message || result.data.error)) || fallback;
}

// ---------- who's signed in ----------

/**
 * `{ signedIn: false }` or `{ signedIn: true, user: { name, username, method },
 * links: [{ id, path, label, protectedAt }] }` (links newest first).
 */
export async function me() {
    const result = await call('/api/account');
    return result.ok ? result.data : { signedIn: false };
}

// ---------- signing in ----------

/** 'gauth' if this is the email of a GAuth account here, else 'password'. */
export async function discover(identifier) {
    const result = await call('/api/auth/sign-in/discover', { method: 'POST', body: { identifier } });
    if (!result.ok) throw new Error(messageOf(result, "Couldn't check that. Try again?"));
    return result.data.method === 'gauth' ? 'gauth' : 'password';
}

/** `{ ok: true }`, `{ gauth: true }` (the account signs in with GAuth), or throws. */
export async function signInWithPassword(username, password) {
    const result = await call('/api/auth/sign-in/username', { method: 'POST', body: { username, password } });
    if (result.status === 403 && result.data.code === 'USE_GAUTH') return { gauth: true };
    if (!result.ok) {
        throw new Error(result.status === 401 ? 'Wrong username or password.' : messageOf(result, "Couldn't sign in. Try again?"));
    }
    signedInWith('password');
    return { ok: true };
}

/**
 * A new password account, signed in. Throws with a message for people. `extra` is
 * anything else the app's sign-up asks for: `{ invite }` where it needs an invite code.
 */
export async function register(username, password, extra = {}) {
    // The server makes the email (a stand-in) and the name; these are only what it needs.
    const result = await call('/api/auth/sign-up/email', {
        method: 'POST',
        body: { ...extra, username, password, email: '', name: '' },
    });
    if (!result.ok) {
        const code = result.data && result.data.code;
        if (code === 'USERNAME_IS_ALREADY_TAKEN') {
            throw new Error('That username is taken.');
        }
        if (code === 'PASSWORD_TOO_SHORT') throw new Error('Passwords need at least 8 characters.');
        throw new Error(messageOf(result, "Couldn't create the account. Try again?"));
    }
    signedInWith('password');
    return { ok: true };
}

/** Off to GAuth (the page goes away), coming back to `next`, a path of this site. */
export function signInWithGAuth(next = location.pathname + location.search, { retry = false } = {}) {
    signedInWith('gauth');
    location.assign(`/auth/gauth?next=${encodeURIComponent(next)}${retry ? '&retry=1' : ''}`);
}

export async function signOut() {
    await call('/api/auth/sign-out', { method: 'POST', body: {} });
    write(local, SIGNED_OUT_KEY, '1');
}

// ---------- protecting links ----------

/** Protect a link with the signed-in account. Throws with a message for people. */
export async function protect(id) {
    const result = await call('/api/account/links', { method: 'POST', body: { id } });
    if (!result.ok) {
        throw new Error(result.status === 409
            ? 'Another account already protects this link.'
            : messageOf(result, "Couldn't protect the link. Try again?"));
    }
    return result.data;
}

/** Protect `id` once a GAuth sign-in this tab is starting comes back. */
export function protectAfterSignIn(id) {
    write(session, PENDING_PROTECT_KEY, id);
}

/**
 * Whether this tab set off to protect `id` (protectAfterSignIn) and hasn't yet.
 * Only the tab that asked has it, so a link can't protect itself into someone's
 * account by being opened with a parameter.
 */
export function takePendingProtect(id) {
    const pending = read(session, PENDING_PROTECT_KEY);
    if (pending === null) return false;
    write(session, PENDING_PROTECT_KEY, null);
    return pending === id;
}

// ---------- signing in by itself (case a) ----------

/** How this browser last signed in: 'gauth', 'password' or null. */
export function signInMethod() {
    const value = read(local, METHOD_KEY);
    return value === 'gauth' || value === 'password' ? value : null;
}

/** Signed in (or setting off to): automatic sign-in may happen again next time. */
export function signedInWith(method) {
    write(local, METHOD_KEY, method);
    write(local, SIGNED_OUT_KEY, null);
    write(session, ATTEMPT_KEY, null);
}

export function mayAutoSignIn(now = Date.now()) {
    if (signInMethod() !== 'gauth' || read(local, SIGNED_OUT_KEY)) return false;
    const last = Number(read(session, ATTEMPT_KEY));
    return !(last > 0 && now - last < RETRY_AFTER_MS);
}

/** GAuth again, by itself, for a page that found its session gone. */
export function autoSignIn(next) {
    write(session, ATTEMPT_KEY, String(Date.now()));
    signInWithGAuth(next);
}

/**
 * The ?auth_error=<code> a GAuth sign-in came back with, if any, as a sentence,
 * taken out of the address bar. It also forgets GAuth for this browser (the account
 * may not be a GAuth one at all), so the page shows the dialog instead of trying again.
 */
export function takeAuthError() {
    const url = new URL(location.href);
    const code = url.searchParams.get('auth_error');
    if (!code) return null;
    url.searchParams.delete('auth_error');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    write(local, METHOD_KEY, null);
    write(session, PENDING_PROTECT_KEY, null);
    return AUTH_ERRORS[code] || `Signing in with GAuth didn't work (${code}).`;
}
