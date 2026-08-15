import { useCallback, useEffect, useState } from "react";

import { api, setToken, type Lesson, type Progress, type Topic, type User } from "./api";
import { LampAuthScreen } from "./components/LampAuthScreen";
import { ProgressCard } from "./components/ProgressCard";
import { Quiz } from "./components/Quiz";

type View =
  | { name: "topics" }
  | { name: "lesson"; lesson: Lesson }
  | { name: "done"; correct: number; total: number };

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [view, setView] = useState<View>({ name: "topics" });
  const [loadingTopic, setLoadingTopic] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    const [topicList, stats] = await Promise.all([api.topics(), api.progress()]);
    setTopics(topicList.topics);
    setProgress(stats);
  }, []);

  // Restores the session on reload: the token lives in sessionStorage, but the
  // user record always comes from the server so a stale token cannot fake one.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const { user: me } = await api.me();
        if (cancelled) return;
        setUser(me);
        await loadDashboard();
      } catch {
        setToken(null);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadDashboard]);

  async function signedIn(me: User) {
    setUser(me);
    await loadDashboard();
  }

  async function startLesson(slug: string) {
    setLoadingTopic(slug);
    setError(null);
    try {
      const { lesson } = await api.createLesson(slug);
      setView({ name: "lesson", lesson });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Darsni yuklab bo'lmadi.");
    } finally {
      setLoadingTopic(null);
    }
  }

  if (checking) {
    return <div className="grid h-full place-items-center text-slate-400">Yuklanmoqda…</div>;
  }

  if (!user) return <LampAuthScreen onSignedIn={signedIn} />;

  return (
    <div className="min-h-full bg-brand-50">
      <header className="border-b border-brand-100 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold text-brand-700">Bolalar.AI</h1>
            <p className="text-sm text-slate-500">Salom, {user.displayName}!</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setToken(null);
              setUser(null);
            }}
            className="rounded-xl px-3 py-2 text-sm text-slate-500 hover:bg-slate-100"
          >
            Chiqish
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {view.name === "topics" && (
          <>
            <ProgressCard progress={progress} />

            <section className="rounded-3xl bg-white p-6 shadow-lg shadow-brand-500/5">
              <h2 className="mb-1 text-lg font-semibold text-slate-900">
                Bugun nimani o'rganamiz?
              </h2>
              <p className="mb-4 text-sm text-slate-500">
                Mavzuni tanla — dars va test sen uchun tayyorlanadi.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                {topics.map((topic) => (
                  <button
                    key={topic.slug}
                    type="button"
                    disabled={loadingTopic !== null}
                    onClick={() => void startLesson(topic.slug)}
                    className="rounded-2xl border-2 border-slate-200 px-4 py-4 text-left transition hover:border-brand-400 hover:bg-brand-50 disabled:opacity-50"
                  >
                    <span className="block text-lg font-semibold text-slate-900">
                      {topic.label}
                    </span>
                    <span className="text-xs text-slate-500">
                      {loadingTopic === topic.slug ? "Tayyorlanmoqda…" : topic.subject}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        {view.name === "lesson" && (
          <>
            <section className="rounded-3xl bg-white p-6 shadow-lg shadow-brand-500/5">
              <h2 className="text-xl font-bold text-slate-900">{view.lesson.title}</h2>
              <p className="mt-3 leading-relaxed text-slate-700">{view.lesson.explanation}</p>
              <p className="mt-3 rounded-2xl bg-brand-50 p-4 text-slate-800">
                {view.lesson.example}
              </p>
            </section>

            <Quiz
              questions={view.lesson.questions}
              onFinished={(score) => {
                setView({ name: "done", ...score });
                void loadDashboard();
              }}
            />
          </>
        )}

        {view.name === "done" && (
          <section className="rounded-3xl bg-white p-8 text-center shadow-lg shadow-brand-500/5">
            <p className="text-5xl">{view.correct === view.total ? "🏆" : "💪"}</p>
            <h2 className="mt-3 text-2xl font-bold text-slate-900">
              {view.correct} / {view.total} to'g'ri
            </h2>
            <p className="mt-2 text-slate-500">
              {view.correct === view.total
                ? "Hammasi to'g'ri! Zo'r ish."
                : "Xato qilgan savollaringni yana takrorlaymiz — shunda esda qoladi."}
            </p>
            <button
              type="button"
              onClick={() => setView({ name: "topics" })}
              className="mt-6 rounded-xl bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700"
            >
              Bosh sahifaga qaytish
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
