import express, { type Express } from "express";

import { createLessonGenerator, type LessonGenerator } from "./ai/generator.js";
import { createGoogleVerifier, type GoogleVerifier } from "./auth/google.js";
import type { Config } from "./config.js";
import type { Db } from "./db/index.js";
import { errorHandler, notFoundHandler } from "./http/errors.js";
import { rateLimit } from "./http/rate-limit.js";
import { authRoutes } from "./routes/auth.js";
import { lessonRoutes } from "./routes/lessons.js";
import { progressRoutes, reviewRoutes } from "./routes/review.js";

export interface AppDeps {
  db: Db;
  config: Config;
  /** Injectable so tests can run without touching a model provider. */
  generator?: LessonGenerator;
  /** Injectable so tests can sign in without talking to Google. */
  googleVerifier?: GoogleVerifier | null;
}

export function createApp({ db, config, generator, googleVerifier }: AppDeps): Express {
  const app = express();
  const lessons = generator ?? createLessonGenerator(config);
  const google = googleVerifier === undefined ? createGoogleVerifier(config) : googleVerifier;

  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));
  app.use(cors(config));

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      generator: lessons.name,
      googleSignIn: Boolean(google),
      uptime: Math.round(process.uptime()),
    });
  });

  // Generation is the only expensive endpoint, so it gets a tighter budget
  // than the read-only routes.
  app.use("/api/auth", rateLimit({ windowMs: 60_000, max: 20 }), authRoutes(db, config, google));
  app.use("/api/lessons", rateLimit({ windowMs: 60_000, max: 60 }), lessonRoutes(db, config, lessons));
  app.use("/api/review", reviewRoutes(db, config));
  app.use("/api/progress", progressRoutes(db, config));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

/** Minimal CORS: one configured origin, no wildcard with credentials. */
function cors(config: Config): express.RequestHandler {
  return (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", config.CORS_ORIGIN);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");

    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  };
}
