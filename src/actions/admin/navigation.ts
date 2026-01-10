'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { NavigationType, SocialPlatform } from '@/generated/prisma/client/enums'
import { z } from 'zod'
import { type ActionResult, createSuccess, createFailure } from '@/types'
import { requireAdmin } from '@/lib/auth'

// =============================================================================
// Types
// =============================================================================

export type NavigationItemData = {
  id: string
  type: NavigationType
  parentId: string | null
  label: string
  url: string
  isExternal: boolean
  order: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  children: NavigationItemData[]
}

export type SocialLinkData = {
  id: string
  platform: SocialPlatform
  url: string
  iconUrl: string | null
  order: number
  isActive: boolean
  showOnDesktop: boolean
  showOnMobile: boolean
  createdAt: Date
  updatedAt: Date
}

// =============================================================================
// Schemas
// =============================================================================

const navigationItemSchema = z.object({
  type: z.enum(['HEADER_DESKTOP', 'HEADER_MOBILE', 'FOOTER']),
  parentId: z.string().uuid().nullable().optional(),
  label: z.string().min(1, 'ラベルは必須です').max(50, 'ラベルは50文字以内'),
  url: z.string().min(1, 'URLは必須です').max(500),
  isExternal: z.boolean().default(false),
  order: z.number().int().min(0),
  isActive: z.boolean().default(true),
})

const socialLinkSchema = z.object({
  platform: z.enum(['TWITTER', 'FACEBOOK', 'INSTAGRAM', 'YOUTUBE', 'LINE', 'TIKTOK', 'OTHER']),
  url: z.string().min(1, 'URLは必須です').url('有効なURLを入力してください'),
  iconUrl: z.string().nullable().optional(),
  order: z.number().int().min(0),
  isActive: z.boolean().default(true),
  showOnDesktop: z.boolean().default(true),
  showOnMobile: z.boolean().default(true),
})

export type NavigationItemInput = z.infer<typeof navigationItemSchema>
export type SocialLinkInput = z.infer<typeof socialLinkSchema>

// =============================================================================
// Navigation Item Actions
// =============================================================================

/**
 * ナビゲーションアイテム一覧を取得
 */
export async function getNavigationItems(type?: NavigationType): Promise<NavigationItemData[]> {
  await requireAdmin()

  const items = await prisma.navigationItem.findMany({
    where: type ? { type, parentId: null } : { parentId: null },
    include: {
      children: {
        orderBy: { order: 'asc' },
      },
    },
    orderBy: { order: 'asc' },
  })

  return items.map((item) => ({
    ...item,
    children: item.children.map((child) => ({
      ...child,
      children: [],
    })),
  }))
}

/**
 * ナビゲーションアイテムを作成
 */
export async function createNavigationItem(
  data: NavigationItemInput
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin()

    const parsed = navigationItemSchema.safeParse(data)
    if (!parsed.success) {
      return createFailure(parsed.error.issues[0].message)
    }

    const item = await prisma.navigationItem.create({
      data: parsed.data,
    })

    revalidatePath('/admin/settings/navigation')
    revalidatePath('/')

    return createSuccess('ナビゲーションを作成しました', { id: item.id })
  } catch (error) {
    console.error('Failed to create navigation item:', error)
    return createFailure('ナビゲーションの作成に失敗しました')
  }
}

/**
 * ナビゲーションアイテムを更新
 */
export async function updateNavigationItem(
  id: string,
  data: NavigationItemInput
): Promise<ActionResult<void>> {
  try {
    await requireAdmin()

    const parsed = navigationItemSchema.safeParse(data)
    if (!parsed.success) {
      return createFailure(parsed.error.issues[0].message)
    }

    const existing = await prisma.navigationItem.findUnique({
      where: { id },
    })

    if (!existing) {
      return createFailure('ナビゲーションが見つかりません')
    }

    await prisma.navigationItem.update({
      where: { id },
      data: parsed.data,
    })

    revalidatePath('/admin/settings/navigation')
    revalidatePath('/')

    return createSuccess('ナビゲーションを更新しました')
  } catch (error) {
    console.error('Failed to update navigation item:', error)
    return createFailure('ナビゲーションの更新に失敗しました')
  }
}

/**
 * ナビゲーションアイテムを削除
 */
export async function deleteNavigationItem(
  id: string
): Promise<ActionResult<void>> {
  try {
    await requireAdmin()

    const item = await prisma.navigationItem.findUnique({
      where: { id },
      include: {
        children: true,
      },
    })

    if (!item) {
      return createFailure('ナビゲーションが見つかりません')
    }

    if (item.children.length > 0) {
      return createFailure('サブメニューがあるため削除できません')
    }

    await prisma.navigationItem.delete({
      where: { id },
    })

    revalidatePath('/admin/settings/navigation')
    revalidatePath('/')

    return createSuccess('ナビゲーションを削除しました')
  } catch (error) {
    console.error('Failed to delete navigation item:', error)
    return createFailure('ナビゲーションの削除に失敗しました')
  }
}

