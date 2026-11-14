// Types for ./accounts.js, for apps written in TypeScript (Pyre, Calendizer).

export interface AccountUser {
    name: string;
    username: string | null;
    method: 'gauth' | 'password';
}

export interface AccountLink {
    id: string;
    path: string;
    label: string | null;
    protectedAt: number;
}

export type Me = { signedIn: false } | { signedIn: true; user: AccountUser; links: AccountLink[] };

export const AUTH_ERRORS: Record<string, string>;

export function me(): Promise<Me>;
export function discover(identifier: string): Promise<'gauth' | 'password'>;
export function signInWithPassword(username: string, password: string): Promise<{ ok: true; gauth?: undefined } | { gauth: true; ok?: undefined }>;
export function register(username: string, password: string, extra?: { invite?: string }): Promise<{ ok: true }>;
export function signInWithGAuth(next?: string, options?: { retry?: boolean }): void;
export function signOut(): Promise<void>;

export function protect(id: string): Promise<{ id: string; path: string }>;
export function protectAfterSignIn(id: string): void;
export function takePendingProtect(id: string): boolean;

export function signInMethod(): 'gauth' | 'password' | null;
export function signedInWith(method: 'gauth' | 'password'): void;
export function mayAutoSignIn(now?: number): boolean;
export function autoSignIn(next: string): void;
export function takeAuthError(): string | null;
