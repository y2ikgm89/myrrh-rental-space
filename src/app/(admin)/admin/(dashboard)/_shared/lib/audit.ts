/**
 * 監査ログライブラリ
 *
 * 書き込み操作とセキュリティイベントの記録
 * - 非同期記録（パフォーマンス優先）
 * - 失敗時は無視（ログ記録失敗でビジネスロジックを止めない）
 *
 * @module admin/lib/audit
 */

import type { Action } from "@/shared/lib/admin-resources";
import "server-only";

import { Prisma } from "@generated/prisma/client";
import { headers } from "next/headers";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import type { AuditJsonPayload } from "@/shared/lib/privacy/pii-audit-keys";
import { notifyPermissionDeniedSpikeIfNeeded } from "@/shared/domain/audit-log/security-alerts";
import { fireAndForget } from "@/shared/lib/async-utils";
import { extractClientIpFromHeaders } from "@/shared/lib/rate-limit";
import { omitUndefined } from "@/shared/lib/serialize";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";

// =============================================================================
// Types
// =============================================================================

/**
 * 監査ログに必要な最小限のUser型
 *
 * - id のみを要求（フルUser型の受け渡しを防止）
 * - 型アサーション（as never）を排除するために導入
 */
export type AuditUser = {
  id: string;
};

export type AuditLogInput = {
  userId?: string | undefined;
  action: AuditAction;
  resource: string;
  resourceId?: string | undefined;
  oldValue?: AuditJsonPayload | typeof Prisma.JsonNull | undefined;
  newValue?: AuditJsonPayload | typeof Prisma.JsonNull | undefined;
  metadata?: AuditJsonPayload | typeof Prisma.JsonNull | undefined;
};

export type AuditLogMetadata = {
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  [key: string]: unknown;
};

// =============================================================================
// Helper Functions
// =============================================================================

// 本番の信頼できる client IP は `cf-connecting-ip` + `x-cloudflare-origin-secret`
// timing-safe 一致時のみ、それ以外は `"unknown"`。`x-forwarded-for` / `x-real-ip`
// 直読みは Cloudflare 前段では client 側追記で spoof 可能なので AuditLog に偽装 IP が
// 焼き付くのを防ぐ。SSoT は rate-limit.ts の extractClientIpFromHeaders。
async function getRequestMetadata(): Promise<AuditLogMetadata> {
  try {
    const headersList = await headers();
    const ipAddress = extractClientIpFromHeaders(headersList);
    const userAgent = headersList.get("user-agent");
    return {
      ipAddress,
      ...(userAgent !== null && { userAgent }),
    };
  } catch {
    return {};
  }
}

// =============================================================================
// Audit Log Functions
// =============================================================================

/**
 * 監査ログを記録（非同期、失敗無視）
 *
 * @param input ログ入力
 */
export async function createAuditLog(input: AuditLogInput): Promise<void> {
  try {
    const metadata = await getRequestMetadata();
    await createAuditLogRecord(
      omitUndefined({
        userId: input.userId,
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId,
        oldValue: input.oldValue,
        newValue: input.newValue,
        metadata: { ...metadata, ...input.metadata },
      }),
    );
  } catch (error) {
    // ログ記録失敗は無視（本番ではSentry等に送信推奨）
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: {
        operation: "createAuditLog",
        action: input.action,
        resource: input.resource,
      },
    });
  }
}

/**
 * ユーザーコンテキスト付き監査ログ記録
 *
 * @param user 実行ユーザー（AuditUser: { id: string }）
 * @param action アクション
 * @param resource リソース種別
 * @param resourceId リソースID
 * @param oldValue 変更前の値
 * @param newValue 変更後の値
 */
export async function logUserAction(
  user: AuditUser,
  action: AuditAction,
  resource: string,
  resourceId?: string,
  oldValue?: AuditJsonPayload | typeof Prisma.JsonNull,
  newValue?: AuditJsonPayload | typeof Prisma.JsonNull,
): Promise<void> {
  await createAuditLog({
    userId: user.id,
    action,
    resource,
    resourceId,
    oldValue,
    newValue,
  });
}

// =============================================================================
// セキュリティイベントログ
// =============================================================================

