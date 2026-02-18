/**
 * システムページブートストラップ
 *
 * サーバー起動時（instrumentation.ts）に全システムページ + デフォルトセクションを自動保証。
 * seed 未実行でも公開ページが正しく表示されるようにする。
 *
 * - 冪等: 既存データがあれば何もしない
 * - per-page try/catch: 1ページの失敗で他を止めない
 * - 絶対に throw しない（サーバー起動をブロックしない）
 */

import { prisma } from '@/shared/lib/prisma'
import { SYSTEM_PAGES } from '@/shared/lib/validations/page'
import { ensurePageSections, ensureHomepageSections } from '@/shared/lib/section-defaults'
import { logError } from '@/shared/lib/errors/logger'
import { ErrorCategory, ErrorSeverity } from '@/shared/lib/errors/types'

/**
 * 全システムページ + デフォルトセクションを保証
 *
 * instrumentation.ts および prisma/seed.ts から呼び出される。
 * 認証不要（インフラ操作）。
 */
export async function bootstrapSystemPages(): Promise<void> {
  // home はセクションが pageId: null なので別処理
  try {
    await ensureHomepageSections()
  } catch (error) {
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'bootstrapSystemPages', slug: 'home' },
    })
  }

  for (const definition of SYSTEM_PAGES) {
    // home は上で処理済み（pageId: null セクション）
    if (definition.slug === 'home') continue

    try {
      const existingPage = await prisma.page.findUnique({
        where: { slug: definition.slug },
        select: { id: true, isSystemPage: true },
      })

      if (existingPage) {
        // isSystemPage フラグが false なら true に更新
        if (!existingPage.isSystemPage) {
          await prisma.page.update({
            where: { id: existingPage.id },
            data: { isSystemPage: true },
          })
        }
        // 既存ページにもデフォルトセクションを確保（additive）
        await ensurePageSections(existingPage.id, definition.slug)
      } else {
        // ページ未存在 → 作成
        const page = await prisma.page.create({
          data: {
            slug: definition.slug,
            title: definition.title,
            description: definition.description,
            isPublished: true,
            isActive: true,
            isSystemPage: true,
          },
        })
        await ensurePageSections(page.id, definition.slug)
      }
    } catch (error) {
      logError(error, {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.MEDIUM,
        context: { operation: 'bootstrapSystemPages', slug: definition.slug },
      })
    }
  }
}
