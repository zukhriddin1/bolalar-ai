import { useState } from "react";

import { api, type User } from "../api";

/**
 * Shows the child's age and lets them change it.
 *
 * The topic list is filtered by age, so a child who picked the wrong number at
 * sign-up sees a short list with no explanation and no way out. This makes the
 * cause visible and fixable in two clicks.
 */
export function AgeBadge({ user, onChanged }: { user: User; onChanged: (user: User) => void }) {
  const [editing, setEditing] = useState(false);
  const [age, setAge] = useState(user.age);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (age === user.age) {
      setEditing(false);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { user: updated } = await api.updateAge(age);
      onChanged(updated);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Saqlab bo'lmadi.");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setAge(user.age);
          setEditing(true);
        }}
        className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 transition hover:bg-brand-100"
        title="Mavzular yoshingga qarab tanlanadi"
      >
        {user.age} yosh · o'zgartirish
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-2 text-xs text-slate-500">
        Yoshim
        <input
          type="number"
          min={5}
          max={16}
          value={age}
          autoFocus
          onChange={(e) => setAge(Number(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-900"
        />
      </label>

      <button
        type="button"
        onClick={() => void save()}
        disabled={busy}
        className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {busy ? "…" : "Saqlash"}
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="text-xs text-slate-400 hover:text-slate-600"
      >
        Bekor
      </button>

      {error && (
        <span role="alert" className="text-xs text-red-600">
          {error}
        </span>
      )}
    </div>
  );
}
