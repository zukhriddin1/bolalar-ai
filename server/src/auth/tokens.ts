import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";

import type { Config } from "../config.js";
import { HttpError } from "../http/errors.js";

export interface TokenPayload {
  sub: number;
  username: string;
}

export function signToken(payload: TokenPayload, config: Config): string {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_TTL as jwt.SignOptions["expiresIn"],
  });
}

/**
 * Bearer-token guard.
 *
 * Every failure returns the same 401 regardless of cause: distinguishing
 * "malformed" from "expired" from "wrong signature" tells an attacker which
 * knob to turn next.
 */
export function requireAuth(config: Config) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.header("authorization") ?? "";
    const [scheme, token] = header.split(" ");

    if (scheme?.toLowerCase() !== "bearer" || !token) {
      next(HttpError.unauthorized());
      return;
    }

    try {
      const decoded = jwt.verify(token, config.JWT_SECRET) as unknown as TokenPayload;
      req.user = { sub: decoded.sub, username: decoded.username };
      next();
    } catch {
      next(HttpError.unauthorized("Session expired or invalid. Please sign in again."));
    }
  };
}

/** Reads the authenticated user, asserting `requireAuth` ran first. */
export function requireUser(req: Request): TokenPayload {
  if (!req.user) throw HttpError.unauthorized();
  return req.user;
}
