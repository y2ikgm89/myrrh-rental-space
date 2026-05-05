/**
 * セクション自動生成
 *
 * システムページのデフォルトセクションを自動作成する。
 * seed.ts と admin の ensureSystemPage の両方から使用。
 *
 * 既にセクションが存在するページでも、デフォルト定義に含まれるが
 * 未作成のセクションタイプがあれば追加作成する（additive）。
 *
 * Serializable トランザクションで原子的に実行し、
 * 同時リクエストによるレースコンディション（重複作成）を防止。
 * 競合時のシリアライゼーション失敗は安全に無視する（もう片方が作成済み）。
 */

import { prisma } from "@/shared/db/prisma";
import { ensurePageSectionsCommand } from "@/shared/domain/pages/system-pages-commands";

/**
 * ページのデフォルトセクションを確保（additive）
 *
 * デフォルト定義に含まれるセクションタイプのうち、
 * ページにまだ存在しないものを作成する。
 *
 * @param pageId - ページID
 * @param slug - ページスラッグ（デフォルトセクション定義のキー）
 * @returns 作成されたセクション数
 */
export async function ensurePageSections(
  pageId: string,
  slug: string,
): Promise<number> {
  return ensurePageSectionsCommand(prisma, pageId, slug);
}
