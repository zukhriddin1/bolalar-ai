import { useState, type FormEvent } from "react";

import { api, setToken, type User } from "../api";

export function AuthScreen({ onSignedIn }: { onSignedIn: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [age, setAge] = useState(9);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const result =
        mode === "login"
          ? await api.login({ username, password })
          : await api.register({ username, displayName, password, age });

      setToken(result.token);
      onSignedIn(result.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik yuz berdi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-brand-50 p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-xl shadow-brand-500/10">
        <h1 className="text-center text-3xl font-bold text-brand-700">Bolalar.AI</h1>
        <p className="mt-1 mb-6 text-center text-sm text-slate-500">
          Sen uchun maxsus tayyorlangan darslar
        </p>

        <form onSubmit={submit} className="space-y-3">
          <Field
            label="Foydalanuvchi nomi"
            value={username}
            onChange={setUsername}
            autoComplete="username"
            required
          />

          {mode === "register" && (
            <>
              <Field label="Isming" value={displayName} onChange={setDisplayName} required />
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Yoshing</span>
                <input
                  type="number"
                  min={5}
                  max={16}
                  value={age}
                  onChange={(e) => setAge(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-brand-500"
                />
              </label>
            </>
          )}

          <Field
            label="Parol"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
          />

          {error && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-brand-600 py-3 font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? "Kutib turing…" : mode === "login" ? "Kirish" : "Ro'yxatdan o'tish"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
          }}
          className="mt-4 w-full text-sm text-brand-600 hover:underline"
        >
          {mode === "login" ? "Akkauntim yo'q — ro'yxatdan o'tish" : "Akkauntim bor — kirish"}
        </button>
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  autoComplete?: string;
}

function Field({ label, value, onChange, type = "text", required, autoComplete }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-brand-500"
      />
    </label>
  );
}
