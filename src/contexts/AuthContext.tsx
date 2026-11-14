/**
 * Who is signed in, for every page. The account system itself is worker/accounts
 * (server) and src/accounts (browser: calls, the GAuth auto sign-in rules and the
 * sign-in dialog), shared with Decklister; see worker/accounts/README.md.
 */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import * as accounts from "../accounts/accounts.js";
import type { AccountLink, AccountUser } from "../accounts/accounts.js";

interface AuthContextType {
  user: AccountUser | null;
  /** The plans this account protects, newest first. */
  links: AccountLink[];
  isLoading: boolean;
  /** What a GAuth sign-in came back with (?auth_error=), as a sentence, until cleared. */
  authError: string | null;
  clearAuthError: () => void;
  /** Ask the server again; resolves whether someone is signed in. */
  refresh: () => Promise<boolean>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Once per page load, before anything reads the address bar: a GAuth sign-in comes
// back with a full page load, and this takes ?auth_error= out of the URL.
const initialAuthError = accounts.takeAuthError();
// Accounts used to be a JWT in localStorage; sessions are a cookie now.
try {
  localStorage.removeItem("pyre_auth_token");
} catch {
  // Storage unavailable: nothing to clean up.
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [links, setLinks] = useState<AccountLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(initialAuthError);

  const refresh = useCallback(async () => {
    const me = await accounts.me();
    if (me.signedIn) {
      setUser(me.user);
      setLinks(me.links);
    } else {
      setUser(null);
      setLinks([]);
    }
    return me.signedIn;
  }, []);

  useEffect(() => {
    refresh().finally(() => setIsLoading(false));
  }, [refresh]);

  const signOut = useCallback(async () => {
    await accounts.signOut();
    setUser(null);
    setLinks([]);
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  return (
    <AuthContext.Provider value={{ user, links, isLoading, authError, clearAuthError, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

/** A path of this app to go back to, from ?return= (never another site). */
// eslint-disable-next-line react-refresh/only-export-components
export function safeReturn(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  return value;
}
