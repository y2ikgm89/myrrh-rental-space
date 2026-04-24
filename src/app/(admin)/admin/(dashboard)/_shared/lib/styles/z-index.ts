/**
 * Z-Index Token System
 *
 * 一元管理されたz-index値システム
 * アプリケーション全体でのz-index競合を防止
 *
 * 階層構造（下から上へ）:
 * - IconLayout (10-19): サイドバー・ヘッダーなどのページレイアウト
 * - Interactive (20-39): ドロップダウン・ポップオーバー
 * - Overlay (40-49): ページ内オーバーレイ、モバイルドロワー
 * - Editor (60-79): エディター専用レイヤー
 * - Fullscreen (80-84): フルスクリーンモード
 * - Dialog (85-94): ダイアログ・モーダル
 * - System (95-99): トースト・ツールチップなど最上位
 *
 * @example
 * import { Z_INDEX } from '@/admin/lib/styles/z-index'
 * // ✅ inline style（Tailwind JIT は静的スキャンのため template literal 内の
 * //    arbitrary value `z-[${VAR}]` は CSS 未生成 → z-index 無効の silent bug）
 * <div style={{ zIndex: Z_INDEX.editorToolbar }} />
 * // ❌ className={`z-[${Z_INDEX.editorToolbar}]`} は禁止（CSS が生成されない）
 */

export const Z_INDEX = {
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
  /** モバイルサイドバー本体 - オーバーレイより上に置く */
  sidebarDrawer: 45,

  // Editor layers (60-79) - エディター専用
  editorCanvas: 60,
  editorToolbar: 65,
  editorSidePanel: 70,
  editorFloating: 75,

  // Fullscreen layers (80-89)
  editorFullscreen: 80,

  // Dialog layers (85-94) - body Portal でも fullscreen editor より上に出す
  dialogOverlay: 85,
  dialog: 90,

  // System layers (90-99) - 最上位システム要素
  toast: 95,
  tooltip: 97,
  emergency: 99,
} satisfies Record<string, number>;

export type ZIndexKey = keyof typeof Z_INDEX;
