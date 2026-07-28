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
 * import { Z_INDEX, adminZIndexLayerProps } from '@/admin/lib/styles/z-index'
 * import { useAdminZIndexLayer } from '@/admin/lib/styles/use-admin-z-index-layer'
 * // ✅ CSP-safe: className + imperative z-index on ref
 * const layer = useAdminZIndexLayer(ref, Z_INDEX.dropdown, style)
 * <Content ref={layer.setRef} className={cn(layer.className, className)} />
 * // ❌ style={{ zIndex: Z_INDEX.dropdown }} — CSP style-src で nonce 不可
 * // ❌ className={`z-[${Z_INDEX.dropdown}]`} — Tailwind JIT 未生成で silent bug
 */

import type { CSSProperties } from "react";
import { CSS_VAR_CLASS } from "@/shared/lib/csp/css-vars";

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

/** Tailwind class that consumes `--admin-z-index`. */
export function adminZIndexClassName(): string {
  return CSS_VAR_CLASS.adminZIndex;
}

/** Resolve z-index from caller `style.zIndex` override or token default. */
export function resolveAdminZIndex(
  defaultZIndex: number,
  style?: CSSProperties,
): number {
  const fromStyle = style?.zIndex;
  if (typeof fromStyle === "number") return fromStyle;
  if (typeof fromStyle === "string") {
    const parsed = Number(fromStyle);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return defaultZIndex;
}

/** Remove legacy `zIndex` from a style object (other keys must be CSS vars). */
export function stripZIndexFromStyle(
  style?: CSSProperties,
): CSSProperties | undefined {
  if (!style) return undefined;
  const { zIndex: _zIndex, ...rest } = style;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

/** Tailwind class for admin z-index layer. Pair with `useAdminZIndexLayer` for CSP-safe z-index. */
export function adminZIndexLayerProps(): { className: string } {
  return { className: adminZIndexClassName() };
}
