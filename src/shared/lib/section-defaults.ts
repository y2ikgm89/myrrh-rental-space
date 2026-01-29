/**
 * セクション自動生成
 *
 * システムページのデフォルトセクションを自動作成する。
 * seed.ts と admin の ensureSystemPage の両方から使用。
 */

import { prisma } from '@/shared/lib/prisma'
import { DEFAULT_PAGE_SECTIONS } from '@/shared/lib/constants/default-page-sections'

/**
 * ページにセクションが存在しない場合、デフォルトセクションを作成
 *
 * @param pageId - ページID
 * @param slug - ページスラッグ（デフォルトセクション定義のキー）
 * @returns 作成されたセクション数
 */
export async function ensurePageSections(pageId: string, slug: string): Promise<number> {
  // デフォルト定義が存在しないスラッグは何もしない
  const defaults = DEFAULT_PAGE_SECTIONS[slug]
  if (!defaults || defaults.length === 0) {
    return 0
  }

  // 既存セクションがあれば何もしない
  const existingCount = await prisma.pageSection.count({
    where: { pageId },
  })

  if (existingCount > 0) {
    return 0
  }

  // デフォルトセクションを一括作成
  const created = await prisma.pageSection.createMany({
    data: defaults.map((section) => ({
      pageId,
      type: section.type,
      title: section.title,
      config: section.config,
      content: section.content,
      order: section.order,
      isActive: section.isActive,
    })),
  })

  return created.count
}
