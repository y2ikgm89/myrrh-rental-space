/**
 * レイアウト関連の型定義
 *
 * admin/public両方で使用するレイアウト設定の型
 */

import { LayoutWidth } from '@/shared/types/prisma'

/**
 * レイアウト設定（Prisma LayoutWidth Enum使用）
 */
export type LayoutConfig = {
  containerWidth: LayoutWidth
  containerWidthCustom: number | null
  contentWidth: LayoutWidth
  contentWidthCustom: number | null
}

/**
 * コンテンツ幅設定（エディタのフォールバック用）
 *
 * DBから取得した値をエディタに渡すための型。
 * フォーム値が未設定の場合のデフォルト値として使用。
 */
export type ContentWidthSettings = {
  contentWidth: string | null
  contentWidthCustom: number | null
}
