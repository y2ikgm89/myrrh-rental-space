---
description: 管理テーブルの 2 層ラッパー + Progressive Disclosure + Badge / TableHead 折り返し防止 + カラム順序 + インライン非表示
paths:
  - src/app/(admin)/**/*Table*.tsx
---

# テーブルレスポンシブ対応パターン

> 管理画面の全テーブルは **2 層ラッパー** + **カラム Progressive Disclosure** で実装する。

## 2 層ラッパー（必須）

```tsx
// 外側: overflow-hidden で border-radius をクリップ
// 内側: overflow-x-auto で横スクロールを有効化
<div className="overflow-hidden rounded-lg border bg-card">
  <div className="overflow-x-auto">
    <Table>...</Table>
  </div>
</div>
```

**禁止**: `overflow-hidden` のみ（角丸はきれいだがスクロール不可）

## カラム Progressive Disclosure（必須）

重要度の低いカラムは `hidden md:table-cell` / `hidden lg:table-cell` で段階的に非表示にする。
ヘッダー行・仮想行（ホームページ行等）・全データ行に **対称的に適用** すること:

```tsx
<TableHeader>
  <TableRow>
    <TableHead>常時表示（必須情報）</TableHead>
    <TableHead className="hidden md:table-cell">md以上（補助情報）</TableHead>
    <TableHead className="hidden lg:table-cell">lg以上（詳細情報）</TableHead>
  </TableRow>
</TableHeader>
<TableBody>
  {items.map((item) => (
    <TableRow key={item.id}>
      <TableCell>...</TableCell>
      <TableCell className="hidden md:table-cell">...</TableCell>  {/* ヘッダーと一致 */}
      <TableCell className="hidden lg:table-cell">...</TableCell>  {/* ヘッダーと一致 */}
    </TableRow>
  ))}
</TableBody>
```

**標準優先度（プロジェクト基準）**:

| 常時表示                   | sm 以上    | md 以上              | lg 以上               |
| -------------------------- | ---------- | -------------------- | --------------------- |
| ステータス・タイトル・操作 | スラッグ等 | 補助情報・料金・日時 | 詳細情報・住所・PV 数 |

**操作列（`*ActionCell` 配置）の標準**: `<TableHead>操作</TableHead>` + `<TableCell>`（どちらも幅指定・寄せ指定なし）。`w-24 text-right` / `className="text-right"` の付与は多数派（Post/News/Customer/Event/Inquiry/Coupon）から逸脱するため禁止。例外は既存の `LocationTable` / `FaqTrashTable` のみ（`text-right` 指定あり）。

## Badge の折り返し防止

`@/admin/components/ui/badge` と `@/public/components/design-system/badge` の base に `whitespace-nowrap` が適用済み。呼び出し側でセル・親要素に `whitespace-nowrap` を重ねて付ける必要はない。

## TableHead の折り返し防止

`@/admin/components/ui/table` の `TableHead` base に `whitespace-nowrap` が適用済み。`tracking-wider uppercase` で幅が広がりやすい日本語ヘッダーラベル（「公開状態」「時間料金」「予約数」等）が 2 行折り返しになる問題を根本解決している。呼び出し側で `whitespace-nowrap` を重ね掛けする必要はない。

## カラム順序の標準パターン

管理画面の一覧テーブルは以下の論理順序で並べる（左→右）:

**識別 → 分類 → スペック → 実績 → 状態 → 操作**

全テーブル例外なくこの順序に統一する（旧「ワークフロー系テーブルはステータスを左端に配置」例外は撤回済み、2026-05-19）。状態 UI patterns は 4 種:

- **`PublishSwitch`** (binary): News / Page / Space / Location / Terms / FAQ / Review / SpaceCategory
- **`CouponStateToggle`** (binary + 5 派生状態 + セマンティックカラー): Coupon 専用
- **`<XxxStatusSelect>`** (3+ states inline Select): Reservation / Post / Event
- **`<XxxStatusBadge>`** (read-only): Customer / Inquiry（状態遷移 UI は別 UX）

全 4 種とも **必ず操作カラムの直前**に配置し、識別・分類・スペック・実績カラムが左、状態・操作カラムが右という一貫した視覚パターンで横断統一する。

| グループ | 例                                         |
| -------- | ------------------------------------------ |
| 識別     | 名前・タイトル・スラッグ（画像サムネ併記） |
| 分類     | カテゴリ・タイプ・所在地                   |
| スペック | 定員・料金・サイズ等の属性値               |
| 実績     | 予約数・PV 数・閲覧数等の集計値            |
| 状態     | 公開/非公開スイッチ・ステータス Badge      |
| 操作     | `ActionDropdown`（常時右端固定）           |

**参照実装** (右配置 canonical で統一済 = 全テーブル): `CouponTable` / `SpaceTableDesktop` / `LocationTable` / `CategoryTable` / `PostTable` / `NewsTable` / `TermsTable` / `FaqCategoryItemsTable` / `PageListTable` / `InquiryTable` / `CustomerTable` / `EventTable` / `ReservationTable`。**禁止**: 旧「ワークフロー系テーブルはステータスを左端に配置する例外」パターンの復活（2026-05-19 全 10 テーブル右配置で統一済）。

## インラインコントロールのモバイル非表示

複雑なインラインコントロール（Select・フォーム等）は小画面で折り畳む:

```tsx
<div className="flex items-center justify-end gap-2">
  <div className="hidden sm:block">
    <ReservationStatusSelect ... />  {/* sm未満では非表示 */}
  </div>
  <ReservationActionCell ... />  {/* 常時表示 */}
</div>
```

## 全テーブルファイル一括検索コマンド

```bash
grep -rl "overflow-hidden rounded-lg border bg-card" src/
```
