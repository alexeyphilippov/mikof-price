import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, ROLE_NAMES, Role } from "../api/client";
import { useAuth } from "../lib/auth";

const NAV: { to: string; label: string; roles?: Role[] }[] = [
  { to: "/", label: "Дашборд" },
  { to: "/services", label: "Услуги" },
  { to: "/packages", label: "Пакеты" },
  { to: "/requests", label: "Заявки", roles: ["r1", "r2", "r3"] },
  { to: "/directories", label: "Справочники", roles: ["r1", "r2", "r3"] },
  { to: "/clinics", label: "Клиники", roles: ["r1", "r2", "r3"] },
  { to: "/users", label: "Пользователи", roles: ["r1"] },
  { to: "/audit", label: "Аудит", roles: ["r1"] },
];

export default function Layout() {
  const { me, logout } = useAuth();
  const nav = useNavigate();

  const { data: pending } = useQuery({
    queryKey: ["pending"],
    queryFn: async () => (await api.get<{ count: number }>("/api/requests/pending-count")).data.count,
    enabled: !!me && me.role !== "r4",
    refetchInterval: 20000,
  });

  const doLogout = async () => {
    await logout();
    nav("/login");
  };

  if (!me) return null;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">mikof<span>ai</span></div>
        <nav>
          {NAV.filter((n) => !n.roles || n.roles.includes(me.role)).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"}>
              <span>{n.label}</span>
              {n.to === "/requests" && pending ? <span className="badge">{pending}</span> : null}
            </NavLink>
          ))}
        </nav>
        <div className="spacer" />
        <NavLink to="/profile" className="user">
          <div>{me.name}</div>
          <div className="role">{ROLE_NAMES[me.role]}</div>
        </NavLink>
        <div className="user" style={{ borderTop: 0 }}>
          <button className="ghost" style={{ width: "100%" }} onClick={doLogout}>Выйти</button>
        </div>
      </aside>
      <main className="main"><Outlet /></main>
    </div>
  );
}
