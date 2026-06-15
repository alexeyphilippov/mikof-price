import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Clinic, Package, Service, STATUS_NAMES } from "../api/client";
import { useAuth } from "../lib/auth";
import { submitEntityChange, RequestPayload } from "../lib/entityAction";

export default function PackageDetail() {
  const { id } = useParams();
  const { me } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const role = me!.role;
  const canWriteFin = role === "r1" || role === "r2";
  const canWriteMed = role === "r1" || role === "r3";
  const viaRequest = role !== "r1";
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState("");
  const [svcId, setSvcId] = useState("");
  const [incType, setIncType] = useState("required");

  const { data: p } = useQuery({ queryKey: ["package", id], queryFn: async () => (await api.get<Package>(`/api/packages/${id}`)).data });
  const { data: clinics } = useQuery({ queryKey: ["clinics"], queryFn: async () => (await api.get<Clinic[]>("/api/clinics")).data });
  const { data: services } = useQuery({ queryKey: ["services-all"], queryFn: async () => (await api.get<Service[]>("/api/services")).data });

  const act = useMutation({
    mutationFn: async (a: { direct: () => Promise<void>; payload: RequestPayload }) =>
      submitEntityChange(role, a.direct, a.payload),
    onSuccess: (reqId) => {
      setEdit(false);
      if (reqId) { nav(`/requests/${reqId}`); return; }
      qc.invalidateQueries({ queryKey: ["package", id] });
      qc.invalidateQueries({ queryKey: ["packages"] });
      qc.invalidateQueries({ queryKey: ["pkg-price"] });
    },
  });

  if (!p) return <div className="muted">Загрузка…</div>;
  const svcName = (sid: number) => services?.find((s) => s.id === sid);

  const rename = () => act.mutate({
    direct: async () => { await api.patch(`/api/packages/${id}`, { name_ru: name }); },
    payload: { title: `Переименование пакета ${p.code}`, items: [{ entity_type: "package", entity_id: Number(id), field_name: "name_ru", old_value: { v: p.name_ru }, new_value: { v: name } }] },
  });
  const toggle = () => {
    const next = p.status === "active" ? "inactive" : "active";
    act.mutate({
      direct: async () => { await api.patch(`/api/packages/${id}`, { status: next }); },
      payload: { title: `Статус пакета ${p.code} → ${STATUS_NAMES[next]}`, items: [{ entity_type: "package", entity_id: Number(id), field_name: "status", old_value: { v: p.status }, new_value: { v: next } }] },
    });
  };
  const addItem = () => {
    if (!svcId) return;
    const sid = Number(svcId);
    act.mutate({
      direct: async () => { await api.post(`/api/packages/${id}/items`, { service_id: sid, inclusion_type: incType }); },
      payload: { title: `Добавление услуги в пакет ${p.code}`, items: [{ entity_type: "package_item_add", field_name: "add", old_value: null, new_value: { package_id: Number(id), service_id: sid, inclusion_type: incType } }] },
    });
    setSvcId("");
  };
  const removeItem = (itemId: number) => act.mutate({
    direct: async () => { await api.delete(`/api/packages/${id}/items/${itemId}`); },
    payload: { title: `Удаление услуги из пакета ${p.code}`, items: [{ entity_type: "package_item_remove", field_name: "remove", old_value: null, new_value: { item_id: itemId } }] },
  });
  const savePrices = (rows: { clinic_id: number; price_fixed: number | null }[]) => act.mutate({
    direct: async () => { for (const r of rows) await api.post(`/api/packages/${id}/prices`, r); },
    payload: {
      title: `Цены пакета ${p.code}`,
      items: rows.map((r) => ({ entity_type: "package_price", field_name: "price_fixed", old_value: null, new_value: { package_id: Number(id), currency: "MDL", ...r } })),
    },
  });

  return (
    <>
      <div className="topbar">
        {edit ? (
          <div className="row" style={{ flex: 1, maxWidth: 600, alignItems: "center" }}>
            <input value={name} onChange={(e) => setName(e.target.value)} />
            <button style={{ flex: "0 0 auto" }} onClick={rename}>Сохранить</button>
            <button className="ghost" style={{ flex: "0 0 auto" }} onClick={() => setEdit(false)}>Отмена</button>
          </div>
        ) : (
          <h1>{p.name_ru}</h1>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {canWriteMed && !edit && (
            <>
              <button className="ghost" onClick={() => { setName(p.name_ru); setEdit(true); }}>Переименовать</button>
              <button className="ghost" onClick={toggle}>{p.status === "active" ? "Деактивировать" : "Активировать"}</button>
            </>
          )}
          <span className={`pill ${p.status}`}>{STATUS_NAMES[p.status]}</span>
        </div>
      </div>
      {viaRequest && (canWriteMed || canWriteFin) && <p className="tag">Ваши изменения отправляются на согласование заявкой.</p>}
      <div className="grid cols-3">
        <div className="card" style={{ gridColumn: "span 2" }}>
          <h3>Состав пакета ({p.items.length})</h3>
          <table>
            <thead><tr><th>Услуга</th><th>Тип включения</th>{canWriteFin && <th></th>}</tr></thead>
            <tbody>
              {p.items.map((it) => {
                const s = svcName(it.service_id);
                return (
                  <tr key={it.id}>
                    <td>{s ? <Link to={`/services/${s.id}`}>{s.code} · {s.name_ru}</Link> : `#${it.service_id}`}</td>
                    <td>{it.inclusion_type === "required" ? "Обязательная" : "По назначению"}</td>
                    {canWriteFin && <td><button className="ghost" onClick={() => removeItem(it.id)}>Удалить</button></td>}
                  </tr>
                );
              })}
              {p.items.length === 0 && <tr><td colSpan={canWriteFin ? 3 : 2} className="muted">Услуг нет</td></tr>}
            </tbody>
          </table>
          {canWriteFin && (
            <div className="row" style={{ alignItems: "flex-end", marginTop: 12 }}>
              <div style={{ flex: 2 }}><label>Добавить услугу</label>
                <select value={svcId} onChange={(e) => setSvcId(e.target.value)}>
                  <option value="">— выберите —</option>
                  {services?.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name_ru}</option>)}
                </select>
              </div>
              <div><label>Тип</label>
                <select value={incType} onChange={(e) => setIncType(e.target.value)}>
                  <option value="required">Обязательная</option>
                  <option value="by_prescription">По назначению</option>
                </select>
              </div>
              <button className="ghost" style={{ flex: "0 0 auto" }} disabled={!svcId} onClick={addItem}>Добавить</button>
            </div>
          )}
        </div>
        <PackagePrice clinics={clinics ?? []} prices={p.prices} packageId={Number(id)} canWrite={canWriteFin} role={role} pending={act.isPending} onSubmit={savePrices} />
      </div>
    </>
  );
}

