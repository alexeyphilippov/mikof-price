import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Price, Ref, Service, STATUS_NAMES } from "../api/client";
import { useAuth } from "../lib/auth";
import { useRefs } from "../lib/useRefs";
import { submitEntityChange, ChangeItem } from "../lib/entityAction";

const EDITABLE = [
  { key: "name_ru", label: "Название (RU)" },
  { key: "name_ro", label: "Название (RO)" },
  { key: "duration_min", label: "Длительность (мин)", num: true },
  { key: "note", label: "Примечание" },
] as const;

export default function ServiceDetail() {
  const { id } = useParams();
  const { me } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const canEditMed = me!.role === "r1" || me!.role === "r3";
  const canEditFin = me!.role === "r1" || me!.role === "r2";
  const viaRequest = me!.role !== "r1";
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState<any>({});

  const { data: s } = useQuery({ queryKey: ["service", id], queryFn: async () => (await api.get<Service>(`/api/services/${id}`)).data });
  const { data: prices } = useQuery({ queryKey: ["service-prices", id], queryFn: async () => (await api.get<Price[]>(`/api/services/${id}/prices`)).data });
  const { groups, subgroups, executors, locations, clinics } = useRefs();
  const { data: history } = useQuery({
    queryKey: ["service-history", id],
    queryFn: async () => (await api.get(`/api/services/${id}/history`)).data,
    enabled: me!.role !== "r4",
  });

  const save = useMutation({
    mutationFn: async (changes: Record<string, any>) => {
      const reqId = await submitEntityChange(
        me!.role,
        async () => { await api.patch(`/api/services/${id}`, changes); },
        {
          title: `Правка услуги ${s!.code}`,
          items: Object.entries(changes).map<ChangeItem>(([field, v]) => ({
            entity_type: "service", entity_id: Number(id), field_name: field,
            old_value: { v: String((s as any)[field] ?? "") }, new_value: { v: String(v ?? "") },
          })),
        },
      );
      return reqId;
    },
    onSuccess: (reqId) => {
      setEdit(false);
      if (reqId) { nav(`/requests/${reqId}`); return; }
      qc.invalidateQueries({ queryKey: ["service", id] });
      qc.invalidateQueries({ queryKey: ["service-history", id] });
    },
  });

  const savePrice = useMutation({
    mutationFn: async ({ clinicId, price, priceOnline }: { clinicId: number; price: number; priceOnline?: number }) => {
      const payload: Record<string, number> = { service_id: Number(id), clinic_id: clinicId, price };
      if (priceOnline != null) payload.price_online = priceOnline;
      const reqId = await submitEntityChange(
        me!.role,
        async () => { await api.post(`/api/services/${id}/prices`, { clinic_id: clinicId, currency: "MDL", price, price_online: priceOnline }); },
        {
          title: `Цена услуги ${s!.code}`,
          items: [{ entity_type: "service_price", entity_id: Number(id), field_name: "price", old_value: null, new_value: payload }],
        },
      );
      return reqId;
    },
    onSuccess: (reqId) => {
      if (reqId) { nav(`/requests/${reqId}`); return; }
      qc.invalidateQueries({ queryKey: ["service-prices", id] });
    },
  });

  if (!s) return <div className="muted">Загрузка…</div>;
  const refName = (list: Ref[] | undefined, rid?: number) => list?.find((x) => x.id === rid)?.name_ru ?? "—";

  const startEdit = () => {
    setForm({
      name_ru: s.name_ru, name_ro: s.name_ro ?? "", duration_min: s.duration_min ?? "", note: s.note ?? "",
      group_id: s.group_id ?? "", subgroup_id: s.subgroup_id ?? "",
      executor_id: s.executor_id ?? "", location_id: s.location_id ?? "",
    });
    setEdit(true);
  };

  const submitEdit = () => {
    const changes: Record<string, any> = {};
    for (const f of EDITABLE) {
      let v: any = form[f.key];
      if ("num" in f && f.num) v = v === "" ? null : Number(v);
      else if (v === "") v = null;
      if (v !== (s as any)[f.key]) changes[f.key] = v;
    }
    for (const key of ["group_id", "subgroup_id", "executor_id", "location_id"]) {
      const v = form[key] === "" ? null : Number(form[key]);
      if (v !== ((s as any)[key] ?? null)) changes[key] = v;
    }
    if (Object.keys(changes).length) save.mutate(changes);
    else setEdit(false);
  };

  const archive = () => {
    const next = s.status === "active" ? "inactive" : "active";
    save.mutate({ status: next });
  };

  const sel = (key: string, list: Ref[] | undefined) => (
    <select value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}>
      <option value="">—</option>
      {list?.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name_ru}</option>)}
    </select>
  );

  return (
    <>
      <div className="topbar">
        <h1>{s.name_ru}</h1>
        <div className="actions">
          {canEditMed && !edit && <button className="ghost" onClick={startEdit}>Редактировать</button>}
          {canEditMed && !edit && (
            <button className="ghost" onClick={archive}>
              {s.status === "active" ? "Архивировать" : "Активировать"}
            </button>
          )}
          <span className={`pill ${s.status}`}>{STATUS_NAMES[s.status]}</span>
        </div>
      </div>
      {canEditMed && viaRequest && edit && (
        <p className="tag">Изменения будут отправлены на согласование заявкой.</p>
      )}
      {canEditFin && viaRequest && !canEditMed && (
        <p className="tag">Изменение цен отправляется на согласование заявкой.</p>
      )}
      <div className="grid cols-3">
        <div className="card">
          <h3>Параметры</h3>
          {!edit ? (
            <>
              <p><span className="tag">Код</span><br />{s.code}</p>
              <p><span className="tag">Название (RO)</span><br />{s.name_ro || "—"}</p>
              <p><span className="tag">Группа</span><br />{refName(groups, s.group_id)}</p>
              <p><span className="tag">Подгруппа</span><br />{refName(subgroups, s.subgroup_id)}</p>
              <p><span className="tag">Исполнитель</span><br />{refName(executors, s.executor_id)}</p>
              <p><span className="tag">Место</span><br />{refName(locations, s.location_id)}</p>
              <p><span className="tag">Длительность</span><br />{s.duration_min ? `${s.duration_min} мин` : "—"}</p>
              <p><span className="tag">Продаётся отдельно</span><br />{s.sold_separately ? "Да" : "Нет"}</p>
              <p><span className="tag">Примечание</span><br />{s.note || "—"}</p>
            </>
          ) : (
            <>
              {EDITABLE.map((f) => (
                <div className="field" key={f.key}>
                  <label>{f.label}</label>
                  <input type={"num" in f && f.num ? "number" : "text"} value={form[f.key]}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                </div>
              ))}
              <div className="field"><label>Группа</label>{sel("group_id", groups)}</div>
              <div className="field"><label>Подгруппа</label>{sel("subgroup_id", subgroups)}</div>
              <div className="field"><label>Исполнитель</label>{sel("executor_id", executors)}</div>
              <div className="field"><label>Место</label>{sel("location_id", locations)}</div>
              <div className="row">
                <button disabled={save.isPending} onClick={submitEdit}>
                  {me!.role === "r1" ? "Сохранить" : "Отправить на согласование"}
                </button>
                <button className="ghost" onClick={() => setEdit(false)}>Отмена</button>
              </div>
            </>
          )}
        </div>
        {canEditFin && (
          <div className="card">
            <h3>Цены по клиникам</h3>
            <table>
              <thead><tr><th>Клиника</th><th>Цена</th><th>Online</th><th>Спец.</th>{canEditFin && <th></th>}</tr></thead>
              <tbody>
                {(clinics ?? []).filter((c) => c.status === "active").map((c) => {
                  const p = prices?.find((x) => x.clinic_id === c.id);
                  return (
                    <ServicePriceRow
                      key={c.id}
                      clinic={c}
                      price={p}
                      canEdit={canEditFin}
                      pending={savePrice.isPending}
                      onSave={(price, priceOnline) => savePrice.mutate({ clinicId: c.id, price, priceOnline })}
                    />
                  );
                })}
                {!clinics?.length && <tr><td colSpan={5} className="muted">Нет клиник</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {me!.role !== "r4" && (
          <div className="card">
            <h3>История изменений</h3>
            <ul className="timeline">
              {history?.map((h: any) => (
                <li key={h.id}>
                  <b>{h.field_name}</b>: {h.old_value?.v} → {h.new_value?.v}
                  <div className="muted">{new Date(h.changed_at).toLocaleString("ru")} · {h.changed_by_name ?? `#${h.changed_by}`}</div>
                </li>
              ))}
              {history?.length === 0 && <li className="muted">Изменений нет</li>}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}

function ServicePriceRow({ clinic, price, canEdit, pending, onSave }: {
  clinic: Ref; price?: Price; canEdit: boolean; pending: boolean;
  onSave: (price: number, priceOnline?: number) => void;
}) {
  const [val, setVal] = useState("");
  const [online, setOnline] = useState("");
  useEffect(() => {
    setVal(price?.price != null ? String(price.price) : "");
    setOnline(price?.price_online != null ? String(price.price_online) : "");
  }, [price?.price, price?.price_online]);
  if (!canEdit) {
    return (
      <tr>
        <td>{clinic.name_ru}</td>
        <td>{price?.price ?? "—"} {price?.currency ?? "MDL"}</td>
        <td>{price?.price_online ?? "—"}</td>
        <td>{price?.price_special ?? "—"}</td>
      </tr>
    );
  }
  return (
    <tr>
      <td>{clinic.name_ru}</td>
      <td><input type="number" value={val} onChange={(e) => setVal(e.target.value)} placeholder="Цена" style={{ maxWidth: 90 }} /></td>
      <td><input type="number" value={online} onChange={(e) => setOnline(e.target.value)} placeholder="Online" style={{ maxWidth: 90 }} /></td>
      <td>{price?.price_special ?? "—"}</td>
      <td>
        <button className="ghost" style={{ flex: "0 0 auto" }} disabled={!val || pending}
          onClick={() => onSave(Number(val), online ? Number(online) : undefined)}>OK</button>
      </td>
    </tr>
  );
}
