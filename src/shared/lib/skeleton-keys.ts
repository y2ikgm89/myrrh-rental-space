/**
 * 固定長プレースホルダ（skeleton）用の安定キー配列を返す。
 *
 * skeleton はデータ由来の identity を持たないため、React 公式が静的リストに
 * 許容する index キー（`key={i}`）の代わりに、位置由来の安定文字列キーを使う。
 * これにより:
 * - `@eslint-react/no-array-index-key` を検出漏れに依存せず満たす（`key` は要素参照）
 * - 再描画間でキーが安定する（render 時生成 `key={Math.random()}` 等の禁止パターンを回避）
 *
 * @example
 * {skeletonKeys(8, "blog-line").map((key) => (
 *   <Skeleton key={key} className="h-4 w-full" />
 * ))}
 *
 * @example // 位置依存ロジックが必要なら map の index を併用（key はあくまで安定文字列）
 * {skeletonKeys(3, "step").map((key, i) => (
 *   <div key={key}>{i < 2 && <Divider />}</div>
 * ))}
 */
export function skeletonKeys(count: number, prefix: string): readonly string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}-${i}`);
}
