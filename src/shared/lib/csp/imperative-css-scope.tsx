"use client";

/**
 * Client wrapper that applies dynamic CSS via element.style (CSP style-src-attr 対象外).
 * Server / client どちらからも props で値を渡せる。
 */

import {
  useRef,
  type ComponentPropsWithoutRef,
  type ElementType,
  type ReactElement,
  type Ref,
} from "react";
import {
  useImperativeCssVars,
  type ImperativeStyleValues,
} from "./use-imperative-style";

type ImperativeCssScopeProps<T extends ElementType> = {
  readonly as?: T;
  readonly cssVars?: ImperativeStyleValues;
  readonly ref?: Ref<HTMLElement>;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "style">;

export function ImperativeCssScope<T extends ElementType = "div">({
  as,
  cssVars,
  ref: externalRef,
  ...rest
}: ImperativeCssScopeProps<T>): ReactElement {
  const Component = (as ?? "div") as ElementType;
  const internalRef = useRef<HTMLElement | null>(null);

  useImperativeCssVars(internalRef, cssVars ?? {});

  const setRef = (node: HTMLElement | null) => {
    internalRef.current = node;
    if (typeof externalRef === "function") {
      externalRef(node);
    } else if (externalRef && typeof externalRef === "object") {
      externalRef.current = node;
    }
  };

  return <Component ref={setRef} {...rest} />;
}
