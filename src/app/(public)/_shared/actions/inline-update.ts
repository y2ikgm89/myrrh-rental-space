'use server'

/**
 * インライン編集用コンテンツ更新 Server Actions
 *
 * 公開ページからのコンテンツ更新を処理
 * 管理者認証必須
 */

import { updateTag } from 'next/cache'
import { CACHE_TAGS } from '@/shared/lib/constants'
import { prisma } from '@/shared/lib/prisma'
import { verifyAdminSession } from '@/shared/lib/auth'
import { logError, ErrorCategory, ErrorSeverity, normalizeError } from '@/shared/lib/errors'
import { createSuccess, createFailure, type ActionResult } from '@/shared/types/server-actions'

// =============================================================================
// Types
// =============================================================================

/** コンテンツタイプ */
type ContentType = 'page' | 'post' | 'news' | 'space' | 'homepage-section'

/** 更新入力 */
type InlineUpdateInput = {
  /** コンテンツタイプ */
  type: ContentType
  /** コンテンツID（slug または id） */
  id: string
  /** HTMLコンテンツ */
  content: string
}

// =============================================================================
// Page Update
// =============================================================================

async function updatePageContent(
  _slug: string,
  _content: string
): Promise<ActionResult> {
  // ページのcontentカラムは廃止されました。
  // セクションシステムを使用してください。
  return createFailure('ページのインライン編集はセクションシステムに移行しました。管理画面のセクションエディタをご利用ください。')
}

// =============================================================================
// Post Update
// =============================================================================

async function updatePostContent(
  id: string,
  content: string
): Promise<ActionResult> {
  const post = await prisma.post.findUnique({
    where: { id },
    select: { slug: true },
  })

  if (!post) {
    return createFailure('投稿が見つかりません')
  }

  await prisma.post.update({
    where: { id },
    data: { content },
  })

  updateTag(CACHE_TAGS.POSTS)
  updateTag(`${CACHE_TAGS.POSTS}-${post.slug}`)

  return createSuccess('保存しました')
}

// =============================================================================
// News Update
// =============================================================================

async function updateNewsContent(
  id: string,
  content: string
): Promise<ActionResult> {
  const news = await prisma.news.findUnique({
    where: { id },
    select: { slug: true },
  })

  if (!news) {
    return createFailure('ニュースが見つかりません')
  }

  await prisma.news.update({
    where: { id },
    data: { content },
  })

  updateTag(CACHE_TAGS.NEWS)
  updateTag(`${CACHE_TAGS.NEWS}-slug-${news.slug}`)

  return createSuccess('保存しました')
}

// =============================================================================
// Space Update
// =============================================================================

async function updateSpaceContent(
  id: string,
  content: string
): Promise<ActionResult> {
  const space = await prisma.space.findUnique({
    where: { id },
    select: { slug: true },
  })

  if (!space) {
    return createFailure('スペースが見つかりません')
  }

  await prisma.space.update({
    where: { id },
    data: { description: content },
  })

  updateTag(CACHE_TAGS.SPACES)
  updateTag(`${CACHE_TAGS.SPACES}-slug-${space.slug}`)

  return createSuccess('保存しました')
}

// =============================================================================
// Homepage Section Update
// =============================================================================

async function updateHomepageSectionContent(
  id: string,
  content: string
): Promise<ActionResult> {
  const section = await prisma.homepageSection.findUnique({
    where: { id },
    select: { id: true, type: true },
  })

  if (!section) {
    return createFailure('セクションが見つかりません')
  }

  // CUSTOMタイプのみコンテンツ更新を許可
  if (section.type !== 'CUSTOM') {
    return createFailure('このセクションタイプはインライン編集に対応していません')
  }

  await prisma.homepageSection.update({
    where: { id },
    data: { content },
  })

  updateTag(CACHE_TAGS.HOMEPAGE_SECTIONS)

  return createSuccess('保存しました')
}

// =============================================================================
// Main Action
// =============================================================================

/**
 * コンテンツをインライン更新
 *
 * @param input - 更新入力
 * @returns ActionResult
 */
export async function updateContentInline(
  input: InlineUpdateInput
): Promise<ActionResult> {
  // 認証チェック
  try {
    await verifyAdminSession()
  } catch {
    return createFailure('ログインが必要です')
  }

  try {
    switch (input.type) {
      case 'page':
        return await updatePageContent(input.id, input.content)

      case 'post':
        return await updatePostContent(input.id, input.content)

      case 'news':
        return await updateNewsContent(input.id, input.content)

      case 'space':
        return await updateSpaceContent(input.id, input.content)

      case 'homepage-section':
        return await updateHomepageSectionContent(input.id, input.content)

      default:
        return createFailure('不正なコンテンツタイプです')
    }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'updateContentInline', input },
    })
    return createFailure('コンテンツの更新中にエラーが発生しました')
  }
}
