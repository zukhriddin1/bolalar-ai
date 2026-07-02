import { useState } from "react";

import { api, type AnswerResult, type Question } from "../api";

interface Props {
  questions: Question[];
  onFinished: (score: { correct: number; total: number }) => void;
}

export function Quiz({ questions, onFinished }: Props) {
  const [index, setIndex] = useState(0);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const question = questions[index];
  if (!question) return null;

  async function choose(choiceIndex: number) {
    if (result || busy || !question) return;
    setBusy(true);
    setChosen(choiceIndex);

    try {
      const answer = await api.answer({
        questionId: question.id,
        chosenIndex: choiceIndex,
        secondsTaken: (Date.now() - startedAt) / 1000,
      });
      setResult(answer);
      if (answer.correct) setScore((s) => s + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Javobni yuborib bo'lmadi.");
      setChosen(null);
    } finally {
      setBusy(false);
    }
  }

  function next() {
    if (index + 1 >= questions.length) {
      onFinished({ correct: score, total: questions.length });
      return;
    }
    setIndex(index + 1);
    setResult(null);
    setChosen(null);
    setStartedAt(Date.now());
  }

  return (
    <section className="rounded-3xl bg-white p-6 shadow-lg shadow-brand-500/5">
      <div className="mb-4 flex items-center justify-between text-sm text-slate-500">
        <span>
          Savol {index + 1} / {questions.length}
        </span>
        <span aria-live="polite">To'g'ri javoblar: {score}</span>
      </div>

      <div
        className="mb-5 h-2 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuenow={index + 1}
        aria-valuemin={1}
        aria-valuemax={questions.length}
      >
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-300"
          style={{ width: `${((index + (result ? 1 : 0)) / questions.length) * 100}%` }}
        />
      </div>

      <h3 className="mb-5 text-xl font-semibold text-slate-900">{question.prompt}</h3>

      <div className="grid gap-3 sm:grid-cols-2">
        {question.choices.map((choice, i) => (
          <button
            key={choice}
            type="button"
            disabled={Boolean(result) || busy}
            onClick={() => void choose(i)}
            className={`rounded-2xl border-2 px-4 py-4 text-left text-lg font-medium transition ${styleFor(
              i,
              chosen,
              result,
            )}`}
          >
            {choice}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {result && (
        <div
          className={`mt-5 rounded-2xl p-4 ${
            result.correct ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"
          }`}
        >
          <p className="font-semibold">
            {result.correct ? "Barakalla! To'g'ri javob." : "Deyarli! Keling, birga ko'ramiz."}
          </p>
          <p className="mt-1 text-sm">{result.explanation}</p>
          <p className="mt-2 text-xs opacity-70">
            {result.nextReview.intervalDays === 0
              ? "Bu savolni bugun yana takrorlaymiz."
              : `Keyingi takrorlash: ${result.nextReview.intervalDays} kundan keyin.`}
          </p>

          <button
            type="button"
            onClick={next}
            className="mt-4 rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700"
          >
            {index + 1 >= questions.length ? "Yakunlash" : "Keyingi savol"}
          </button>
        </div>
      )}
    </section>
  );
}

function styleFor(index: number, chosen: number | null, result: AnswerResult | null): string {
  if (!result) {
    return chosen === index
      ? "border-brand-500 bg-brand-50"
      : "border-slate-200 hover:border-brand-400 hover:bg-brand-50";
  }
  if (index === result.correctIndex) return "border-emerald-500 bg-emerald-50 text-emerald-900";
  if (index === chosen) return "border-red-400 bg-red-50 text-red-900";
  return "border-slate-200 opacity-60";
}
