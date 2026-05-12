---
paths:
  - src/app/(admin)/**/*.tsx
---

# 管理画面 UI パターンルール

> Swiss Industrial Admin テーマ / 一貫性のある管理 UI を実現するためのパターン集

## 詳細パターン別ファイル（ファイル種別で自動ロード）

ファイル種別に応じて以下が自動ロードされる:

- **`admin-ui/dialogs.md`** — Dialog 型 CRUD・多選択肢ダイアログ（`*Dialog.tsx`）
- **`admin-ui/tables.md`** — テーブルレスポンシブ・ActionDropdown・フィルター・ソート・一括操作・ソータブルリスト（`*Table*.tsx` / `*Filters.tsx` / `*ActionCell.tsx` / `*BulkActions.tsx`）
- **`admin-ui/forms.md`** — Server Actions 認証・2 カラムフォーム・詳細/編集/新規作成ページ・ToggleGroup・設定セクション（`*Form.tsx` / `new/page.tsx` / `edit/page.tsx` / `settings/**`）
- **`admin-ui/navigation.md`** — サイドバーアクティブ判定（`ResponsiveSidebar.tsx` / `layout.tsx`）

> 共通パターンサブルール（path-scoped auto-load）:
>
> - **タブ UI A/B + ページヘッダー + admin 専用カラートークン + サイドバーモバイルオーバーレイ** — `frontend/admin-ui-patterns/tabs-headers-tokens.md`
> - **SubmitButton 統一 + Sticky 子サイドバー (3 点セット)** — `frontend/admin-ui-patterns/submit-and-sticky.md`

## 禁止事項

1. **型 re-export の追加禁止** — 共有型のローカル aliases は不要（`export type Foo = SharedFoo`）
2. **ハードコードカラー禁止** — `bg-black/60` → `bg-overlay`、`hover:bg-white/5` → `hover:bg-sidebar-nav-hover`
3. **bare div ページネーション禁止** — `<nav aria-label="...">` を使用
4. **setPage/setParams の void なし呼び出し禁止** — `void setPage(n)`
5. **テーブル操作列インライン Button+Link 禁止** — `ActionDropdown` の `*ActionCell` コンポーネントを使用（`@/admin/components/ActionDropdown`）
6. **削除ボタンをページ最下部カードに配置禁止** — `DetailDeleteButton` をヘッダー `actions` の編集ボタン左に配置
7. **詳細・編集ページのバックボタンを詳細コンポーネント内に配置禁止** — `AdminDetailLayout backHref` で左上固定
8. **Suspense 内 async Server Component の `connection()` 省略禁止** — `new Date()` や uncached データを使う Suspense 内コンポーネントは先頭に `await connection()` を配置
9. **新規作成ページで手動ヘッダー実装禁止** — `new/page.tsx` も `AdminDetailLayout` を使用（`locations/new` がテンプレート）
10. **`backLabel` にエンティティ名を含めること禁止** — `"クーポン一覧に戻る"` NG → `"一覧に戻る"`（デフォルト）/ `"詳細に戻る"` のみ使用
11. **バックナビゲーションに `ChevronLeft` 禁止** — `ArrowLeft` は `AdminDetailLayout` 内部で自動提供
12. **タブコンテンツ内にタブ名を繰り返す見出し禁止** — `<TabsContent>` 内で同名の `h2`/`h3` は冗長
13. **タブリスト右端ボタンの dialog state をタブ内コンポーネントに持つこと禁止** — `showXxxDialog` state は `*EditTabs` 親で管理し、`onShowXxxDialogChange` prop として渡す
14. **テーブルカラム非表示をヘッダーのみ・データ行のみに適用禁止** — ヘッダー・仮想行・全データ行に対称的に `hidden md:table-cell` を適用
15. **テーブルに `overflow-x-auto` なしで `overflow-hidden` のみ使用禁止** — モバイルでテーブルがクリップされスクロール不可になる
16. **管理画面のサブページディレクトリにルーティング対象名を使用禁止** — `[slug]/sections/` や `[slug]/seo/` は `_` プレフィックスでプライベート化（`[slug]/_sections/` / `[slug]/_seo/`）
17. **新規作成フォームに `disabled={!isDirty}` 禁止** — 新規作成は初期状態で全フィールドが空のため isDirty は常に false。create/edit 共用は `{...(isEdit && { disabled: !form.formState.isDirty })}` 条件スプレッド
18. **設定セクションの SubmitButton を CardContent 内に直置き禁止** — `<div className="flex justify-end pt-2">` でラップして右寄せ
19. **`<Input type="date" placeholder="...">` 禁止** — `type="date"` は placeholder を無視するため dead code。`aria-label` で説明
20. **同一 navigation chrome 情報の二重表示禁止** — user identity / notification badge / breadcrumb 等は単一 SSoT 配置のみ。user identity SSoT は サイドバー下部 `UserInfo`
21. **管理画面 edit form の outer `mx-auto max-w-*` 禁止** — `DashboardMain` の `p-4 lg:p-6` で十分。`SpaceEditForm` / `CouponForm` 等は full width + 内部 `grid sm:grid-cols-2`。プレビュー要素を含む場合は intra-card `lg:grid-cols-2` を使う（→ `admin-ui/forms.md` §Edit + Live Preview）

