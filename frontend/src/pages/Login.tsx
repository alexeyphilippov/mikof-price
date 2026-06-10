import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await login(email, password);
      nav("/");
    } catch {
      setErr("Неверный логин или пароль");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <h1>mikof<span style={{ color: "var(--brand)" }}>ai</span></h1>
        <div className="sub">Панель управления прейскурантом</div>
        <div className="field">
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoFocus />
        </div>
        <div className="field">
          <label>Пароль</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" />
        </div>
        <button disabled={busy} style={{ width: "100%" }}>{busy ? "Вход…" : "Войти"}</button>
        {err && <div className="err">{err}</div>}
      </form>
    </div>
  );
}
