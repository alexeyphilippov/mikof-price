import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Ref } from "../api/client";
import { useAuth } from "../lib/auth";
import { submitEntityChange, ChangeItem } from "../lib/entityAction";
import ConfirmDialog from "../components/ConfirmDialog";

interface Usage {
  services: { id: number; code: string; name_ru: string }[];
  packages: { id: number; code: string; name_ru: string }[];
}

const EMPTY = { code: "", name_ru: "", name_ro: "" };

function RefTable({ title, url, entity, hasNameRo }: { title: string; url: string; entity: string; hasNameRo: boolean }) {
  const { me } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const role = me!.role;
  const viaRequest = role !== "r1";
  const canWrite = role === "r1" || role === "r3";
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(EMPTY);
  const [archiveTarget, setArchiveTarget] = useState<Ref | null>(null);

  const { data } = useQuery({ queryKey: [url], queryFn: async () => (await api.get<Ref[]>(url)).data });
  const { data: usage } = useQuery({
    queryKey: ["usage", url, archiveTarget?.id],
    queryFn: async () => (await api.get<Usage>(`${url}/${archiveTarget!.id}/usage`)).data,
    enabled: !!archiveTarget,
  });

  const refresh = (reqId: number | null) => { qc.invalidateQueries({ queryKey: [url] }); if (reqId) nav(`/requests/${reqId}`); };
  const body = (f: typeof EMPTY) => (hasNameRo ? { code: f.code, name_ru: f.name_ru, name_ro: f.name_ro } : { code: f.code, name_ru: f.name_ru });

  const create = useMutation({
    mutationFn: async () => submitEntityChange(role, async () => { await api.post(url, body(form)); },
      { title: `Создание: ${form.code}`, items: [{ entity_type: `${entity}_create`, field_name: "create", old_value: null, new_value: body(form) }] }),
    onSuccess: (reqId) => { setForm(EMPTY); refresh(reqId); },
  });

  const saveEdit = useMutation({
    mutationFn: async () => {
      const full = body(editForm) as Record<string, any>;
      const orig = data!.find((d) => d.id === editId)! as any;
      const items: ChangeItem[] = Object.keys(full)
        .filter((k) => orig[k] !== full[k])
        .map((k) => ({ entity_type: entity, entity_id: editId!, field_name: k, old_value: { v: String(orig[k] ?? "") }, new_value: { v: String(full[k] ?? "") } }));
      return submitEntityChange(role, async () => { await api.patch(`${url}/${editId}`, full); },
        { title: `Правка: ${full.code}`, items });
    },
    onSuccess: (reqId) => { setEditId(null); refresh(reqId); },
  });

  const archiving = !!archiveTarget && (archiveTarget.status ?? "active") !== "archived";
  const checking = archiving && usage === undefined;
  const blocked = archiving && usage && (usage.services.length > 0 || usage.packages.length > 0);

  const doArchive = useMutation({
    mutationFn: async () => {
      const t = archiveTarget!;
      const next = (t.status ?? "active") !== "archived" ? "archived" : "active";
      return submitEntityChange(role, async () => { await api.patch(`${url}/${t.id}/archive`); },
        { title: `Статус справочника: ${t.code} → ${next}`, items: [{ entity_type: entity, entity_id: t.id, field_name: "status", old_value: { v: t.status ?? "active" }, new_value: { v: next } }] });
    },
    onSuccess: (reqId) => { setArchiveTarget(null); refresh(reqId); },
  });

  return (
    <div className="card">
      <h3>{title}</h3>
      <table>
        <thead><tr><th>Код</th><th>Название</th><th>Статус</th>{canWrite && <th></th>}</tr></thead>
        <tbody>
          {data?.map((r) => editId === r.id ? (
            <tr key={r.id}>
              <td><input value={editForm.code} onChange={(e) => setEditForm({ ...editForm, code: e.target.value })} /></td>
              <td>
                <input value={editForm.name_ru} onChange={(e) => setEditForm({ ...editForm, name_ru: e.target.value })} />
                {hasNameRo && <input value={editForm.name_ro} onChange={(e) => setEditForm({ ...editForm, name_ro: e.target.value })} placeholder="RO" style={{ marginTop: 4 }} />}
              </td>
              <td>—</td>
              <td><div className="row" style={{ gap: 4 }}>
                <button style={{ flex: "0 0 auto" }} onClick={() => saveEdit.mutate()}>OK</button>
                <button className="ghost" style={{ flex: "0 0 auto" }} onClick={() => setEditId(null)}>×</button>
              </div></td>
            </tr>
          ) : (
            <tr key={r.id}>
              <td>{r.code}</td>
              <td>{r.name_ru}</td>
              <td><span className={`pill ${r.status === "archived" ? "inactive" : "active"}`}>{r.status === "archived" ? "Архив" : "Активен"}</span></td>
              {canWrite && <td><div className="row" style={{ gap: 4 }}>
                <button className="ghost" style={{ flex: "0 0 auto" }} onClick={() => { setEditId(r.id); setEditForm({ code: r.code, name_ru: r.name_ru, name_ro: r.name_ro ?? "" }); }}>Изм.</button>
                <button className="ghost" style={{ flex: "0 0 auto" }} onClick={() => setArchiveTarget(r)}>{r.status === "archived" ? "Разарх." : "Архив"}</button>
              </div></td>}
            </tr>
          ))}
        </tbody>
      </table>
      {canWrite && <div className="row" style={{ marginTop: 12, alignItems: "flex-end" }}>
        <div><label>Код</label><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
        <div><label>Название (RU)</label><input value={form.name_ru} onChange={(e) => setForm({ ...form, name_ru: e.target.value })} /></div>
        {hasNameRo && <div><label>Название (RO)</label><input value={form.name_ro} onChange={(e) => setForm({ ...form, name_ro: e.target.value })} /></div>}
        <button style={{ flex: "0 0 auto" }} disabled={!form.code || !form.name_ru || create.isPending} onClick={() => create.mutate()}>
          {viaRequest ? "Через заявку" : "Добавить"}
        </button>
      </div>}

      {archiveTarget && (
        <ConfirmDialog
          title={`${archiving ? "Архивировать" : "Разархивировать"}: ${archiveTarget.code}`}
          confirmLabel={archiving ? "Архивировать" : "Разархивировать"}
          danger={archiving}
          confirmDisabled={!!blocked || checking || doArchive.isPending}
          onCancel={() => setArchiveTarget(null)}
          onConfirm={() => doArchive.mutate()}
        >
          {!archiving ? (
            <p>Вернуть запись в активный статус.{viaRequest ? " Будет создана заявка на согласование." : ""}</p>
          ) : checking ? (
            <p className="muted">Проверка связанных сущностей…</p>
          ) : blocked ? (
            <>
              <p className="err">Нельзя архивировать: есть связанные активные сущности. Сначала снимите связи.</p>
              {usage!.services.length > 0 && <><b>Услуги ({usage!.services.length}):</b><ul>{usage!.services.slice(0, 20).map((s) => <li key={s.id}><Link to={`/services/${s.id}`}>{s.code} · {s.name_ru}</Link></li>)}</ul></>}
              {usage!.packages.length > 0 && <><b>Пакеты ({usage!.packages.length}):</b><ul>{usage!.packages.slice(0, 20).map((p) => <li key={p.id}><Link to={`/packages/${p.id}`}>{p.code} · {p.name_ru}</Link></li>)}</ul></>}
            </>
          ) : (
            <p>Связанных активных сущностей нет.{viaRequest ? " Будет создана заявка на согласование." : ""}</p>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}

export default function Directories() {
  return (
    <>
      <div className="topbar"><h1>Справочники</h1></div>
      <div className="grid cols-2">
        <RefTable title="Группы услуг" url="/api/groups" entity="group" hasNameRo />
        <RefTable title="Подгруппы услуг" url="/api/subgroups" entity="subgroup" hasNameRo />
        <RefTable title="Исполнители" url="/api/executors" entity="executor" hasNameRo={false} />
        <RefTable title="Места оказания" url="/api/locations" entity="location" hasNameRo={false} />
      </div>
    </>
  );
}