const PRICE_CELL = { width: 80, padding: "4px 6px" } as const;

function PackagePrice({ clinics, prices, packageId, canWrite, role, pending, onSubmit }: {
  clinics: Clinic[]; prices: Package["prices"]; packageId: number; canWrite: boolean;
  role: string; pending: boolean; onSubmit: (rows: { clinic_id: number; price_fixed: number | null }[]) => void;
}) {
  const active = clinics.filter((c) => c.status === "active");
  const initOf = (cid: number) => { const f = prices.find((pr) => pr.clinic_id === cid)?.price_fixed; return f != null ? String(f) : ""; };
  const [pe, setPe] = useState<Record<number, string>>({});
  useEffect(() => {
    const m: Record<number, string> = {};
    for (const c of active) m[c.id] = initOf(c.id);
    setPe(m);
  }, [clinics, prices]);
  const submit = () => {
    const rows = active.flatMap((c) => (pe[c.id] ?? "") !== initOf(c.id)
      ? [{ clinic_id: c.id, price_fixed: (pe[c.id] ?? "").trim() === "" ? null : Number(pe[c.id]) }] : []);
    if (rows.length) onSubmit(rows);
  };
  return (
    <div className="card">
      <h3>Цена по клиникам</h3>
      <p className="muted" style={{ fontSize: 13 }}>Пусто — считается как сумма входящих услуг.</p>
      <table>
        <thead><tr><th>Клиника</th><th>Расчёт</th>{canWrite && <th>Фикс.</th>}</tr></thead>
        <tbody>
          {active.map((c) => (
            <tr key={c.id}>
              <td>{c.name_ru}</td>
              <td><ComputedCell packageId={packageId} clinicId={c.id} /></td>
              {canWrite && <td><input type="number" value={pe[c.id] ?? ""} onChange={(e) => setPe((prev) => ({ ...prev, [c.id]: e.target.value }))} style={PRICE_CELL} /></td>}
            </tr>
          ))}
        </tbody>
      </table>
      {canWrite && !!active.length && (
        <button style={{ marginTop: 12 }} disabled={pending} onClick={submit}>
          {role === "r1" ? "Сохранить цены" : "Отправить на согласование"}
        </button>
      )}
    </div>
  );
}

function ComputedCell({ packageId, clinicId }: { packageId: number; clinicId: number }) {
  const { data } = useQuery({
    queryKey: ["pkg-price", packageId, clinicId],
    queryFn: async () => (await api.get(`/api/packages/${packageId}/computed-price/${clinicId}`)).data,
  });
  return <>{data?.price != null ? `${data.price} MDL` : "—"} {data?.fixed ? <span className="tag">(фикс.)</span> : null}</>;
}
