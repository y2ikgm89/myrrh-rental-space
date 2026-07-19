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

type CustomerRow = {
  emailCanonical: string;
  suppressedEmailHash: string | null;
};

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
      CANONICAL_EMAILS.map((emailCanonical) => ({
        emailCanonical,
        suppressedEmailHash: null,
      })),
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
      CANONICAL_EMAILS.map((emailCanonical) => ({
        emailCanonical,
        suppressedEmailHash: null,
      })),
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

  test("prisma is queried for HARD_BOUNCED / COMPLAINED OR persisted suppressedEmailHash (regression guard for the filter shape)", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    await getSuppressedEmailSet();

    // RESEND-AUDIT M7: union of two suppression sources —
    //   (a) 通常 Customer で emailDeliveryStatus が抑制系
    //   (b) 匿名化/マージで持ち越された suppressedEmailHash (NOT NULL)
    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            {
              emailDeliveryStatus: {
                in: [
                  EmailDeliveryStatus.HARD_BOUNCED,
                  EmailDeliveryStatus.COMPLAINED,
                ],
              },
            },
            { suppressedEmailHash: { not: null } },
          ],
        },
        select: { emailCanonical: true, suppressedEmailHash: true },
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // RESEND-AUDIT M7: suppressedEmailHash 経路
  // ---------------------------------------------------------------------------

  test("suppressedEmailHash が set された行はその hash 値がそのまま Set に含まれる (anonymize/merge で持ち越された suppression が読める)", async () => {
    // 実 email の hash (原本) を simulate — 匿名化前の "real@example.com" が
    // HARD_BOUNCED だったケース。emailCanonical は placeholder に置換済み。
    const originalEmailHash = sha256Hex("real@example.com");
    mockFindMany.mockResolvedValueOnce([
      {
        emailCanonical: "deleted+abc-123@anonymized.local",
        suppressedEmailHash: originalEmailHash,
      },
    ]);

    const set = await getSuppressedEmailSet();

    // 送信側で `hashSuppressedEmailCandidate("real@example.com")` を計算すると
    // 保存された hash と一致 → suppression が持続する (M7 の中核不変条件)。
    expect(set.has(originalEmailHash)).toBe(true);
    expect(set.has(hashSuppressedEmailCandidate("real@example.com"))).toBe(
      true,
    );
  });

  test("emailDeliveryStatus 抑制列と suppressedEmailHash 列は両方 Set に取り込まれる (union)", async () => {
    const originalEmailHash = sha256Hex("real@example.com");
    mockFindMany.mockResolvedValueOnce([
      {
        // 通常 Customer (HARD_BOUNCED) — emailCanonical hash が入る
        emailCanonical: "bounce@example.com",
        suppressedEmailHash: null,
      },
      {
        // 匿名化済み Customer — suppressedEmailHash 経路
        emailCanonical: "deleted+xyz@anonymized.local",
        suppressedEmailHash: originalEmailHash,
      },
    ]);

    const set = await getSuppressedEmailSet();

    // 両者が独立に含まれる (placeholder emailCanonical hash + 実 email hash)
    expect(set.has(hashSuppressedEmailCandidate("bounce@example.com"))).toBe(
      true,
    );
    expect(set.has(originalEmailHash)).toBe(true);
  });

  test("empty DB rows produce an empty Set (no accidental sentinel entries)", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    const set = await getSuppressedEmailSet();

    expect(set.size).toBe(0);
  });
});
