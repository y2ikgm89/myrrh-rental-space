---
description: 管理画面のタブ UI (A 重い CC / B 軽量 RSC) + ページヘッダー標準構造 + admin 専用セマンティックカラートークン + サイドバーモバイルオーバーレイ
paths:
  - src/app/(admin)/**/*.tsx
  - src/app/(admin)/**/page.tsx
  - src/app/(admin)/**/layout.tsx
---

# 管理画面 タブ UI + ページヘッダー + テーマトークン

> CRUD タブ A/B 選択基準 / 標準ヘッダー flex 構造 / admin 専用 bg-overlay / sidebar-\* トークン / モバイルオーバーレイ。

## タブ UI パターン（管理画面 CRUD）

タブ付き CRUD は **用途で (A) / (B) を選ぶ**。アクションボタン（新規作成等）は **ページヘッダー右端**に配置する（全管理ページで位置を統一）。タブがコンテキストを持つ場合はボタンのラベルをタブに応じて切り替える（例: スペース管理 → `HeaderAction` で tab 別分岐）。参照実装: `spaces/page.tsx`。

### (A) 重いクライアント状態をタブ間で保持したい

Lexical や複雑なフォーム状態を **非表示タブでもマウントしたまま** にしたい場合。

| 設定                     | 値         | 理由                                               |
| ------------------------ | ---------- | -------------------------------------------------- |
| `shallow`                | `true`     | タブ切り替えで RSC を再実行しない（即時切り替え）  |
| `TabsContent forceMount` | `true`     | 非アクティブタブを DOM 保持（再マウント防止）      |
| コンテンツレンダリング   | 全タブ常時 | 初回で一括取得、以降は同一マウント内で切り替えのみ |

```tsx
const [activeTab, setActiveTab] = useQueryState(
  "tab",
  parseAsStringLiteral(TAB_VALUES)
    .withDefault("posts")
    .withOptions({ history: "push", shallow: true }),
);

<TabsContent value="posts" forceMount className="data-[state=inactive]:hidden">
  {postsContent}
</TabsContent>;
```

### (B) 各タブが Server Components の一覧のみ（データ取得を抑えたい）

タブごとの中身が **軽量な RSC（テーブル・フィルタ）** だけのときは、**アクティブタブの RSC だけ** を描画する。親ページで `createSearchParamsCache` を `parse` し、`tab` で分岐する。タブ切替は **`Link`（または `shallow: false` の URL 更新）** で `searchParams` を変え、Next.js が RSC を再実行する。

**参照実装**: `src/app/(admin)/admin/(dashboard)/spaces/page.tsx` と `spaces/_components/SpaceManagementTabs.tsx`。ハブの `tab`（`ADMIN_SPACE_MANAGEMENT_TABS`）に加え、一覧状態はタブ別プレフィックスで分離する: スペース一覧 `spSearch` / `spStatus` / `spPage` / `spSortBy` / `spSortOrder` / `spLocationId` / `spCategoryId`、場所 `locSearch` / `locPublished` / `locPage`、カテゴリ `catSearch` / `catIncludeInactive` / `catPage`（`adminSpaceSearchParamsCache`）。スペース編集フォームのタブ URL はハブと衝突しないよう `section` クエリを使用する。

| 設定           | 値                                     | 理由                                               |
| -------------- | -------------------------------------- | -------------------------------------------------- |
| サーバー       | `parse` 後に `tab` で条件付き 1 パネル | 非表示タブの `getLocations` 等を初回から走らせない |
| タブナビ       | `Link` + 名前空間付きクエリの preserve | タブ切替で他タブのフィルタが汚染されない           |
| 子のデータ読み | `searchParamsCache.all()` / `get`      | 親で `parse` 済みなら子で二重 `parse` を避ける     |

