/**
 * レイアウト関連の型定義
 *
 * admin/public両方で使用するレイアウト設定の型
 */

import { LayoutWidth } from '@/shared/types/prisma'

/**
 * レイアウト設定
 */
export type LayoutConfig = {
  containerWidth: LayoutWidth
  containerWidthCustom: number | null
  contentWidth: LayoutWidth
  contentWidthCustom: number | null
}

/**
 * デフォルトレイアウト設定
 */
export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  containerWidth: LayoutWidth.LG,
  containerWidthCustom: null,
  contentWidth: LayoutWidth.SM,
  contentWidthCustom: null,
}
