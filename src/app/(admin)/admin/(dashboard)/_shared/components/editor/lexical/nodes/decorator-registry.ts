/**
 * Lexical DecoratorNode の client UI 登録レジストリ（server-safe）。
 *
 * Node クラスは server / headless でも import 可能。decorate() は
 * クライアントで registerLexicalDecorator 済みのコンポーネントを
 * createElement する。未登録（server / RSC）では null → exportDOM が使われる。
 */

import type { ReactElement } from "react";

export type LexicalDecoratorComponent = (
  props: Record<string, unknown>,
) => ReactElement | null;

const registry = new Map<string, LexicalDecoratorComponent>();

export function registerLexicalDecorator(
  nodeType: string,
  component: LexicalDecoratorComponent,
): void {
  registry.set(nodeType, component);
}

export function renderLexicalDecorator(
  nodeType: string,
  props: Record<string, unknown>,
): ReactElement | null {
  const Component = registry.get(nodeType);
  if (Component === undefined) {
    return null;
  }
  return Component(props);
}

/** テスト用: 登録済み decorator node type 一覧 */
export function getRegisteredDecoratorTypes(): readonly string[] {
  return [...registry.keys()];
}

export function getDecoratorStringProp(
  props: Record<string, unknown>,
  key: string,
): string | null {
  const value = props[key];
  return typeof value === "string" ? value : null;
}

export function getDecoratorNumberProp(
  props: Record<string, unknown>,
  key: string,
): number | null {
  const value = props[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
