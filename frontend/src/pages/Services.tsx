import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Ref, Service, Page } from "../api/client";
import { useAuth } from "../lib/auth";

const PAGE = 50;

export default function Services() {
  const { me } = useAuth();
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const [offset, setOffset] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const canCreate = me!.role === "r1" || me!.role === "r3";

  const { data: groups } = useQuery({ queryKey: ["groups"], queryFn: async () => (await api.get<Ref[]>("/api/groups")).data });
  const { data, isLoading } = useQuery({
    queryKey: ["services", search, group, offset],
    queryFn: async () => {
      const p = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
      if (search) p.set("search", search);
      if (group) p.set("group_id", group);
      return (await api.get<Page<Service>>(`/api/services?${p}`)).data;
    },
  });

  useEffect(() => { setOffset(0); }, [search, group]);

  const total = data?.total ?? 0;
  const page = Math.floor(offset / PAGE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <>
      <div className="topbar">
        <h1>Услуги</h1>
        {canCreate && <button onClick={() => setShowCreate(!showCreate)}>{showCreate ? "Скрыть форму" : "Создать услугу"}</button>}
      </div>
      {showCreate && <CreateServiceForm onDone={() => setShowCreate(false)} />}
      <div className="toolbar">
        <input placeholder="Поиск по коду или названию…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Поиск по коду или названию" />
        <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Фильтр по группе">
          <option value="">Все группы</option>
          {groups?.map((g) => <option key={g.id} value={g.id}>{g.code} · {g.name_ru}</option>)}
        </select>
        <span className="muted" style={{ marginLeft: "auto" }}>Найдено: {total}</span>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Код</th><th>Название</th><th>Цена (Кишинёв)</th><th>Длит.</th><th>Статус</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="muted">Загрузка…</td></tr>}
            {data?.items.map((s) => (
              <tr key={s.id}>
                <td><Link to={`/services/${s.id}`}>{s.code}</Link></td>
                <td>{s.name_ru}</td>
                <td className="muted">{s.price != null ? `${s.price} MDL` : "—"}</td>
                <td className="muted">{s.duration_min ? `${s.duration_min} мин` : "—"}</td>
                <td><span className={`pill ${s.status}`}>{s.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
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

function CreateServiceForm({ onDone }: { onDone: () => void }) {
  const { me } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const isR3 = me!.role === "r3";

  const [form, setForm] = useState({
    code: "", name_ru: "", name_ro: "", group_id: "", subgroup_id: "",
    executor_id: "", location_id: "", duration_min: "",
  });
  const [err, setErr] = useState("");

  const { data: groups } = useQuery({ queryKey: ["groups"], queryFn: async () => (await api.get<Ref[]>("/api/groups")).data });
  const { data: subgroups } = useQuery({ queryKey: ["subgroups"], queryFn: async () => (await api.get<Ref[]>("/api/subgroups")).data });

  const prefix = (() => {
    const g = groups?.find((x) => String(x.id) === form.group_id);
    const sg = subgroups?.find((x) => String(x.id) === form.subgroup_id);
    return g && sg ? `${g.code}-${sg.code}-` : "";
  })();

  useEffect(() => {
    if (prefix && !form.code.startsWith(prefix)) setForm((f) => ({ ...f, code: prefix }));
  }, [prefix]);

  const codeOk = prefix ? form.code.startsWith(prefix) && form.code.length > prefix.length : false;

  const create = useMutation({
    mutationFn: async () => {
      const payload: any = {
        code: form.code, name_ru: form.name_ru, name_ro: form.name_ro || null,
        group_id: Number(form.group_id), subgroup_id: Number(form.subgroup_id),
        executor_id: form.executor_id ? Number(form.executor_id) : null,
        location_id: form.location_id ? Number(form.location_id) : null,
        duration_min: form.duration_min ? Number(form.duration_min) : null,
      };
      const svc = (await api.post<Service>("/api/services", payload)).data;
      if (isR3) {
        const req = (await api.post("/api/requests", {
          title: `Активация услуги ${svc.code}`,
          note: `Новая услуга «${svc.name_ru}» создана медицинским директором, требуется согласование.`,
          items: [{ entity_type: "service_create", entity_id: svc.id, field_name: "status", old_value: { v: "pending" }, new_value: { v: "active" } }],
        })).data;
        await api.patch(`/api/requests/${req.id}/submit`);
        return { svc, reqId: req.id };
      }
      return { svc, reqId: null };
    },
    onSuccess: ({ reqId }) => {
      qc.invalidateQueries({ queryKey: ["services"] });
      onDone();
      if (reqId) nav(`/requests/${reqId}`);
    },
    onError: () => setErr("Ошибка создания. Проверьте уникальность кода и заполненность полей."),
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3>Новая услуга {isR3 && <span className="tag">(будет отправлена на согласование)</span>}</h3>
      <div className="row">
        <div className="field"><label htmlFor="svc-group">Группа *</label>
          <select id="svc-group" value={form.group_id} onChange={set("group_id")} required>
            <option value="">— выберите —</option>
            {groups?.map((g) => <option key={g.id} value={g.id}>{g.code} · {g.name_ru}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="svc-subgroup">Подгруппа *</label>
          <select id="svc-subgroup" value={form.subgroup_id} onChange={set("subgroup_id")} required>
            <option value="">— выберите —</option>
            {subgroups?.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name_ru}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="svc-code">Код *</label><input id="svc-code" value={form.code} onChange={set("code")} placeholder={prefix || "G-001-CON-XXX"} /></div>
      </div>
      <div className="row">
        <div className="field"><label htmlFor="svc-name-ru">Название (RU) *</label><input id="svc-name-ru" value={form.name_ru} onChange={set("name_ru")} /></div>
        <div className="field"><label htmlFor="svc-name-ro">Название (RO)</label><input id="svc-name-ro" value={form.name_ro} onChange={set("name_ro")} /></div>
        <div className="field"><label htmlFor="svc-duration">Длительность (мин)</label><input id="svc-duration" type="number" value={form.duration_min} onChange={set("duration_min")} /></div>
      </div>
      <button style={{ marginTop: 8 }} disabled={!form.group_id || !form.subgroup_id || !codeOk || !form.name_ru || create.isPending} onClick={() => create.mutate()}>
        {isR3 ? "Создать и отправить на согласование" : "Создать"}
      </button>
      {err && <div className="err">{err}</div>}
    </div>
  );
}
