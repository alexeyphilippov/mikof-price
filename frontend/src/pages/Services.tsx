import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Ref, Service, STATUS_NAMES } from "../api/client";
import { useAuth } from "../lib/auth";

export default function Services() {
  const { me } = useAuth();
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const canCreate = me!.role === "r1" || me!.role === "r3";

  const { data: groups } = useQuery({ queryKey: ["groups"], queryFn: async () => (await api.get<Ref[]>("/api/groups")).data });
  const { data: services, isLoading } = useQuery({
    queryKey: ["services", search, group],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (search) p.set("search", search);
      if (group) p.set("group_id", group);
      return (await api.get<Service[]>(`/api/services?${p}`)).data;
    },
  });

  return (
    <>
      <div className="topbar">
        <h1>Услуги</h1>
        {canCreate && <button onClick={() => setShowCreate(!showCreate)}>{showCreate ? "Скрыть форму" : "Создать услугу"}</button>}
      </div>
      {showCreate && <CreateServiceForm onDone={() => setShowCreate(false)} />}
      <div className="toolbar">
        <input placeholder="Поиск по коду или названию…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="">Все группы</option>
          {groups?.map((g) => <option key={g.id} value={g.id}>{g.code} · {g.name_ru}</option>)}
        </select>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Код</th><th>Название</th><th>Цена</th><th>Длит.</th><th>Статус</th></tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="muted">Загрузка…</td></tr>}
            {services?.map((s) => (
              <tr key={s.id}>
                <td><Link to={`/services/${s.id}`}>{s.code}</Link></td>
                <td>{s.name_ru}</td>
                <td className="muted">{s.price != null ? `${s.price} MDL` : "—"}</td>
                <td className="muted">{s.duration_min ? `${s.duration_min} мин` : "—"}</td>
                <td><span className={`pill ${s.status}`}>{STATUS_NAMES[s.status]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
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
  const { data: executors } = useQuery({ queryKey: ["executors"], queryFn: async () => (await api.get<Ref[]>("/api/executors")).data });
  const { data: locations } = useQuery({ queryKey: ["locations"], queryFn: async () => (await api.get<Ref[]>("/api/locations")).data });

  const group = groups?.find((g) => g.id === Number(form.group_id));
  const subgroup = subgroups?.find((s) => s.id === Number(form.subgroup_id));
  const codePrefix = group && subgroup ? `${group.code}-${subgroup.code}-` : "";
  const codeValid = !!codePrefix && form.code.startsWith(codePrefix);
  const canSubmit = !!(form.group_id && form.subgroup_id && form.name_ru && codeValid);

  const create = useMutation({
    mutationFn: async () => {
      const payload: any = {
        code: form.code, name_ru: form.name_ru, name_ro: form.name_ro || null,
        group_id: form.group_id ? Number(form.group_id) : null,
        subgroup_id: form.subgroup_id ? Number(form.subgroup_id) : null,
        executor_id: form.executor_id ? Number(form.executor_id) : null,
        location_id: form.location_id ? Number(form.location_id) : null,
        duration_min: form.duration_min ? Number(form.duration_min) : null,
      };
      const svc = (await api.post<Service>("/api/services", payload)).data;
      if (isR3) {
        // Ф32/Ф38: услуга создана как pending — заявка на активацию через R2 → R1
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
    onError: (e: any) => {
      const d = e?.response?.data?.detail;
      setErr(Array.isArray(d) ? d.map((x: any) => x.msg).join("; ") : (d ?? "Ошибка создания. Проверьте уникальность кода и заполненность полей."));
    },
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const setGroup = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const group_id = e.target.value;
    setForm({ ...form, group_id, subgroup_id: "", code: "" });
  };

  const setSubgroup = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const subgroup_id = e.target.value;
    const g = groups?.find((x) => x.id === Number(form.group_id));
    const sg = subgroups?.find((x) => x.id === Number(subgroup_id));
    const prefix = g && sg ? `${g.code}-${sg.code}-` : "";
    setForm({ ...form, subgroup_id, code: prefix });
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3>Новая услуга {isR3 && <span className="tag">(будет отправлена на согласование)</span>}</h3>
      <div className="row">
        <div className="field"><label>Группа *</label>
          <select value={form.group_id} onChange={setGroup}>
            <option value="">— выберите —</option>
            {groups?.filter((g) => g.status !== "archived").map((g) => <option key={g.id} value={g.id}>{g.code} · {g.name_ru}</option>)}
          </select>
        </div>
        <div className="field"><label>Подгруппа *</label>
          <select value={form.subgroup_id} onChange={setSubgroup} disabled={!form.group_id}>
            <option value="">— выберите —</option>
            {subgroups?.filter((s) => s.status !== "archived").map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name_ru}</option>)}
          </select>
        </div>
      </div>
      <div className="row">
        <div className="field"><label>Код *</label>
          <input value={form.code} onChange={set("code")} placeholder={codePrefix || "G-001-CON-001"} disabled={!codePrefix} />
          {codePrefix && !codeValid && form.code && <div className="err">Код должен начинаться с {codePrefix}</div>}
        </div>
        <div className="field"><label>Название (RU) *</label><input value={form.name_ru} onChange={set("name_ru")} /></div>
        <div className="field"><label>Название (RO)</label><input value={form.name_ro} onChange={set("name_ro")} /></div>
      </div>
      <div className="row">
        <div className="field"><label>Исполнитель</label>
          <select value={form.executor_id} onChange={set("executor_id")}>
            <option value="">—</option>
            {executors?.filter((e) => e.status !== "archived").map((e) => <option key={e.id} value={e.id}>{e.name_ru}</option>)}
          </select>
        </div>
        <div className="field"><label>Место оказания</label>
          <select value={form.location_id} onChange={set("location_id")}>
            <option value="">—</option>
            {locations?.filter((l) => l.status !== "archived").map((l) => <option key={l.id} value={l.id}>{l.name_ru}</option>)}
          </select>
        </div>
        <div className="field"><label>Длительность (мин)</label><input type="number" value={form.duration_min} onChange={set("duration_min")} /></div>
        <div className="field" style={{ display: "flex", alignItems: "flex-end" }}>
          <button style={{ width: "100%" }} disabled={!canSubmit || create.isPending} onClick={() => create.mutate()}>
            {isR3 ? "Создать и отправить на согласование" : "Создать"}
          </button>
        </div>
      </div>
      {err && <div className="err">{err}</div>}
    </div>
  );
}
