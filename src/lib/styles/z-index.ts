/**
 * Z-Index Token System
 *
 * 一元管理されたz-index値システム
 * アプリケーション全体でのz-index競合を防止
 *
 * 階層構造（下から上へ）:
 * - Layout (10-19): サイドバー・ヘッダーなどのページレイアウト
 * - Interactive (20-39): ドロップダウン・ポップオーバー
 * - Overlay (40-49): モーダル背景など
 * - Modal (50-59): ダイアログ・モーダル
 * - Editor (60-79): エディター専用レイヤー
 * - Fullscreen (80-89): フルスクリーンモード
 * - System (90-99): トースト・ツールチップなど最上位
 *
 * @example
 * import { Z_INDEX } from '@/lib/styles/z-index'
 * className={`z-[${Z_INDEX.editorToolbar}]`}
 */

export const Z_INDEX: Record<string, number> = {
  // Base (0-9)
  base: 0,

  // Layout layers (10-19) - ページレイアウト要素
  /** サイドバー - レイアウトの一部なので下層 */
  sidebar: 10,
  /** ヘッダー - サイドバーの少し上 */
  header: 15,

  // Interactive layers (20-39) - インタラクティブ要素
  sticky: 20,
  dropdown: 25,
  popover: 30,

  // Overlay layers (40-49)
  overlay: 40,

  // Dialog layers (50-59) - ダイアログ（HTML <dialog> / WAI-ARIA準拠）
  dialog: 50,

  // Editor layers (60-79) - エディター専用
  editorCanvas: 60,
  editorToolbar: 65,
  editorSidePanel: 70,
  editorFloating: 75,

  // Fullscreen layers (80-89)
  editorFullscreen: 80,

  // System layers (90-99) - 最上位システム要素
  toast: 95,
  tooltip: 97,
  emergency: 99,
}

export type ZIndexKey = keyof typeof Z_INDEX

