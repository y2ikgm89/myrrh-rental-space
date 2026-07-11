/**
 * Invariant pin: getSuppressedEmailSet() returns SHA-256 hex digests
 * of canonical emails, NEVER plaintext.
 *
 * Rationale (Codex review, PR #945): the returned Set is cached via
 * "use cache" + cacheTag(SUPPRESSED_EMAILS). If the cache value contained
 * plaintext canonical emails, Data Cache would retain suppression-list PII.
 * Hashing at the domain layer keeps cache values non-reversible; senders
 * hash the recipient with `hashSuppressedEmailCandidate` for `.has()`
 * lookup so semantics stay equivalent (deterministic hash + Set membership).
 *
 * This test pins that contract so a future refactor cannot silently regress
 * the hashing to plaintext.
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";
import { createHash } from "node:crypto";
import { EmailDeliveryStatus } from "@generated/prisma/enums";

type CustomerRow = { emailCanonical: string };

const mockFindMany = mock<
  (args: Record<string, unknown>) => Promise<CustomerRow[]>
>(() => Promise.resolve([]));

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
      findMany: mockFindMany,
    },
  },
}));

const { getSuppressedEmailSet, hashSuppressedEmailCandidate } =
  await import("@/shared/domain/customers/queries");

const CANONICAL_EMAILS = [
  "bounce.a@example.com",
  "bounce.b@example.com",
  "complaint.c@example.jp",
];

const SHA256_HEX = /^[0-9a-f]{64}$/;

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

describe("getSuppressedEmailSet — hashing invariant (PII must NOT leak into Data Cache)", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
  });

  test("every Set entry is a 64-char SHA-256 hex digest, never the plaintext email", async () => {
    mockFindMany.mockResolvedValueOnce(
      CANONICAL_EMAILS.map((emailCanonical) => ({ emailCanonical })),
    );

    const set = await getSuppressedEmailSet();

    expect(set.size).toBe(CANONICAL_EMAILS.length);
    for (const value of set) {
      // Contract: SHA-256 hex digest (64 lowercase hex chars).
      expect(value).toMatch(SHA256_HEX);
    }
    // Explicit anti-regression: plaintext canonical emails MUST NOT appear.
    for (const plaintext of CANONICAL_EMAILS) {
      expect(set.has(plaintext)).toBe(false);
    }
  });

  test("hashSuppressedEmailCandidate applied to the same canonical email hits the Set (semantic equivalence)", async () => {
    mockFindMany.mockResolvedValueOnce(
      CANONICAL_EMAILS.map((emailCanonical) => ({ emailCanonical })),
    );

    const set = await getSuppressedEmailSet();

    for (const plaintext of CANONICAL_EMAILS) {
      const digest = hashSuppressedEmailCandidate(plaintext);
      expect(set.has(digest)).toBe(true);
    }
  });

  test("hashing is bit-for-bit SHA-256 of the canonical email string (golden pinning)", () => {
    // Pin the exact hashing algorithm so a rename to a different digest
    // (e.g. SHA-1 or a HMAC variant) breaks the sender-side lookup — which
    // is silent — before it reaches production.
    for (const plaintext of CANONICAL_EMAILS) {
      expect(hashSuppressedEmailCandidate(plaintext)).toBe(
        sha256Hex(plaintext),
      );
    }
  });

  test("prisma is queried for HARD_BOUNCED / COMPLAINED customers only (regression guard for the filter shape)", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    await getSuppressedEmailSet();

    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          emailDeliveryStatus: {
            in: [
              EmailDeliveryStatus.HARD_BOUNCED,
              EmailDeliveryStatus.COMPLAINED,
            ],
          },
        },
        select: { emailCanonical: true },
      }),
    );
  });

  test("empty DB rows produce an empty Set (no accidental sentinel entries)", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    const set = await getSuppressedEmailSet();

    expect(set.size).toBe(0);
  });
});
