/**
 * ヘッダー設定管理
 *
 * layout-settings.ts から分離（単一責任原則）
 */

import { cacheLife, cacheTag } from 'next/cache'
import { prisma } from '@/shared/lib/prisma'
import { CACHE_TAGS } from '@/shared/lib/constants'
import {
  HeaderScrollBehavior,
  HeaderBackgroundMode,
  isValidHeaderScrollBehavior,
  isValidHeaderBackgroundMode,
} from '@/shared/lib/validations/enums'

export interface HeaderSettings {
  scrollBehavior: HeaderScrollBehavior
  backgroundMode: HeaderBackgroundMode
}

/**
 * ヘッダー設定を取得（キャッシュ付き）
 * スクロール動作 + 背景モードを1クエリで取得
 */
export async function getHeaderSettings(): Promise<HeaderSettings> {
  'use cache'
  cacheLife('hours')
  cacheTag(CACHE_TAGS.SETTINGS, CACHE_TAGS.LAYOUT_SETTINGS)

  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: {
      headerScrollBehavior: true,
      headerBackgroundMode: true,
    },
  })

  return {
    scrollBehavior: isValidHeaderScrollBehavior(settings?.headerScrollBehavior)
      ? settings.headerScrollBehavior
      : HeaderScrollBehavior.always_visible,
    backgroundMode: isValidHeaderBackgroundMode(settings?.headerBackgroundMode)
      ? settings.headerBackgroundMode
      : HeaderBackgroundMode.solid,
  }
}
