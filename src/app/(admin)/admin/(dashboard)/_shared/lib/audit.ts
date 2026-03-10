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
import { AuditAction } from "@/shared/db/enums";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
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
  userId?: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  oldValue?: object;
  newValue?: object;
  metadata?: object;
};

export type AuditLogMetadata = {
  ipAddress?: string;
  userAgent?: string;
  [key: string]: unknown;
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * リクエストメタデータを取得
 */
async function getRequestMetadata(): Promise<AuditLogMetadata> {
  try {
    const headersList = await headers();
    return {
      ipAddress:
        headersList.get("x-forwarded-for") ??
        headersList.get("x-real-ip") ??
        undefined,
      userAgent: headersList.get("user-agent") ?? undefined,
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
    await createAuditLogRecord({
      userId: input.userId,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId,
      oldValue: input.oldValue,
      newValue: input.newValue,
      metadata: { ...metadata, ...input.metadata },
    });
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