/**
 * 権限不足を記録する（非ブロッキング）。
 *
 * # なぜ `void promise` ではなく void 関数なのか
 *
 * 呼び出し側 6 箇所すべてが `void logPermissionDenied(...)` だった（監査 F-102）。
 * `void` は**待たない**ことしか表明しておらず、reject を捨てる。
 *
 * 監査行の書込 (`createAuditLog`) は自前で try/catch 済みなので残る。捨てられて
 * いたのは**後段の `notifyPermissionDeniedSpikeIfNeeded`**（同一ユーザーの権限拒否
 * スパイク ＝ 権限の総当たりを検知して運用へ通知する経路）で、ここが落ちると
 * **通知も痕跡も何も残らない**。攻撃の兆候だけが黙って消える。
 *
 * そこで async を export せず、`fireAndForget` で包んだ**void 関数だけ**を出す。
 * 「待たない」は関数の型で表現され、失敗は `logError` に必ず残る。呼び出し側で
 * `void` を書ける形に戻さないこと — 戻した瞬間、6 箇所の握り潰しが復活する。
 */
export function recordPermissionDenied(
  userId: string,
  resource: string,
  // **`AuditAction` ではない。** DB の `audit_logs.action` に入るのは
  // `PERMISSION_DENIED` 固定で、ここで受けるのは*拒否された権限操作*
  // （`"create"` / `"read"` …）。metadata に記録するだけなので型が違う。
  action: Action,
  resourceId?: string,
): void {
  fireAndForget(
    (async () => {
      await createAuditLog({
        userId,
        action: AuditAction.PERMISSION_DENIED,
        resource,
        resourceId,
        metadata: { attemptedAction: action },
      });

      await notifyPermissionDeniedSpikeIfNeeded(userId);
    })(),
    {
      operation: "recordPermissionDenied",
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { resource, resourceId, userId, attemptedAction: action },
    },
  );
}

// =============================================================================
// Bulk Audit Emission
// =============================================================================

/**
 * bulk 系 admin action で per-entity の AuditLog を fireAndForget で書き出す SSoT。
 *
 * # 背景
 *
 * `executeAdminMutationResult` は成功後に単一の集約 AuditLog（`logAction`）を
 * 書くのみ。bulk 操作では resourceId が単一 id では表現できず、結果として
 * 「30 件キャンセルしたが AuditLog 上は resource=reservation の集約行 1 件だけ、
 * どの id が影響を受けたかは復元不能」という forensic ギャップが生じる。
 *
 * この helper は bulk 系 action の `afterSuccess` から呼ぶ。ip / userAgent /
 * userId を 1 度だけ引数で受け取り、`records` を loop して per-id で
 * `createAuditLogRecord` を発火する。個別書込は `fireAndForget` で非ブロッキング。
 *
 * # 契約
 *
 * - 各 record は `resourceId` を必須 (bulk の目的は「どの id に影響したか」を残すこと)。
 * - `metadata` は record 個別追加 (`additionalMetadata`) と shared (`metadata` 引数)
 *   をマージする (records で共通の request context は shared に置く)。
 * - 個別書込の失敗は `fireAndForget` の logError に吸収され、他 record の書込を
 *   ブロックしない。
 */
export type BulkAuditRecord = {
  resourceId: string;
  action: AuditAction;
  oldValue?: AuditJsonPayload | typeof Prisma.JsonNull | undefined;
  newValue?: AuditJsonPayload | typeof Prisma.JsonNull | undefined;
  additionalMetadata?: Record<string, unknown> | undefined;
};

export type EmitBulkAuditRecordsArgs = {
  resource: string;
  userId: string;
  records: ReadonlyArray<BulkAuditRecord>;
  metadata?: Record<string, unknown> | undefined;
};

export function emitBulkAuditRecords(args: EmitBulkAuditRecordsArgs): void {
  const { resource, userId, records, metadata } = args;
  const sharedMetadata = metadata ?? {};

  for (const record of records) {
    fireAndForget(
      createAuditLogRecord(
        omitUndefined({
          userId,
          action: record.action,
          resource,
          resourceId: record.resourceId,
          oldValue: record.oldValue,
          newValue: record.newValue,
          metadata: {
            ...sharedMetadata,
            ...(record.additionalMetadata ?? {}),
          },
        }),
      ),
      {
        operation: "emitBulkAuditRecords",
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.MEDIUM,
        context: {
          resource,
          resourceId: record.resourceId,
          userId,
          action: record.action,
        },
      },
    );
  }
}
