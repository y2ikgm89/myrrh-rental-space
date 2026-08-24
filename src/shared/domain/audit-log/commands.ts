import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@/shared/db/prisma";
import { Prisma } from "@generated/prisma/client";
import type { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import { asPrismaInputJsonValue } from "@/shared/db/prisma-input-json";
import { isRecord, omitUndefined } from "@/shared/lib/serialize";
import {
  AUDIT_LOG_CHAIN_LOCK_KEY,
  AUDIT_LOG_CHAIN_VERSION,
  AUDIT_LOG_GENESIS_HASH,
  AUDIT_LOG_HASH_ALGORITHM,
  computeAuditLogEntryHash,
  getAuditLogHashKeyId,
  type AuditLogHashPayload,
} from "./hash-chain";
import { getCacheTag } from "@/shared/lib/constants";
import { invalidateTagNowOrAfterResponse } from "@/shared/lib/cache/invalidate-timing";

/**
 * 監査ログ書込の生入力型。
 *
 * `oldValue` / `newValue` / `metadata` は Prisma の `Json` カラムに永続化される。
 * 型自体は呼び出し側の構造的不整合（`Record<string, unknown>` 等）を許容するため
 * `unknown` で受け、書込時に `asPrismaInputJsonValue` で `Prisma.InputJsonValue`
 * に runtime narrow する。`typeof Prisma.JsonNull` の sentinel もそのまま通過させる
 * （DB null 永続化のため）。
 */
export type CreateAuditLogRecordInput = {
  userId?: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  metadata?: unknown;
  createdAt?: Date;
};

const REDACTED_AUDIT_VALUE = "[REDACTED]";
const MAX_AUDIT_LOG_CHAIN_RETRIES = 3;

type CreatedAuditLogAnchor = {
  id: string;
  sequence: bigint;
  previousHash: string;
  entryHash: string;
  hashAlgorithm: string;
  hashKeyId: string;
  chainVersion: number;
  createdAt: Date;
};

function isSensitiveAuditKey(key: string): boolean {
  const normalized = key.replace(/[\s_-]/g, "").toLowerCase();

  if (normalized.endsWith("id")) {
    return false;
  }

  return (
    normalized === "authorization" ||
    normalized === "cookie" ||
    normalized === "setcookie" ||
    normalized === "apikey" ||
    normalized.endsWith("apikey") ||
    normalized.includes("password") ||
    normalized.includes("passcode") ||
    normalized.includes("secret") ||
    normalized.includes("token") ||
    normalized.includes("credential") ||
    normalized.includes("privatekey") ||
    normalized.includes("accesskey")
  );
}

function redactSensitiveAuditJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveAuditJson(item));
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, itemValue] of Object.entries(value)) {
    result[key] = isSensitiveAuditKey(key)
      ? REDACTED_AUDIT_VALUE
      : redactSensitiveAuditJson(itemValue);
  }
  return result;
}

function normalizeAuditJsonForHash(value: unknown): unknown {
  if (value === undefined || value === Prisma.JsonNull) return null;
  return value;
}

/**
 * リトライで回復しうる書込衝突（Prisma P2034 = write conflict / deadlock）。
 *
 * chain の採番は下の advisory lock が直列化するため、通常この経路には入らない。
 * 残しているのは deadlock（別の advisory lock を保持したまま監査ログを書く
 * 呼出が将来入る可能性）への保険。
 */
function isRetryableWriteConflict(error: unknown): boolean {
  return isRecord(error) && error["code"] === "P2034";
}

function emitAuditLogIntegrityAnchor(anchor: CreatedAuditLogAnchor): void {
  console.info(
    JSON.stringify({
      severity: "NOTICE",
      message: "audit_log_integrity_anchor",
      component: "audit-log-integrity",
      auditLogIntegrityAnchor: {
        id: anchor.id,
        sequence: anchor.sequence.toString(),
        previousHash: anchor.previousHash,
        entryHash: anchor.entryHash,
        hashAlgorithm: anchor.hashAlgorithm,
        hashKeyId: anchor.hashKeyId,
        chainVersion: anchor.chainVersion,
        createdAt: anchor.createdAt.toISOString(),
      },
    }),
  );
}

function toJsonInput(
  value: unknown,
  message: string,
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) return undefined;
  if (value === Prisma.JsonNull) return Prisma.JsonNull;
  return asPrismaInputJsonValue(redactSensitiveAuditJson(value), message);
}

