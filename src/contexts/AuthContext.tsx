import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

interface User {
  username: string;
  planIds: string[];
}

interface LoginResult {
  success: boolean;
  error?: string;
  isNewUser?: boolean;
  planIds?: string[];
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = "pyre_auth_token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch user data using token
  const fetchUser = useCallback(async (authToken: string): Promise<User | null> => {
    try {
      const response = await fetch("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch {
      return null;
    }
  }, []);

  // Initialize auth state from localStorage
  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      if (storedToken) {
        const userData = await fetchUser(storedToken);
        if (userData) {
          setUser(userData);
          setToken(storedToken);
        } else {
          // Token invalid, clear it
          localStorage.removeItem(TOKEN_KEY);
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, [fetchUser]);

  // Login/signup
  const login = useCallback(async (username: string, password: string): Promise<LoginResult> => {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || "Login failed" };
      }

      // Store token and update state
      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      setUser({
        username: data.username,
        planIds: data.planIds,
      });

      return {
        success: true,
        isNewUser: data.isNewUser,
        planIds: data.planIds,
      };
    } catch (error) {
      return { success: false, error: "Network error" };
    }
  }, []);

  // Logout
  const logout = useCallback(async () => {
    try {
      if (token) {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      }
    } catch {
      // Ignore errors
    }

    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, [token]);

  // Refresh user data
  const refreshUser = useCallback(async () => {
    if (token) {
      const userData = await fetchUser(token);
      if (userData) {
        setUser(userData);
      }
    }
  }, [token, fetchUser]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
