import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, Page } from "../api/client";
import { fmtDate } from "../lib/dates";
import SortableTable, { Column } from "../components/SortableTable";

interface Log {
  id: number; user_id: number; user_name?: string; action: string;
  entity_type?: string; entity_id?: number; ip?: string; created_at: string;
}

const PAGE = 50;

export default function Audit() {
  const [offset, setOffset] = useState(0);
  const { data, isLoading } = useQuery({
    queryKey: ["audit", offset],
    queryFn: async () => (await api.get<Page<Log>>(`/api/audit?limit=${PAGE}&offset=${offset}`)).data,
  });

  const total = data?.total ?? 0;
  const page = Math.floor(offset / PAGE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  const columns: Column<Log>[] = [
    { key: "time", label: "Время", value: (l) => Date.parse(l.created_at), render: (l) => <span className="muted">{fmtDate(l.created_at)}</span> },
    { key: "user", label: "Пользователь", value: (l) => l.user_name ?? `#${l.user_id}` },
    { key: "action", label: "Действие", value: (l) => l.action },
    { key: "entity", label: "Объект", value: (l) => (l.entity_type ? `${l.entity_type} ${l.entity_id ?? ""}` : "—") },
    { key: "ip", label: "IP", value: (l) => l.ip ?? "—" },
  ];

  return (
    <>
      <div className="topbar"><h1>Аудит действий</h1></div>
      <div className="card">
        {isLoading && <p className="muted">Загрузка…</p>}
        <SortableTable
          columns={columns}
          rows={data?.items ?? []}
          rowKey={(l) => l.id}
          initialSort={{ key: "time", dir: "desc" }}
          emptyText="Записей нет"
        />
        {pages > 1 && (
          <div className="row" style={{ marginTop: 12, justifyContent: "center", gap: 8 }}>
            <button className="ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>← Назад</button>
            <span className="muted">{page} / {pages}</span>
            <button className="ghost" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>Далее →</button>
          </div>
        )}
      </div>
    </>
  );
}
