"use client";

import type { CSSProperties, RefObject } from "react";
import { CSS_VAR } from "@/shared/lib/csp/css-vars";
import {
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
