/**
 * M6 — HMAC-keyed suppression hash contract.
 *
 * `hashSuppressedEmailCandidate` MUST:
 *   1. produce DIFFERENT output for different `SUPPRESSION_HASH_SECRET` values
 *      (HMAC keying property — dictionary attacks on cache dumps require the key).
 *   2. produce the SAME output for the same email+secret (deterministic — the
 *      sender-side `.has()` lookup depends on this).
 *   3. fall back to plain SHA-256 when `SUPPRESSION_HASH_SECRET` is unset
 *      (local/test path; production fails closed via `validateProductionEnv`).
 *
 * Because `serverEnv` snapshots `process.env` at module load, we mock the
 * env module itself with a mutable holder and re-import the SUT once per
 * scenario via `bun test`'s `require.cache` reset semantics is unavailable
 * — instead we use a `secretRef` object whose contents mutate between tests.
 */
import { describe, test, expect, mock } from "bun:test";
import { createHash, createHmac } from "node:crypto";

// Mutable holder that the mocked `serverEnv` reads through a getter, so each
// test can change the effective SUPPRESSION_HASH_SECRET without re-importing.
const envHolder: { SUPPRESSION_HASH_SECRET: string | undefined } = {
  SUPPRESSION_HASH_SECRET: undefined,
};

mock.module("server-only", () => ({}));
mock.module("next/cache", () => ({
  cacheLife: () => {},
  cacheTag: () => {},
  revalidateTag: mock(() => undefined),
  updateTag: mock(() => undefined),
}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    customer: {
      findMany: mock(() => Promise.resolve([])),
    },
  },
}));
mock.module("@/shared/lib/env/server", () => ({
  serverEnv: new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "SUPPRESSION_HASH_SECRET") {
          return envHolder.SUPPRESSION_HASH_SECRET;
        }
        return undefined;
      },
    },
  ),
  isProduction: () => false,
  isLocalhostUrl: () => true,
  validateProductionEnv: () => {},
}));

const { hashSuppressedEmailCandidate } =
  await import("@/shared/domain/customers/queries");

const CANONICAL_EMAIL = "someone@example.com";

describe("hashSuppressedEmailCandidate — M6 HMAC-keyed hash", () => {
  test("different secrets produce different hashes (HMAC keying property)", () => {
    const secretA = "a".repeat(64);
    const secretB = "b".repeat(64);

    envHolder.SUPPRESSION_HASH_SECRET = secretA;
    const hashA = hashSuppressedEmailCandidate(CANONICAL_EMAIL);

    envHolder.SUPPRESSION_HASH_SECRET = secretB;
    const hashB = hashSuppressedEmailCandidate(CANONICAL_EMAIL);

    expect(hashA).not.toBe(hashB);
    // Both must be 64-char lowercase hex (SHA-256 hex digest length).
    expect(hashA).toMatch(/^[0-9a-f]{64}$/);
    expect(hashB).toMatch(/^[0-9a-f]{64}$/);
    // Golden: matches the reference HMAC-SHA256 output for that key.
    expect(hashA).toBe(
      createHmac("sha256", secretA).update(CANONICAL_EMAIL).digest("hex"),
    );
    expect(hashB).toBe(
      createHmac("sha256", secretB).update(CANONICAL_EMAIL).digest("hex"),
    );
  });

  test("same email + same secret is deterministic (sender lookup depends on this)", () => {
    envHolder.SUPPRESSION_HASH_SECRET = "c".repeat(64);

    const first = hashSuppressedEmailCandidate(CANONICAL_EMAIL);
    const second = hashSuppressedEmailCandidate(CANONICAL_EMAIL);

    expect(first).toBe(second);
    expect(first).toBe(
      createHmac("sha256", "c".repeat(64))
        .update(CANONICAL_EMAIL)
        .digest("hex"),
    );
  });

  test("unset secret falls back to plain SHA-256 (local/test path)", () => {
    envHolder.SUPPRESSION_HASH_SECRET = undefined;

    const fallback = hashSuppressedEmailCandidate(CANONICAL_EMAIL);

    expect(fallback).toBe(
      createHash("sha256").update(CANONICAL_EMAIL).digest("hex"),
    );
  });

  test("empty-string secret is treated as unset (defense-in-depth against t3-env emptyStringAsUndefined skew)", () => {
    // t3-env's `emptyStringAsUndefined: true` converts "" → undefined at the
    // schema layer, but the callsite also guards `secret.length > 0` so a
    // direct raw-env injection cannot silently degrade to HMAC("").
    envHolder.SUPPRESSION_HASH_SECRET = "";

    const fallback = hashSuppressedEmailCandidate(CANONICAL_EMAIL);

    expect(fallback).toBe(
      createHash("sha256").update(CANONICAL_EMAIL).digest("hex"),
    );
  });
});
