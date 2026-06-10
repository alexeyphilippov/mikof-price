import { useQuery } from "@tanstack/react-query";
import { api, ROLE_NAMES } from "../api/client";
import { useAuth } from "../lib/auth";

export default function Profile() {
  const { me } = useAuth();
  const { data: pending } = useQuery({
    queryKey: ["pending"],
    queryFn: async () => (await api.get<{ count: number }>("/api/requests/pending-count")).data.count,
    enabled: me!.role !== "r4",
  });

  return (
    <>
      <div className="topbar"><h1>Личный кабинет</h1></div>
      <div className="grid cols-3">
        <div className="card">
          <h3>{me!.name}</h3>
          <p><span className="tag">Email</span><br />{me!.email}</p>
          <p><span className="tag">Роль</span><br />{ROLE_NAMES[me!.role]}</p>
        </div>
        {me!.role !== "r4" && (
          <div className="stat">
            <div className="n">{pending ?? 0}</div>
            <div className="l">Заявок ожидает вашего действия</div>
          </div>
        )}
      </div>
    </>
  );
}
