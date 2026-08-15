import type { Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { OfflineLessonGenerator } from "../src/ai/offline.js";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { openDatabase, type Db } from "../src/db/index.js";

const config = loadConfig({
  NODE_ENV: "test",
  DATABASE_PATH: ":memory:",
  JWT_SECRET: "test-secret-that-is-long-enough",
} as NodeJS.ProcessEnv);

const CHILD = { username: "aziza", displayName: "Aziza", password: "parol-12345", age: 9 };

let db: Db;
let app: Express;

beforeEach(() => {
  db = openDatabase(":memory:");
  app = createApp({ db, config, generator: new OfflineLessonGenerator() });
});

async function registerAndLogin(): Promise<string> {
  const response = await request(app).post("/api/auth/register").send(CHILD).expect(201);
  return response.body.token as string;
}

describe("health", () => {
  it("reports which generator is active", async () => {
    const response = await request(app).get("/health").expect(200);
    expect(response.body).toMatchObject({ ok: true, generator: "offline-generator" });
  });
});

describe("auth", () => {
  it("registers a child and returns a usable token", async () => {
    const token = await registerAndLogin();
    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(me.body.user).toMatchObject({ username: "aziza", displayName: "Aziza", age: 9 });
  });

  it("never returns the password hash", async () => {
    const response = await request(app).post("/api/auth/register").send(CHILD).expect(201);
    expect(JSON.stringify(response.body)).not.toMatch(/scrypt\$/);
  });

  it("rejects a duplicate username", async () => {
    await registerAndLogin();
    const response = await request(app).post("/api/auth/register").send(CHILD).expect(409);
    expect(response.body.code).toBe("conflict");
  });

  it("validates the registration payload", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({ username: "a", displayName: "", password: "short", age: 99 })
      .expect(400);

    expect(response.body.code).toBe("validation_error");
    expect(response.body.issues.length).toBeGreaterThan(2);
  });

  it("gives the same error for an unknown user and a wrong password", async () => {
    await registerAndLogin();
    const wrongUser = await request(app)
      .post("/api/auth/login")
      .send({ username: "nobody", password: "parol-12345" })
      .expect(401);
    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ username: "aziza", password: "wrong-password" })
      .expect(401);

    expect(wrongUser.body.error).toBe(wrongPassword.body.error);
  });

  it("refuses protected routes without a valid token", async () => {
    await request(app).get("/api/auth/me").expect(401);
    await request(app).get("/api/auth/me").set("Authorization", "Bearer nonsense").expect(401);
    await request(app).get("/api/auth/me").set("Authorization", "Basic abc").expect(401);
  });
});

describe("lessons", () => {
  it("lists only age-appropriate topics", async () => {
    const nine = await registerAndLogin();
    const six = await request(app)
      .post("/api/auth/register")
      .send({ ...CHILD, username: "javohir", age: 6 })
      .expect(201);

    const slugsFor = async (token: string) => {
      const response = await request(app)
        .get("/api/lessons/topics")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      return response.body.topics.map((t: { slug: string }) => t.slug) as string[];
    };

    const forNine = await slugsFor(nine);
    const forSix = await slugsFor(six.body.token);

    expect(forNine).toContain("kasrlar"); // 9-14
    expect(forSix).not.toContain("kasrlar");
    expect(forSix).toContain("qoshish"); // 5-9
    expect(forSix.length).toBeLessThan(forNine.length);
  });

  it("generates a lesson and hides the correct answers", async () => {
    const token = await registerAndLogin();
    const response = await request(app)
      .post("/api/lessons")
      .set("Authorization", `Bearer ${token}`)
      .send({ topic: "qoshish" })
      .expect(201);

    const { lesson } = response.body;
    expect(lesson.questions.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(lesson)).not.toContain("answerIndex");
    expect(lesson.questions[0]).not.toHaveProperty("answer_index");
  });

  it("rejects an unknown topic", async () => {
    const token = await registerAndLogin();
    await request(app)
      .post("/api/lessons")
      .set("Authorization", `Bearer ${token}`)
      .send({ topic: "kvant-fizika" })
      .expect(400);
  });

  it("does not leak another child's lesson", async () => {
    const tokenA = await registerAndLogin();
    const created = await request(app)
      .post("/api/lessons")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ topic: "qoshish" })
      .expect(201);

    const other = await request(app)
      .post("/api/auth/register")
      .send({ ...CHILD, username: "bekzod" })
      .expect(201);

    await request(app)
      .get(`/api/lessons/${created.body.lesson.id}`)
      .set("Authorization", `Bearer ${other.body.token}`)
      .expect(404);
  });
});

