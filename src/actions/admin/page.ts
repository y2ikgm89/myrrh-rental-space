'use server'

/**
 * ページ管理用Server Actions
 *
 * 管理画面からの公開ページ編集用
 */

import { revalidatePath, revalidateTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { verifyAdminSession } from '@/lib/auth'
import { LayoutWidth } from '@/types/prisma'
import {
  updatePageSchema,
  type UpdatePageInput,
  type PageData,
  type PageActionResult,
} from '@/lib/validations/page'

/**
 * 管理画面用ページ一覧取得
 * @throws {Error} 認証が必要な場合
 */
export async function getPagesList(): Promise<PageData[]> {
  await verifyAdminSession()

  const pages = await prisma.page.findMany({
    where: { isActive: true },
    orderBy: { updatedAt: 'desc' },
  })

  return pages
}

/**
 * スラッグでページ取得（管理画面用）
 * @throws {Error} 認証が必要な場合
 */
export async function getPageBySlug(slug: string): Promise<PageData | null> {
  await verifyAdminSession()

  const page = await prisma.page.findUnique({
    where: { slug },
  })

  return page
}

/**
 * 公開ページ用ページ取得（isPublishedチェック付き）
 */
export async function getPageForPublic(slug: string): Promise<PageData | null> {
  const page = await prisma.page.findUnique({
    where: {
      slug,
      isPublished: true,
      isActive: true,
    },
  })

  return page
}

/**
 * ページ更新
 */
export async function updatePage(
  slug: string,
  input: UpdatePageInput
): Promise<PageActionResult> {
  try {
    await verifyAdminSession()
  } catch {
    return { success: false, error: 'ログインが必要です' }
  }

  // バリデーション
  const parsed = updatePageSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {}
    for (const error of parsed.error.issues) {
      const field = error.path.join('.')
      if (!fieldErrors[field]) {
        fieldErrors[field] = []
      }
      fieldErrors[field].push(error.message)
    }
    return {
      success: false,
      error: 'バリデーションエラー',
      fieldErrors,
    }
  }

  try {
    // ページが存在するか確認
    const existingPage = await prisma.page.findUnique({
      where: { slug },
    })

    if (!existingPage) {
      return { success: false, error: 'ページが見つかりません' }
    }

    // 更新
    await prisma.page.update({
      where: { slug },
      data: {
        title: parsed.data.title,
        description: parsed.data.description || null,
        content: parsed.data.content,
        metaDescription: parsed.data.metaDescription || null,
        metaKeywords: parsed.data.metaKeywords || null,
        ogpTitle: parsed.data.ogpTitle || null,
        ogpDescription: parsed.data.ogpDescription || null,
        ogpImageUrl: parsed.data.ogpImageUrl || null,
        isPublished: parsed.data.isPublished,
        publishedAt: parsed.data.publishedAt || null,
        contentWidth: parsed.data.contentWidth
          ? (parsed.data.contentWidth as LayoutWidth)
          : null,
        contentWidthCustom: parsed.data.contentWidthCustom ?? null,
      },
    })

    // キャッシュ無効化
    revalidatePath(`/${slug}`)
    revalidatePath('/admin/pages')
    revalidatePath(`/admin/pages/${slug}/edit`)
    revalidateTag('pages', { expire: 0 })
    revalidateTag(`page-${slug}`, { expire: 0 })

    return { success: true, message: 'ページを更新しました' }
  } catch (error) {
    console.error('ページ更新エラー:', error)
    return { success: false, error: 'ページの更新中にエラーが発生しました' }
  }
}

/**
 * ページ作成（存在しない場合）
 */
export async function createPageIfNotExists(
  slug: string,
  title: string,
  content: string
): Promise<PageData | null> {
  try {
    await verifyAdminSession()
  } catch {
    return null
  }

  try {
    const existingPage = await prisma.page.findUnique({
      where: { slug },
    })

    if (existingPage) {
      return existingPage
    }

    const page = await prisma.page.create({
      data: {
        slug,
        title,
        content,
        isPublished: true,
        isActive: true,
      },
    })

    return page
  } catch (error) {
    console.error('ページ作成エラー:', error)
    return null
  }
}

