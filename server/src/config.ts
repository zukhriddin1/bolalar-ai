import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  /** `:memory:` keeps tests hermetic. */
  DATABASE_PATH: z.string().default("./data/bolalar.db"),
  JWT_SECRET: z.string().min(16).default("dev-secret-change-me-in-production"),
  JWT_TTL: z.string().default("7d"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),

  /** Google OAuth client ID. Sign-in with Google is disabled when unset. */
  GOOGLE_CLIENT_ID: z.string().optional(),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_BASE_URL: z.string().default("https://api.openai.com/v1"),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  if (parsed.data.NODE_ENV === "production" && parsed.data.JWT_SECRET.startsWith("dev-secret")) {
    throw new Error("JWT_SECRET must be set to a real secret in production.");
  }

  return parsed.data;
}
