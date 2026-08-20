"use client";

import type { RefObject } from "react";
import { CSS_VAR } from "@/shared/lib/csp/css-vars";
import { useImperativeCssVars } from "@/shared/lib/csp/use-imperative-style";

/**
 * ページ内レイヤーの z-index を CSS var で当てる（CSP-safe）。
 *
 * サイドバーのように条件で値が変わるものが対象。値が固定なら Tailwind class で
 * 済むのでこのフックは要らない。
 *
 * body へ Portal される要素には使わない。Portal 層は `PORTAL_LAYER_CLASS` の
 * 静的クラス 1 つで、重なり順は DOM 追加順に委ねる。理由は
 * `./z-index.ts` の JSDoc。
 */
export function useAdminZIndexImperative<T extends HTMLElement>(
  ref: RefObject<T | null>,
  zIndex: number,
): void {
  useImperativeCssVars(ref, { [CSS_VAR.adminZIndex]: zIndex });
}
