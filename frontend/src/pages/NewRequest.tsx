import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, Clinic, Package, Service } from "../api/client";

const SERVICE_FIELDS = [
  { key: "name_ru", label: "Название (RU)" },
  { key: "name_ro", label: "Название (RO)" },
  { key: "duration_min", label: "Длительность (мин)" },
  { key: "note", label: "Примечание" },
  { key: "status", label: "Статус (active/inactive)" },
];

const PACKAGE_FIELDS = [
  { key: "name_ru", label: "Название (RU)" },
  { key: "status", label: "Статус (active/inactive)" },
];

interface Item { entity_type: string; entity_id?: number; field_name: string; old_value: any; new_value: any; label: string }

export default function NewRequest() {
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [kind, setKind] = useState<"service" | "service_price" | "package">("service");

  const { data: services } = useQuery({ queryKey: ["services-all"], queryFn: async () => (await api.get<Service[]>("/api/services")).data });
  const { data: packages } = useQuery({ queryKey: ["packages"], queryFn: async () => (await api.get<Package[]>("/api/packages")).data });
  const { data: clinics } = useQuery({ queryKey: ["clinics"], queryFn: async () => (await api.get<Clinic[]>("/api/clinics")).data });

  const create = useMutation({
    mutationFn: async () => {
      const r = (await api.post("/api/requests", {
        title, note,
        items: items.map(({ label, ...rest }) => rest),
      })).data;
      const text = comment.trim();
      if (text) await api.post(`/api/requests/${r.id}/comments`, { text });
      return r;
    },
    onSuccess: (r: any) => nav(`/requests/${r.id}`),
  });

  return (
    <>
      <div className="topbar"><h1>Новая заявка</h1></div>
      <div className="grid cols-3">
        <div className="card" style={{ gridColumn: "span 2" }}>
          <h3>Параметры заявки</h3>
          <div className="field"><label>Заголовок</label><input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="field"><label>Описание</label><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></div>
          <div className="field"><label>Комментарий</label><textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Пояснение для согласующих (необязательно)" /></div>

          <h3 style={{ marginTop: 18 }}>Добавить изменение</h3>
          <div className="field"><label>Тип изменения</label>
            <select value={kind} onChange={(e) => setKind(e.target.value as any)}>
              <option value="service">Параметр услуги</option>
              <option value="service_price">Цена услуги (по клинике)</option>
              <option value="package">Параметр пакета</option>
            </select>
          </div>
          {kind === "service" && <ServiceItemForm services={services ?? []} onAdd={(it) => setItems([...items, it])} />}
          {kind === "service_price" && <PriceItemForm services={services ?? []} clinics={clinics ?? []} onAdd={(it) => setItems([...items, it])} />}
          {kind === "package" && <PackageItemForm packages={packages ?? []} onAdd={(it) => setItems([...items, it])} />}
        </div>

        <div className="card">
          <h3>Изменения ({items.length})</h3>
          <ul className="timeline">
            {items.map((it, i) => <li key={i}>{it.label}</li>)}
            {items.length === 0 && <li className="muted">Добавьте хотя бы одно изменение</li>}
          </ul>
          <button style={{ width: "100%", marginTop: 12 }} disabled={!title || items.length === 0} onClick={() => create.mutate()}>
            Создать черновик
          </button>
        </div>
      </div>
    </>
  );
}

