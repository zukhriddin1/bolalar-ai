import { Router } from "express";
import { z } from "zod";

import type { Config } from "../config.js";
import type { Db } from "../db/index.js";
import type { LessonGenerator } from "../ai/generator.js";
import { difficultyForAge, findTopic, topicsForAge } from "../ai/curriculum.js";
import { HttpError, asyncHandler } from "../http/errors.js";
import { requireAuth, requireUser } from "../auth/tokens.js";
import { INITIAL_STATE, gradeFromAnswer, review } from "../domain/sm2.js";

const CreateLessonSchema = z.object({
  topic: z.string().min(1),
  /** Optional override; otherwise derived from the child's age. */
  difficulty: z.number().int().min(1).max(5).optional(),
});

const AnswerSchema = z.object({
  questionId: z.number().int().positive(),
  chosenIndex: z.number().int().min(0).max(3),
  secondsTaken: z.number().min(0).max(3600).optional(),
  hintUsed: z.boolean().optional().default(false),
});

interface QuestionRow {
  id: number;
  lesson_id: number;
  position: number;
  prompt: string;
  choices_json: string;
  answer_index: number;
  explanation: string;
}

export function lessonRoutes(db: Db, config: Config, generator: LessonGenerator): Router {
  const router = Router();
  router.use(requireAuth(config));

  /** Topics suitable for the signed-in child. */
  router.get("/topics", (req, res) => {
    const { sub } = requireUser(req);
    const user = db.prepare("SELECT age FROM users WHERE id = ?").get(sub) as
      | { age: number }
      | undefined;
    if (!user) throw HttpError.unauthorized();

    res.json({
      topics: topicsForAge(user.age).map((t) => ({
        slug: t.slug,
        label: t.label,
        subject: t.subject,
      })),
    });
  });

  /** Generates and stores a new lesson. */
  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const { sub } = requireUser(req);
      const { topic: slug, difficulty: override } = CreateLessonSchema.parse(req.body);

      const topic = findTopic(slug);
      if (!topic) throw HttpError.badRequest(`Unknown topic: ${slug}`);

      const user = db.prepare("SELECT age FROM users WHERE id = ?").get(sub) as
        | { age: number }
        | undefined;
      if (!user) throw HttpError.unauthorized();

      const difficulty = override ?? difficultyForAge(user.age, topic);
      // Seeding on user + topic + day keeps a child's lesson stable if they
      // reload the page, but gives them a fresh one tomorrow.
      const seed = hashSeed(`${sub}:${slug}:${new Date().toISOString().slice(0, 10)}`);
      const generated = await generator.generate(topic, difficulty, seed);

      const lessonId = db.transaction(() => {
        const { lastInsertRowid } = db
          .prepare(
            `INSERT INTO lessons (user_id, topic, subject, difficulty, title, explanation, example, generated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            sub,
            topic.slug,
            topic.subject,
            difficulty,
            generated.title,
            generated.explanation,
            generated.example,
            generator.name,
          );

        const id = Number(lastInsertRowid);
        const insertQuestion = db.prepare(
          `INSERT INTO questions (lesson_id, position, prompt, choices_json, answer_index, explanation)
           VALUES (?, ?, ?, ?, ?, ?)`,
        );
        generated.questions.forEach((question, position) => {
          insertQuestion.run(
            id,
            position,
            question.prompt,
            JSON.stringify(question.choices),
            question.answerIndex,
            question.explanation,
          );
        });
        return id;
      })();

      res.status(201).json({ lesson: loadLesson(db, lessonId, sub) });
    }),
  );

  router.get("/", (req, res) => {
    const { sub } = requireUser(req);
    const rows = db
      .prepare(
        `SELECT id, topic, subject, difficulty, title, created_at
         FROM lessons WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 50`,
      )
      .all(sub);
    res.json({ lessons: rows });
  });

  router.get("/:id", (req, res) => {
    const { sub } = requireUser(req);
    res.json({ lesson: loadLesson(db, Number(req.params.id), sub) });
  });

  /**
   * Grades one answer and schedules the card.
   *
   * The correct index is never sent to the client with the question, so the
   * only place grading can happen is here.
   */
  router.post(
    "/answer",
    asyncHandler(async (req, res) => {
      const { sub } = requireUser(req);
      const { questionId, chosenIndex, secondsTaken, hintUsed } = AnswerSchema.parse(req.body);

      const question = db
        .prepare(
          `SELECT q.* FROM questions q
           JOIN lessons l ON l.id = q.lesson_id
           WHERE q.id = ? AND l.user_id = ?`,
        )
        .get(questionId, sub) as QuestionRow | undefined;
      if (!question) throw HttpError.notFound("Question not found.");

      const correct = chosenIndex === question.answer_index;
      const quality = gradeFromAnswer({ correct, secondsTaken, hintUsed });

      const card = db
        .prepare("SELECT * FROM cards WHERE user_id = ? AND question_id = ?")
        .get(sub, questionId) as
        | { repetitions: number; interval_days: number; ease_factor: number }
        | undefined;

      const outcome = review(
        card
          ? {
              repetitions: card.repetitions,
              intervalDays: card.interval_days,
              easeFactor: card.ease_factor,
            }
          : INITIAL_STATE,
        quality,
      );

      db.transaction(() => {
        db.prepare(
          `INSERT INTO attempts (user_id, question_id, chosen_index, correct, seconds_taken, hint_used, quality)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(sub, questionId, chosenIndex, correct ? 1 : 0, secondsTaken ?? null, hintUsed ? 1 : 0, quality);

        db.prepare(
          `INSERT INTO cards (user_id, question_id, repetitions, interval_days, ease_factor, due_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (user_id, question_id) DO UPDATE SET
             repetitions   = excluded.repetitions,
             interval_days = excluded.interval_days,
             ease_factor   = excluded.ease_factor,
             due_at        = excluded.due_at`,
        ).run(
          sub,
          questionId,
          outcome.repetitions,
          outcome.intervalDays,
          outcome.easeFactor,
          outcome.dueAt.toISOString(),
        );
      })();

      res.json({
        correct,
        correctIndex: question.answer_index,
        explanation: question.explanation,
        nextReview: { dueAt: outcome.dueAt.toISOString(), intervalDays: outcome.intervalDays },
      });
    }),
  );

  return router;
}

export function loadLesson(db: Db, lessonId: number, userId: number) {
  const lesson = db.prepare("SELECT * FROM lessons WHERE id = ? AND user_id = ?").get(
    lessonId,
    userId,
  ) as
    | {
        id: number;
        topic: string;
        subject: string;
        difficulty: number;
        title: string;
        explanation: string;
        example: string;
        generated_by: string;
        created_at: string;
      }
    | undefined;

  if (!lesson) throw HttpError.notFound("Lesson not found.");

  const questions = db
    .prepare("SELECT * FROM questions WHERE lesson_id = ? ORDER BY position")
    .all(lessonId) as QuestionRow[];

  return {
    id: lesson.id,
    topic: lesson.topic,
    subject: lesson.subject,
    difficulty: lesson.difficulty,
    title: lesson.title,
    explanation: lesson.explanation,
    example: lesson.example,
    generatedBy: lesson.generated_by,
    createdAt: lesson.created_at,
    // answer_index deliberately omitted — grading happens server-side only.
    questions: questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      choices: JSON.parse(q.choices_json) as string[],
    })),
  };
}

function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
