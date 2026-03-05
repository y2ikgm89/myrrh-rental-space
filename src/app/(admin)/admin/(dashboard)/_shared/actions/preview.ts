"use server";

/**
 * プレビュー用 Server Actions
 */

import { checkReadPermissionFor } from "@/admin/lib/permissions";
import type { Resource } from "@/admin/lib/permissions";
import { renderEditorStateToHtmlLazy } from "@/admin/lib/lazy-renderer";
import { logger } from "@/shared/lib/logger";
import { getErrorMessage } from "@/shared/lib/errors";

/**
 * Lexical JSON → HTML 変換（プレビュー用）
 *
 * 管理者のみ実行可能。
 * @returns 変換済み HTML 文字列。認証失敗・変換エラー時は null。
 */
export async function generatePreviewHtml(
  contentJson: string,
  resource: Extract<Resource, "post" | "news" | "page"> = "post",
): Promise<string | null> {
  const checkReadPermission = checkReadPermissionFor(resource);
  const hasPermission = await checkReadPermission();
  if (!hasPermission) return null;
  if (!contentJson) return "";
  try {
    return await renderEditorStateToHtmlLazy(contentJson);
  } catch (error) {
    logger.error("プレビュー HTML 変換に失敗しました", {
      error: getErrorMessage(error),
      resource,
    });
    return null;
  }
}