/**
 * ナビゲーションの順序を更新
 */
export async function updateNavigationOrder(
  items: { id: string; order: number; parentId?: string | null }[]
): Promise<ActionResult<void>> {
  try {
    await requireAdmin()

    await prisma.$transaction(
      items.map((item) =>
        prisma.navigationItem.update({
          where: { id: item.id },
          data: {
            order: item.order,
            ...(item.parentId !== undefined && { parentId: item.parentId }),
          },
        })
      )
    )

    revalidatePath('/admin/settings/navigation')
    revalidatePath('/')

    return createSuccess('順序を更新しました')
  } catch (error) {
    console.error('Failed to update navigation order:', error)
    return createFailure('順序の更新に失敗しました')
  }
}

/**
 * SNSリンクの順序を更新
 */
export async function updateSocialLinkOrder(
  items: { id: string; order: number }[]
): Promise<ActionResult<void>> {
  try {
    await requireAdmin()

    await prisma.$transaction(
      items.map((item) =>
        prisma.socialLink.update({
          where: { id: item.id },
          data: { order: item.order },
        })
      )
    )

    revalidatePath('/admin/settings/navigation')
    revalidatePath('/')

    return createSuccess('順序を更新しました')
  } catch (error) {
    console.error('Failed to update social link order:', error)
    return createFailure('順序の更新に失敗しました')
  }
}

// =============================================================================
// Social Link Actions
// =============================================================================

/**
 * SNSリンク取得オプション
 */
export type GetSocialLinksOptions = {
  /** デスクトップで表示するリンクのみ取得 */
  showOnDesktop?: boolean
  /** モバイルで表示するリンクのみ取得 */
  showOnMobile?: boolean
  /** アクティブなリンクのみ取得（デフォルト: true） */
  activeOnly?: boolean
}

/**
 * SNSリンク一覧を取得
 */
export async function getSocialLinks(options: GetSocialLinksOptions = {}): Promise<SocialLinkData[]> {
  await requireAdmin()

  const { showOnDesktop, showOnMobile, activeOnly = false } = options

  return prisma.socialLink.findMany({
    where: {
      ...(activeOnly && { isActive: true }),
      ...(showOnDesktop !== undefined && { showOnDesktop }),
      ...(showOnMobile !== undefined && { showOnMobile }),
    },
    orderBy: { order: 'asc' },
  })
}

/**
 * SNSリンクを作成
 */
export async function createSocialLink(
  data: SocialLinkInput
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin()

    const parsed = socialLinkSchema.safeParse(data)
    if (!parsed.success) {
      return createFailure(parsed.error.issues[0].message)
    }

    const link = await prisma.socialLink.create({
      data: parsed.data,
    })

    revalidatePath('/admin/settings/navigation')
    revalidatePath('/')

    return createSuccess('SNSリンクを作成しました', { id: link.id })
  } catch (error) {
    console.error('Failed to create social link:', error)
    return createFailure('SNSリンクの作成に失敗しました')
  }
}

/**
 * SNSリンクを更新
 */
export async function updateSocialLink(
  id: string,
  data: SocialLinkInput
): Promise<ActionResult<void>> {
  try {
    await requireAdmin()

    const parsed = socialLinkSchema.safeParse(data)
    if (!parsed.success) {
      return createFailure(parsed.error.issues[0].message)
    }

    const existing = await prisma.socialLink.findUnique({
      where: { id },
    })

    if (!existing) {
      return createFailure('SNSリンクが見つかりません')
    }

    await prisma.socialLink.update({
      where: { id },
      data: parsed.data,
    })

    revalidatePath('/admin/settings/navigation')
    revalidatePath('/')

    return createSuccess('SNSリンクを更新しました')
  } catch (error) {
    console.error('Failed to update social link:', error)
    return createFailure('SNSリンクの更新に失敗しました')
  }
}

/**
 * SNSリンクを削除
 */
export async function deleteSocialLink(
  id: string
): Promise<ActionResult<void>> {
  try {
    await requireAdmin()

    const link = await prisma.socialLink.findUnique({
      where: { id },
    })

    if (!link) {
      return createFailure('SNSリンクが見つかりません')
    }

    await prisma.socialLink.delete({
      where: { id },
    })

    revalidatePath('/admin/settings/navigation')
    revalidatePath('/')

    return createSuccess('SNSリンクを削除しました')
  } catch (error) {
    console.error('Failed to delete social link:', error)
    return createFailure('SNSリンクの削除に失敗しました')
  }
}
