import type { Progress } from "../api";

export function ProgressCard({ progress }: { progress: Progress | null }) {
  if (!progress) return null;

  return (
    <section className="rounded-3xl bg-white p-6 shadow-lg shadow-brand-500/5">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">Mening natijalarim</h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Kunlik seriya" value={`${progress.streakDays} kun`} />
        <Stat label="Javoblar" value={progress.attempts} />
        <Stat label="Aniqlik" value={`${Math.round(progress.accuracy * 100)}%`} />
        <Stat label="Takrorlash" value={progress.dueNow} highlight={progress.dueNow > 0} />
      </div>

      {progress.byTopic.length > 0 && (
        <ul className="mt-5 space-y-2">
          {progress.byTopic.map((topic) => (
            <li key={topic.topic} className="flex items-center gap-3 text-sm">
              <span className="w-28 shrink-0 truncate text-slate-600">{topic.topic}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <span
                  className="block h-full rounded-full bg-emerald-500"
                  style={{ width: `${Math.round(topic.accuracy * 100)}%` }}
                />
              </span>
              <span className="w-10 shrink-0 text-right tabular-nums text-slate-500">
                {Math.round(topic.accuracy * 100)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-2xl p-3 ${highlight ? "bg-amber-50" : "bg-slate-50"}`}>
      <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
