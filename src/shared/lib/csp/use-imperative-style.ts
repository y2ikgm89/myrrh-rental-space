"use client";

/**
 * Apply dynamic styles via element.style (CSP style-src / style-src-attr 対象外).
 * dnd-kit transform / Lexical selection rect / CSS var 等、ライブラリ境界で使用。
 */

import { useEffect, type Ref, type RefObject } from "react";

export type ImperativeStyleValues = Record<
  string,
  string | number | undefined | null
>;

/** Merge an internal ref with an optional external ref callback/object. */
export function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref != null && typeof ref === "object") {
    ref.current = value;
  }
}

function applyImperativeValues(
  el: HTMLElement,
  values: ImperativeStyleValues,
): void {
  for (const [property, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === "") {
      el.style.removeProperty(property);
    } else if (property.startsWith("--")) {
      el.style.setProperty(property, String(value));
    } else {
      // camelCase → kebab-case for setProperty; direct assignment for known props
      el.style.setProperty(
        property.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`),
        String(value),
      );
    }
  }
}

export function useImperativeStyle<T extends HTMLElement>(
  ref: RefObject<T | null>,
  values: ImperativeStyleValues,
): void {
  const serialized = JSON.stringify(values);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    applyImperativeValues(el, JSON.parse(serialized) as ImperativeStyleValues);
  }, [ref, serialized]);
}

/** CSS custom properties only — sugar over useImperativeStyle. */
export function useImperativeCssVars<T extends HTMLElement>(
  ref: RefObject<T | null>,
  vars: ImperativeStyleValues,
): void {
  useImperativeStyle(ref, vars);
}

/** Set transform via imperative DOM (CSP-safe alternative to React style={{ transform }}). */
export function useImperativeTransform<T extends HTMLElement>(
  ref: RefObject<T | null>,
  transform: string | undefined,
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (transform) {
      el.style.transform = transform;
    } else {
      el.style.removeProperty("transform");
    }
  }, [ref, transform]);
}
