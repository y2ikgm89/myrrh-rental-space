/**
 * サイドバーアクティブ判定（query-bearing href 対応）
 *
 * `"use client"` 境界外の純粋ロジック（テスト可能・React 非依存）。
 * 詳細な設計指針は `.claude/rules/frontend/admin-ui/navigation.md` を参照。
 */

/**
 * サイドバー項目の href が現在の URL（pathname + query）に一致するか判定する。
 *
 * - bare path（クエリなし）: pathname の完全一致 or サブルート一致で `true`
 * - query-bearing（`?tab=...`）: パス一致 + クエリの全キーが現在 URL と一致で `true`
 */
export function hrefMatchesCurrentUrl(
  itemHref: string,
  pathname: string,
  currentParams: URLSearchParams,
): boolean {
  const [itemPath, itemQuery = ""] = itemHref.split("?");
  if (itemPath === undefined) return false;

  const pathMatches =
    pathname === itemPath ||
    (itemPath !== "/admin" && pathname.startsWith(`${itemPath}/`));
  if (!pathMatches) return false;

  // bare path はパス一致のみで成立。
  if (!itemQuery) return true;

  // query-bearing 項目は item のクエリ全キーが現在 URL と一致する必要がある。
  const itemQueryParams = new URLSearchParams(itemQuery);
  for (const [key, value] of itemQueryParams.entries()) {
    if (currentParams.get(key) !== value) return false;
  }
  return true;
}

/**
 * サイドバー項目がアクティブ（ハイライト）かどうかを判定する。
 *
 * bare path 項目は、**同じパスを共有する query-bearing な兄弟項目**
 * （例: `/admin/spaces` ↔ `/admin/spaces?tab=reviews`）が現在 URL に一致する場合のみ
 * ハイライトを譲る。編集フォーム内部タブ（例: `/admin/pages/[slug]/edit?tab=seo`）は
 * 該当する兄弟項目を持たないため、親項目（`/admin/pages`）は active のまま維持される。
 *
 * @param queryBearingHrefs サイドバー全項目のうち `?` を含む href の一覧
 */
export function isSidebarItemActive(
  itemHref: string,
  pathname: string,
  currentParams: URLSearchParams,
  queryBearingHrefs: readonly string[],
): boolean {
  if (!hrefMatchesCurrentUrl(itemHref, pathname, currentParams)) return false;

  // query-bearing 項目はクエリ含め完全一致したので active。
  if (itemHref.includes("?")) return true;

  // bare path 項目: query-bearing な兄弟が現在 URL に一致するときだけ譲る。
  return !queryBearingHrefs.some((href) =>
    hrefMatchesCurrentUrl(href, pathname, currentParams),
  );
}