export async function createAuditLogRecord(
  input: CreateAuditLogRecordInput,
): Promise<void> {
  const oldValue = toJsonInput(input.oldValue, "監査ログの旧値形式が不正です");
  const newValue = toJsonInput(input.newValue, "監査ログの新値形式が不正です");
  const metadata = toJsonInput(
    input.metadata,
    "監査ログのメタデータ形式が不正です",
  );

  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_AUDIT_LOG_CHAIN_RETRIES; attempt += 1) {
    try {
      // 既定の READ COMMITTED で走らせる（isolationLevel を指定しない）。
      //
      // 直列化を担うのは下の `pg_advisory_xact_lock` であって isolation level ではない。
      // ここを SERIALIZABLE にすると **逆に壊れる**:
      //
      // - スナップショットは「トランザクション内の最初のクエリの *開始時*」に凍結される。
      //   最初の文が `SELECT pg_advisory_xact_lock(...)` なので、**ロック取得を待つ前に**
      //   スナップショットが確定し、待っている間に先行 writer がコミットしても見えない。
      // - PostgreSQL 公式もこの罠を明示している: 明示ロックで並行変更を防ぐなら
      //   Read Committed を使うか、Repeatable Read 以上ではクエリより前にロックを取れ
      //   （13.4.2 Enforcing Consistency With Explicit Blocking Locks）。逃げ道として
      //   挙げられているのは `LOCK TABLE`（クエリではないので凍結しない）で、
      //   **関数呼び出しである advisory lock はその逃げ道を取れない**。
      // - 結果、後続 writer は古い max(sequence) を読んで衝突し P2034 で abort する。
      //   リトライしても新トランザクションが再び「ロック待ちより前」にスナップショットを
      //   取るため衝突が続く。実測（integration/domain/audit-log/chain-concurrency）:
      //   6 並行で 3 件がリトライ 3 回を使い切って失格した。
      //
      // READ COMMITTED なら各文が実行時に新しいスナップショットを取る。advisory lock は
      // コミット完了（＝新スナップショットへの可視化後）に解放されるので、ロックを得た
      // 時点で先行 writer の行は必ず見える。本 repo の他の advisory lock 直列化
      // （予約・イベント・領収書連番）もすべてこの形。
      const anchor = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(${AUDIT_LOG_CHAIN_LOCK_KEY})`,
        );

        const previous = await tx.auditLog.findFirst({
          select: { sequence: true, entryHash: true },
          orderBy: { sequence: "desc" },
        });

        const id = randomUUID();
        const sequence = previous ? previous.sequence + 1n : 1n;
        const previousHash = previous?.entryHash ?? AUDIT_LOG_GENESIS_HASH;
        const hashKeyId = getAuditLogHashKeyId();
        const createdAt = input.createdAt ?? new Date();
        const hashPayload: AuditLogHashPayload = {
          version: AUDIT_LOG_CHAIN_VERSION,
          id,
          sequence: sequence.toString(),
          previousHash,
          hashAlgorithm: AUDIT_LOG_HASH_ALGORITHM,
          hashKeyId,
          userId: input.userId ?? null,
          action: input.action,
          resource: input.resource,
          resourceId: input.resourceId ?? null,
          oldValue: normalizeAuditJsonForHash(oldValue),
          newValue: normalizeAuditJsonForHash(newValue),
          metadata: normalizeAuditJsonForHash(metadata),
          createdAt: createdAt.toISOString(),
        };
        const entryHash = computeAuditLogEntryHash(hashPayload);

        await tx.auditLog.create({
          data: omitUndefined({
            id,
            sequence,
            previousHash,
            entryHash,
            hashAlgorithm: AUDIT_LOG_HASH_ALGORITHM,
            hashKeyId,
            chainVersion: AUDIT_LOG_CHAIN_VERSION,
            userId: input.userId,
            action: input.action,
            resource: input.resource,
            resourceId: input.resourceId,
            oldValue,
            newValue,
            metadata,
            createdAt,
          }),
        });

        return {
          id,
          sequence,
          previousHash,
          entryHash,
          hashAlgorithm: AUDIT_LOG_HASH_ALGORITHM,
          hashKeyId,
          chainVersion: AUDIT_LOG_CHAIN_VERSION,
          createdAt,
        };
      });

      emitAuditLogIntegrityAnchor(anchor);
      const auditUserId = input.userId;
      if (auditUserId) {
        // 監査ログは Server Action だけでなく、page render 中の
        // `requireAdminPermission`（PERMISSION_DENIED）や IAP ログイン記録、
        // CSV エクスポートなどの Route Handler からも書かれる。
        // 3 つの文脈で使える API が違うので、tag を渡して helper に選ばせる。
        invalidateTagNowOrAfterResponse(
          getCacheTag.auditLogs.recent(auditUserId),
          {
            operation: "updateAuditLogRecentTag",
            context: { userId: auditUserId },
          },
        );
      }
      return;
    } catch (error) {
      lastError = error;
      if (isRetryableWriteConflict(error)) {
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}
