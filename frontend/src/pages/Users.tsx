import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Me, ROLE_NAMES } from "../api/client";
import ConfirmDialog from "../components/ConfirmDialog";

const genPassword = () =>
  Array.from({ length: 12 }, () => "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 55)]).join("");

export default function Users() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["users"], queryFn: async () => (await api.get<Me[]>("/api/users")).data });
  const [form, setForm] = useState({ email: "", name: "", role: "r4", password: "" });
  const [pwTarget, setPwTarget] = useState<Me | null>(null);
  const [pwValue, setPwValue] = useState("");
  const [pwDone, setPwDone] = useState(false);

  const create = useMutation({
    mutationFn: async () => api.post("/api/users", form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setForm({ email: "", name: "", role: "r4", password: "" }); },
  });
  const toggle = useMutation({
    mutationFn: async (u: Me) => api.patch(`/api/users/${u.id}`, { is_active: !u.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
  const setPw = useMutation({
    mutationFn: async () => api.patch(`/api/users/${pwTarget!.id}`, { password: pwValue }),
    onSuccess: () => setPwDone(true),
  });

  const openPw = (u: Me) => { setPwTarget(u); setPwValue(genPassword()); setPwDone(false); };

  return (
    <>
      <div className="topbar"><h1>Пользователи</h1></div>
      <div className="grid cols-3">
        <div className="card" style={{ gridColumn: "span 2" }}>
          <table>
            <thead><tr><th>Email</th><th>Имя</th><th>Роль</th><th>Активен</th><th></th></tr></thead>
            <tbody>
              {data?.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td><td>{u.name}</td><td>{ROLE_NAMES[u.role]}</td>
                  <td><span className={`pill ${u.is_active ? "active" : "inactive"}`}>{u.is_active ? "Да" : "Нет"}</span></td>
                  <td><div className="cell-actions">
                    <button className="ghost" onClick={() => toggle.mutate(u)}>{u.is_active ? "Деактивировать" : "Активировать"}</button>
                    <button className="ghost" onClick={() => openPw(u)}>Сменить пароль</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>Новый пользователь</h3>
          <div className="field"><label>Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="field"><label>Имя</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="field"><label>Роль</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {Object.entries(ROLE_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="field"><label>Пароль</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
          <button style={{ width: "100%" }} disabled={!form.email || !form.password} onClick={() => create.mutate()}>Создать</button>
        </div>
      </div>

      {pwTarget && (
        <ConfirmDialog
          title={`Смена пароля: ${pwTarget.name}`}
          confirmLabel={pwDone ? "Готово" : "Установить пароль"}
          confirmDisabled={!pwValue || setPw.isPending}
          onCancel={() => setPwTarget(null)}
          onConfirm={() => (pwDone ? setPwTarget(null) : setPw.mutate())}
        >
          <p className="muted" style={{ fontSize: 13 }}>
            Просмотр текущего пароля невозможен — пароли хранятся в виде необратимого хеша.
            Можно задать <b>новый</b> пароль и скопировать его сейчас (после закрытия он будет недоступен).
          </p>
          <div className="field">
            <label>Новый пароль</label>
            <div className="row" style={{ gap: 6 }}>
              <input value={pwValue} onChange={(e) => { setPwValue(e.target.value); setPwDone(false); }} />
              <button className="ghost" style={{ flex: "0 0 auto" }} onClick={() => navigator.clipboard?.writeText(pwValue)}>Копировать</button>
              <button className="ghost" style={{ flex: "0 0 auto" }} onClick={() => { setPwValue(genPassword()); setPwDone(false); }}>Сгенерировать</button>
            </div>
          </div>
          {pwDone && <p style={{ color: "var(--green)" }}>Пароль установлен. Скопируйте значение выше — повторно его увидеть нельзя.</p>}
        </ConfirmDialog>
      )}
    </>
  );
}
