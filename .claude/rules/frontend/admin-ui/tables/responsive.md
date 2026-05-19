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

**操作列（`*ActionCell` 配置）の標準**: `<TableHead className="text-right">操作</TableHead>` + `<TableCell className="text-right">`。業界標準（shadcn-ui 公式 Table 例 / Material DataGrid `actions` column type / Shopify Polaris / Stripe Dashboard / Linear / GitHub Issues / Ant Design Table）と整合。ActionDropdown / 三点リーダーは行右端に固定し、複数行縦に並べた際に操作ボタン位置が揃って Fitts's Law が成立する。`w-24` 等の固定幅指定は禁止（content driven width で operations content がはみ出さない）。下記「カラム alignment 規律」§操作（ActionDropdown）と整合。

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

## カラム alignment 規律（semantic ベース、業界標準準拠）

業界標準（Stripe Dashboard / Shopify Admin / Linear / GitHub Issues / Material DataGrid / Ant Design Table）に準拠し、列の semantic 種別で alignment を決める。`text-center` は新規禁止（業界標準で center を採用する列はテーブル上に存在しない）。

| 列 semantic                                                                  | TableHead / TableCell                             | 例                                            |
| ---------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------- |
| **数値**（金額・件数・カウント・PV・割引・利用数・予約数・累計金額・並び順） | **`text-right`** （tabular-nums も推奨）          | 料金 / スペース数 / PV / 利用数 / 累計金額    |
| 日時                                                                         | 寄せ指定なし（デフォルト左）                      | 予約日時 / 登録日 / 更新日 / 最終予約         |
| テキスト（タイトル・名前・コード・スラッグ・説明・住所・メール・電話）       | 寄せ指定なし                                      | スペース名 / 顧客名 / クーポンコード          |
| Badge（種別・タイプ・同期ステータス）                                        | 寄せ指定なし                                      | カスタム/システム / CouponTypeBadge / GBP同期 |
| PublishSwitch / CouponStateToggle / `<XxxStatusSelect>` / `<XxxStatusBadge>` | 寄せ指定なし                                      | 公開状態 / 有効状態 / 予約ステータス          |
| Checkbox（行選択）                                                           | 寄せ指定なし（`CheckboxCell` 内の flex で中央化） | 行選択                                        |
| **操作（ActionDropdown）**                                                   | **`text-right`** （TableHead + TableCell 両方）   | 三点リーダー                                  |

**禁止**:

- **`text-center` 全面禁止** — center で揃える業界標準列は存在しない。数値は `text-right`、Badge / Toggle / Switch は左揃え（指定なし）。`text-center` を残すと「数値 center」「Switch center」「Badge center」のいずれにも筋が通らず drift する
- **日時列に `text-right`** — 業界標準は日時=左。Stripe Dashboard / Shopify Orders / Linear Issues いずれも `created_at` / `updated_at` は左寄せ
- **数値列を指定なし（デフォルト左）** — 数値は桁揃えのため右寄せ必須（小数点・通貨記号を視覚的に整列）
- **PublishSwitch / Toggle / StatusSelect / Badge に `text-center` / `text-right`** — 業界標準で center / right はコントロールに不適切（左揃えで列内の他データと視線が揃う）

**監査 grep**:

```bash
# text-center 残存検出（ゼロ件期待）
grep -rnE 'text-center' src/app/\(admin\)/admin/\(dashboard\)/**/_components/*Table*.tsx | grep -vE 'h-24 text-center|p-12 text-center|py-4 text-center'

# 日時列の text-right 残存検出（登録日 / createdAt / updatedAt / publishedAt / lastReservationAt 等）
grep -rnE 'text-right' src/app/\(admin\)/admin/\(dashboard\)/**/_components/*Table*.tsx -B2 -A2 | grep -E '(createdAt|updatedAt|publishedAt|登録日|更新日|公開日|最終予約)'
```

**参照実装** (規律統一済): `ReservationTable` / `CustomerTable` / `CategoryTable` / `LocationTable` / `CouponTable`。

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
