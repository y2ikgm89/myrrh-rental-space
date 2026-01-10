'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createSuccess, createFailure, withAuth } from '@/types'

// =============================================================================
// Types
// =============================================================================

export type AnnouncementBarData = {
  id: string
  message: string
  type: string
  linkUrl: string | null
  linkText: string | null
  bgColor: string | null
  textColor: string | null
  isActive: boolean
  priority: number
  startAt: Date | null
  endAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type GetAnnouncementBarsResult = {
  items: AnnouncementBarData[]
  total: number
}

// =============================================================================
// Schemas
// =============================================================================

const announcementBarSchema = z.object({
  message: z.string().min(1, 'メッセージは必須です').max(200, 'メッセージは200文字以内で入力してください'),
  type: z.enum(['info', 'warning', 'promo']).default('info'),
  linkUrl: z.string().url('有効なURLを入力してください').or(z.literal('')).nullable().optional(),
  linkText: z.string().max(50, 'リンクテキストは50文字以内').nullable().optional(),
  bgColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, '有効な色コードを入力してください').transform(v => v.toLowerCase()).or(z.literal('')).nullable().optional(),
  textColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, '有効な色コードを入力してください').transform(v => v.toLowerCase()).or(z.literal('')).nullable().optional(),
  isActive: z.boolean().default(true),
  priority: z.number().int().min(0).max(100).default(0),
  startAt: z.string().nullable().optional(),
  endAt: z.string().nullable().optional(),
})

export type AnnouncementBarInput = z.infer<typeof announcementBarSchema>

// =============================================================================
// Actions
// =============================================================================

/**
 * お知らせバー一覧を取得（管理画面用）
 */
export async function getAnnouncementBars(): Promise<GetAnnouncementBarsResult> {
  const items = await prisma.announcementBar.findMany({
    orderBy: [
      { priority: 'desc' },
      { createdAt: 'desc' },
    ],
  })

  return {
    items,
    total: items.length,
  }
}

/**
 * 有効なお知らせバーを複数取得（フロントエンド用）
 * 優先度順、表示期間内のもののみ
 */
export async function getActiveAnnouncementBars(): Promise<AnnouncementBarData[]> {
  const now = new Date()

  const bars = await prisma.announcementBar.findMany({
    where: {
      isActive: true,
      OR: [
        // 期間指定なし
        { startAt: null, endAt: null },
        // 開始日のみ指定
        { startAt: { lte: now }, endAt: null },
        // 終了日のみ指定
        { startAt: null, endAt: { gte: now } },
        // 両方指定
        { startAt: { lte: now }, endAt: { gte: now } },
      ],
    },
    orderBy: [
      { priority: 'desc' },
      { createdAt: 'desc' },
    ],
  })

  return bars
}

/**
 * お知らせバー詳細を取得
 */
export async function getAnnouncementBarById(id: string): Promise<AnnouncementBarData | null> {
  return prisma.announcementBar.findUnique({
    where: { id },
  })
}

/**
 * お知らせバーを作成
 */
export const createAnnouncementBar = withAuth(async (_user, data: AnnouncementBarInput) => {
  const parsed = announcementBarSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  const {
    message,
    type,
    linkUrl,
    linkText,
    bgColor,
    textColor,
    isActive,
    priority,
    startAt,
    endAt,
  } = parsed.data

  const bar = await prisma.announcementBar.create({
    data: {
      message,
      type,
      linkUrl: linkUrl || null,
      linkText: linkText || null,
      bgColor: bgColor || null,
      textColor: textColor || null,
      isActive,
      priority,
      startAt: startAt ? new Date(startAt) : null,
      endAt: endAt ? new Date(endAt) : null,
    },
  })

  revalidatePath('/admin/settings/announcement-bar')
  revalidatePath('/', 'layout')

  return createSuccess('お知らせバーを作成しました', { id: bar.id })
})

/**
 * お知らせバーを更新
 */
export const updateAnnouncementBar = withAuth(async (_user, id: string, data: AnnouncementBarInput) => {
  const parsed = announcementBarSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  const existing = await prisma.announcementBar.findUnique({
    where: { id },
  })

  if (!existing) {
    return createFailure('お知らせバーが見つかりません')
  }

  const {
    message,
    type,
    linkUrl,
    linkText,
    bgColor,
    textColor,
    isActive,
    priority,
    startAt,
    endAt,
  } = parsed.data

  await prisma.announcementBar.update({
    where: { id },
    data: {
      message,
      type,
      linkUrl: linkUrl || null,
      linkText: linkText || null,
      bgColor: bgColor || null,
      textColor: textColor || null,
      isActive,
      priority,
      startAt: startAt ? new Date(startAt) : null,
      endAt: endAt ? new Date(endAt) : null,
    },
  })

  revalidatePath('/admin/settings/announcement-bar')
  revalidatePath('/', 'layout')

  return createSuccess('お知らせバーを更新しました')
})

/**
 * お知らせバーを削除
 */
export const deleteAnnouncementBar = withAuth(async (_user, id: string) => {
  const bar = await prisma.announcementBar.findUnique({
    where: { id },
  })

  if (!bar) {
    return createFailure('お知らせバーが見つかりません')
  }

  await prisma.announcementBar.delete({
    where: { id },
  })

  revalidatePath('/admin/settings/announcement-bar')
  revalidatePath('/', 'layout')

  return createSuccess('お知らせバーを削除しました')
})

/**
 * 有効/無効を切り替え
 */
export const toggleAnnouncementBarActive = withAuth(async (_user, id: string) => {
  const bar = await prisma.announcementBar.findUnique({
    where: { id },
  })

  if (!bar) {
    return createFailure('お知らせバーが見つかりません')
  }

  await prisma.announcementBar.update({
    where: { id },
    data: {
      isActive: !bar.isActive,
    },
  })

  revalidatePath('/admin/settings/announcement-bar')
  revalidatePath('/', 'layout')

  return createSuccess('状態を変更しました')
})
