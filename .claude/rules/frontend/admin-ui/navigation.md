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

同じパスを共有する複数項目（例: 「スペース管理」`/admin/spaces` と「レビュー」`/admin/spaces?tab=reviews`）を正しくハイライト切り替えするためのパターン:

```tsx
"use client";
import { usePathname, useSearchParams } from "next/navigation";

// 純粋関数としてコンポーネント外に定義（レンダー毎に再生成しない）
function isSidebarItemActive(
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

  // 裸のパス項目は `tab` パラメータがない時のみアクティブ
  // （「スペース管理」が `?tab=reviews` 訪問時にハイライトされるのを防ぐ）
  if (!itemQuery) return !currentParams.has("tab");

  // クエリ付き項目は全キーが一致した時のみアクティブ
  const itemQueryParams = new URLSearchParams(itemQuery);
  for (const [key, value] of itemQueryParams.entries()) {
    if (currentParams.get(key) !== value) return false;
  }
  return true;
}

// コンポーネント内で使用
const pathname = usePathname();
const searchParams = useSearchParams();
// ...
const isActive = isSidebarItemActive(item.href, pathname, searchParams);
```

**禁止パターン:**

```tsx
// NG: path のみの比較。query-bearing href が 1 つでもあると active ハイライトが誤作動する
const isActive =
  pathname === item.href ||
  (item.href !== "/admin" && pathname.startsWith(item.href + "/"));
```

**ルール:**

- サイドバーに query-bearing href を 1 つでも追加したら、即座にこのパターンへ移行する
- 裸のパス項目は `!searchParams.has("tab")` でガード（タブが active でない時のみハイライト）
- query 比較は全キー一致で判定（partial match 禁止）
- `isSidebarItemActive` はコンポーネント外のモジュールレベル純粋関数として定義

参照実装: `src/app/(admin)/admin/(dashboard)/_components/ResponsiveSidebar.tsx`
