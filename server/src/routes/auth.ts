import { Router } from "express";
import { z } from "zod";

import type { Config } from "../config.js";
import type { Db } from "../db/index.js";
import { HttpError, asyncHandler } from "../http/errors.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { signToken, requireAuth, requireUser } from "../auth/tokens.js";

const RegisterSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(24)
    .regex(/^[a-z0-9_]+$/i, "Username may contain letters, digits and underscores only."),
  displayName: z.string().min(1).max(40),
  password: z.string().min(8).max(128),
  age: z.number().int().min(5).max(16),
});

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

interface UserRow {
  id: number;
  username: string;
  display_name: string;
  password_hash: string;
  age: number;
}

export function authRoutes(db: Db, config: Config): Router {
  const router = Router();

  router.post(
    "/register",
    asyncHandler(async (req, res) => {
      const { username, displayName, password, age } = RegisterSchema.parse(req.body);

      const existing = db
        .prepare("SELECT id FROM users WHERE username = ?")
        .get(username) as { id: number } | undefined;
      if (existing) throw HttpError.conflict("That username is already taken.");

      const passwordHash = await hashPassword(password);
      const { lastInsertRowid } = db
        .prepare(
          "INSERT INTO users (username, display_name, password_hash, age) VALUES (?, ?, ?, ?)",
        )
        .run(username, displayName, passwordHash, age);

      const id = Number(lastInsertRowid);
      res.status(201).json({
        token: signToken({ sub: id, username }, config),
        user: { id, username, displayName, age },
      });
    }),
  );

  router.post(
    "/login",
    asyncHandler(async (req, res) => {
      const { username, password } = LoginSchema.parse(req.body);
      const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as
        | UserRow
        | undefined;

      // Same message and roughly the same work either way, so the response does
      // not reveal whether the username exists.
      const ok = user ? await verifyPassword(password, user.password_hash) : false;
      if (!user || !ok) throw HttpError.unauthorized("Incorrect username or password.");

      res.json({
        token: signToken({ sub: user.id, username: user.username }, config),
        user: {
          id: user.id,
          username: user.username,
          displayName: user.display_name,
          age: user.age,
        },
      });
    }),
  );

  router.get("/me", requireAuth(config), (req, res) => {
    const { sub } = requireUser(req);
    const user = db
      .prepare("SELECT id, username, display_name, age FROM users WHERE id = ?")
      .get(sub) as { id: number; username: string; display_name: string; age: number } | undefined;

    if (!user) throw HttpError.unauthorized();
    res.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        age: user.age,
      },
    });
  });

  return router;
}
