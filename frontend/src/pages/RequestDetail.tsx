import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ChangeRequest, Ref, ROLE_NAMES, STATUS_NAMES } from "../api/client";
import { useAuth } from "../lib/auth";
import { useRefs } from "../lib/useRefs";
import EntityCard from "../components/EntityCard";

const FIELD_LABELS: Record<string, string> = {
  name_ru: "Название (RU)", name_ro: "Название (RO)", duration_min: "Длительность",
  note: "Примечание", group_id: "Группа", subgroup_id: "Подгруппа",
  executor_id: "Исполнитель", location_id: "Место", clinic_id: "Клиника",
  status: "Статус", price: "Цена", price_online: "Цена онлайн",
  price_special: "Спец. цена", price_fixed: "Фикс. цена",
};
const ENTITY_LABELS: Record<string, string> = {
  service: "Услуга", service_price: "Цена услуги", package: "Пакет",
  package_price: "Цена пакета", group: "Группа", subgroup: "Подгруппа",
  executor: "Исполнитель", location: "Место", clinic: "Клиника",
};

type ReqItem = ChangeRequest["items"][number];
const isPriceItem = (et: string) => et === "service_price" || et === "package_price";

const scalar = (raw: any, field?: string) => {
  if (raw == null) return raw;
  if (typeof raw === "object" && "v" in raw) return raw.v;
  if (field && typeof raw === "object" && field in raw) return raw[field];
  return raw;
};

const itemEditStr = (it: ReqItem): string => {
  const raw = it.r2_override_value ?? it.new_value;
  if (isPriceItem(it.entity_type)) return raw?.price != null ? String(raw.price) : "";
  const v = scalar(raw, it.field_name);
  return v != null && v !== "" ? String(v) : "";
};

const buildNewValue = (it: ReqItem, val: string): any => {
  const raw = it.new_value ?? {};
  if (isPriceItem(it.entity_type)) return { ...raw, price: val === "" ? null : Number(val) };
  return { v: val };
};

