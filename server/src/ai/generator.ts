import type { Config } from "../config.js";
import type { Topic } from "./curriculum.js";
import { OfflineLessonGenerator } from "./offline.js";
import { LESSON_JSON_SCHEMA, LessonSchema, type GeneratedLesson } from "./schemas.js";

export interface LessonGenerator {
  readonly name: string;
  generate(topic: Topic, difficulty: number, seed: number): Promise<GeneratedLesson>;
}

const SYSTEM_PROMPT = `You write short lessons for children learning in Uzbek (Latin script).

Hard requirements:
- Write ALL user-facing text in Uzbek. Keep sentences short and concrete.
- Stay strictly on the requested topic. Never introduce unrelated subjects.
- Age-appropriate only: no violence, politics, religion, romance or scary content.
- Every question must have exactly one unambiguous correct answer.
- Wrong choices must be plausible mistakes a child would actually make, never jokes.
- The explanation must teach the idea, not just restate the answer.
- Return JSON only, matching the provided schema.`;

/**
 * LLM-backed generator with a hard fallback.
 *
 * Model output for children is validated twice: structurally by Zod, then
 * semantically by `assertCoherent` (an answer index that points nowhere, or a
 * lesson that quietly drifts off topic, is worse than no lesson). A response
 * that fails either check is retried once and then abandoned in favour of the
 * offline generator, so the endpoint always returns something usable.
 */
export class OpenAILessonGenerator implements LessonGenerator {
  readonly name = "openai";
  private readonly fallback = new OfflineLessonGenerator();

  constructor(private readonly config: Config) {}

  async generate(topic: Topic, difficulty: number, seed: number): Promise<GeneratedLesson> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const lesson = await this.request(topic, difficulty);
        assertCoherent(lesson);
        return lesson;
      } catch (error) {
        if (attempt === 1) {
          console.warn(
            `[generator] falling back to offline lessons: ${(error as Error).message}`,
          );
        }
      }
    }
    return this.fallback.generate(topic, difficulty, seed);
  }

  private async request(topic: Topic, difficulty: number): Promise<GeneratedLesson> {
    const response = await fetch(`${this.config.OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: this.config.OPENAI_MODEL,
        temperature: 0.4,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content:
              `Topic: ${topic.english} (Uzbek label: "${topic.label}").\n` +
              `Subject: ${topic.subject}. Difficulty: ${difficulty} of 5.\n` +
              `Write one lesson with 3 or 4 multiple-choice questions.`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "lesson", strict: true, schema: LESSON_JSON_SCHEMA },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`model request failed (${response.status}): ${await response.text()}`);
    }

    const json = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error("model returned an empty message");

    return LessonSchema.parse(JSON.parse(content));
  }
}

/** Checks the model actually produced a usable quiz, beyond mere shape validity. */
export function assertCoherent(lesson: GeneratedLesson): void {
  for (const [i, question] of lesson.questions.entries()) {
    const unique = new Set(question.choices.map((c) => c.trim().toLowerCase()));
    if (unique.size !== question.choices.length) {
      throw new Error(`question ${i} has duplicate choices`);
    }
    if (!question.choices[question.answerIndex]) {
      throw new Error(`question ${i} has an answerIndex that points at nothing`);
    }
  }

  const prompts = new Set(lesson.questions.map((q) => q.prompt.trim().toLowerCase()));
  if (prompts.size !== lesson.questions.length) {
    throw new Error("lesson repeats the same question");
  }
}

export function createLessonGenerator(config: Config): LessonGenerator {
  return config.OPENAI_API_KEY ? new OpenAILessonGenerator(config) : new OfflineLessonGenerator();
}
