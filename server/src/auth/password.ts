import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * Password hashing with scrypt from Node's standard library.
 *
 * scrypt is memory-hard and ships with Node, so there is no native module to
 * compile and no extra dependency to keep patched. The salt is stored inline
 * with the hash so a single column round-trips everything we need.
 *
 * Format: `scrypt$<salt-hex>$<hash-hex>`
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);

  // Constant-time comparison: a length check first, because timingSafeEqual
  // throws (and therefore leaks) on mismatched lengths.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
