import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Clinic } from "../api/client";
import { useAuth } from "../lib/auth";
import { submitEntityChange, ChangeItem } from "../lib/entityAction";
import ConfirmDialog from "../components/ConfirmDialog";

interface Usage {
  services: { id: number; code: string; name_ru: string }[];
  packages: { id: number; code: string; name_ru: string }[];
}
const EMPTY = { code: "", name_ru: "", name_ro: "", address: "", phone: "" };
const FIELDS: { k: keyof typeof EMPTY; label: string }[] = [
  { k: "code", label: "Код" }, { k: "name_ru", label: "Название (RU)" },
  { k: "name_ro", label: "Название (RO)" }, { k: "address", label: "Адрес" }, { k: "phone", label: "Телефон" },
];

export default function Clinics() {
  const { me } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const role = me!.role;
  const viaRequest = role !== "r1";
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(EMPTY);
  const [archiveTarget, setArchiveTarget] = useState<Clinic | null>(null);

  const { data } = useQuery({ queryKey: ["clinics"], queryFn: async () => (await api.get<Clinic[]>("/api/clinics")).data });
  const { data: usage } = useQuery({
    queryKey: ["clinic-usage", archiveTarget?.id],
    queryFn: async () => (await api.get<Usage>(`/api/clinics/${archiveTarget!.id}/usage`)).data,
    enabled: !!archiveTarget,
  });

  const refresh = (reqId: number | null) => { qc.invalidateQueries({ queryKey: ["clinics"] }); if (reqId) nav(`/requests/${reqId}`); };

  const create = useMutation({
    mutationFn: async () => submitEntityChange(role, async () => { await api.post("/api/clinics", form); },
      { title: `Создание клиники ${form.code}`, items: [{ entity_type: "clinic_create", field_name: "create", old_value: null, new_value: form }] }),
    onSuccess: (reqId) => { setForm(EMPTY); refresh(reqId); },
  });

  const saveEdit = useMutation({
    mutationFn: async () => {
      const orig = data!.find((d) => d.id === editId)! as any;
      const items: ChangeItem[] = FIELDS.map((f) => f.k).filter((k) => k !== "code" && orig[k] !== (editForm as any)[k] && (editForm as any)[k] !== "")
        .map((k) => ({ entity_type: "clinic", entity_id: editId!, field_name: k, old_value: { v: String(orig[k] ?? "") }, new_value: { v: String((editForm as any)[k]) } }));
      const patch: any = { name_ru: editForm.name_ru, name_ro: editForm.name_ro, address: editForm.address, phone: editForm.phone };
      return submitEntityChange(role, async () => { await api.patch(`/api/clinics/${editId}`, patch); },
        { title: `Правка клиники ${editForm.code}`, items });
    },
    onSuccess: (reqId) => { setEditId(null); refresh(reqId); },
  });

  const closing = !!archiveTarget && archiveTarget.status === "active";
  const checking = closing && usage === undefined;
  const blocked = closing && usage && (usage.services.length > 0 || usage.packages.length > 0);

  const doArchive = useMutation({
    mutationFn: async () => {
      const t = archiveTarget!;
      const next = t.status === "active" ? "closed" : "active";
      return submitEntityChange(role, async () => { await api.patch(`/api/clinics/${t.id}/archive`); },
        { title: `Статус клиники ${t.code} → ${next}`, items: [{ entity_type: "clinic", entity_id: t.id, field_name: "status", old_value: { v: t.status }, new_value: { v: next } }] });
    },
    onSuccess: (reqId) => { setArchiveTarget(null); refresh(reqId); },
  });

  return (
    <>
      <div className="topbar"><h1>Клиники</h1></div>
      {viaRequest && <p className="tag">Ваши изменения отправляются на согласование заявкой.</p>}
      <div className="grid cols-3">
        <div className="card" style={{ gridColumn: "span 2" }}>
          <table>
            <thead><tr><th>Код</th><th>Название</th><th>Адрес</th><th>Статус</th><th></th></tr></thead>
            <tbody>
              {data?.map((c) => editId === c.id ? (
                <tr key={c.id}>
                  <td>{c.code}</td>
                  <td><input value={editForm.name_ru} onChange={(e) => setEditForm({ ...editForm, name_ru: e.target.value })} /></td>
                  <td><input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} /></td>
                  <td>—</td>
                  <td><div className="row" style={{ gap: 4 }}>
                    <button style={{ flex: "0 0 auto" }} onClick={() => saveEdit.mutate()}>OK</button>
                    <button className="ghost" style={{ flex: "0 0 auto" }} onClick={() => setEditId(null)}>×</button>
                  </div></td>
                </tr>
              ) : (
                <tr key={c.id}>
                  <td>{c.code}</td><td>{c.name_ru}</td><td className="muted">{c.address || "—"}</td>
                  <td><span className={`pill ${c.status === "active" ? "active" : "inactive"}`}>{c.status === "active" ? "Активна" : "Закрыта"}</span></td>
                  <td><div className="row" style={{ gap: 4 }}>
                    <button className="ghost" style={{ flex: "0 0 auto" }} onClick={() => { setEditId(c.id); setEditForm({ code: c.code, name_ru: c.name_ru, name_ro: c.name_ro ?? "", address: c.address ?? "", phone: c.phone ?? "" }); }}>Изм.</button>
                    <button className="ghost" style={{ flex: "0 0 auto" }} onClick={() => setArchiveTarget(c)}>{c.status === "active" ? "Закрыть" : "Открыть"}</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>Новая клиника {viaRequest && <span className="tag">(заявка)</span>}</h3>
          {FIELDS.map(({ k, label }) => (
            <div className="field" key={k}>
              <label>{label}</label>
              <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </div>
          ))}
          <button style={{ width: "100%" }} disabled={!form.code || !form.name_ru || create.isPending} onClick={() => create.mutate()}>
            {viaRequest ? "Через заявку" : "Добавить"}
          </button>
        </div>
      </div>

      {archiveTarget && (
        <ConfirmDialog
          title={`${closing ? "Закрыть" : "Открыть"} клинику: ${archiveTarget.code}`}
          confirmLabel={closing ? "Закрыть" : "Открыть"}
          danger={closing}
          confirmDisabled={!!blocked || checking || doArchive.isPending}
          onCancel={() => setArchiveTarget(null)}
          onConfirm={() => doArchive.mutate()}
        >
          {!closing ? (
            <p>Вернуть клинику в активный статус.{viaRequest ? " Будет создана заявка." : ""}</p>
          ) : checking ? (
            <p className="muted">Проверка связанных цен…</p>
          ) : blocked ? (
            <>
              <p className="err">Нельзя закрыть: есть активные цены. Сначала удалите/деактивируйте их.</p>
              {usage!.services.length > 0 && <><b>Услуги с ценами ({usage!.services.length}):</b><ul>{usage!.services.slice(0, 20).map((s) => <li key={s.id}><Link to={`/services/${s.id}`}>{s.code} · {s.name_ru}</Link></li>)}</ul></>}
              {usage!.packages.length > 0 && <><b>Пакеты с ценами ({usage!.packages.length}):</b><ul>{usage!.packages.slice(0, 20).map((p) => <li key={p.id}><Link to={`/packages/${p.id}`}>{p.code} · {p.name_ru}</Link></li>)}</ul></>}
            </>
          ) : (
            <p>Активных цен нет.{viaRequest ? " Будет создана заявка." : ""}</p>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
