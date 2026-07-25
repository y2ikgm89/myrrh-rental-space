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

const AUDIT_LOG_INTEGRITY_BATCH_SIZE = 1000;

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

type IntegrityVerificationState = {
  expectedSequence: bigint;
  expectedPreviousHash: string;
  latestSequence: string | null;
  latestHash: string | null;
  failures: AuditLogIntegrityFailure[];
  checkedCount: number;
};

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

function createInitialVerificationState(): IntegrityVerificationState {
  return {
    expectedSequence: 1n,
    expectedPreviousHash: AUDIT_LOG_GENESIS_HASH,
    latestSequence: null,
    latestHash: null,
    failures: [],
    checkedCount: 0,
  };
}

function toIntegrityResult(
  state: IntegrityVerificationState,
  checkedAt: Date,
): AuditLogIntegrityResult {
  return {
    ok: state.failures.length === 0,
    checkedCount: state.checkedCount,
    latestSequence: state.latestSequence,
    latestHash: state.latestHash,
    checkedAt: checkedAt.toISOString(),
    failures: state.failures,
  };
}

function verifyAuditLogIntegrityBatch(
  rows: AuditLogIntegrityRow[],
  state: IntegrityVerificationState,
): IntegrityVerificationState {
  let expectedSequence = state.expectedSequence;
  let expectedPreviousHash = state.expectedPreviousHash;
  let latestSequence = state.latestSequence;
  let latestHash = state.latestHash;
  const failures = [...state.failures];
  let checkedCount = state.checkedCount;

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
    checkedCount += 1;
  }

  return {
    expectedSequence,
    expectedPreviousHash,
    latestSequence,
    latestHash,
    failures,
    checkedCount,
  };
}

export function verifyAuditLogIntegrityRows(
  rows: AuditLogIntegrityRow[],
  checkedAt = new Date(),
): AuditLogIntegrityResult {
  const state = verifyAuditLogIntegrityBatch(
    rows,
    createInitialVerificationState(),
  );
  return toIntegrityResult(state, checkedAt);
}

export async function verifyAuditLogIntegrity(): Promise<AuditLogIntegrityResult> {
  const checkedAt = new Date();
  let state = createInitialVerificationState();
  let cursor: bigint | undefined;

  while (true) {
    const rows = await prisma.auditLog.findMany({
      select: auditLogIntegritySelect,
      orderBy: { sequence: "asc" },
      take: AUDIT_LOG_INTEGRITY_BATCH_SIZE,
      ...(cursor !== undefined
        ? { skip: 1, cursor: { sequence: cursor } }
        : {}),
    });

    if (rows.length === 0) {
      break;
    }

    state = verifyAuditLogIntegrityBatch(rows, state);
    const lastRow = rows.at(-1);
    if (lastRow === undefined) {
      break;
    }
    cursor = lastRow.sequence;

    if (rows.length < AUDIT_LOG_INTEGRITY_BATCH_SIZE) {
      break;
    }
  }

  return toIntegrityResult(state, checkedAt);
}
