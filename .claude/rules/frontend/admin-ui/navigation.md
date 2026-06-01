---
paths:
  - src/app/(admin)/**/_components/ResponsiveSidebar.tsx
  - src/app/(admin)/**/_components/Sidebar*.tsx
  - src/app/(admin)/**/layout.tsx
---

# 管理画面サイドバー・レイアウトパターン

サイドバーアクティブ判定（query-bearing href 対応）を扱う。

## サイドバーアクティブ判定（query-bearing href 対応）

サイドバー項目が `/admin/spaces?tab=reviews` のようなクエリ付き URL を href に使う場合、`pathname === href` 比較では `usePathname()` がクエリを返さないためマッチしない。`useSearchParams()` と併用して query key も比較する必要がある。

同じパスを共有する複数項目（例: 「スペース管理」`/admin/spaces` と「レビュー」`/admin/spaces?tab=reviews`）を正しくハイライト切り替えするためのパターン。純粋ロジックは `"use client"` 境界外の別モジュール（`sidebar-active.ts`）に切り出してテスト可能にする:

```ts
// sidebar-active.ts（"use client" を持たない純粋モジュール）

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

  if (!itemQuery) return true; // bare path はパス一致のみで成立
  const itemQueryParams = new URLSearchParams(itemQuery);
  for (const [key, value] of itemQueryParams.entries()) {
    if (currentParams.get(key) !== value) return false;
  }
  return true;
}

export function isSidebarItemActive(
  itemHref: string,
  pathname: string,
  currentParams: URLSearchParams,
  queryBearingHrefs: readonly string[],
): boolean {
  if (!hrefMatchesCurrentUrl(itemHref, pathname, currentParams)) return false;
  if (itemHref.includes("?")) return true; // query-bearing 項目は完全一致したので active

  // bare path 項目: query-bearing な兄弟（例: /admin/spaces?tab=reviews）が
  // 現在 URL に一致するときだけハイライトを譲る。
  return !queryBearingHrefs.some((href) =>
    hrefMatchesCurrentUrl(href, pathname, currentParams),
  );
}
```

```tsx
// ResponsiveSidebar.tsx（"use client"）
const pathname = usePathname();
const searchParams = useSearchParams();
const queryBearingHrefs = groups.flatMap((group) =>
  group.items.map((item) => item.href).filter((href) => href.includes("?")),
);
const isActive = isSidebarItemActive(
  item.href,
  pathname,
  searchParams,
  queryBearingHrefs,
);
```

**禁止パターン:**

```tsx
// NG: path のみの比較。query-bearing href が 1 つでもあると active ハイライトが誤作動する
const isActive =
  pathname === item.href ||
  (item.href !== "/admin" && pathname.startsWith(item.href + "/"));

// NG: bare 項目を「tab パラメータがあれば一律で非アクティブ」にする
//     編集フォーム内部タブ (/admin/pages/[slug]/edit?tab=seo) や一覧ハブのタブ
//     (/admin/spaces?tab=locations) でも親項目が消える silent bug の原因（2026-06-01 修正）
if (!itemQuery) return !currentParams.has("tab");
```

**ルール:**

- サイドバーに query-bearing href を 1 つでも追加したら、即座にこのパターンへ移行する
- bare path 項目は **query-bearing な兄弟項目が現在 URL に一致するときだけ** ハイライトを譲る（`!currentParams.has("tab")` の一律ガードは禁止 — 編集フォーム内部タブ・一覧ハブタブで親項目が誤って非アクティブ化する）
- query 比較は全キー一致で判定（partial match 禁止）
- 判定ロジックは `"use client"` 境界外の純粋モジュール（`sidebar-active.ts`）に置き、`__tests__/unit/sidebar-active.test.ts` で回帰を担保する

参照実装: `src/app/(admin)/admin/(dashboard)/_components/sidebar-active.ts` + `ResponsiveSidebar.tsx`、テスト: `__tests__/unit/sidebar-active.test.ts`
