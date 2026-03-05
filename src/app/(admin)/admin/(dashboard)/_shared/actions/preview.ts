"use server";

/**
 * プレビュー用 Server Actions
 */

import { checkReadPermissionFor } from "@/admin/lib/permissions";
import { renderEditorStateToHtmlLazy } from "@/admin/lib/lazy-renderer";

const checkReadPermission = checkReadPermissionFor("post");

/**
 * Lexical JSON → HTML 変換（プレビュー用）
 *
 * 管理者のみ実行可能。
 */
export async function generatePreviewHtml(
  contentJson: string,
): Promise<string> {
  const hasPermission = await checkReadPermission();
  if (!hasPermission) return "";
  if (!contentJson) return "";
  return renderEditorStateToHtmlLazy(contentJson);
}
