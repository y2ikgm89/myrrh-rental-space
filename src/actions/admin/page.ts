'use server'

/**
 * ページ管理用Server Actions
 *
 * 管理画面からの公開ページ編集用
 */

import { revalidatePath, revalidateTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { verifyAdminSession } from '@/lib/auth'
import {
  updatePageSchema,
  createPageSchema,
  SYSTEM_PAGE_SLUGS,
  type UpdatePageInput,
  type CreatePageInput,
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
        contentWidth: parsed.data.contentWidth ?? null,
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
 * ページ作成（存在しない場合）- 内部用
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
      return existingPage as PageData
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

    return page as PageData
  } catch (error) {
    console.error('ページ作成エラー:', error)
    return null
  }
}

/**
 * 新規ページ作成
 */
export async function createPage(
  input: CreatePageInput
): Promise<PageActionResult & { slug?: string }> {
  try {
    await verifyAdminSession()
  } catch {
    return { success: false, error: 'ログインが必要です' }
  }

  // バリデーション
  const parsed = createPageSchema.safeParse(input)
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
    // スラッグの重複チェック
    const existingPage = await prisma.page.findUnique({
      where: { slug: parsed.data.slug },
    })

    if (existingPage) {
      return {
        success: false,
        error: 'このスラッグは既に使用されています',
        fieldErrors: { slug: ['このスラッグは既に使用されています'] },
      }
    }

    // ページ作成
    const page = await prisma.page.create({
      data: {
        slug: parsed.data.slug,
        title: parsed.data.title,
        description: parsed.data.description || null,
        content: '<div></div>',
        isPublished: parsed.data.isPublished,
        isActive: true,
      },
    })

    // キャッシュ無効化
    revalidatePath('/admin/pages')
    revalidateTag('pages', { expire: 0 })

    return {
      success: true,
      message: 'ページを作成しました',
      slug: page.slug,
    }
  } catch (error) {
    console.error('ページ作成エラー:', error)
    return { success: false, error: 'ページの作成中にエラーが発生しました' }
  }
}

/**
 * ページ削除（論理削除）
 */
export async function deletePage(slug: string): Promise<PageActionResult> {
  try {
    await verifyAdminSession()
  } catch {
    return { success: false, error: 'ログインが必要です' }
  }

  // システムページは削除不可
  if (SYSTEM_PAGE_SLUGS.includes(slug as typeof SYSTEM_PAGE_SLUGS[number])) {
    return { success: false, error: 'システムページは削除できません' }
  }

  try {
    const existingPage = await prisma.page.findUnique({
      where: { slug },
    })

    if (!existingPage) {
      return { success: false, error: 'ページが見つかりません' }
    }

    // 論理削除（isActive = false）
    await prisma.page.update({
      where: { slug },
      data: {
        isActive: false,
        isPublished: false,
      },
    })

    // キャッシュ無効化
    revalidatePath(`/${slug}`)
    revalidatePath('/admin/pages')
    revalidateTag('pages', { expire: 0 })
    revalidateTag(`page-${slug}`, { expire: 0 })

    return { success: true, message: 'ページを削除しました' }
  } catch (error) {
    console.error('ページ削除エラー:', error)
    return { success: false, error: 'ページの削除中にエラーが発生しました' }
  }
}

/**
 * ページ完全削除（物理削除）- 管理者のみ
 */
export async function deletePagePermanently(
  slug: string
): Promise<PageActionResult> {
  try {
    await verifyAdminSession()
  } catch {
    return { success: false, error: 'ログインが必要です' }
  }

  // システムページは削除不可
  if (SYSTEM_PAGE_SLUGS.includes(slug as typeof SYSTEM_PAGE_SLUGS[number])) {
    return { success: false, error: 'システムページは削除できません' }
  }

  try {
    const existingPage = await prisma.page.findUnique({
      where: { slug },
    })

    if (!existingPage) {
      return { success: false, error: 'ページが見つかりません' }
    }

    // 物理削除
    await prisma.page.delete({
      where: { slug },
    })

    // キャッシュ無効化
    revalidatePath(`/${slug}`)
    revalidatePath('/admin/pages')
    revalidateTag('pages', { expire: 0 })
    revalidateTag(`page-${slug}`, { expire: 0 })

    return { success: true, message: 'ページを完全に削除しました' }
  } catch (error) {
    console.error('ページ完全削除エラー:', error)
    return { success: false, error: 'ページの削除中にエラーが発生しました' }
  }
}

/**
 * ページ復元（論理削除からの復元）
 */
export async function restorePage(slug: string): Promise<PageActionResult> {
  try {
    await verifyAdminSession()
  } catch {
    return { success: false, error: 'ログインが必要です' }
  }

  try {
    const existingPage = await prisma.page.findUnique({
      where: { slug },
    })

    if (!existingPage) {
      return { success: false, error: 'ページが見つかりません' }
    }

    if (existingPage.isActive) {
      return { success: false, error: 'このページは既にアクティブです' }
    }

    // 復元
    await prisma.page.update({
      where: { slug },
      data: {
        isActive: true,
      },
    })

    // キャッシュ無効化
    revalidatePath('/admin/pages')
    revalidateTag('pages', { expire: 0 })

    return { success: true, message: 'ページを復元しました' }
  } catch (error) {
    console.error('ページ復元エラー:', error)
    return { success: false, error: 'ページの復元中にエラーが発生しました' }
  }
}

/**
 * 削除済みページ一覧取得
 */
export async function getDeletedPagesList(): Promise<PageData[]> {
  await verifyAdminSession()

  const pages = await prisma.page.findMany({
    where: { isActive: false },
    orderBy: { updatedAt: 'desc' },
  })

  return pages as PageData[]
}

/**
 * ページ公開状態の切り替え
 */
export async function togglePagePublished(
  slug: string
): Promise<PageActionResult> {
  try {
    await verifyAdminSession()
  } catch {
    return { success: false, error: 'ログインが必要です' }
  }

  try {
    const existingPage = await prisma.page.findUnique({
      where: { slug },
    })

    if (!existingPage) {
      return { success: false, error: 'ページが見つかりません' }
    }

    const newPublishedState = !existingPage.isPublished

    await prisma.page.update({
      where: { slug },
      data: {
        isPublished: newPublishedState,
        publishedAt: newPublishedState ? new Date() : null,
      },
    })

    // キャッシュ無効化
    revalidatePath(`/${slug}`)
    revalidatePath('/admin/pages')
    revalidateTag('pages', { expire: 0 })
    revalidateTag(`page-${slug}`, { expire: 0 })

    return {
      success: true,
      message: newPublishedState ? 'ページを公開しました' : 'ページを非公開にしました',
    }
  } catch (error) {
    console.error('ページ公開状態変更エラー:', error)
    return { success: false, error: 'ページの更新中にエラーが発生しました' }
  }
}

