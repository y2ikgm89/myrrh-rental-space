/**
 * レイアウト関連の型定義
 *
 * admin/public両方で使用するレイアウト設定の型
 */

import type { LayoutWidth } from "@/shared/types/prisma";

/** サイト全体のレイアウト設定 */
export type LayoutConfig = {
  containerWidth: LayoutWidth;
  containerWidthCustom: number | null;
  contentWidth: LayoutWidth;
  contentWidthCustom: number | null;
};

/** コンテンツ幅（スタイル解決の最小入力単位） */
export type ContentWidth = {
  width: LayoutWidth;
  customPx: number | null;
};
