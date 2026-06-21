import type { NextFunction, Request, Response } from "express";

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window rate limiter, in process memory.
 *
 * Deliberately not a distributed limiter: this app runs as a single instance,
 * and an in-memory counter has no dependency to operate. Expired buckets are
 * swept lazily on write so the map cannot grow without bound.
 */
export function rateLimit({ windowMs, max }: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();
  let lastSweep = Date.now();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();

    if (now - lastSweep > windowMs) {
      for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
      lastSweep = now;
    }

    const key = req.ip ?? "unknown";
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      setHeaders(res, max, max - 1, now + windowMs);
      next();
      return;
    }

    bucket.count++;
    setHeaders(res, max, Math.max(0, max - bucket.count), bucket.resetAt);

    if (bucket.count > max) {
      res
        .status(429)
        .setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)))
        .json({ error: "Too many requests. Please slow down.", code: "rate_limited" });
      return;
    }

    next();
  };
}

function setHeaders(res: Response, limit: number, remaining: number, resetAt: number): void {
  res.setHeader("RateLimit-Limit", String(limit));
  res.setHeader("RateLimit-Remaining", String(remaining));
  res.setHeader("RateLimit-Reset", String(Math.ceil((resetAt - Date.now()) / 1000)));
}
