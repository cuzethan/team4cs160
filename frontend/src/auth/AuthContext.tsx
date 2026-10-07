import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchCurrentUser, logout as logoutRequest, type User } from "./api";

type AuthState = {
  user: User | null;
  // True until the first check of the session cookie finishes.
  loading: boolean;
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCurrentUser().then((current) => {
      // Don't overwrite a user who logged in while this was still loading.
      setUser((existing) => existing ?? current);
      setLoading(false);
    });
  }, []);

  const logout = async () => {
    await logoutRequest();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used inside <AuthProvider>");
  return auth;
}
