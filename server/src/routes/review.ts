import { Router } from "express";

import type { Config } from "../config.js";
import type { Db } from "../db/index.js";
import { requireAuth, requireUser } from "../auth/tokens.js";

interface DueRow {
  id: number;
  prompt: string;
  choices_json: string;
  due_at: string;
  interval_days: number;
  topic: string;
  label: string;
}

export function reviewRoutes(db: Db, config: Config): Router {
  const router = Router();
  router.use(requireAuth(config));

  /** Cards whose `due_at` has passed, oldest first. */
  router.get("/due", (req, res) => {
    const { sub } = requireUser(req);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 10)));

    const rows = db
      .prepare(
        `SELECT q.id, q.prompt, q.choices_json, c.due_at, c.interval_days,
                l.topic, l.title AS label
         FROM cards c
         JOIN questions q ON q.id = c.question_id
         JOIN lessons  l ON l.id = q.lesson_id
         WHERE c.user_id = ? AND c.due_at <= ?
         ORDER BY c.due_at ASC
         LIMIT ?`,
      )
      .all(sub, new Date().toISOString(), limit) as DueRow[];

    res.json({
      due: rows.map((row) => ({
        questionId: row.id,
        prompt: row.prompt,
        choices: JSON.parse(row.choices_json) as string[],
        topic: row.topic,
        lessonTitle: row.label,
        dueAt: row.due_at,
        intervalDays: row.interval_days,
      })),
    });
  });

  return router;
}

export function progressRoutes(db: Db, config: Config): Router {
  const router = Router();
  router.use(requireAuth(config));

  router.get("/", (req, res) => {
    const { sub } = requireUser(req);

    const totals = db
      .prepare(
        `SELECT COUNT(*)                             AS attempts,
                COALESCE(SUM(correct), 0)            AS correct,
                COUNT(DISTINCT question_id)          AS questions
         FROM attempts WHERE user_id = ?`,
      )
      .get(sub) as { attempts: number; correct: number; questions: number };

    const byTopic = db
      .prepare(
        `SELECT l.topic,
                COUNT(*)                  AS attempts,
                COALESCE(SUM(a.correct), 0) AS correct
         FROM attempts a
         JOIN questions q ON q.id = a.question_id
         JOIN lessons   l ON l.id = q.lesson_id
         WHERE a.user_id = ?
         GROUP BY l.topic
         ORDER BY attempts DESC`,
      )
      .all(sub) as { topic: string; attempts: number; correct: number }[];

    const dueNow = db
      .prepare("SELECT COUNT(*) AS n FROM cards WHERE user_id = ? AND due_at <= ?")
      .get(sub, new Date().toISOString()) as { n: number };

    const activeDays = db
      .prepare(
        `SELECT DISTINCT date(created_at) AS day
         FROM attempts WHERE user_id = ? ORDER BY day DESC LIMIT 60`,
      )
      .all(sub) as { day: string }[];

    res.json({
      attempts: totals.attempts,
      correct: totals.correct,
      accuracy: totals.attempts === 0 ? 0 : Number((totals.correct / totals.attempts).toFixed(3)),
      questionsSeen: totals.questions,
      dueNow: dueNow.n,
      streakDays: currentStreak(activeDays.map((d) => d.day)),
      byTopic: byTopic.map((t) => ({
        topic: t.topic,
        attempts: t.attempts,
        correct: t.correct,
        accuracy: Number((t.correct / t.attempts).toFixed(3)),
      })),
    });
  });

  return router;
}

/**
 * Consecutive days of practice, counting back from today.
 * A gap of one day is tolerated at the start so a child who has not practised
 * *yet today* does not see their streak reset before the day is over.
 */
export function currentStreak(days: string[], today = new Date()): number {
  if (days.length === 0) return 0;

  const set = new Set(days);
  let streak = 0;
  const cursor = new Date(today);

  if (!set.has(iso(cursor))) cursor.setDate(cursor.getDate() - 1);

  while (set.has(iso(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}