## Gotchas

- **`PublishSwitch.onToggle` は `(id, bool) => Promise<MutationResult<T>>` 必須** — canonical action 名は `update<Resource>Published(id, isPublished)` / `update<Resource>Active(id, isActive)`（Stripe / Shopify Admin / GitHub API 命名と整合、race-free な単一 UPDATE）。**9 resource 統一済**: Space / Location / Page / FAQ / News / Terms / Review (Published) + Coupon / SpaceCategory (Active)。`PublishSwitch` は label custom（`label={{ published, unpublished }}`）で `isActive` 系にも再利用可能。`toggleXxx*`（DB 読込反転型）復活禁止
- **tailwind-variants 複数スロット合成時の `text-*` 競合** — `${base()} ${variant()}` で同一要素に 2 つの `text-*` が適用されると CSS 生成順次第でどちらが勝つか不定。動的色は子要素に直接 `text-*` を明示
- **Tabler アイコンの `currentColor`** — アイコン色を動的切替したい場合、呼び出し元で `<span className={isActive ? "text-sidebar-text" : ""}>` でラップ
- **`bg-overlay` に opacity modifier 禁止** — `--color-overlay: oklch(0 0 0 / 0.6)` はアルファ値が組み込み済み。`bg-overlay/30` 等は機能しない
- **`DialogContent` には必ず `DialogTitle` が必要** — Radix `DialogTitle`（または VisuallyHidden）がないと `role="dialog"` に `aria-labelledby` が接続されず WCAG 4.1.2 違反
- **Settings singleton にフィールド追加は 4 箇所同時更新** — ① `schema.prisma` + migrate ② `domain/settings/types.ts` ③ `queries.ts` + `commands.ts` ④ `actions/settings/schemas.ts` + Server Action + barrel
- **Recharts の SVG props は CSS 変数を受け取れない** — `fill={CHART_COLORS.primary}` のように oklch 定数を定義して渡す
- **Recharts のラベル個別スタイリングは `tick={<CustomTick />}` 必須** — object 形式は全ラベル一律。月跨ぎ semibold landmark 等は React element で `payload`/`x`/`y`/`index` を受け取る custom 実装
- **Recharts 3.0+ は `accessibilityLayer` デフォルト ON** — 明示不要。`<ComposedChart title="...">` で SVG `<title>` 自動生成
- **Recharts `ResponsiveContainer` は dynamic({ ssr: false }) 配下で警告ゼロにできない** — `useChartContainerSize()` 相当の hook (`useRef` + `ResizeObserver` + `useState`) で width 観測 → `width > 0 ? <ComposedChart width={width} height={width / ASPECT}> : null` で条件付き render。プレースホルダー高さは wrapper `style={{ minHeight: 240 }}`
- **`bg-muted` 系は青みがかる** — admin.css の `--color-muted: oklch(0.95 0.01 250)` は色相 250。`bg-muted/30` で薄い青が目立つ。ニュートラル背景は背景色なし or `bg-card`
- **入力 → ダイアログ起動の trigger は単純 button + 既存 dialog が universal pattern** — cmdk Combobox + Popover のインライン検索は power user 向けで CMS の non-technical user には誤解を生む。クリック → カテゴリグリッド dialog が discovery 性高い（`IconPickerField` 参照実装、commit `d40f8319`）
