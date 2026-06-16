import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Package, Ref, Service, STATUS_NAMES } from "../api/client";
import { useAuth } from "../lib/auth";
import { submitEntityChange } from "../lib/entityAction";

export default function Packages() {
  const { me } = useAuth();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const canCreate = me!.role !== "r4";
  const { data, isLoading } = useQuery({
    queryKey: ["packages", search],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (search) p.set("search", search);
      return (await api.get<Package[]>(`/api/packages?${p}`)).data;
    },
  });

  return (
    <>
      <div className="topbar">
        <h1>Пакеты услуг</h1>
        {canCreate && <button onClick={() => setShowCreate(!showCreate)}>{showCreate ? "Скрыть форму" : "Создать пакет"}</button>}
      </div>
      {showCreate && <CreatePackageForm onDone={() => setShowCreate(false)} />}
      <div className="toolbar">
        <input placeholder="Поиск по коду или названию…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Код</th><th>Название</th><th>Цена</th><th>Услуг</th><th>Статус</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="muted">Загрузка…</td></tr>}
            {data?.map((p) => (
              <tr key={p.id}>
                <td><Link to={`/packages/${p.id}`}>{p.code}</Link></td>
                <td>{p.name_ru}</td>
                <td className="muted">{p.price != null ? `${p.price} MDL` : "—"}</td>
                <td className="muted">{p.items.length}</td>
                <td><span className={`pill ${p.status}`}>{STATUS_NAMES[p.status]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CreatePackageForm({ onDone }: { onDone: () => void }) {
  const { me } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const viaRequest = me!.role !== "r1";

  const [form, setForm] = useState({ code: "", name_ru: "", name_ro: "", group_id: "" });
  const [items, setItems] = useState<{ service_id: number; inclusion_type: string; label: string }[]>([]);
  const [svcId, setSvcId] = useState("");
  const [incType, setIncType] = useState("required");
  const [err, setErr] = useState("");

  const { data: groups } = useQuery({ queryKey: ["groups"], queryFn: async () => (await api.get<Ref[]>("/api/groups")).data });
  const { data: services } = useQuery({ queryKey: ["services-all"], queryFn: async () => (await api.get<Service[]>("/api/services")).data });

  const addItem = () => {
    const svc = services?.find((s) => s.id === Number(svcId));
    if (!svc || items.some((i) => i.service_id === svc.id)) return;
    setItems([...items, { service_id: svc.id, inclusion_type: incType, label: `${svc.code} ${svc.name_ru}` }]);
    setSvcId("");
  };

  const create = useMutation({
    mutationFn: async () => {
      const payload = {
        code: form.code, name_ru: form.name_ru, name_ro: form.name_ro || null,
        group_id: form.group_id ? Number(form.group_id) : null,
        items: items.map(({ service_id, inclusion_type }) => ({ service_id, inclusion_type })),
      };
      return submitEntityChange(
        me!.role,
        async () => { await api.post("/api/packages", payload); },
        { title: `Создание пакета ${form.code}`, items: [{ entity_type: "package_create", field_name: "create", old_value: null, new_value: payload }] },
      );
    },
    onSuccess: (reqId) => {
      qc.invalidateQueries({ queryKey: ["packages"] });
      onDone();
      if (reqId) nav(`/requests/${reqId}`);
    },
    onError: () => setErr("Ошибка создания пакета"),
  });

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3>Новый пакет {viaRequest && <span className="tag">(будет отправлен на согласование)</span>}</h3>
      <div className="row">
        <div className="field"><label>Код *</label><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="G-001-PAK-XXX" /></div>
        <div className="field"><label>Название (RU) *</label><input value={form.name_ru} onChange={(e) => setForm({ ...form, name_ru: e.target.value })} /></div>
        <div className="field"><label>Группа</label>
          <select value={form.group_id} onChange={(e) => setForm({ ...form, group_id: e.target.value })}>
            <option value="">—</option>
            {groups?.map((g) => <option key={g.id} value={g.id}>{g.code} · {g.name_ru}</option>)}
          </select>
        </div>
      </div>
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div style={{ flex: 2 }}><label>Услуга</label>
          <select value={svcId} onChange={(e) => setSvcId(e.target.value)}>
            <option value="">— выберите —</option>
            {services?.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name_ru}</option>)}
          </select>
        </div>
        <div><label>Тип включения</label>
          <select value={incType} onChange={(e) => setIncType(e.target.value)}>
            <option value="required">Обязательная</option>
            <option value="by_prescription">По назначению</option>
          </select>
        </div>
        <button className="ghost" style={{ flex: "0 0 auto" }} disabled={!svcId} onClick={addItem}>Добавить услугу</button>
      </div>
      {items.length > 0 && (
        <ul className="timeline" style={{ marginTop: 10 }}>
          {items.map((it, i) => (
            <li key={i}>{it.label} <span className="tag">({it.inclusion_type === "required" ? "обязательная" : "по назначению"})</span></li>
          ))}
        </ul>
      )}
      <button style={{ marginTop: 12 }} disabled={!form.code || !form.name_ru || items.length === 0 || create.isPending} onClick={() => create.mutate()}>
        {viaRequest ? "Создать через заявку" : "Создать пакет"}
      </button>
      {err && <div className="err">{err}</div>}
    </div>
  );
}
