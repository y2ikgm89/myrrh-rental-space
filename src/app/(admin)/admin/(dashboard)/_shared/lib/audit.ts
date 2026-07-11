/**
 * 監査ログライブラリ
 *
 * 書き込み操作とセキュリティイベントの記録
 * - 非同期記録（パフォーマンス優先）
 * - 失敗時は無視（ログ記録失敗でビジネスロジックを止めない）
 *
 * @module admin/lib/audit
 */

import "server-only";

import { headers } from "next/headers";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
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
  oldValue?: object | undefined;
  newValue?: object | undefined;
  metadata?: object | undefined;
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
  oldValue?: object,
  newValue?: object,
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
 * 権限不足を記録
 */
export async function logPermissionDenied(
  userId: string,
  resource: string,
  action: string,
  resourceId?: string,
): Promise<void> {
  await createAuditLog({
    userId,
    action: AuditAction.PERMISSION_DENIED,
    resource,
    resourceId,
    metadata: { attemptedAction: action },
  });
}

/**
 * ロール変更を記録
 */
export async function logRoleChange(
  userId: string,
  targetUserId: string,
  oldRole: string,
  newRole: string,
): Promise<void> {
  await createAuditLog({
    userId,
    action: AuditAction.ROLE_CHANGE,
    resource: "user",
    resourceId: targetUserId,
    oldValue: { role: oldRole },
    newValue: { role: newRole },
  });
}
