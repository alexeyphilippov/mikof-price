import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import SortableTable, { Column } from "../components/SortableTable";

interface Log {
  id: number; user_id: number; user_name?: string; action: string;
  entity_type?: string; entity_id?: number; ip?: string; created_at: string;
}

export default function Audit() {
  const { data } = useQuery({ queryKey: ["audit"], queryFn: async () => (await api.get<Log[]>("/api/audit")).data });

  const columns: Column<Log>[] = [
    { key: "time", label: "Время", value: (l) => Date.parse(l.created_at), render: (l) => <span className="muted">{new Date(l.created_at).toLocaleString("ru")}</span> },
    { key: "user", label: "Пользователь", value: (l) => l.user_name ?? `#${l.user_id}` },
    { key: "action", label: "Действие", value: (l) => l.action },
    { key: "entity", label: "Объект", value: (l) => (l.entity_type ? `${l.entity_type} ${l.entity_id ?? ""}` : "—") },
    { key: "ip", label: "IP", value: (l) => l.ip ?? "—" },
  ];

  return (
    <>
      <div className="topbar"><h1>Аудит действий</h1></div>
      <div className="card">
        <SortableTable
          columns={columns}
          rows={data ?? []}
          rowKey={(l) => l.id}
          initialSort={{ key: "time", dir: "desc" }}
          emptyText="Записей нет"
        />
      </div>
    </>
  );
}
