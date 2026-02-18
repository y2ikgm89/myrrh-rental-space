/**
 * Type Guard Factory
 *
 * @description Set-based 型ガードのファクトリ関数
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
  values: readonly T[]
): (value: string) => value is T {
  const set = new Set<string>(values)
  return (value: string): value is T => set.has(value)
}