function ServiceItemForm({ services, onAdd }: { services: Service[]; onAdd: (it: Item) => void }) {
  const [serviceId, setServiceId] = useState("");
  const [field, setField] = useState("name_ru");
  const [value, setValue] = useState("");

  const add = () => {
    const svc = services.find((s) => s.id === Number(serviceId));
    if (!svc) return;
    onAdd({
      entity_type: "service", entity_id: svc.id, field_name: field,
      old_value: { v: String((svc as any)[field] ?? "") }, new_value: { v: value },
      label: `Услуга ${svc.code}: ${field} → ${value}`,
    });
    setValue("");
  };

  return (
    <>
      <div className="row">
        <div><label>Услуга</label>
          <select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            <option value="">— выберите —</option>
            {services.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name_ru}</option>)}
          </select>
        </div>
        <div><label>Поле</label>
          <select value={field} onChange={(e) => setField(e.target.value)}>
            {SERVICE_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </div>
      </div>
      <div className="row" style={{ marginTop: 8, alignItems: "flex-end" }}>
        <div><label>Новое значение</label><input value={value} onChange={(e) => setValue(e.target.value)} /></div>
        <button className="ghost" style={{ flex: "0 0 auto" }} disabled={!serviceId || !value} onClick={add}>Добавить в заявку</button>
      </div>
    </>
  );
}

function PriceItemForm({ services, clinics, onAdd }: { services: Service[]; clinics: Clinic[]; onAdd: (it: Item) => void }) {
  const [serviceId, setServiceId] = useState("");
  const [clinicId, setClinicId] = useState("");
  const [price, setPrice] = useState("");
  const [priceOnline, setPriceOnline] = useState("");

  const add = () => {
    const svc = services.find((s) => s.id === Number(serviceId));
    const cln = clinics.find((c) => c.id === Number(clinicId));
    if (!svc || !cln) return;
    const payload: any = { service_id: svc.id, clinic_id: cln.id, price: Number(price) };
    if (priceOnline) payload.price_online = Number(priceOnline);
    onAdd({
      entity_type: "service_price", entity_id: svc.id, field_name: "price",
      old_value: null, new_value: payload,
      label: `Цена ${svc.code} (${cln.name_ru}): ${price} MDL`,
    });
    setPrice(""); setPriceOnline("");
  };

  return (
    <>
      <div className="row">
        <div><label>Услуга</label>
          <select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            <option value="">— выберите —</option>
            {services.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name_ru}</option>)}
          </select>
        </div>
        <div><label>Клиника</label>
          <select value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
            <option value="">— выберите —</option>
            {clinics.map((c) => <option key={c.id} value={c.id}>{c.name_ru}</option>)}
          </select>
        </div>
      </div>
      <div className="row" style={{ marginTop: 8, alignItems: "flex-end" }}>
        <div><label>Цена (MDL)</label><input type="number" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
        <div><label>Цена Online (опц.)</label><input type="number" value={priceOnline} onChange={(e) => setPriceOnline(e.target.value)} /></div>
        <button className="ghost" style={{ flex: "0 0 auto" }} disabled={!serviceId || !clinicId || !price} onClick={add}>Добавить в заявку</button>
      </div>
    </>
  );
}

function PackageItemForm({ packages, onAdd }: { packages: Package[]; onAdd: (it: Item) => void }) {
  const [packageId, setPackageId] = useState("");
  const [field, setField] = useState("name_ru");
  const [value, setValue] = useState("");

  const add = () => {
    const pkg = packages.find((p) => p.id === Number(packageId));
    if (!pkg) return;
    onAdd({
      entity_type: "package", entity_id: pkg.id, field_name: field,
      old_value: { v: String((pkg as any)[field] ?? "") }, new_value: { v: value },
      label: `Пакет ${pkg.code}: ${field} → ${value}`,
    });
    setValue("");
  };

  return (
    <>
      <div className="row">
        <div><label>Пакет</label>
          <select value={packageId} onChange={(e) => setPackageId(e.target.value)}>
            <option value="">— выберите —</option>
            {packages.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name_ru}</option>)}
          </select>
        </div>
        <div><label>Поле</label>
          <select value={field} onChange={(e) => setField(e.target.value)}>
            {PACKAGE_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </div>
      </div>
      <div className="row" style={{ marginTop: 8, alignItems: "flex-end" }}>
        <div><label>Новое значение</label><input value={value} onChange={(e) => setValue(e.target.value)} /></div>
        <button className="ghost" style={{ flex: "0 0 auto" }} disabled={!packageId || !value} onClick={add}>Добавить в заявку</button>
      </div>
    </>
  );
}
