/** Typed client for the Bolalar.AI API. */

export interface User {
  id: number;
  username: string;
  displayName: string;
  age: number;
}

export interface Topic {
  slug: string;
  label: string;
  subject: string;
}

export interface Question {
  id: number;
  prompt: string;
  choices: string[];
}

export interface Lesson {
  id: number;
  topic: string;
  subject: string;
  difficulty: number;
  title: string;
  explanation: string;
  example: string;
  generatedBy: string;
  questions: Question[];
}

export interface AnswerResult {
  correct: boolean;
  correctIndex: number;
  explanation: string;
  nextReview: { dueAt: string; intervalDays: number };
}

export interface Progress {
  attempts: number;
  correct: number;
  accuracy: number;
  questionsSeen: number;
  dueNow: number;
  streakDays: number;
  byTopic: { topic: string; attempts: number; correct: number; accuracy: number }[];
}

export interface DueCard {
  questionId: number;
  prompt: string;
  choices: string[];
  topic: string;
  lessonTitle: string;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const TOKEN_KEY = "bolalar.token";

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(response.status, body.error ?? `So'rov muvaffaqiyatsiz (${response.status})`);
  }

  return (await response.json()) as T;
}

export const api = {
  register: (input: { username: string; displayName: string; password: string; age: number }) =>
    call<{ token: string; user: User }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  login: (input: { username: string; password: string }) =>
    call<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  me: () => call<{ user: User }>("/auth/me"),

  topics: () => call<{ topics: Topic[] }>("/lessons/topics"),

  createLesson: (topic: string) =>
    call<{ lesson: Lesson }>("/lessons", { method: "POST", body: JSON.stringify({ topic }) }),

  answer: (input: {
    questionId: number;
    chosenIndex: number;
    secondsTaken?: number;
    hintUsed?: boolean;
  }) => call<AnswerResult>("/lessons/answer", { method: "POST", body: JSON.stringify(input) }),

  progress: () => call<Progress>("/progress"),

  due: () => call<{ due: DueCard[] }>("/review/due"),
};
