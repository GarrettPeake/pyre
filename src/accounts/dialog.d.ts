// Types for ./dialog.js, for apps written in TypeScript (Pyre, Calendizer).

export interface AccountDialogOptions {
    mode?: 'signin' | 'protect' | 'locked';
    /** The link to protect ('protect') or that is locked ('locked'). */
    linkId?: string;
    /** Where a GAuth sign-in comes back to (a path of this site); defaults to here. */
    next?: string;
    /** 'locked': the browser is signed in as someone else. */
    otherAccount?: boolean;
    /** A message to show from the start (takeAuthError()'s, say). */
    error?: string | null;
    text?: { title?: string; intro?: string };
    /** false: no close button, Escape or backdrop click. */
    dismissible?: boolean;
    start?: 'register';
    identifier?: string;
}

export type AccountDialogResult =
    | { signedIn: false }
    | { signedIn: true; protected?: boolean; error?: string };

export function openAccountDialog(options?: AccountDialogOptions): Promise<AccountDialogResult>;
