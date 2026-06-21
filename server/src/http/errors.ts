import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

/** An error that is safe to show the client, with an intended status code. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = "error",
  ) {
    super(message);
    this.name = "HttpError";
  }

  static badRequest(message: string) {
    return new HttpError(400, message, "bad_request");
  }
  static unauthorized(message = "Authentication required.") {
    return new HttpError(401, message, "unauthorized");
  }
  static forbidden(message = "Not allowed.") {
    return new HttpError(403, message, "forbidden");
  }
  static notFound(message = "Not found.") {
    return new HttpError(404, message, "not_found");
  }
  static conflict(message: string) {
    return new HttpError(409, message, "conflict");
  }
}

/** Wraps an async handler so rejected promises reach the error middleware. */
export function asyncHandler<T extends Request>(
  handler: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: T, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: "Route not found.", code: "not_found" });
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed.",
      code: "validation_error",
      issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message, code: error.code });
    return;
  }

  // Anything unrecognised is a bug: log it in full, tell the client nothing.
  console.error("[unhandled]", error);
  res.status(500).json({ error: "Internal server error.", code: "internal_error" });
}
