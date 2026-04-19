---
paths:
  - src/app/(admin)/**
---

# 管理画面 UI パターンルール

> Swiss Industrial Admin テーマ / 一貫性のある管理 UI を実現するためのパターン集

## 詳細パターン別ファイル（ファイル種別で自動ロード）

ファイル種別に応じて以下が自動ロードされる:

- **`admin-ui/dialogs.md`** — Dialog 型 CRUD・多選択肢ダイアログ（`*Dialog.tsx`）
- **`admin-ui/tables.md`** — テーブルレスポンシブ・ActionDropdown・フィルター・ソート・一括操作・ソータブルリスト（`*Table*.tsx` / `*Filters.tsx` / `*ActionCell.tsx` / `*BulkActions.tsx`）
- **`admin-ui/forms.md`** — Server Actions 認証・2 カラムフォーム・詳細/編集/新規作成ページ・ToggleGroup・設定セクション（`*Form.tsx` / `new/page.tsx` / `edit/page.tsx` / `settings/**`）
- **`admin-ui/navigation.md`** — サイドバーアクティブ判定（`ResponsiveSidebar.tsx` / `layout.tsx`）

本ファイルは全管理画面ファイルで常時ロードされる共通パターン（タブ UI・ページヘッダー・テーマトークン・Server Actions 型 import・SubmitButton・禁止事項・Gotchas）を扱う。

---

## タブUI パターン（管理画面 CRUD）

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

**(A) と (B) の選び方**: タブ内に Lexical・大きなクライアント状態・「戻ったときに入力を残したい」要件がある → **(A)**。タブが一覧＋フィルタのみで、初回・タブ切替の DB 負荷を抑えたい → **(B)**。

---

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

---

## セマンティックカラートークン（admin専用）

管理画面でのみ使用できる追加トークン:

| 用途                       | 正しいクラス                 | 禁止クラス                              |
| -------------------------- | ---------------------------- | --------------------------------------- |
| モーダル背景オーバーレイ   | `bg-overlay`                 | `bg-black/60`, `bg-black/50`            |
| サイドバーナビホバー背景   | `hover:bg-sidebar-nav-hover` | `hover:bg-white/5`, `hover:bg-gray-700` |
| サイドバー背景             | `bg-sidebar-bg`              | `bg-gray-900`, `bg-slate-900`           |
| サイドバーボーダー         | `border-sidebar-border`      | `border-gray-700`, `border-slate-700`   |
| サイドバーテキスト         | `text-sidebar-text`          | `text-white`, `text-gray-100`           |
| サイドバーミュートテキスト | `text-sidebar-text-muted`    | `text-gray-400`, `text-slate-400`       |

---

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

---

## Server Actions の型インポート

管理画面内の**全ファイル**（Server Actions・`'use client'` コンポーネント・hooks・型定義ファイルを問わず）は `@/admin/types/server-actions` から import する:

```typescript
// OK: 管理画面専用（Server Actions・'use client' コンポーネント・hooks すべて共通）
import {
  createSuccess,
  createFailure,
  type ActionResult,
} from "@/admin/types/server-actions";

// NG: 共有型を直接 import（管理画面内では禁止）
import { createSuccess, createFailure } from "@/shared/types/server-actions";
```

`@/admin/types/server-actions` は `@/shared/types/server-actions` の re-export に加え、`AuditUser` 型も提供する。

---

## フォーム送信ボタン（SubmitButton）

フォームの送信ボタンは `SubmitButton` コンポーネントに統一する。インラインの `isPending ? "X中..." : "X"` パターンは禁止:

```tsx
import { SubmitButton } from "@/admin/components/ui";

// OK: SubmitButton（Loader2 スピナー + disabled 自動管理）
<SubmitButton isPending={isPending} label="保存" />
<SubmitButton isPending={isPending} label="予約を作成" pendingLabel="作成中..." />
<SubmitButton isPending={isPending} label="削除" variant="destructive" pendingLabel="削除中..." />

// NG: インライン isPending パターン（禁止）
<Button type="submit" disabled={isPending}>
  {isPending ? "保存中..." : "保存"}
</Button>
```

**`pendingLabel` ルール**:

- 単純ラベル（「保存」「更新」「削除」「作成」）→ 省略可（デフォルト: `label + "中..."`）
- 複合ラベル（「予約を作成」「顧客情報を更新」）→ `pendingLabel` 明示指定（デフォルトだと「予約を作成中...」になる）

**適用対象外**（以下は SubmitButton に置換**しない**）:

- `DeleteConfirmDialog`（内部 isPending 管理）
- `onClick` ハンドラのボタン（`type="submit"` でないもの — Settings セクションの保存ボタン、EditorHeader 等）
- `disabled={isPending || !isDirty}` / `disabled={isPending || hasErrors}` / `disabled={!value || isPending}` 等の**複合条件ボタン**
- カスタムアイコン付きボタン（`Loader2` / `Save` 切替等）

---

## 禁止事項

1. **型 re-export の追加禁止** — 共有型のローカル aliases は不要（`export type Foo = SharedFoo`）
2. **ハードコードカラー禁止** — `bg-black/60` → `bg-overlay`、`hover:bg-white/5` → `hover:bg-sidebar-nav-hover`
3. **bare div ページネーション禁止** — `<nav aria-label="...">` を使用
4. **setPage/setParams の void なし呼び出し禁止** — `void setPage(n)`
5. **`@/shared/types/server-actions` を管理画面で直接使用禁止** — `@/admin/types/server-actions` 経由
6. **テーブル操作列インライン Button+Link 禁止** — `ActionDropdown` の `*ActionCell` コンポーネントを使用（`@/admin/components/ActionDropdown`）
7. **削除ボタンをページ最下部カードに配置禁止** — `DetailDeleteButton` をヘッダー `actions` の編集ボタン左に配置
8. **詳細・編集ページのバックボタンを詳細コンポーネント内に配置禁止** — `AdminDetailLayout backHref` で左上固定
9. **Suspense 内 async Server Component の `connection()` 省略禁止** — `new Date()` や uncached データを使う Suspense 内コンポーネントは先頭に `await connection()` を配置。page.tsx 本体には不要
10. **新規作成ページで手動ヘッダー実装禁止** — `new/page.tsx` も `AdminDetailLayout` を使用（`locations/new` がテンプレート。`Link`+`ArrowLeft`+`Button` の手動実装禁止）
11. **`backLabel` にエンティティ名を含めること禁止** — `"クーポン一覧に戻る"` NG → `"一覧に戻る"`（デフォルト）/ `"詳細に戻る"` のみ使用
12. **バックナビゲーションに `ChevronLeft` 禁止** — `ArrowLeft` は `AdminDetailLayout` 内部で自動提供。手動実装が必要な場合も `ArrowLeft` のみ
13. **タブコンテンツ内にタブ名を繰り返す見出し禁止** — `<TabsContent>` 内で同名の `h2`/`h3` は冗長。タブ自体がコンテキストを持つ
14. **タブリスト右端ボタンの dialog state をタブ内コンポーネントに持つこと禁止** — `showXxxDialog` state は `*EditTabs` 親で管理し、`onShowXxxDialogChange` prop として渡す
15. **テーブルカラム非表示をヘッダーのみ・データ行のみに適用禁止** — ヘッダー・仮想行（ホームページ行等）・全データ行に対称的に `hidden md:table-cell` を適用する
16. **テーブルに `overflow-x-auto` なしで `overflow-hidden` のみ使用禁止** — モバイルでテーブルがクリップされスクロール不可になる。必ず2層ラッパーを使う
17. **管理画面のサブページディレクトリにルーティング対象名を使用禁止** — `[slug]/sections/` や `[slug]/seo/` 等のサブページコンポーネントディレクトリは Next.js がルートとして解釈する可能性がある。`_` プレフィックスでプライベートフォルダにする（`[slug]/_sections/`、`[slug]/_seo/`）
18. **新規作成フォームに `disabled={!isDirty}` 禁止** — 新規作成は初期状態で全フィールドが空のため isDirty は常に false。isDirty 無効化は**編集モードのみ**。create/edit 共用コンポーネントでは `{...(isEdit && { disabled: !form.formState.isDirty })}` 条件スプレッド
19. **設定セクションの SubmitButton を CardContent 内に直置き禁止** — `<div className="flex justify-end pt-2">` でラップして右寄せ。CRUD フォームの `flex justify-end gap-4` と統一
20. **`<Input type="date" placeholder="...">` 禁止** — `type="date"` input は placeholder 属性を無視するため dead code。`aria-label` で説明する

---

## Gotchas

- **`PublishSwitch.onToggle` は `(id, checked: boolean)` 必須** — 既存の「DB を読んで反転」パターン（`data: { isActive: !current }`）は非互換。`executeAdminMutationResult` で boolean を直接受け取り `data: { isActive }` で set する形に変更する
- **tailwind-variants 複数スロット合成時の `text-*` 競合** — `${base()} ${variant()}` のように同一要素に2つの `text-*` が適用されると、CSS 生成順次第でどちらが勝つか不定（HTML クラス順は無関係）。動的に変わる色（アクティブ状態等）は継承に頼らず子要素に直接 `text-*` を明示する
- **Tabler アイコンの `currentColor`** — アイコンの色を動的に切り替えたい場合、アイコン定義側では制御できないため呼び出し元で `<span className={isActive ? "text-sidebar-text" : ""}>` でラップして色クラスを付与する
- **`bg-overlay` に opacity modifier 禁止** — `--color-overlay: oklch(0 0 0 / 0.6)` はアルファ値が CSS 変数値に組み込み済み。`bg-overlay/30` 等の Tailwind opacity modifier は期待通り機能しない。`bg-overlay` のみ使用する
- **`DialogContent` には必ず `DialogTitle` が必要** — Radix `DialogTitle`（または VisuallyHidden でラップ）がないと `role="dialog"` に `aria-labelledby` が接続されず WCAG 4.1.2 違反。`DialogContent` 追加時は必ずセットで記述する
- **Settings singleton にフィールド追加は4箇所同時更新** — ① `schema.prisma` + migrate ② `domain/settings/types.ts` の `SettingsData` 型 ③ `domain/settings/queries.ts` の get クエリ + `commands.ts` の update コマンド ④ `actions/settings/schemas.ts` の Zod スキーマ + `other.ts` の Server Action + `index.ts` barrel。`SettingsData` は `getOrCreateSettings()` が `select` なしで全カラムを返すため型追加のみで値は自動伝播
- **Recharts の SVG props は CSS 変数を受け取れない** — `fill={CHART_COLORS.primary}` のように oklch 定数を定義して渡す。admin.css テーマトークンと同期する oklch 値をコンポーネント上部に `as const` で定義（`ReservationChart.tsx` が実装例）
- **`bg-muted` 系は青みがかる** — admin.css の `--color-muted: oklch(0.95 0.01 250)` は色相250（青系）。`bg-muted/30` 等の低不透明度で薄い青が目立つ。ニュートラルな背景には背景色なし or `bg-card` を使用
