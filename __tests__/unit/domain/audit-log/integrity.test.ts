import { createHmac } from "node:crypto";
import { describe, test, expect, mock, beforeEach } from "bun:test";

const TEST_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const OTHER_KEY =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ZERO_HASH = "0".repeat(64);
const mockFindMany = mock<() => Promise<unknown[]>>(() => Promise.resolve([]));
const mockServerEnv: Record<string, string | undefined> = {
  NODE_ENV: "test",
  AUDIT_LOG_HMAC_KEY: TEST_KEY,
  AUDIT_LOG_HMAC_KEY_ID: "test-key",
};

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    auditLog: {
      findMany: mockFindMany,
    },
  },
}));

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: mockServerEnv,
}));

type IntegrityRow = {
  id: string;
  sequence: bigint;
  previousHash: string;
  entryHash: string;
  hashAlgorithm: string;
  hashKeyId: string;
  chainVersion: number;
  userId: string | null;
  action: "CREATE" | "UPDATE";
  resource: string;
  resourceId: string | null;
  oldValue: unknown;
  newValue: unknown;
  metadata: unknown;
  createdAt: Date;
};

function canonicalize(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      result[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return result;
  }
  return value;
}

function calculateExpectedHash(
  row: Omit<IntegrityRow, "entryHash">,
  key = TEST_KEY,
): string {
  return createHmac("sha256", Buffer.from(key, "hex"))
    .update(
      JSON.stringify(
        canonicalize({
          version: row.chainVersion,
          id: row.id,
          sequence: row.sequence.toString(),
          previousHash: row.previousHash,
          hashAlgorithm: row.hashAlgorithm,
          hashKeyId: row.hashKeyId,
          userId: row.userId,
          action: row.action,
          resource: row.resource,
          resourceId: row.resourceId,
          oldValue: row.oldValue,
          newValue: row.newValue,
          metadata: row.metadata,
          createdAt: row.createdAt.toISOString(),
        }),
      ),
      "utf8",
    )
    .digest("hex");
}

function buildRow(
  input: Partial<Omit<IntegrityRow, "entryHash">> & {
    id: string;
    sequence: bigint;
    previousHash: string;
  },
  key = TEST_KEY,
): IntegrityRow {
  const rowWithoutHash: Omit<IntegrityRow, "entryHash"> = {
    hashAlgorithm: "HMAC-SHA256",
    hashKeyId: "test-key",
    chainVersion: 1,
    userId: null,
    action: "CREATE",
    resource: "post",
    resourceId: null,
    oldValue: null,
    newValue: null,
    metadata: null,
    createdAt: new Date("2026-07-02T01:00:00.000Z"),
    ...input,
  };
  return {
    ...rowWithoutHash,
    entryHash: calculateExpectedHash(rowWithoutHash, key),
  };
}

const { verifyAuditLogIntegrity } =
  await import("@/shared/domain/audit-log/integrity");

describe("verifyAuditLogIntegrity", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockFindMany.mockResolvedValue([]);
    mockServerEnv["NODE_ENV"] = "test";
    mockServerEnv["AUDIT_LOG_HMAC_KEY"] = TEST_KEY;
    mockServerEnv["AUDIT_LOG_HMAC_KEY_ID"] = "test-key";
  });

  test("全行の hash chain が正しい場合は ok を返す", async () => {
    const first = buildRow({
      id: "00000000-0000-0000-0000-000000000001",
      sequence: 1n,
      previousHash: ZERO_HASH,
    });
    const second = buildRow({
      id: "00000000-0000-0000-0000-000000000002",
      sequence: 2n,
      previousHash: first.entryHash,
      action: "UPDATE",
      newValue: { status: "PUBLISHED" },
    });
    mockFindMany.mockResolvedValueOnce([first, second]);

    const result = await verifyAuditLogIntegrity();

    expect(result.ok).toBe(true);
    expect(result.checkedCount).toBe(2);
    expect(result.latestSequence).toBe("2");
    expect(result.latestHash).toBe(second.entryHash);
    expect(result.failures).toEqual([]);
  });

  test("sequence の欠番を検出する", async () => {
    const first = buildRow({
      id: "00000000-0000-0000-0000-000000000001",
      sequence: 1n,
      previousHash: ZERO_HASH,
    });
    const third = buildRow({
      id: "00000000-0000-0000-0000-000000000003",
      sequence: 3n,
      previousHash: first.entryHash,
    });
    mockFindMany.mockResolvedValueOnce([first, third]);

    const result = await verifyAuditLogIntegrity();

    expect(result.ok).toBe(false);
    expect(result.failures).toContainEqual(
      expect.objectContaining({
        sequence: "3",
        reason: "SEQUENCE_GAP",
      }),
    );
  });

  test("previousHash の不一致を検出する", async () => {
    const first = buildRow({
      id: "00000000-0000-0000-0000-000000000001",
      sequence: 1n,
      previousHash: ZERO_HASH,
    });
    const second = buildRow({
      id: "00000000-0000-0000-0000-000000000002",
      sequence: 2n,
      previousHash:
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });
    mockFindMany.mockResolvedValueOnce([first, second]);

    const result = await verifyAuditLogIntegrity();

    expect(result.ok).toBe(false);
    expect(result.failures).toContainEqual(
      expect.objectContaining({
        sequence: "2",
        reason: "PREVIOUS_HASH_MISMATCH",
        expected: first.entryHash,
      }),
    );
  });

  test("entryHash の不一致を検出する", async () => {
    const first = buildRow({
      id: "00000000-0000-0000-0000-000000000001",
      sequence: 1n,
      previousHash: ZERO_HASH,
      resource: "post",
    });
    mockFindMany.mockResolvedValueOnce([
      {
        ...first,
        resource: "settings",
      },
    ]);

    const result = await verifyAuditLogIntegrity();

    expect(result.ok).toBe(false);
    expect(result.failures).toContainEqual(
      expect.objectContaining({
        sequence: "1",
        reason: "ENTRY_HASH_MISMATCH",
        actual: first.entryHash,
      }),
    );
  });

  test("hashKeyId に対応する鍵がない場合は failure として返す", async () => {
    const first = buildRow(
      {
        id: "00000000-0000-0000-0000-000000000001",
        sequence: 1n,
        previousHash: ZERO_HASH,
        hashKeyId: "missing-key",
      },
      OTHER_KEY,
    );
    mockFindMany.mockResolvedValueOnce([first]);

    const result = await verifyAuditLogIntegrity();

    expect(result.ok).toBe(false);
    expect(result.failures).toContainEqual(
      expect.objectContaining({
        sequence: "1",
        reason: "HASH_KEY_UNAVAILABLE",
      }),
    );
  });
});
