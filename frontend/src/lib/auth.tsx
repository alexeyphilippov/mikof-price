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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const { data } = await api.get<Me>("/api/auth/me");
      setMe(data);
    } catch {
      setMe(null);
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
  };

  return <Ctx.Provider value={{ me, loading, login, logout, refresh }}>{children}</Ctx.Provider>;
}