**実装は `NavTabs` primitive 経由必須**（`@/admin/components/ui` から re-export、`_shared/components/ui/nav-tabs.tsx` が SSoT）。`<nav>` / `<ul>` / トリガー `<Link>` をローカルで直書きする legacy 実装は禁止 — スタイル・WCAG 2.5.5 (44×44) ヒットエリア・`aria-current="page"`・`scrollbar-hide` 契約をすべて primitive が保証する。margin は consumer 側で `className` 経由（例: `<NavTabs className="mb-2" ... />`）。スタイル契約は `Tabs` primitive（`tabs.tsx`）の `TabsList` / `TabsTrigger` と一致（`min-h-11` / `bg-muted` / `px-3 py-2` / active 時 `bg-card shadow-sm`）。参照実装: `SpaceManagementTabs.tsx` / `EventTabs.tsx`。

**(A) と (B) の選び方**: タブ内に Lexical・大きなクライアント状態・「戻ったときに入力を残したい」要件がある → **(A)**。タブが一覧 + フィルタのみで、初回・タブ切替の DB 負荷を抑えたい → **(B)**。

**(A) パターン参照実装一覧**: `SpaceEditForm.tsx` (5 tab: basic / pricing / media / details / publish、`section` クエリ + Lexical state 保持) / `EventForm.tsx` (5 tab: basic / publish / tickets / location / seo、`section` クエリ + Lexical state 保持 + tab error count badge)。両者とも `tabErrorCount: Record<TabValue, number>` で `fields.X.errors` 集計 + tab label に `<span className="bg-destructive">{count}</span>` 赤丸 badge を表示 (`fieldHasErrors(errors): errors.length > 0` helper)。新規大型 edit form は本 pattern 踏襲必須 (monolithic file + `section` クエリ + tab error badge)。

### `TabsTrigger` の `type="button"` default (form submit silent bug 防止)

