/**
 * Type Guard & Parse Helpers
 *
 * @description Set-based 型ガードのファクトリ関数 + NodeState parse ヘルパー
 * ノードファイルでのボイラープレートを削減
 */

/**
 * readonly配列から Set-based 型ガード関数を生成
 *
 * @example
 * const VARIANTS = ['primary', 'secondary', 'outline'] as const
 * type Variant = (typeof VARIANTS)[number]
 * export const isButtonVariant = createEnumGuard<Variant>(VARIANTS)
 */
export function createEnumGuard<T extends string>(
  values: readonly T[],
): (value: string) => value is T {
  const set = new Set<string>(values);
  return (value: string): value is T => set.has(value);
}

// =============================================================================
// NodeState parse ヘルパー
//
// createState の parse 関数として直接渡せる共通パーサー。
// 約30箇所のノードファイルで繰り返される同一パターンを集約。
// =============================================================================

/** unknown を string にパースする（デフォルト: ''） */
export function parseString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** unknown を boolean にパースする（デフォルト: false） */
export function parseBoolean(v: unknown): boolean {
  return typeof v === "boolean" ? v : false;
}