export default function RequestDetail() {
  const { id } = useParams();
  const { me } = useAuth();
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const [note, setNote] = useState("");
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [editing, setEditing] = useState(false);
  const [editItems, setEditItems] = useState<Record<number, string>>({});

  const { data: r } = useQuery({ queryKey: ["request", id], queryFn: async () => (await api.get<ChangeRequest>(`/api/requests/${id}`)).data });
  const { groups, subgroups, executors, locations, clinics } = useRefs();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["request", id] });
    qc.invalidateQueries({ queryKey: ["requests"] });
    qc.invalidateQueries({ queryKey: ["pending"] });
  };

  const act = useMutation({
    mutationFn: async (action: { url: string; body?: any }) => api.patch(`/api/requests/${id}/${action.url}`, action.body ?? {}),
    onSuccess: invalidate,
  });
  const saveEdit = useMutation({
    mutationFn: async () => {
      const items = r!.items.map((it) => ({
        entity_type: it.entity_type,
        entity_id: it.entity_id,
        field_name: it.field_name,
        old_value: it.old_value,
        new_value: buildNewValue(it, editItems[it.id] ?? itemEditStr(it)),
      }));
      return api.patch(`/api/requests/${id}`, { items });
    },
    onSuccess: () => { setEditing(false); invalidate(); },
  });
  const actErr = act.isError ? ((act.error as any)?.response?.data?.detail ?? "Не удалось выполнить действие") : "";
  const saveErr = saveEdit.isError ? ((saveEdit.error as any)?.response?.data?.detail ?? "Не удалось сохранить") : "";
  const addComment = useMutation({
    mutationFn: async () => api.post(`/api/requests/${id}/comments`, { text: comment }),
    onSuccess: () => { setComment(""); invalidate(); },
  });

  useEffect(() => {
    if (editing && r) {
      const m: Record<number, string> = {};
      for (const it of r.items) m[it.id] = itemEditStr(it);
      setEditItems(m);
    }
  }, [editing, r]);

  if (!r) return <div className="muted">Загрузка…</div>;

  const FK_LIST: Record<string, Ref[] | undefined> = {
    group_id: groups, subgroup_id: subgroups, executor_id: executors,
    location_id: locations, clinic_id: clinics,
  };
  const fmtVal = (field: string, raw: any): string => {
    const v = scalar(raw, field);
    if (v === null || v === undefined || v === "") return "—";
    const list = FK_LIST[field];
    const found = list?.find((x) => String(x.id) === String(v));
    if (found) return found.name_ru;
    if (field === "status") {
      const k = String(v).replace(/^\w+\./, "");
      return STATUS_NAMES[k] ?? k;
    }
    return String(v);
  };
  const fmtPriceItem = (it: ReqItem): string => {
    const raw = it.r2_override_value ?? it.new_value;
    if (!raw || typeof raw !== "object") return fmtVal(it.field_name, raw);
    const parts: string[] = [];
    for (const [k, label] of [["price", "Цена"], ["price_online", "Online"], ["price_special", "Спец."], ["price_fixed", "Фикс."]] as const) {
      if (raw[k] != null && raw[k] !== "") parts.push(`${label}: ${raw[k]}`);
    }
    return parts.join(", ") || "—";
  };
  const clinicName = (it: ReqItem) => {
    const raw = it.r2_override_value ?? it.new_value;
    if (!raw || typeof raw !== "object" || raw.clinic_id == null) return "—";
    return clinics?.find((c) => c.id === raw.clinic_id)?.name_ru ?? `#${raw.clinic_id}`;
  };
  const entityLabel = (it: ReqItem) => ENTITY_LABELS[it.entity_type] ?? it.entity_type;

  const renderNewCell = (it: ReqItem) => {
    const canOverride = isR2 && r.status === "pending_cfd" && it.entity_type === "service_price";
    if (canOverride) {
      return (
        <div className="row" style={{ alignItems: "center", gap: 6 }}>
          <span className="muted" style={{ flex: "0 0 auto" }}>{it.new_value?.price} →</span>
          <input type="number" style={{ maxWidth: 120 }} placeholder={String(it.new_value?.price ?? "")}
            value={overrides[it.id] ?? ""} onChange={(e) => setOverrides({ ...overrides, [it.id]: e.target.value })} />
        </div>
      );
    }
    if (editing && canEdit) {
      const val = editItems[it.id] ?? "";
      const set = (v: string) => setEditItems({ ...editItems, [it.id]: v });
      const fk = FK_LIST[it.field_name];
      if (fk) {
        return (
          <select value={val} onChange={(e) => set(e.target.value)}>
            <option value="">—</option>
            {fk.map((x) => <option key={x.id} value={x.id}>{x.name_ru}</option>)}
          </select>
        );
      }
      return (
        <input type={it.field_name === "duration_min" || isPriceItem(it.entity_type) ? "number" : "text"}
          style={{ maxWidth: 160 }} value={val} onChange={(e) => set(e.target.value)} />
      );
    }
    return isPriceItem(it.entity_type) ? fmtPriceItem(it) : fmtVal(it.field_name, it.r2_override_value ?? it.new_value);
  };

  const isR2 = me!.role === "r2";
  const isR1 = me!.role === "r1";
  const isAuthor = r.author_id === me!.id;
  const canEdit = isAuthor && (r.status === "draft" || r.status === "revision");
  const cancellable = ["draft", "revision", "pending_cfd", "pending_ceo"].includes(r.status);

  const affected = Array.from(
    new Map(r.items.filter((it) => it.entity_id).map((it) => [`${it.entity_type}:${it.entity_id}`, it])).values()
  );

  return (
    <>
      <div className="topbar">
        <h1>Заявка №{r.id}: {r.title}</h1>
        <span className={`pill ${r.status}`}>{STATUS_NAMES[r.status]}</span>
      </div>
      <div className="grid cols-3">
        <div className="card" style={{ gridColumn: "span 2" }}>
          <h3>Изменения{editing ? " — правка" : ""}</h3>
          <p className="muted" style={{ marginTop: -6 }}>
            Автор: <b>{r.author_name ?? `#${r.author_id}`}</b>
            {r.participants && r.participants.length > 0 && (
              <> · Участники: {r.participants.map((p) => `${p.name} (${ROLE_NAMES[p.role]})`).join(", ")}</>
            )}
          </p>
          {r.note && <p className="muted">{r.note}</p>}
          <table>
            <thead><tr><th>Сущность</th><th>Клиника</th><th>Поле</th><th>Было</th><th>Станет</th></tr></thead>
            <tbody>
              {r.items.map((it) => (
                <tr key={it.id}>
                  <td>{entityLabel(it)}</td>
                  <td>{isPriceItem(it.entity_type) ? clinicName(it) : "—"}</td>
                  <td>{FIELD_LABELS[it.field_name] ?? it.field_name}</td>
                  <td className="muted">{isPriceItem(it.entity_type) ? "—" : fmtVal(it.field_name, it.old_value)}</td>
                  <td>{renderNewCell(it)}</td>
                </tr>
              ))}
              {r.items.length === 0 && <tr><td colSpan={5} className="muted">Без изменений данных</td></tr>}
            </tbody>
          </table>
          {affected.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <h3>Затрагиваемые сущности</h3>
              {affected.map((it) => (
                <EntityCard key={`${it.entity_type}:${it.entity_id}`} entityType={it.entity_type} entityId={it.entity_id!} />
              ))}
            </div>
          )}

          <div style={{ marginTop: 18 }}>
            {(actErr || saveErr) && <div className="err" style={{ marginBottom: 10 }}>{String(actErr || saveErr)}</div>}
            {(isR2 && r.status === "pending_cfd") && (
              <div className="row">
                <button onClick={() => {
                  const r2_overrides: Record<number, any> = {};
                  for (const it of r.items) {
                    const v = overrides[it.id];
                    if (v !== undefined && v !== "" && it.entity_type === "service_price") {
                      r2_overrides[it.id] = { ...it.new_value, price: Number(v) };
                    }
                  }
                  act.mutate({ url: "approve", body: { note, r2_overrides: Object.keys(r2_overrides).length ? r2_overrides : null } });
                }}>Согласовать → гендиректору</button>
                <button className="danger" onClick={() => act.mutate({ url: "reject", body: { note } })}>Вернуть на доработку</button>
              </div>
            )}
            {(isR1 && r.status === "pending_ceo") && (
              <div className="row">
                <button onClick={() => act.mutate({ url: "approve", body: { note } })}>Утвердить (применить)</button>
                <button className="ghost" onClick={() => act.mutate({ url: "reject", body: { note, send_to: "r2" } })}>Вернуть финдиректору</button>
                <button className="danger" onClick={() => act.mutate({ url: "reject", body: { note, send_to: "r3" } })}>Вернуть меддиректору</button>
                <button className="danger" onClick={() => {
                  if (window.confirm("Отклонить заявку окончательно? Изменения не будут применены."))
                    act.mutate({ url: "reject", body: { note, final: true } });
                }}>Отклонить заявку</button>
              </div>
            )}
            {canEdit && editing && (
              <>
                <button disabled={saveEdit.isPending} onClick={() => saveEdit.mutate()}>Сохранить</button>
                <button className="ghost" style={{ marginLeft: 8 }} onClick={() => setEditing(false)}>Отмена</button>
              </>
            )}
            {canEdit && !editing && (
              <>
                <button onClick={() => setEditing(true)}>Редактировать</button>
                <button style={{ marginLeft: 8 }} onClick={() => act.mutate({ url: "submit" })}>Отправить на согласование</button>
              </>
            )}
            {isAuthor && cancellable && (
              <button className="danger" style={{ marginLeft: 8 }} onClick={() => {
                if (window.confirm("Отменить заявку?")) act.mutate({ url: "cancel" });
              }}>Отменить заявку</button>
            )}
            {(isR1 || isR2) && (r.status === "pending_cfd" || r.status === "pending_ceo") && (
              <div className="field" style={{ marginTop: 12 }}>
                <label htmlFor="decision-note">Комментарий к решению (необязательно)</label>
                <input id="decision-note" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <h3>История статусов</h3>
          <ul className="timeline">
            {r.history.map((h) => (
              <li key={h.id}>
                {h.from_status ? `${STATUS_NAMES[h.from_status]} → ` : ""}{STATUS_NAMES[h.to_status]}
                <div className="muted">{h.actor_name ?? `#${h.actor_id}`} · {new Date(h.created_at).toLocaleString("ru")}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Комментарии</h3>
        {r.comments.map((c) => (
          <div className="comment" key={c.id}>
            <div className="meta">{c.author_name ?? `#${c.author_id}`} · {new Date(c.created_at).toLocaleString("ru")}</div>
            {c.text}
          </div>
        ))}
        <div className="row" style={{ marginTop: 12 }}>
          <input placeholder="Написать комментарий…" value={comment} onChange={(e) => setComment(e.target.value)} />
          <button style={{ flex: "0 0 auto" }} disabled={!comment} onClick={() => addComment.mutate()}>Отправить</button>
        </div>
      </div>
    </>
  );
}
