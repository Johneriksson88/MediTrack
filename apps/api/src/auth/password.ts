import argon2 from 'argon2';

/**
 * Pattern G / D-05 — argon2id password hashing.
 *
 * OWASP 2025 defaults: argon2id, default memoryCost (~19 MiB), timeCost=3,
 * parallelism=1. The argon2 library hard-codes a sensible default; we
 * specify the variant explicitly so a future library default change
 * doesn't silently flip us to argon2i / argon2d.
 *
 * Never log the plain password or the hash. Hash never leaves the server.
 */
const HASH_OPTIONS = {
  type: argon2.argon2id,
  timeCost: 3,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, HASH_OPTIONS);
}

export async function verifyPassword(
  hash: string,
  plain: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // argon2.verify throws on malformed hashes; treat as a failed verify.
    return false;
  }
}
