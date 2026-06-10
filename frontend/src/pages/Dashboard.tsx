import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, ChangeRequest, STATUS_NAMES } from "../api/client";
import { useAuth } from "../lib/auth";

export default function Dashboard() {
  const { me } = useAuth();
  const isDirector = me!.role !== "r4";

  const { data: reqs } = useQuery({
    queryKey: ["requests"],
    queryFn: async () => (await api.get<ChangeRequest[]>("/api/requests")).data,
    enabled: isDirector,
  });
  const { data: services } = useQuery({
    queryKey: ["services-count"],
    queryFn: async () => (await api.get("/api/services")).data.length,
  });

  if (!isDirector) {
    return (
      <>
        <div className="topbar"><h1>Дашборд</h1></div>
        <div className="grid cols-4">
          <div className="stat"><div className="n">{services ?? "…"}</div><div className="l">Доступных услуг</div></div>
        </div>
        <p className="muted" style={{ marginTop: 20 }}>
          Перейдите в раздел «Услуги» или «Пакеты» для просмотра прейскуранта.
        </p>
      </>
    );
  }

  const by = (s: string) => reqs?.filter((r) => r.status === s).length ?? 0;

  return (
    <>
      <div className="topbar"><h1>Дашборд заявок</h1></div>
      <div className="grid cols-4" style={{ marginBottom: 22 }}>
        <div className="stat"><div className="n">{by("pending_cfd")}</div><div className="l">У финдиректора</div></div>
        <div className="stat"><div className="n">{by("pending_ceo")}</div><div className="l">У гендиректора</div></div>
        <div className="stat"><div className="n">{by("revision")}</div><div className="l">На доработке</div></div>
        <div className="stat"><div className="n">{by("approved")}</div><div className="l">Утверждено</div></div>
      </div>
      <div className="card">
        <h3>Все заявки</h3>
        <table>
          <thead><tr><th>№</th><th>Заголовок</th><th>Статус</th><th>Обновлена</th></tr></thead>
          <tbody>
            {reqs?.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td><Link to={`/requests/${r.id}`}>{r.title}</Link></td>
                <td><span className={`pill ${r.status}`}>{STATUS_NAMES[r.status]}</span></td>
                <td className="muted">{new Date(r.updated_at).toLocaleString("ru")}</td>
              </tr>
            ))}
            {reqs?.length === 0 && <tr><td colSpan={4} className="muted">Заявок пока нет</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
