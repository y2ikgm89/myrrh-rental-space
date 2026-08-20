/**
 * Admin z-index layers
 *
 * ## レイヤーは 2 種類しかない
 *
 * - **ページ内レイヤー** — サイドバー・ヘッダー・エディタ。通常のフローの中で重なる
 *   ので、数値で序列を決める。
 * - **Portal レイヤー** — Radix の Dialog / AlertDialog / Select / DropdownMenu /
 *   Popover / Tooltip。`document.body` 直下へ Portal されるので**互いに兄弟**であり、
 *   重なり順は DOM への追加順（= 開いた順）で決まる。
 *
 * ## Portal レイヤーに個別の番号を振らない
 *
 * Radix 公式（radix-ui/primitives discussions#1985）:
 *
 * > If you use the `Portal` part on all of these, you shouldn't even really need
 * > to fiddle with `z-index` as they will be appended naturally one after the
 * > other in `document.body`, so layering will be correct by default.
 *
 * 以前はここで `dropdown: 25` / `popover: 30` / `dialog: 90` と別々に振っていた。
 * ページ内の序列を Portal 先にも持ち込んだせいで、**ダイアログ内で開いた Select が
 * 必ずダイアログの背後に沈む**（実測: overlay 85 / content 90 に対し Select は 25）。
 * Radix Popper は content の computed z-index を popper wrapper へ複写するため、
 * content 側だけを持ち上げても抜けられない。
 *
 * そこで Portal 層は `portal` 1 値だけを持つ。番号の役割は「ページ内レイヤーより上へ
 * 持ち上げる」ことに限り、Portal 同士の順序は DOM に任せる。不変条件は
 * `__tests__/unit/lib/styles/z-index.test.ts` が固定している。
 *
 * ## ここで管理しないもの
 *
 * トーストは sonner が `[data-sonner-toaster]` に自前の z-index を持つ。
 *
 * @example
 * // ページ内レイヤー: 値が動的になりうるので CSS var 経由（CSP-safe）
 * useAdminZIndexImperative(ref, Z_INDEX.header);
 * <header ref={ref} className={adminZIndexClassName()} />
 *
 * // Portal レイヤー: 静的クラスをそのまま付ける
 * <SelectPrimitive.Content className={cn(PORTAL_LAYER_CLASS, className)} />
 */

import { CSS_VAR_CLASS } from "@/shared/lib/csp/css-vars";

export const Z_INDEX = {
  // ---- ページ内レイヤー（root stacking context に直接置かれる要素） ----
  /** サイドバー（デスクトップ常設） */
  sidebar: 10,
  /** ヘッダー — サイドバーの上 */
  header: 15,
  /** モバイルドロワーの scrim */
  overlay: 40,
  /** モバイルドロワー本体 — scrim の上 */
  sidebarDrawer: 45,
  /** エディタのツールバー */
  editorToolbar: 65,
  /** エディタのフルスクリーン化コンテナ — ページ内レイヤーの最上位 */
  editorFullscreen: 80,

  // ---- Portal レイヤー ----
  /**
   * body へ Portal される overlay 群が乗る唯一の層。
   * この中の重なり順は DOM 追加順（= 開いた順）が決める。
   */
  portal: 90,
} satisfies Record<string, number>;

export type ZIndexKey = keyof typeof Z_INDEX;

/**
 * `Z_INDEX.portal` を表す静的 Tailwind class。
 *
 * Tailwind v4 のスキャナは実行時の値を知らないので、テンプレートリテラルで
 * `z-[${Z_INDEX.portal}]` と組み立てると CSS が 1 つも生成されない
 * （`__tests__/unit/architecture/no-interpolated-tailwind-arbitrary-value.test.ts`）。
 * リテラルで書き、値との一致は gate で固定する。
 */
export const PORTAL_LAYER_CLASS = "z-[90]";

/** ページ内レイヤー用の Tailwind class。`--admin-z-index` を読む。 */
export function adminZIndexClassName(): string {
  return CSS_VAR_CLASS.adminZIndex;
}
