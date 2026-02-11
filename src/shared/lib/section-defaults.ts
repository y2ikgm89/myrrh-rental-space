/**
 * セクション自動生成
 *
 * システムページのデフォルトセクションを自動作成する。
 * seed.ts と admin の ensureSystemPage の両方から使用。
 *
 * Serializable トランザクションで count + create を原子的に実行し、
 * 同時リクエストによるレースコンディション（重複作成）を防止。
 * 競合時のシリアライゼーション失敗は安全に無視する（もう片方が作成済み）。
 */

import { prisma } from '@/shared/lib/prisma'
import { DEFAULT_PAGE_SECTIONS } from '@/shared/lib/constants/default-page-sections'
import { defaultHomepageSectionOrder, defaultSectionConfigs } from '@/shared/lib/validations/section'

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

  // 高速パス: トランザクション外で先にチェック（大半のリクエストはここで終了）
  const existingCount = await prisma.section.count({
    where: { pageId },
  })
  if (existingCount > 0) {
    return 0
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // トランザクション内で再チェック（Serializable で原子性保証）
      const count = await tx.section.count({
        where: { pageId },
      })
      if (count > 0) {
        return 0
      }

      const created = await tx.section.createMany({
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
    }, { isolationLevel: 'Serializable' })
  } catch {
    // シリアライゼーション競合: 別リクエストが先に作成済み → 正常
    return 0
  }
}

/**
 * ホームページにセクションが存在しない場合、デフォルトセクションを作成
 *
 * admin のホームページ編集ページから呼ばれる（ensureSystemPage と同パターン）。
 * 公開ページからは呼ばない（読み取り専用）。
 *
 * @returns 作成されたセクション数
 */
export async function ensureHomepageSections(): Promise<number> {
  // 高速パス: トランザクション外で先にチェック（大半のリクエストはここで終了）
  const existingCount = await prisma.section.count({
    where: { pageId: null },
  })
  if (existingCount > 0) {
    return 0
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // トランザクション内で再チェック（Serializable で原子性保証）
      const count = await tx.section.count({
        where: { pageId: null },
      })
      if (count > 0) {
        return 0
      }

      const created = await tx.section.createMany({
        data: defaultHomepageSectionOrder.map((type, index) => ({
          pageId: undefined,
          type,
          config: defaultSectionConfigs[type],
          design: {},
          order: index,
          isActive: true,
        })),
      })

      return created.count
    }, { isolationLevel: 'Serializable' })
  } catch {
    // シリアライゼーション競合: 別リクエストが先に作成済み → 正常
    return 0
  }
}
