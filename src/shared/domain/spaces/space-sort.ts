/**
 * 公開スペース検索 facet の sort 軸 SSoT。
 *
 * - `recommended` = name asc（推奨・既定）
 * - `capacity-asc` / `capacity-desc` = capacity 昇降
 * - `price-asc` / `price-desc` = hourlyPrice 昇降
 *
 * 依存方向: `src/shared/*` からも `src/app/(public)/*` の nuqs parser からも
 * 参照するため shared 側に置く（app → shared の一方向依存を守る）。
 */

export const SPACE_SORT_VALUES = [
  "recommended",
  "capacity-asc",
  "capacity-desc",
  "price-asc",
  "price-desc",
] as const;

export type SpaceSort = (typeof SPACE_SORT_VALUES)[number];

const spaceSortSet = new Set<string>(SPACE_SORT_VALUES);

export function isSpaceSort(value: string): value is SpaceSort {
  return spaceSortSet.has(value);
}
