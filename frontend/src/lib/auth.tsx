import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, Me } from "../api/client";

interface AuthCtx {
  me: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>(null as any);
export const useAuth = () => useContext(Ctx);

const readCachedMe = (): Me | null => {
  try {
    const c = sessionStorage.getItem("me");
    return c ? (JSON.parse(c) as Me) : null;
  } catch {
    return null;
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const cached = readCachedMe();
  const [me, setMe] = useState<Me | null>(cached);
  // при наличии кэша показываем UI сразу, ревалидация идёт в фоне (U4)
  const [loading, setLoading] = useState(!cached);

  const refresh = async () => {
    try {
      const { data } = await api.get<Me>("/api/auth/me");
      setMe(data);
      sessionStorage.setItem("me", JSON.stringify(data));
    } catch {
      setMe(null);
      sessionStorage.removeItem("me");
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
    sessionStorage.removeItem("me");
  };

  return <Ctx.Provider value={{ me, loading, login, logout, refresh }}>{children}</Ctx.Provider>;
}
