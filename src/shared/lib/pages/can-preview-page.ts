import type { Role } from "@/shared/lib/validations/enums/prisma-types";
import { hasPermission } from "@/shared/lib/admin-permissions";

/**
 * `/preview/pages/[slug]` の公開状態ゲート（純粋関数）。
 *
 * `userHasResourceAccess(..., "page", "read", pageId)` で page:read と
 * EDITOR 割り当てを確認したうえで呼ぶ。
 *
 * - 公開済み: read があればプレビュー可（VIEWER 含む）
 * - 未公開: `page:update` または `page:publish` が必要（VIEWER は不可）
 */
export function canPreviewPageByPublishState(
  role: Role,
  isPublished: boolean,
): boolean {
  if (isPublished) {
    return true;
  }

  return (
    hasPermission(role, "page", "update") ||
    hasPermission(role, "page", "publish")
  );
}