describe("answering and review scheduling", () => {
  async function setup() {
    const token = await registerAndLogin();
    const created = await request(app)
      .post("/api/lessons")
      .set("Authorization", `Bearer ${token}`)
      .send({ topic: "qoshish" })
      .expect(201);
    return { token, lesson: created.body.lesson };
  }

  it("grades a correct answer and schedules it a day out", async () => {
    const { token, lesson } = await setup();
    const question = lesson.questions[0];

    // The API hides the answer, so brute-force the four choices: exactly one
    // must be accepted, which is itself the assertion.
    const results = [];
    for (let i = 0; i < question.choices.length; i++) {
      const response = await request(app)
        .post("/api/lessons/answer")
        .set("Authorization", `Bearer ${token}`)
        .send({ questionId: question.id, chosenIndex: i, secondsTaken: 3 })
        .expect(200);
      results.push(response.body);
    }

    const correct = results.filter((r) => r.correct);
    expect(correct).toHaveLength(1);
    expect(correct[0].explanation).toBeTruthy();
    expect(correct[0].nextReview.intervalDays).toBeGreaterThanOrEqual(1);
  });

  it("re-queues a wrong answer within the session", async () => {
    const { token, lesson } = await setup();
    const question = lesson.questions[0];

    const first = await request(app)
      .post("/api/lessons/answer")
      .set("Authorization", `Bearer ${token}`)
      .send({ questionId: question.id, chosenIndex: 0 })
      .expect(200);

    const wrongIndex = first.body.correct ? (first.body.correctIndex + 1) % 4 : 0;
    const wrong = await request(app)
      .post("/api/lessons/answer")
      .set("Authorization", `Bearer ${token}`)
      .send({ questionId: question.id, chosenIndex: wrongIndex })
      .expect(200);

    expect(wrong.body.correct).toBe(false);
    expect(wrong.body.nextReview.intervalDays).toBe(0);
  });

  it("refuses to grade a question belonging to someone else", async () => {
    const { lesson } = await setup();
    const other = await request(app)
      .post("/api/auth/register")
      .send({ ...CHILD, username: "dilnoza" })
      .expect(201);

    await request(app)
      .post("/api/lessons/answer")
      .set("Authorization", `Bearer ${other.body.token}`)
      .send({ questionId: lesson.questions[0].id, chosenIndex: 0 })
      .expect(404);
  });

  it("validates the answer payload", async () => {
    const { token, lesson } = await setup();
    await request(app)
      .post("/api/lessons/answer")
      .set("Authorization", `Bearer ${token}`)
      .send({ questionId: lesson.questions[0].id, chosenIndex: 99 })
      .expect(400);
  });

  it("surfaces lapsed cards in the review queue and tracks progress", async () => {
    const { token, lesson } = await setup();
    const question = lesson.questions[0];

    const probe = await request(app)
      .post("/api/lessons/answer")
      .set("Authorization", `Bearer ${token}`)
      .send({ questionId: question.id, chosenIndex: 0 })
      .expect(200);

    // Force a lapse so the card becomes due almost immediately.
    const wrongIndex = (probe.body.correctIndex + 1) % question.choices.length;
    await request(app)
      .post("/api/lessons/answer")
      .set("Authorization", `Bearer ${token}`)
      .send({ questionId: question.id, chosenIndex: wrongIndex })
      .expect(200);

    db.prepare("UPDATE cards SET due_at = ? WHERE question_id = ?").run(
      new Date(Date.now() - 60_000).toISOString(),
      question.id,
    );

    const due = await request(app)
      .get("/api/review/due")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(due.body.due).toHaveLength(1);
    expect(due.body.due[0]).toMatchObject({ questionId: question.id, topic: "qoshish" });

    const progress = await request(app)
      .get("/api/progress")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(progress.body.attempts).toBe(2);
    expect(progress.body.dueNow).toBe(1);
    expect(progress.body.streakDays).toBe(1);
    expect(progress.body.byTopic[0]).toMatchObject({ topic: "qoshish", attempts: 2 });
  });
});

describe("changing the age", () => {
  it("re-filters the topic list", async () => {
    const token = await registerAndLogin(); // age 9

    const before = await request(app)
      .get("/api/lessons/topics")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(before.body.topics.map((t: { slug: string }) => t.slug)).toContain("kasrlar");

    const updated = await request(app)
      .patch("/api/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ age: 6 })
      .expect(200);
    expect(updated.body.user.age).toBe(6);

    const after = await request(app)
      .get("/api/lessons/topics")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const slugs = after.body.topics.map((t: { slug: string }) => t.slug);
    expect(slugs).not.toContain("kasrlar");
    expect(slugs).toContain("qoshish");
    expect(slugs.length).toBeLessThan(before.body.topics.length);
  });

  it("rejects an age outside the supported range", async () => {
    const token = await registerAndLogin();
    await request(app)
      .patch("/api/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ age: 3 })
      .expect(400);
  });

  it("requires a session", async () => {
    await request(app).patch("/api/auth/me").send({ age: 10 }).expect(401);
  });
});

describe("unknown routes", () => {
  it("returns a structured 404", async () => {
    const response = await request(app).get("/api/nope").expect(404);
    expect(response.body.code).toBe("not_found");
  });
});
