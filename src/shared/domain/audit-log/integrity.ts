import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { Prisma } from "@generated/prisma/client";
import {
  AUDIT_LOG_CHAIN_VERSION,
  AUDIT_LOG_GENESIS_HASH,
  AUDIT_LOG_HASH_ALGORITHM,
  computeAuditLogEntryHash,
  type AuditLogHashPayload,
} from "./hash-chain";

export type AuditLogIntegrityFailureReason =
  | "SEQUENCE_GAP"
  | "PREVIOUS_HASH_MISMATCH"
  | "ENTRY_HASH_MISMATCH"
  | "HASH_KEY_UNAVAILABLE"
  | "UNSUPPORTED_CHAIN_VERSION"
  | "UNSUPPORTED_HASH_ALGORITHM";

export type AuditLogIntegrityFailure = {
  sequence: string;
  id: string;
  reason: AuditLogIntegrityFailureReason;
  expected?: string;
  actual?: string;
};

export type AuditLogIntegrityResult = {
  ok: boolean;
  checkedCount: number;
  latestSequence: string | null;
  latestHash: string | null;
  checkedAt: string;
  failures: AuditLogIntegrityFailure[];
};

const auditLogIntegritySelect = {
  id: true,
  sequence: true,
  previousHash: true,
  entryHash: true,
  hashAlgorithm: true,
  hashKeyId: true,
  chainVersion: true,
  userId: true,
  action: true,
  resource: true,
  resourceId: true,
  oldValue: true,
  newValue: true,
  metadata: true,
  createdAt: true,
} satisfies Prisma.AuditLogSelect;

type AuditLogIntegrityRow = Prisma.AuditLogGetPayload<{
  select: typeof auditLogIntegritySelect;
}>;

function toHashPayload(row: AuditLogIntegrityRow): AuditLogHashPayload {
  return {
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
  };
}

function addFailure(
  failures: AuditLogIntegrityFailure[],
  row: AuditLogIntegrityRow,
  failure: Omit<AuditLogIntegrityFailure, "sequence" | "id">,
): void {
  failures.push({
    sequence: row.sequence.toString(),
    id: row.id,
    ...failure,
  });
}

export function verifyAuditLogIntegrityRows(
  rows: AuditLogIntegrityRow[],
  checkedAt = new Date(),
): AuditLogIntegrityResult {
  const failures: AuditLogIntegrityFailure[] = [];
  let expectedSequence = 1n;
  let expectedPreviousHash = AUDIT_LOG_GENESIS_HASH;
  let latestSequence: string | null = null;
  let latestHash: string | null = null;

  for (const row of rows) {
    if (row.sequence !== expectedSequence) {
      addFailure(failures, row, {
        reason: "SEQUENCE_GAP",
        expected: expectedSequence.toString(),
        actual: row.sequence.toString(),
      });
      expectedSequence = row.sequence;
    }

    if (row.previousHash !== expectedPreviousHash) {
      addFailure(failures, row, {
        reason: "PREVIOUS_HASH_MISMATCH",
        expected: expectedPreviousHash,
        actual: row.previousHash,
      });
    }

    if (row.chainVersion !== AUDIT_LOG_CHAIN_VERSION) {
      addFailure(failures, row, {
        reason: "UNSUPPORTED_CHAIN_VERSION",
        expected: AUDIT_LOG_CHAIN_VERSION.toString(),
        actual: row.chainVersion.toString(),
      });
    }

    if (row.hashAlgorithm !== AUDIT_LOG_HASH_ALGORITHM) {
      addFailure(failures, row, {
        reason: "UNSUPPORTED_HASH_ALGORITHM",
        expected: AUDIT_LOG_HASH_ALGORITHM,
        actual: row.hashAlgorithm,
      });
    }

    let expectedEntryHash: string | null = null;
    try {
      expectedEntryHash = computeAuditLogEntryHash(toHashPayload(row));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Audit log HMAC key error";
      addFailure(failures, row, {
        reason: "HASH_KEY_UNAVAILABLE",
        expected: row.hashKeyId,
        actual: message,
      });
    }

    if (expectedEntryHash !== null && row.entryHash !== expectedEntryHash) {
      addFailure(failures, row, {
        reason: "ENTRY_HASH_MISMATCH",
        expected: expectedEntryHash,
        actual: row.entryHash,
      });
    }

    latestSequence = row.sequence.toString();
    latestHash = row.entryHash;
    expectedSequence = row.sequence + 1n;
    expectedPreviousHash = row.entryHash;
  }

  return {
    ok: failures.length === 0,
    checkedCount: rows.length,
    latestSequence,
    latestHash,
    checkedAt: checkedAt.toISOString(),
    failures,
  };
}

export async function verifyAuditLogIntegrity(): Promise<AuditLogIntegrityResult> {
  const rows = await prisma.auditLog.findMany({
    select: auditLogIntegritySelect,
    orderBy: { sequence: "asc" },
  });

  return verifyAuditLogIntegrityRows(rows);
}