`@/admin/components/ui/tabs` の `TabsTrigger` は **`type={type ?? "button"}` を default 設定**する (2026-05-20 PR #170 確立)。HTML 仕様で `<form>` 内の `<button>` は default `type="submit"` となるため、SettingsDialog 等で `<form>` 内に Radix Tabs を配置すると **tab 切替クリックが form submit を発火する silent bug** が起きる。Radix の `TabsPrimitive.Trigger` は `type` 未指定で素通し、caller が明示しないと `<button>` の HTML default が適用される。`type="button"` default 化で全 admin Tabs 利用箇所が form 内外を問わず安全に動作する (caller が `type` を渡せば override 可能)。`type` 直書きの呼び出し側コード復活禁止。

## ステータス分類タブ（list 系 admin ページ）

リソースがステータス遷移する場合、ステータス Select Filter 単独より**ステータス軸タブ**が運営動線に合う。業界標準（Shopify Orders / Stripe Payments / Linear Issues）と整合。タブ軸の選び方で 2 variants:

### Variant A: 純ステータス軸（Reservation canonical）

時系列要素なしの per-status タブ。各タブが特定 `status` enum 値（または複数値の OR グループ）を絞り込む。

- **タブ value = ステータス enum 値**: `confirmed` / `pending` / `completed` / `cancelled` (CANCELLED + NO_SHOW 統合)
- **タブ別 default sort**: active なタブは `startTime asc`（直近優先）、過去/cancelled は `startTime desc`
- **default tab**: active items (確認済み / open 等)

**参照実装**: `reservations/_components/ReservationTabs.tsx` + `page.tsx` / `shared/domain/reservations/admin-queries.ts` の `buildTabWhere(tab)` + `getDefaultSort(tab)` / `shared/lib/nuqs/parsers.ts` の `reservationTabFilterValues` + `isReservationTabFilter`

### Variant B: 時間軸 + ステータス軸（Event canonical）

リソースが時系列要素も持つ（イベント開催期間等）場合、時間軸 × ステータスを組み合わせる。

- **判定軸は `endTime` 系の終了時刻列**: 「開催」= `endTime >= now`、「終了」= `endTime < now`。`startTime` ベースだと開催期間中のレコードが「開催予定」から脱落する silent UX。複数日イベント（startTime/endTime 日跨ぎ）も自然に挙動（期間中ずっと「開催」、終了後「終了」へ自動遷移）
- **タブ別 default sort**: open: `startTime asc` / past: `endTime desc` / draft: `updatedAt desc` 等。
- **status Select は `tab === "all"` のみ表示**: 他タブは tab 自体が status を絞るため UI 重複防止

**参照実装**: `events/_components/EventTabs.tsx` + `page.tsx` + `EventFilters.tsx` / `shared/domain/events/admin-queries.ts` の `buildTabWhere(tab, now)` + `getDefaultSort(tab)` / `shared/lib/nuqs/parsers.ts` の `eventTabFilterValues` + `isEventTabFilter`

### 共通設計指針（両 variants）

- **タブ別 default sort は domain 層 `getDefaultSort(tab)` helper 必須**: parser default 1 種で全タブ覆禁止。URL に sortBy/sortOrder があれば優先
- **URL state は 2 分**: タブ切替時 search/dateFrom/dateTo 保持、page/sortBy/sortOrder reset（タブ別 default が効くため）
- **ラベルは 2-4 文字 + 対比で意味立て**: 「確認済み / 保留中 / 完了 / キャンセル / すべて」(Notion/Linear "Active vs Done" pattern)。Mobile 375px に 5 タブ ~300-350px 目安、6 タブ以上で横スクロール必須化
- **`nav` + `aria-current="page"` パターン**: ページ遷移は `role="tab"` ではない（`accessibility/semantics/html-elements.md` §nav vs tab WAI-ARIA 区別 準拠）。実装は **`NavTabs` primitive 経由必須**（`@/admin/components/ui`）。ローカル `<nav>` / `<ul>` 直書きは禁止
- **Status 列 (`<XxxStatusSelect>`) との併用**: タブで絞り込み + 行内 Select で per-row 状態変更（Post / Reservation / Event 全 3 canonical で同型）

## ページヘッダー標準構造

管理画面の各ページヘッダーは以下の構造を使用する:

```tsx
<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
  <div>
    <h1 className="text-2xl font-bold tracking-tight text-foreground">
      ページタイトル
    </h1>
    <p className="text-muted-foreground">説明テキスト</p>
  </div>
  <div className="flex items-center gap-2">{/* アクションボタン */}</div>
</div>
```

**禁止パターン**:

```tsx
// NG: justify-between のみ（モバイル対応なし）
<div className="flex items-center justify-between">

// NG: ハードコードスペーシング
<div className="flex items-center gap-4 justify-between">
```

## セマンティックカラートークン（admin 専用）

管理画面でのみ使用できる追加トークン:

| 用途                       | 正しいクラス                 | 禁止クラス                              |
| -------------------------- | ---------------------------- | --------------------------------------- |
| モーダル背景オーバーレイ   | `bg-overlay`                 | `bg-black/60`, `bg-black/50`            |
| サイドバーナビホバー背景   | `hover:bg-sidebar-nav-hover` | `hover:bg-white/5`, `hover:bg-gray-700` |
| サイドバー背景             | `bg-sidebar-bg`              | `bg-gray-900`, `bg-slate-900`           |
| サイドバーボーダー         | `border-sidebar-border`      | `border-gray-700`, `border-slate-700`   |
| サイドバーテキスト         | `text-sidebar-text`          | `text-white`, `text-gray-100`           |
| サイドバーミュートテキスト | `text-sidebar-text-muted`    | `text-gray-400`, `text-slate-400`       |

## サイドバーモバイルオーバーレイ

サイドバーのモバイルオーバーレイは専用トークンを使用:

```tsx
// OK
<div
  className="fixed inset-0 z-30 bg-overlay lg:hidden"
  onClick={closeSidebar}
/>

// NG: 直接アルファ値を指定
<div className="fixed inset-0 z-30 bg-black/60 lg:hidden" />
```
