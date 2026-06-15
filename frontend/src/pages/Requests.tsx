import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, ChangeRequest, STATUS_NAMES } from "../api/client";
import { useAuth } from "../lib/auth";
import SortableTable, { Column } from "../components/SortableTable";

const METRICS = ["pending_cfd", "pending_ceo", "revision", "approved", "cancelled"];

export default function Requests() {
  const { me } = useAuth();
  const { data } = useQuery({ queryKey: ["requests"], queryFn: async () => (await api.get<ChangeRequest[]>("/api/requests")).data });
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const rows = data ?? [];
  const by = (s: string) => rows.filter((r) => r.status === s).length;

  // Заявки, ожидающие действия текущей роли (зам.7)
  const mine = rows.filter((r) =>
    (me!.role === "r1" && r.status === "pending_ceo") ||
    (me!.role === "r2" && r.status === "pending_cfd") ||
    (me!.role === "r3" && (r.status === "revision" || r.status === "draft") && r.author_id === me!.id)
  );

  const columns: Column<ChangeRequest>[] = [
    { key: "id", label: "№", value: (r) => r.id, render: (r) => <Link to={`/requests/${r.id}`}>{r.id}</Link> },
    { key: "title", label: "Заголовок", value: (r) => r.title, render: (r) => <Link to={`/requests/${r.id}`}>{r.title}</Link> },
    { key: "author", label: "Автор", value: (r) => r.author_name ?? `#${r.author_id}` },
    { key: "count", label: "Изменений", value: (r) => r.items.length },
    { key: "status", label: "Статус", value: (r) => STATUS_NAMES[r.status] ?? r.status, render: (r) => <span className={`pill ${r.status}`}>{STATUS_NAMES[r.status]}</span> },
    { key: "updated", label: "Обновлена", value: (r) => Date.parse(r.updated_at), render: (r) => <span className="muted">{new Date(r.updated_at).toLocaleString("ru")}</span> },
  ];

  const tableRows = statusFilter ? rows.filter((r) => r.status === statusFilter) : rows;

  return (
    <>
      <div className="topbar">
        <h1>Заявки на изменение</h1>
        {me!.role === "r3" && <Link className="btn" to="/requests/new">Новая заявка</Link>}
      </div>

      <div className="metrics">
        {METRICS.map((s) => (
          <div
            key={s}
            role="button"
            tabIndex={0}
            className={`stat${statusFilter === s ? " active" : ""}`}
            onClick={() => setStatusFilter(statusFilter === s ? null : s)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setStatusFilter(statusFilter === s ? null : s); }}
          >
            <div className="n">{by(s)}</div>
            <div className="l">{STATUS_NAMES[s]}</div>
          </div>
        ))}
      </div>

      {me!.role !== "r4" && (
        <div className="framed">
          <h3>На моём согласовании ({mine.length})</h3>
          {mine.length === 0 ? (
            <p className="muted">Нет заявок, ожидающих вашего действия.</p>
          ) : (
            <table>
              <thead><tr><th>№</th><th>Заголовок</th><th>Автор</th><th>Статус</th><th>Обновлена</th></tr></thead>
              <tbody>
                {mine.map((r) => (
                  <tr key={r.id}>
                    <td><Link to={`/requests/${r.id}`}>{r.id}</Link></td>
                    <td><Link to={`/requests/${r.id}`}>{r.title}</Link></td>
                    <td className="muted">{r.author_name ?? `#${r.author_id}`}</td>
                    <td><span className={`pill ${r.status}`}>{STATUS_NAMES[r.status]}</span></td>
                    <td className="muted">{new Date(r.updated_at).toLocaleString("ru")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="card">
        <h3>
          Все заявки
          {statusFilter && (
            <span className="muted" style={{ fontWeight: 400, fontSize: 14, marginLeft: 8 }}>
              · фильтр: {STATUS_NAMES[statusFilter]}{" "}
              <button className="link" onClick={() => setStatusFilter(null)}>сбросить</button>
            </span>
          )}
        </h3>
        <SortableTable
          columns={columns}
          rows={tableRows}
          rowKey={(r) => r.id}
          initialSort={{ key: "updated", dir: "desc" }}
          emptyText="Заявок нет"
        />
      </div>
    </>
  );
}
