import { z } from "zod";

/**
 * The contract the model must satisfy.
 *
 * The same schema is used three ways: to build the JSON-schema sent to the
 * model, to validate whatever comes back, and to type the rest of the app.
 * A model response that fails validation is retried, then falls back to the
 * offline generator — the API never returns half-parsed model output.
 */
export const QuestionSchema = z.object({
  prompt: z.string().min(5).max(300),
  choices: z.array(z.string().min(1).max(200)).min(2).max(4),
  answerIndex: z.number().int().min(0),
  explanation: z.string().min(5).max(500),
});

export const LessonSchema = z
  .object({
    title: z.string().min(3).max(120),
    explanation: z.string().min(20).max(2000),
    example: z.string().min(5).max(1000),
    questions: z.array(QuestionSchema).min(2).max(6),
  })
  .refine((lesson) => lesson.questions.every((q) => q.answerIndex < q.choices.length), {
    message: "answerIndex must point at an existing choice",
    path: ["questions"],
  });

export type GeneratedQuestion = z.infer<typeof QuestionSchema>;
export type GeneratedLesson = z.infer<typeof LessonSchema>;

/** JSON Schema handed to the model via `response_format`. */
export const LESSON_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "explanation", "example", "questions"],
  properties: {
    title: { type: "string" },
    explanation: { type: "string" },
    example: { type: "string" },
    questions: {
      type: "array",
      minItems: 2,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["prompt", "choices", "answerIndex", "explanation"],
        properties: {
          prompt: { type: "string" },
          choices: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
          answerIndex: { type: "integer" },
          explanation: { type: "string" },
        },
      },
    },
  },
} as const;
