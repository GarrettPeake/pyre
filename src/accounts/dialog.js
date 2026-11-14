// ========================================
// The sign-in dialog: one form for signing in, creating an account, and protecting a
// link with either. Nothing app-specific: the app passes its words and links in, and
// styles it through the --acct-* properties in ./accounts.css.
//
//   const result = await openAccountDialog({ mode: 'protect', linkId, next: '/abc' });
//
// Modes:
//  - 'signin':  sign in or create an account.
//  - 'protect': the same, then protect `linkId` with that account.
//  - 'locked':  `linkId` is protected; sign in as its owner. With `otherAccount`, the
//               browser is signed in as someone else: it offers to sign out first.
//
// It asks for a username or email first. An email of a GAuth account here goes to
// GAuth (the page goes away and comes back to `next`); anything else gets the password
// form. Resolves `{ signedIn: true, protected? }` once signed in with a password
// (and the link protected, in 'protect' mode), or `{ signedIn: false }` if closed.
// ========================================

import * as accounts from './accounts.js';

const html = (strings, ...values) => strings.reduce((out, s, i) => out + s + (i < values.length ? escape(values[i]) : ''), '');
function escape(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const DEFAULT_TEXT = {
    signin: { title: 'Sign in', intro: '' },
    protect: {
        title: 'Protect this link',
        intro: 'Only you will be able to open it, on any device, once signed in. Sign in or create an account to protect it.',
    },
    locked: { title: 'This link is protected', intro: 'Sign in as its owner to open it.' },
};

export function openAccountDialog(options = {}) {
    const mode = options.mode || 'signin';
    const text = { ...DEFAULT_TEXT[mode], ...(options.text || {}) };
    const next = options.next || location.pathname + location.search;
    const dismissible = options.dismissible !== false;

    return new Promise((resolve) => {
        const dialog = document.createElement('dialog');
        dialog.className = 'acct-dialog';
        dialog.setAttribute('aria-labelledby', 'acct-title');
        document.body.appendChild(dialog);

        let settled = false;
        const finish = (result) => {
            if (settled) return;
            settled = true;
            dialog.close();
            dialog.remove();
            resolve(result);
        };
        dialog.addEventListener('cancel', (e) => {
            if (!dismissible) e.preventDefault();
            else finish({ signedIn: false });
        });
        dialog.addEventListener('click', (e) => {
            if (dismissible && e.target === dialog) finish({ signedIn: false });
        });

        let identifier = options.identifier || '';
        let error = options.error || '';

        const frame = (body) => '<div class="acct-panel">'
            + html`<h2 id="acct-title" class="acct-title">${text.title}</h2>`
            + (dismissible ? '<button type="button" class="acct-close" aria-label="Close">&times;</button>' : '')
            + (text.intro ? html`<p class="acct-intro">${text.intro}</p>` : '')
            + `<p class="acct-error" role="alert"${error ? '' : ' hidden'}>${escape(error)}</p>`
            + body
            + '</div>';

        function show(body, wire) {
            dialog.innerHTML = frame(body);
            const close = dialog.querySelector('.acct-close');
            if (close) close.onclick = () => finish({ signedIn: false });
            wire();
            const first = dialog.querySelector('input:not([type=hidden]):not([readonly]), button[type=submit]');
            if (first) first.focus();
        }

        const setError = (message) => {
            error = message || '';
            const box = dialog.querySelector('.acct-error');
            box.textContent = error;
            box.hidden = !error;
        };

        /** Disable the form while `work` runs, and show what it throws. */
        async function busy(form, label, work) {
            const button = form.querySelector('button[type=submit]');
            const was = button.textContent;
            for (const el of form.elements) el.disabled = true;
            button.textContent = label;
            try {
                await work();
            } catch (e) {
                setError(e.message);
            } finally {
                if (dialog.isConnected) {
                    for (const el of form.elements) el.disabled = false;
                    button.textContent = was;
                }
            }
        }

        function goToGAuth() {
            if (mode === 'protect' && options.linkId) accounts.protectAfterSignIn(options.linkId);
            accounts.signInWithGAuth(next, { retry: true });
        }

        /** Signed in with a password: protect the link if asked, and we're done. */
        async function signedIn() {
            if (mode === 'protect' && options.linkId) {
                try {
                    await accounts.protect(options.linkId);
                    finish({ signedIn: true, protected: true });
                } catch (e) {
                    // Signed in all the same; the app says why the link isn't protected.
                    finish({ signedIn: true, protected: false, error: e.message });
                }
            } else {
                finish({ signedIn: true });
            }
        }

        function identify() {
            if (options.otherAccount) {
                show(`
                    <p class="acct-note">You're signed in with a different account.</p>
                    <div class="acct-actions"><button type="button" class="acct-primary acct-signout">Sign out</button></div>`, () => {
                    dialog.querySelector('.acct-signout').onclick = async () => {
                        await accounts.signOut();
                        options.otherAccount = false;
                        identify();
                    };
                });
                return;
            }
            show(html`
                <form class="acct-form" novalidate>
                    <label class="acct-label" for="acct-identifier">Username or email</label>
                    <input class="acct-input" id="acct-identifier" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required value="${identifier}">
                    <button type="submit" class="acct-primary">Continue</button>
                </form>
                <p class="acct-switch">New here? <button type="button" class="acct-link acct-to-register">Create an account</button></p>`, () => {
                const form = dialog.querySelector('form');
                dialog.querySelector('.acct-to-register').onclick = () => { setError(''); register(); };
                form.onsubmit = (e) => {
                    e.preventDefault();
                    identifier = form.elements.username.value.trim();
                    if (!identifier) return setError('Enter your username or email.');
                    if (!identifier.includes('@')) { setError(''); return password(); }
                    return busy(form, 'Checking…', async () => {
                        if (await accounts.discover(identifier) === 'gauth') return goToGAuth();
                        throw new Error('No account here uses that email. Sign in with your username, or create an account.');
                    });
                };
            });
        }

        function password() {
            show(html`
                <form class="acct-form" novalidate>
                    <label class="acct-label" for="acct-username">Username</label>
                    <div class="acct-row">
                        <input class="acct-input" id="acct-username" name="username" autocomplete="username" readonly value="${identifier}">
                        <button type="button" class="acct-link acct-change">Change</button>
                    </div>
                    <label class="acct-label" for="acct-password">Password</label>
                    <input class="acct-input" id="acct-password" name="password" type="password" autocomplete="current-password" required>
                    <button type="submit" class="acct-primary">${mode === 'protect' ? 'Sign in and protect' : 'Sign in'}</button>
                </form>`, () => {
                const form = dialog.querySelector('form');
                dialog.querySelector('.acct-change').onclick = () => { setError(''); identify(); };
                form.onsubmit = (e) => {
                    e.preventDefault();
                    const pw = form.elements.password.value;
                    if (!pw) return setError('Enter your password.');
                    return busy(form, 'Signing in…', async () => {
                        const result = await accounts.signInWithPassword(identifier, pw);
                        if (result.gauth) return goToGAuth();
                        await signedIn();
                    });
                };
            });
        }

        function register() {
            show(html`
                <form class="acct-form" novalidate>
                    <label class="acct-label" for="acct-new-username">Username</label>
                    <input class="acct-input" id="acct-new-username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required
                        value="${identifier.includes('@') ? '' : identifier}" aria-describedby="acct-username-hint">
                    <p class="acct-hint" id="acct-username-hint">3–30 letters, numbers or underscores.</p>
                    <label class="acct-label" for="acct-new-password">Password</label>
                    <input class="acct-input" id="acct-new-password" name="password" type="password" autocomplete="new-password" required minlength="8" aria-describedby="acct-password-hint">
                    <p class="acct-hint" id="acct-password-hint">At least 8 characters.</p>
                    <button type="submit" class="acct-primary">${mode === 'protect' ? 'Create account and protect' : 'Create account'}</button>
                </form>
                <p class="acct-switch">Have an account? <button type="button" class="acct-link acct-to-signin">Sign in</button></p>`, () => {
                const form = dialog.querySelector('form');
                dialog.querySelector('.acct-to-signin').onclick = () => { setError(''); identify(); };
                form.onsubmit = (e) => {
                    e.preventDefault();
                    const name = form.elements.username.value.trim();
                    const pw = form.elements.password.value;
                    if (!/^[A-Za-z0-9_]{3,30}$/.test(name)) return setError('Usernames are 3–30 letters, numbers or underscores.');
                    if (pw.length < 8) return setError('Passwords need at least 8 characters.');
                    identifier = name;
                    return busy(form, 'Creating…', async () => {
                        await accounts.register(name, pw);
                        await signedIn();
                    });
                };
            });
        }

        // Open first, then fill: showModal() would move focus to the close button.
        dialog.showModal();
        if (options.start === 'register') register();
        else identify();
    });
}
