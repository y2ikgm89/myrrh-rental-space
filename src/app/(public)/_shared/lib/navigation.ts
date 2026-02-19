/**
 * 公開ページ用ナビゲーション取得
 *
 * 認証不要。'use cache' + cacheTag でキャッシュ。
 * admin の updateNavigationItem 等で CACHE_TAGS.NAVIGATION が無効化される。
 */

import { cacheLife, cacheTag } from 'next/cache'
import { prisma } from '@/shared/lib/prisma'
import { CACHE_TAGS, CACHE_LIFE } from '@/shared/lib/constants'
import type { NavigationType } from '@/shared/generated/prisma/enums'

export type PublicNavItem = {
  readonly id: string
  readonly label: string
  readonly url: string
  readonly isExternal: boolean
  readonly children: readonly PublicNavItem[]
}

const EMPTY_NAV_CHILDREN: readonly PublicNavItem[] = Object.freeze([])

/**
 * 指定タイプのアクティブなナビゲーションアイテムを取得
 */
export async function getPublicNavigation(type: NavigationType): Promise<readonly PublicNavItem[]> {
  'use cache'
  cacheLife(CACHE_LIFE.STATIC_SETTINGS)
  cacheTag(CACHE_TAGS.NAVIGATION)

  const items = await prisma.navigationItem.findMany({
    where: {
      type,
      parentId: null,
      isActive: true,
    },
    select: {
      id: true,
      label: true,
      url: true,
      isExternal: true,
      children: {
        where: { isActive: true },
        orderBy: { order: 'asc' },
        select: {
          id: true,
          label: true,
          url: true,
          isExternal: true,
        },
      },
    },
    orderBy: { order: 'asc' },
  })

  return items.map((item) => ({
    id: item.id,
    label: item.label,
    url: item.url,
    isExternal: item.isExternal,
    children: item.children.map((child) => ({
      id: child.id,
      label: child.label,
      url: child.url,
      isExternal: child.isExternal,
      children: EMPTY_NAV_CHILDREN,
    })),
  }))
}

/**
 * ヘッダー用ナビゲーション（デスクトップ）
 */
export async function getHeaderNavigation(): Promise<readonly PublicNavItem[]> {
  return getPublicNavigation('HEADER_DESKTOP')
}

/**
 * フッター用ナビゲーション
 */
export async function getFooterNavigation(): Promise<readonly PublicNavItem[]> {
  return getPublicNavigation('FOOTER')
}
