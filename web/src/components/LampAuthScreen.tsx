import { useEffect, useRef, useState, type FormEvent } from "react";

import { ApiError, api, setToken, type User } from "../api";
import { GoogleButton } from "./GoogleButton";

type Mode = "login" | "register";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();

/**
 * Sign-in screen built around a lamp the visitor switches on.
 *
 * Design adapted from the "lamp toggle login" concept by @code.xr on Instagram.
 * The light starts off, so the first interaction is a single obvious one — and
 * it doubles as a soft gate: nothing to fill in until you have chosen to.
 */
export function LampAuthScreen({ onSignedIn }: { onSignedIn: (user: User) => void }) {
  const [on, setOn] = useState(() => prefersReducedMotion());
  const [pulling, setPulling] = useState(false);

  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [age, setAge] = useState(9);
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Set while Google has authenticated someone we have never seen before. */
  const [pendingCredential, setPendingCredential] = useState<string | null>(null);
  const [googleAge, setGoogleAge] = useState(9);

  const firstField = useRef<HTMLInputElement>(null);
  const pullTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(pullTimer.current), []);

  function toggleLamp() {
    setPulling(true);
    window.clearTimeout(pullTimer.current);
    pullTimer.current = window.setTimeout(() => setPulling(false), 130);

    setOn((wasOn) => {
      if (!wasOn) window.setTimeout(() => firstField.current?.focus(), 420);
      return !wasOn;
    });
  }

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

  async function signInWithGoogle(credential: string, withAge?: number) {
    setBusy(true);
    setError(null);

    try {
      const result = await api.loginWithGoogle(
        withAge === undefined ? { credential } : { credential, age: withAge },
      );
      setToken(result.token);
      onSignedIn(result.user);
    } catch (e) {
      if (e instanceof ApiError && e.code === "age_required") {
        setPendingCredential(credential);
      } else {
        setError(e instanceof Error ? e.message : "Google orqali kirib bo'lmadi.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      className={`lamp-scene relative flex min-h-full flex-col items-center overflow-hidden px-4 py-10 ${on ? "lamp-on" : ""}`}
    >
      <p className="lamp-hint mb-8 text-[10px] font-medium text-white/25 uppercase sm:text-[11px]">
        {on ? "Chiroqni o'chirish uchun ipni torting" : "Ipni torting — chiroq yonadi"}
      </p>

      <div className="flex w-full max-w-4xl flex-1 flex-col items-center gap-8 md:flex-row md:items-center md:justify-center md:gap-4">
        <Lamp on={on} pulling={pulling} onToggle={toggleLamp} />

        {/* The wrapper collapses to nothing when the light is off, which lets the
            lamp sit dead centre until there is something to sit beside. */}
        <div
          className={`overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            on ? "w-[21rem] max-md:h-auto" : "w-0 max-md:h-0"
          }`}
        >
          <section
            className="lamp-card w-[21rem] rounded-3xl border border-white/10 bg-white/[0.04] p-7 backdrop-blur-xl"
            aria-hidden={!on}
            {...(!on ? { inert: "" as unknown as boolean } : {})}
          >
          {pendingCredential ? (
            <AgeStep
              age={googleAge}
              busy={busy}
              onChange={setGoogleAge}
              onCancel={() => setPendingCredential(null)}
              onConfirm={() => void signInWithGoogle(pendingCredential, googleAge)}
            />
          ) : (
            <>
              <h1 className="text-center text-2xl font-bold text-white">
                {mode === "login" ? "Xush kelibsan!" : "Keling, tanishamiz"}
              </h1>
              <p className="mt-1 mb-6 text-center text-sm text-white/40">
                {mode === "login"
                  ? "Darslaringni davom ettiramiz"
                  : "Bir daqiqada profil ochamiz"}
              </p>

              <form onSubmit={submit} className="space-y-3">
                <Field
                  ref={firstField}
                  label="Foydalanuvchi nomi"
                  value={username}
                  onChange={setUsername}
                  autoComplete="username"
                  required
                />

                {mode === "register" && (
                  <>
                    <Field
                      label="Isming"
                      value={displayName}
                      onChange={setDisplayName}
                      autoComplete="given-name"
                      required
                    />
                    <NumberField label="Yoshing" value={age} onChange={setAge} />
                  </>
                )}

                <div className="relative">
                  <Field
                    label="Parol"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={setPassword}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Parolni yashirish" : "Parolni ko'rsatish"}
                    className="absolute top-[30px] right-3 text-white/35 transition hover:text-white/70"
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </button>
                </div>

                {error && (
                  <p
                    role="alert"
                    className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-200"
                  >
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-violet-600 py-3 text-sm font-semibold tracking-wide text-white uppercase shadow-lg shadow-violet-900/40 transition hover:bg-violet-500 disabled:opacity-50"
                >
                  {busy ? "Kutib turing…" : mode === "login" ? "Kirish" : "Ro'yxatdan o'tish"}
                </button>
              </form>

              {GOOGLE_CLIENT_ID && (
                <>
                  <div className="my-5 flex items-center gap-3">
                    <span className="h-px flex-1 bg-white/10" />
                    <span className="text-xs text-white/30">yoki</span>
                    <span className="h-px flex-1 bg-white/10" />
                  </div>

                  <GoogleButton
                    clientId={GOOGLE_CLIENT_ID}
                    disabled={busy}
                    onCredential={(credential) => void signInWithGoogle(credential)}
                  />
                </>
              )}

              <button
                type="button"
                onClick={() => {
                  setMode(mode === "login" ? "register" : "login");
                  setError(null);
                }}
                className="mt-5 w-full text-center text-sm text-violet-300/80 transition hover:text-violet-200"
              >
                {mode === "login"
                  ? "Akkauntim yo'q — ro'yxatdan o'tish"
                  : "Akkauntim bor — kirish"}
              </button>
            </>
          )}
          </section>
        </div>
      </div>
    </main>
  );
}

function Lamp({
  on,
  pulling,
  onToggle,
}: {
  on: boolean;
  pulling: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="relative h-[380px] w-[320px] shrink-0 select-none sm:h-[440px]">
      {/* Light, behind the fixture. */}
      <div className="lamp-cone pointer-events-none absolute top-[74px] left-0 h-[290px] w-full sm:h-[340px]" />
      <div className="lamp-pool pointer-events-none absolute bottom-[6px] left-1/2 h-24 w-[300px] -translate-x-1/2" />

      <button
        type="button"
        onClick={onToggle}
        aria-pressed={on}
        aria-label={on ? "Chiroqni o'chirish" : "Chiroqni yoqish"}
        className="absolute inset-0 cursor-pointer rounded-3xl focus-visible:ring-2 focus-visible:ring-violet-400/70 focus-visible:outline-none"
      >
        {/* Shade */}
        <span className="lamp-metal absolute top-[56px] left-1/2 block h-3 w-40 -translate-x-1/2 rounded-t-md" />
        <span className="lamp-lip absolute top-[68px] left-1/2 block h-[3px] w-40 -translate-x-1/2 rounded-full" />

        {/* Stem and base */}
        <span className="lamp-shaft absolute top-[71px] left-1/2 block h-[280px] w-[3px] -translate-x-1/2 sm:h-[330px]" />
        <span className="lamp-metal absolute bottom-[8px] left-1/2 block h-[5px] w-24 -translate-x-1/2 rounded-full" />

        {/* Pull cord, offset from the stem like the real thing */}
        <span
          className="lamp-cord absolute top-[71px] left-[calc(50%+34px)] block"
          data-pulling={pulling}
        >
          <span className="block h-9 w-px bg-white/25" />
          <span className="lamp-knob absolute -bottom-2 -left-[3px] block h-[7px] w-[7px] rounded-full bg-white/35" />
        </span>
      </button>
    </div>
  );
}

function AgeStep({
  age,
  busy,
  onChange,
  onConfirm,
  onCancel,
}: {
  age: number;
  busy: boolean;
  onChange: (age: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div>
      <h1 className="text-center text-2xl font-bold text-white">Yoshing nechida?</h1>
      <p className="mt-1 mb-6 text-center text-sm text-white/40">
        Darslar sening yoshingga moslanadi. Google buni bizga aytmaydi.
      </p>

      <NumberField label="Yoshing" value={age} onChange={onChange} />

      <button
        type="button"
        onClick={onConfirm}
        disabled={busy}
        className="mt-5 w-full rounded-xl bg-violet-600 py-3 text-sm font-semibold tracking-wide text-white uppercase transition hover:bg-violet-500 disabled:opacity-50"
      >
        {busy ? "Kutib turing…" : "Davom etish"}
      </button>

      <button
        type="button"
        onClick={onCancel}
        className="mt-3 w-full text-center text-sm text-white/40 transition hover:text-white/70"
      >
        Orqaga
      </button>
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
  ref?: React.Ref<HTMLInputElement>;
}

function Field({ label, value, onChange, type = "text", required, autoComplete, ref }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium tracking-wide text-white/45">{label}</span>
      <input
        ref={ref}
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none transition placeholder:text-white/25 focus:border-violet-400/60 focus:bg-white/[0.07]"
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium tracking-wide text-white/45">{label}</span>
      <input
        type="number"
        min={5}
        max={16}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none transition focus:border-violet-400/60 focus:bg-white/[0.07]"
      />
    </label>
  );
}

function Eye() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOff() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2" />
      <path d="M9.9 5.2A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.2 6.7A17 17 0 0 0 2 12s3.5 7 10 7c1 0 1.9-.1 2.7-.4" />
    </svg>
  );
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}
