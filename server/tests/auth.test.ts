import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "../src/auth/password.js";
import { currentStreak } from "../src/routes/review.js";

describe("password hashing", () => {
  it("verifies the right password", async () => {
    const stored = await hashPassword("olma-daraxti-2026");
    expect(await verifyPassword("olma-daraxti-2026", stored)).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const stored = await hashPassword("olma-daraxti-2026");
    expect(await verifyPassword("olma-daraxti-2027", stored)).toBe(false);
  });

  it("salts, so identical passwords hash differently", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same-password", a)).toBe(true);
    expect(await verifyPassword("same-password", b)).toBe(true);
  });

  it("refuses malformed stored hashes instead of throwing", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$aa$bb")).toBe(false);
    expect(await verifyPassword("x", "scrypt$onlyonepart")).toBe(false);
  });
});

describe("currentStreak", () => {
  const today = new Date("2026-03-10T12:00:00.000Z");

  it("is zero with no activity", () => {
    expect(currentStreak([], today)).toBe(0);
  });

  it("counts consecutive days ending today", () => {
    expect(currentStreak(["2026-03-10", "2026-03-09", "2026-03-08"], today)).toBe(3);
  });

  it("still counts a streak that ended yesterday", () => {
    expect(currentStreak(["2026-03-09", "2026-03-08"], today)).toBe(2);
  });

  it("stops at the first gap", () => {
    expect(currentStreak(["2026-03-10", "2026-03-08", "2026-03-07"], today)).toBe(1);
  });

  it("ignores activity older than the break", () => {
    expect(currentStreak(["2026-01-01"], today)).toBe(0);
  });
});
