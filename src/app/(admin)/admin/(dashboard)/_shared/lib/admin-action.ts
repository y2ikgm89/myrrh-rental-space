import "server-only";

import type { AdminUser } from "@/shared/lib/admin-auth";
import {
  type Resource,
  type Action,
  hasPermission,
  userHasResourceAccess,
  isEditorRole,
} from "@/admin/lib/permissions";
import { checkAdminAuth, logAction } from "@/admin/lib/action-auth";
import { logPermissionDenied } from "@/admin/lib/audit";
import { isDomainError } from "@/shared/domain/domain-error";
import { fireAndForget } from "@/shared/lib/async-utils";
import { withPurgeBatch } from "@/shared/lib/cache/batcher";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors/server";
import type { MutationResult } from "@/shared/lib/mutation-result";

/**
 * 共通フィールド（resourceId 解決方法に依存しない部分）。
 *
 * @see ExecuteAdminMutationResultOptions for the discriminated full type.
 */
type ExecuteAdminMutationResultCommon<TData> = {
  resource: Resource;
  action: Action;
  /** EDITOR の `userPageAssignment` を参照する resource-level access チェックを有効化 */
  checkResourceAccess?: boolean;
  execute: (user: AdminUser) => Promise<TData>;
  afterSuccess?: (data: TData) => Promise<void> | void;
  /** 実行結果から監査ログ用 resourceId を解決（create 系で execute 後に id 確定するケース） */
  resolveAuditResourceId?: (data: TData) => string | undefined;
};

/**
 * `executeAdminMutationResult` のオプション。
 *
 * `resourceId` と `resolveResourceId` は型レベルで排他化されている:
 * - 静的に既知の resourceId（input から直接渡せる場合）→ `resourceId`
 * - 認証後に DB から解決する必要がある場合 → `resolveResourceId`
 *   （sectionId → pageId のような認可キー解決パターン）
 * - resourceId を一切持たない操作（list / 集計）→ どちらも省略
 *
 * **`resolveResourceId` は認証後に呼ばれる** — 認証前の DB lookup を防ぐ
 * 公式の「認証 → 解決 → 認可 → 実行」順序を保証する。
 */
export type ExecuteAdminMutationResultOptions<TData> =
  ExecuteAdminMutationResultCommon<TData> &
    (
      | { resourceId: string; resolveResourceId?: never }
      | {
          resourceId?: never;
          resolveResourceId: (user: AdminUser) => Promise<string | null>;
        }
      | { resourceId?: never; resolveResourceId?: never }
    );

/**
 * 管理画面 Server Action 用の標準ラッパー。
 *
 * **実行順序契約**（不変）:
 *   1. `checkAdminAuth()` — 認証（DB lookup より前に必ず）
 *   2. `resolveResourceId(user)` — 認証後に resourceId を解決（指定時のみ）
 *   3. `hasPermission()` — RBAC ロールベース認可
 *   4. `userHasResourceAccess()` — EDITOR の `userPageAssignment` チェック（`checkResourceAccess: true` 時のみ）
 *   5. `execute(user)` — DB mutation（DomainError は `MutationError` に自動変換）
 *   6. `await afterSuccess(data)` — クリティカル副作用（cache invalidation 等）
 *   7. `fireAndForget(logAction)` — 監査ログ（非ブロッキング）
 *
 * 順序を変えると下記 silent regression が発生する:
 * - 1 を 2 より後に置く → 未認証で DB lookup（DoS / cache-layer poisoning 経路）
 * - 6 を 7 より後に置く → 監査書き込み失敗で cache invalidation が skip → 公開ページ stale
 *
 * @see CLAUDE.md §コア規約 / executeAdminMutationResult 実行順序契約
 */
export async function executeAdminMutationResult<TData>(
  options: ExecuteAdminMutationResultOptions<TData>,
): Promise<MutationResult<TData>> {
  // 1. 認証 — DB lookup より前に必ず実行（DoS 経路防止）
  const authResult = await checkAdminAuth();
  if (!authResult.success) {
    return { error: authResult.error.error };
  }
  const { user } = authResult;

  // 2. resourceId 解決 — 認証後に DB lookup
  let resourceId = options.resourceId;
  if (options.resolveResourceId) {
    const resolved = await options.resolveResourceId(user);
    if (resolved === null) {
      return {
        error: "対象リソースが見つかりません",
        code: "NOT_FOUND",
      };
    }
    resourceId = resolved;
  }

  // 3. RBAC 権限チェック
  if (!hasPermission(user.role, options.resource, options.action)) {
    void logPermissionDenied(
      user.id,
      options.resource,
      options.action,
      resourceId,
    );
    return {
      error: `${options.resource}の${options.action}権限がありません`,
    };
  }

  // 4. EDITOR の resource-level access チェック
  if (options.checkResourceAccess && isEditorRole(user.role)) {
    const allowed = await userHasResourceAccess(
      user,
      options.resource,
      options.action,
      resourceId,
    );
    if (!allowed) {
      void logPermissionDenied(
        user.id,
        options.resource,
        options.action,
        resourceId,
      );
      return { error: "このリソースへのアクセス権がありません" };
    }
  }

  // 5-7. 実行 + afterSuccess + 監査ログ
  // withPurgeBatch wraps to coalesce all queueTagPurge calls (issued from inside
  // afterSuccess via invalidateSiteWideCache) into a single Cloudflare API call.
  // Early-return paths above (auth/permission failure) deliberately skip this scope
  // since they don't invoke afterSuccess.
  return withPurgeBatch(async () => {
    try {
      const data = await options.execute(user);
      await options.afterSuccess?.(data);

      fireAndForget(
        logAction(
          user.id,
          options.action,
          options.resource,
          options.resolveAuditResourceId?.(data) ?? resourceId,
        ),
        {
          operation: "executeAdminMutationResult.logAction",
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.MEDIUM,
          context: {
            resource: options.resource,
            action: options.action,
            userId: user.id,
          },
        },
      );

      return data;
    } catch (error) {
      if (isDomainError(error)) {
        return {
          error: error.message,
          code: error.code,
        };
      }

      throw error;
    }
  });
}
