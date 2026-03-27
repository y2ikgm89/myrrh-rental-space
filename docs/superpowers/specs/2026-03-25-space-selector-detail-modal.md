# SpaceSelector Detail Modal — Design Spec

> 予約フローのスペース選択カードに面積を追加し、「詳細を見る」→ モーダルで写真・設備・説明を表示

## 概要

予約フローの SpaceSelector カードに面積を追加し、Booking.com 方式の「詳細を見る」リンクでモーダルダイアログを表示する。モーダルには写真ギャラリー・設備一覧・面積・説明・料金を表示し、モーダル内からスペースを選択できる。

## カード変更

現状のカードに 2 点追加:

1. **面積**: 定員の横に `/ 25㎡`（`area` が null なら省略）
2. **「詳細を見る →」リンク**: カード下部に `text-xs text-accent` で配置

「詳細を見る」クリック時は `e.stopPropagation()` でカードの選択イベントを止め、モーダルを開く。

## モーダル内容

Radix Dialog を公開ページに導入。管理画面の `dialog.tsx` と同パターンだが、公開ページのデザイン言語に合わせてスタイルを調整。

### 表示要素（上から順に）

1. **DialogTitle**: スペース名（`font-heading`）
2. **DialogDescription**: スペースの説明テキスト（空文字列なら VisuallyHidden でフォールバック）
3. **画像ギャラリー**: `mainImageUrl` + `imageUrls` を横スクロールで表示。`imageUrls` が空なら `mainImageUrl` のみ静的表示（スクロールコンテナなし）。画像は情報提供目的でインタラクティブではないため、キーボードフォーカス不要
4. **メタデータ**: アイコン + テキスト行
   - `Users` アイコン + 定員 X 名
   - `Ruler` アイコン + 面積 X ㎡（area が null なら行ごと省略）
   - 料金: `¥X,XXX/h`（必須）+ `¥X,XXX/day`（dailyPrice があれば）
5. **設備一覧**: タグ表示（facilities 配列。空なら セクションごと省略）
6. **「このスペースを選択」ボタン**: `Button variant="primary"` — クリックで `onSelect(id)` を呼びモーダルを閉じる。既に選択済みなら `disabled`

### モバイル対応

モーダルコンテンツに `max-h-[85vh] overflow-y-auto` を適用し、長いコンテンツでも画面内でスクロール可能にする。

## データフロー

```
locations/public-queries.ts (SpaceOption 型拡張 + クエリ拡張)
  → SpaceSelector (面積表示 + 詳細リンク + Dialog state)
    → SpaceDetailDialog (新規コンポーネント)
```

注意: `reservation-form.tsx` は `SpaceOption[]` を型レベルで受け渡すだけなので、コード変更は不要。`SpaceOption` 型が拡張されれば自動的に対応する。

### SpaceOption 型拡張

追加フィールド:

| フィールド    | 型               | 変換                                                        | 備考                                                           |
| ------------- | ---------------- | ----------------------------------------------------------- | -------------------------------------------------------------- |
| `description` | `string`         | そのまま                                                    | 非 nullable（Prisma: `String @db.Text`）。空文字列の可能性あり |
| `area`        | `number \| null` | `Decimal` → `Number()`                                      | null なら UI で省略                                            |
| `dailyPrice`  | `number \| null` | `Decimal` → `Number()`                                      | null なら UI で省略                                            |
| `facilities`  | `string[]`       | JSON → `.filter((f): f is string => typeof f === "string")` | `as` 禁止、型ガードで安全に変換                                |
| `imageUrls`   | `string[]`       | JSON → `.filter((f): f is string => typeof f === "string")` | 同上                                                           |

### キャッシュ影響

`getPublishedLocationsWithSpaces` は `'use cache'` + `CACHE_TAGS.SPACES` でキャッシュされる。5 フィールド追加（特に `description` と `imageUrls`）でペイロードサイズが増加するが、予約フォーム用のクエリであり大量ページネーションはないため許容範囲。

## 公開ページ用 Dialog プリミティブ

`src/app/(public)/_shared/components/design-system/dialog.tsx` を新規作成。管理画面の `dialog.tsx` と同じ Radix 構成だが、公開ページのデザイン言語に合わせる:

- `DialogTitle`: `font-heading tracking-tight`（管理画面は `font-semibold`）
- `DialogClose` の sr-only テキスト: 「閉じる」
- アニメーション: 管理画面と同じ（`animate-in`/`animate-out`）
- `bg-background`（公開ページのテーマ変数を参照）
- export: `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`, `DialogClose`

## SpaceDetailDialog コンポーネント

`src/app/(public)/reservation/_components/space-detail-dialog.tsx` を新規作成。

Props:

- `space: SpaceOption | null` — 表示するスペース（null でモーダル非表示）
- `onOpenChange: (open: boolean) => void` — 開閉制御
- `onSelect: (id: string) => void` — スペース選択コールバック
- `isSelected: boolean` — 選択済みかどうか

Dialog の `open` 制御パターン:

```tsx
<Dialog open={space !== null} onOpenChange={onOpenChange}>
```

親（SpaceSelector）は `onOpenChange(false)` を受けて `setDetailSpace(null)` にする。

## SpaceSelector の変更

- Dialog の state 管理: `useState<SpaceOption | null>(null)` で「詳細表示中のスペース」を管理
- 「詳細を見る」は `<button>` で実装（ページ遷移しないため `<a>` ではない）
- `e.stopPropagation()` でカード選択を防止
- 面積表示: 定員の横に追加
- 既存の `/時間` 表記を `/h` に変更（サイト全体で統一）

## アクセシビリティ

- Radix Dialog が `role="dialog"`, `aria-modal="true"`, `aria-labelledby` を自動管理
- `DialogTitle` 必須（Radix が `aria-labelledby` を接続）
- `DialogDescription` 必須（空文字列の場合は `VisuallyHidden` で「スペースの詳細情報」を提供）
- 「詳細を見る」ボタンに `aria-label="{スペース名}の詳細を見る"`
- 画像ギャラリーは情報提供目的のため `aria-label="{スペース名}の写真"` 付きの `div`（インタラクティブ要素なし）
- ESC キーでモーダルを閉じる（Radix デフォルト）

## 料金表記

- `/h`, `/day`（既存の SpaceCard ホバーオーバーレイと統一）
- 既存 SpaceSelector の `/時間` 表記は `/h` に変更（サイト全体で統一）

## 影響ファイル

| ファイル                                                           | 変更                                                   |
| ------------------------------------------------------------------ | ------------------------------------------------------ |
| `src/shared/domain/locations/public-queries.ts`                    | `SpaceOption` 型拡張 + クエリ select 拡張 + マッピング |
| `src/app/(public)/_shared/components/design-system/dialog.tsx`     | **新規** — 公開ページ用 Dialog プリミティブ            |
| `src/app/(public)/reservation/_components/space-detail-dialog.tsx` | **新規** — モーダル本体                                |
| `src/app/(public)/reservation/_components/space-selector.tsx`      | 面積追加 + 詳細リンク + Dialog state + `/h` 統一       |

## 対象外

- LocationSelector（場所選択カード）への変更
- スペース画像の追加/編集 UI
- SpaceSelector のレイアウト変更（グリッド → リスト等）
- `reservation-form.tsx`（型レベルで自動対応、コード変更不要）
