import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, Me } from "../api/client";

const CACHE_KEY = "mikof_me";

interface AuthCtx {
  me: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>(null as any);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(() => {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const { data } = await api.get<Me>("/api/auth/me");
      setMe(data);
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch {
      setMe(null);
      sessionStorage.removeItem(CACHE_KEY);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const login = async (email: string, password: string) => {
    await api.post("/api/auth/login", { email, password });
    await refresh();
  };

  const logout = async () => {
    await api.post("/api/auth/logout");
    setMe(null);
    sessionStorage.removeItem(CACHE_KEY);
  };

  return <Ctx.Provider value={{ me, loading, login, logout, refresh }}>{children}</Ctx.Provider>;
}
