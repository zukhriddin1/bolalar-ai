import { describe, expect, it } from "vitest";

import { TOPICS, difficultyForAge, findTopic, topicsForAge } from "../src/ai/curriculum.js";
import { assertCoherent } from "../src/ai/generator.js";
import { OfflineLessonGenerator, mulberry32 } from "../src/ai/offline.js";
import { LessonSchema } from "../src/ai/schemas.js";

const generator = new OfflineLessonGenerator();

describe("curriculum", () => {
  it("finds topics by slug", () => {
    expect(findTopic("qoshish")?.subject).toBe("matematika");
    expect(findTopic("nope")).toBeUndefined();
  });

  it("filters topics by age and never returns an empty list", () => {
    expect(topicsForAge(6).every((t) => 6 >= t.minAge && 6 <= t.maxAge)).toBe(true);
    expect(topicsForAge(99).length).toBe(TOPICS.length);
  });

  it("maps age onto a 1-5 difficulty band", () => {
    const topic = findTopic("kopaytirish")!;
    expect(difficultyForAge(topic.minAge, topic)).toBe(1);
    expect(difficultyForAge(topic.maxAge, topic)).toBe(5);
    expect(difficultyForAge(topic.maxAge + 20, topic)).toBe(5);
    expect(difficultyForAge(topic.minAge - 20, topic)).toBe(1);
  });
});

describe("OfflineLessonGenerator", () => {
  it("produces a schema-valid, coherent lesson for every topic", async () => {
    for (const topic of TOPICS) {
      const lesson = await generator.generate(topic, 3, 42);
      expect(() => LessonSchema.parse(lesson)).not.toThrow();
      expect(() => assertCoherent(lesson)).not.toThrow();
    }
  });

  it("computes arithmetic answers correctly rather than sampling them", async () => {
    for (const slug of ["qoshish", "ayirish", "kopaytirish"]) {
      const lesson = await generator.generate(findTopic(slug)!, 4, 7);

      for (const question of lesson.questions) {
        const [, a, op, b] = /^(\d+) ([+\-×]) (\d+) = \?$/.exec(question.prompt)!;
        const expected = op === "+" ? +a! + +b! : op === "-" ? +a! - +b! : +a! * +b!;
        expect(question.choices[question.answerIndex]).toBe(String(expected));
        expect(expected).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("is deterministic for a given seed and varies across seeds", async () => {
    const topic = findTopic("qoshish")!;
    const a = await generator.generate(topic, 3, 100);
    const b = await generator.generate(topic, 3, 100);
    const c = await generator.generate(topic, 3, 101);

    expect(a).toEqual(b);
    expect(a.questions.map((q) => q.prompt)).not.toEqual(c.questions.map((q) => q.prompt));
  });

  it("does not put the correct answer in the same slot every time", async () => {
    const topic = findTopic("sayyoralar")!;
    const positions = new Set<number>();
    for (let seed = 0; seed < 12; seed++) {
      const lesson = await generator.generate(topic, 3, seed);
      lesson.questions.forEach((q) => positions.add(q.answerIndex));
    }
    expect(positions.size).toBeGreaterThan(1);
  });

  it("never repeats a question inside one lesson", async () => {
    for (const topic of TOPICS) {
      const lesson = await generator.generate(topic, 5, 3);
      const prompts = lesson.questions.map((q) => q.prompt);
      expect(new Set(prompts).size).toBe(prompts.length);
    }
  });
});

describe("assertCoherent", () => {
  const base = {
    title: "Test",
    explanation: "A".repeat(30),
    example: "Example text",
    questions: [
      { prompt: "2 + 2 = ?", choices: ["4", "5"], answerIndex: 0, explanation: "It is four." },
      { prompt: "3 + 3 = ?", choices: ["6", "7"], answerIndex: 0, explanation: "It is six." },
    ],
  };

  it("accepts a well-formed lesson", () => {
    expect(() => assertCoherent(base)).not.toThrow();
  });

  it("rejects duplicate choices", () => {
    const lesson = structuredClone(base);
    lesson.questions[0]!.choices = ["4", "4"];
    expect(() => assertCoherent(lesson)).toThrow(/duplicate choices/);
  });

  it("rejects an answerIndex that points at nothing", () => {
    const lesson = structuredClone(base);
    lesson.questions[0]!.answerIndex = 9;
    expect(() => assertCoherent(lesson)).toThrow(/points at nothing/);
  });

  it("rejects a repeated question", () => {
    const lesson = structuredClone(base);
    lesson.questions[1]!.prompt = lesson.questions[0]!.prompt;
    expect(() => assertCoherent(lesson)).toThrow(/repeats the same question/);
  });
});

describe("mulberry32", () => {
  it("returns reproducible values in [0, 1)", () => {
    const a = mulberry32(1);
    const b = mulberry32(1);
    for (let i = 0; i < 100; i++) {
      const value = a();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(value).toBe(b());
    }
  });
});
