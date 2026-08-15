import type { Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { OfflineLessonGenerator } from "../src/ai/offline.js";
import { createApp } from "../src/app.js";
import {
  uniqueUsername,
  usernameFromEmail,
  type GoogleIdentity,
  type GoogleVerifier,
} from "../src/auth/google.js";
import { loadConfig } from "../src/config.js";
import { HttpError } from "../src/http/errors.js";
import { openDatabase, type Db } from "../src/db/index.js";

const config = loadConfig({
  NODE_ENV: "test",
  DATABASE_PATH: ":memory:",
  JWT_SECRET: "test-secret-that-is-long-enough",
} as NodeJS.ProcessEnv);

/** Stands in for Google so the tests never leave the process. */
class FakeVerifier implements GoogleVerifier {
  constructor(private readonly identities: Record<string, GoogleIdentity>) {}

  async verify(credential: string): Promise<GoogleIdentity> {
    const identity = this.identities[credential];
    if (!identity) throw HttpError.unauthorized("Google sign-in could not be verified.");
    return identity;
  }
}

// Real Google ID tokens are ~1 kB of JWT; these only need to clear the length
// check the route applies before it bothers the verifier.
const TOKEN_AZIZA = "fake.id.token.for.aziza.0123456789";
const TOKEN_BEKZOD = "fake.id.token.for.bekzod.0123456789";

const AZIZA: GoogleIdentity = {
  sub: "google-oid-1",
  email: "aziza.karimova@example.com",
  emailVerified: true,
  name: "Aziza Karimova",
};

const BEKZOD: GoogleIdentity = {
  sub: "google-oid-2",
  email: "aziza.karimova@example.org", // same local part, different domain
  emailVerified: true,
  name: "Bekzod",
};

let db: Db;
let app: Express;

beforeEach(() => {
  db = openDatabase(":memory:");
  app = createApp({
    db,
    config,
    generator: new OfflineLessonGenerator(),
    googleVerifier: new FakeVerifier({ [TOKEN_AZIZA]: AZIZA, [TOKEN_BEKZOD]: BEKZOD }),
  });
});

describe("username derivation", () => {
  it("strips everything a username may not contain", () => {
    expect(usernameFromEmail("Aziza.Karimova+school@example.com")).toBe("azizakarimovaschool");
    expect(usernameFromEmail("a.b@example.com")).toBe("bolaab");
  });

  it("appends a counter until the name is free", () => {
    const taken = new Set(["aziza", "aziza2"]);
    expect(uniqueUsername("aziza", (n) => taken.has(n))).toBe("aziza3");
    expect(uniqueUsername("bekzod", (n) => taken.has(n))).toBe("bekzod");
  });
});

describe("POST /api/auth/google", () => {
  it("asks for an age the first time an account signs in", async () => {
    const response = await request(app)
      .post("/api/auth/google")
      .send({ credential: TOKEN_AZIZA })
      .expect(400);

    expect(response.body.code).toBe("age_required");
  });

  it("creates a profile once the age is supplied", async () => {
    const response = await request(app)
      .post("/api/auth/google")
      .send({ credential: TOKEN_AZIZA, age: 9 })
      .expect(201);

    expect(response.body.user).toMatchObject({
      username: "azizakarimova",
      displayName: "Aziza Karimova",
      age: 9,
    });

    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${response.body.token}`)
      .expect(200);
    expect(me.body.user.username).toBe("azizakarimova");
  });

  it("returns the same profile on every later sign-in, without asking again", async () => {
    const first = await request(app)
      .post("/api/auth/google")
      .send({ credential: TOKEN_AZIZA, age: 9 })
      .expect(201);

    const second = await request(app)
      .post("/api/auth/google")
      .send({ credential: TOKEN_AZIZA })
      .expect(200);

    expect(second.body.user.id).toBe(first.body.user.id);
  });

  it("gives a second Google account its own profile and a free username", async () => {
    await request(app)
      .post("/api/auth/google")
      .send({ credential: TOKEN_AZIZA, age: 9 })
      .expect(201);

    const other = await request(app)
      .post("/api/auth/google")
      .send({ credential: TOKEN_BEKZOD, age: 10 })
      .expect(201);

    expect(other.body.user.username).toBe("azizakarimova2");
  });

  it("rejects a credential Google does not recognise", async () => {
    await request(app)
      .post("/api/auth/google")
      .send({ credential: "forged-token-value-here" })
      .expect(401);
  });

  it("validates the payload", async () => {
    await request(app).post("/api/auth/google").send({ credential: "short" }).expect(400);
    await request(app)
      .post("/api/auth/google")
      .send({ credential: TOKEN_AZIZA, age: 99 })
      .expect(400);
  });

  it("never returns a password hash for a Google account", async () => {
    const response = await request(app)
      .post("/api/auth/google")
      .send({ credential: TOKEN_AZIZA, age: 9 })
      .expect(201);
    expect(JSON.stringify(response.body)).not.toMatch(/hash/i);
  });

  it("does not let a Google account log in through the password endpoint", async () => {
    await request(app)
      .post("/api/auth/google")
      .send({ credential: TOKEN_AZIZA, age: 9 })
      .expect(201);

    await request(app)
      .post("/api/auth/login")
      .send({ username: "azizakarimova", password: "" })
      .expect(400);

    await request(app)
      .post("/api/auth/login")
      .send({ username: "azizakarimova", password: "anything-at-all" })
      .expect(401);
  });
});

describe("when Google sign-in is not configured", () => {
  it("answers 501 rather than pretending to work", async () => {
    const bare = createApp({
      db: openDatabase(":memory:"),
      config,
      generator: new OfflineLessonGenerator(),
      googleVerifier: null,
    });

    const response = await request(bare)
      .post("/api/auth/google")
      .send({ credential: TOKEN_AZIZA, age: 9 })
      .expect(501);

    expect(response.body.code).toBe("google_disabled");
  });

  it("advertises the state on /health", async () => {
    const response = await request(app).get("/health").expect(200);
    expect(response.body.googleSignIn).toBe(true);
  });
});

describe("existing password accounts", () => {
  it("keeps working after the migration that made password_hash nullable", async () => {
    const created = await request(app)
      .post("/api/auth/register")
      .send({ username: "dilnoza", displayName: "Dilnoza", password: "parol-12345", age: 8 })
      .expect(201);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "dilnoza", password: "parol-12345" })
      .expect(200);

    expect(login.body.user.id).toBe(created.body.user.id);
  });
});
