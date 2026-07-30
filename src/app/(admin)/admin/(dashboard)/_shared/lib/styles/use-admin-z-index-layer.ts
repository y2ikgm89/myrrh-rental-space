"use client";

import type { CSSProperties, RefObject } from "react";
import { CSS_VAR } from "@/shared/lib/csp/css-vars";
import {
  applyImperativeStyleValues,
  useImperativeCssVars,
  useImperativeStyle,
  type ImperativeStyleValues,
} from "@/shared/lib/csp/use-imperative-style";
import { resolveAdminZIndex, stripZIndexFromStyle } from "./z-index";

/** Apply admin z-index token imperatively on a caller-owned ref (CSP-safe). */
export function useAdminZIndexImperative<T extends HTMLElement>(
  ref: RefObject<T | null>,
  defaultZIndex: number,
  style?: CSSProperties,
): void {
  const zIndex = resolveAdminZIndex(defaultZIndex, style);
  const extraStyle = stripZIndexFromStyle(style);
  useImperativeCssVars(ref, { [CSS_VAR.adminZIndex]: zIndex });
  useImperativeStyle(ref, (extraStyle ?? {}) as ImperativeStyleValues);
}

/**
 * Apply the admin z-index token from a ref callback (portal-safe).
 *
 * Radix の `Portal` は `useState(false)` + layout effect で mount を 1 render 遅らせる
 * （`@radix-ui/react-portal`: `container ? createPortal(...) : null`）。そのため
 * `<XContent>` を返すコンポーネント自身の mount effect は **ノードがまだ無い状態**で
 * 走り、`useAdminZIndexImperative` は early return する。2 render 目でノードが
 * 生えても effect の deps は変わらないため再実行されず、`--admin-z-index` が
 * 永久に未設定 = `z-index: auto` になる。
 *
 * この結果 overlay (85) が content (auto) の上に乗り、admin の Dialog /
 * AlertDialog はクリックを一切受け付けなくなる（Playwright は
 * "intercepts pointer events" で検出）。dropdown / popover / select / tooltip も
 * 同じ形なので token 通りの重なり順にならない。
 *
 * ノード attach 時点で適用するこのヘルパーを ref callback から呼ぶことで、
 * portal の遅延 mount と再 mount の双方に追従する。
 */
export function assignAdminZIndex<T extends HTMLElement>(
  node: T | null,
  defaultZIndex: number,
  style?: CSSProperties,
): void {
  if (!node) return;

  const extraStyle = stripZIndexFromStyle(style);
  applyImperativeStyleValues(node, {
    [CSS_VAR.adminZIndex]: resolveAdminZIndex(defaultZIndex, style),
    ...((extraStyle ?? {}) as ImperativeStyleValues),
  });
}
