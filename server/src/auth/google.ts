import { createRemoteJWKSet, jwtVerify } from "jose";

import type { Config } from "../config.js";
import { HttpError } from "../http/errors.js";

export interface GoogleIdentity {
  /** Google's stable, immutable user id. Never key a user off the email. */
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
}

export interface GoogleVerifier {
  verify(credential: string): Promise<GoogleIdentity>;
}

const GOOGLE_JWKS_URL = new URL("https://www.googleapis.com/oauth2/v3/certs");
const GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

/**
 * Verifies a Google ID token locally against Google's published keys.
 *
 * The alternative — calling Google's tokeninfo endpoint — adds a network
 * round trip to every sign-in and is rate limited. `createRemoteJWKSet` caches
 * the key set and refreshes it only when it sees an unknown key id, so the
 * common path is pure local crypto.
 *
 * A token is only accepted if the signature checks out AND the audience is our
 * own client id — without that check, a token minted for any other Google app
 * would be accepted here, which is the classic way this integration is broken.
 */
export class GoogleTokenVerifier implements GoogleVerifier {
  private readonly jwks = createRemoteJWKSet(GOOGLE_JWKS_URL);

  constructor(private readonly clientId: string) {}

  async verify(credential: string): Promise<GoogleIdentity> {
    let payload;
    try {
      ({ payload } = await jwtVerify(credential, this.jwks, {
        issuer: GOOGLE_ISSUERS,
        audience: this.clientId,
        clockTolerance: 30,
      }));
    } catch {
      // Deliberately opaque: the client cannot fix a specific JWT failure, and
      // spelling it out only helps someone probing the endpoint.
      throw HttpError.unauthorized("Google sign-in could not be verified.");
    }

    const sub = typeof payload.sub === "string" ? payload.sub : "";
    const email = typeof payload.email === "string" ? payload.email : "";
    const emailVerified = payload.email_verified === true;

    if (!sub || !email) {
      throw HttpError.unauthorized("Google sign-in returned an incomplete profile.");
    }
    if (!emailVerified) {
      throw HttpError.unauthorized("This Google account has an unverified email address.");
    }

    return {
      sub,
      email,
      emailVerified,
      name: typeof payload.name === "string" ? payload.name : undefined,
    };
  }
}

export function createGoogleVerifier(config: Config): GoogleVerifier | null {
  return config.GOOGLE_CLIENT_ID ? new GoogleTokenVerifier(config.GOOGLE_CLIENT_ID) : null;
}

/**
 * Turns an email into a username that fits the same rules as a hand-picked one.
 * Collisions are resolved by the caller, which knows what is already taken.
 */
export function usernameFromEmail(email: string): string {
  const base = email
    .split("@")[0]!
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 20);

  return base.length >= 3 ? base : `bola${base}`.slice(0, 24);
}

/** First free name in the series `aziza`, `aziza2`, `aziza3`, … */
export function uniqueUsername(base: string, isTaken: (name: string) => boolean): string {
  if (!isTaken(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base.slice(0, 20)}${i}`;
    if (!isTaken(candidate)) return candidate;
  }
  throw HttpError.conflict("Could not allocate a username.");
}
