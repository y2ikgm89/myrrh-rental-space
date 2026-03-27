# Space Card Hover Preview — Design Spec

> スペース一覧カードに2秒ホバーで詳細プレビューを表示する機能

## 概要

SpaceCard の画像エリアにオーバーレイとして詳細情報を表示する。2秒間ホバーで表示、マウスアウトで非表示。モバイルではホバー不可のため影響なし（タップ = 詳細ページ遷移）。

## 表示内容

カードに既にある情報（名前、説明、定員、面積、時間料金、カテゴリ）と重複しない情報を表示:

1. **拠点名** — `location.name`（必須。`locationId` は required のため常に存在）
2. **住所** — `formatSpaceLineAddress(location.address, addressDetail)` でフォーマット済みの `lineAddress` を使用（`getSpaceBySlug` と同じパターン）
3. **設備タグ** — `facilities` 配列の上位 4 個をタグ表示（0 件または空配列なら省略）
4. **料金** — `¥X,XXX/h`（必須）+ `¥X,XXX/day`（`dailyPrice` があれば）

## レイアウト

```
┌─────────────────────────────┐
│  [Image area]               │
│  ┌─ overlay (opacity 0→1) ─┐│
│  │ 📍 渋谷スタジオ          ││
│  │ 東京都渋谷区神南1-2-3 3F ││
│  │                          ││
│  │ Wi-Fi ┃ プロジェクター   ││
│  │ ホワイトボード            ││
│  │                          ││
│  │ ¥3,000/h ・ ¥15,000/day  ││
│  └──────────────────────────┘│
│  [Name / Description / Meta] │
└─────────────────────────────┘
```

- オーバーレイ: `absolute inset-0` で画像の上に配置
- 背景: `bg-black/70 backdrop-blur-sm`
- テキスト: `text-white`（オーバーレイ上の白文字は画像の上なのでテーマトークンではなく直接指定が適切）
- アニメーション: `opacity` transition (`duration-300`)
- `prefers-reduced-motion: reduce` 時は `duration-0`（即時切替）

## データフロー

```
public-queries.ts (spaceListSelect 拡張 + マッピング関数追加)
  → spaces/page.tsx → SpaceGrid (props 型拡張) → SpaceCard
  → space-showcase.tsx (独自マークアップを SpaceCard に置き換え)
```

### クエリ拡張

`spaceListSelect` に追加するフィールド:

- `dailyPrice` — Decimal → `Number()` 変換（`null` の場合は `null` のまま。`getSpaceBySlug` と同パターン）
- `facilities` — JSON → `Array.isArray()` チェック後 `string[]` に変換。不正な値は `[]` にフォールバック
- `location: { select: { name: true, address: true } }` — 必須リレーション
- `addressDetail` — String | null

マッピングは共通ヘルパー関数 `mapSpaceListItem()` に抽出し、`getPublishedSpaces` / `getPublishedSpacesPaginated` の両方で使用:

```typescript
function mapSpaceListItem(s: RawSpaceListItem) {
  return {
    ...s,
    hourlyPrice: Number(s.hourlyPrice),
    dailyPrice: s.dailyPrice ? Number(s.dailyPrice) : null,
    facilities: Array.isArray(s.facilities) ? (s.facilities as string[]) : [],
    lineAddress: formatSpaceLineAddress(s.location.address, s.addressDetail),
  };
}
```

## コンポーネント変更

### SpaceCard (`space-card.tsx`)

- `"use client"` 化（2秒タイマーの `useState` + `useRef` が必要なため）
- 新 props: `locationName`, `lineAddress`, `facilities`, `dailyPrice`
- 画像エリア内にオーバーレイ div を追加
- `pointerType === 'mouse'` チェックでタッチデバイスを除外

### SpaceGrid (`space-grid.tsx`)

- `Space` interface に新フィールド追加: `dailyPrice`, `facilities`, `locationName`, `lineAddress`
- SpaceCard に新 props を渡す

### SpaceShowcase (`space-showcase.tsx`)

- 独自のインラインカードマークアップを削除し、`SpaceCard` を使用するよう置き換え
- `getShowcaseSpaces` クエリも `spaceListSelect` 相当のフィールドを返すよう拡張が必要
- ScrollReveal ラッパーは維持

## インタラクション

### デスクトップ

1. カードに `pointerenter` → `event.pointerType === 'mouse'` の場合のみ 2 秒タイマー開始
2. 2 秒経過 → state を `true` に → オーバーレイが `opacity-100` に遷移（`duration-300`）
3. カードから `pointerleave` → タイマーキャンセル + state を `false` に → オーバーレイが `opacity-0` に遷移

### キーボード

- カード（Link）に `focus-within` → ディレイなしで即座にオーバーレイ表示（キーボードユーザーはタブで素早く通過するため、表示は一瞬。2秒ディレイだと見られない）
- `blur` → オーバーレイ非表示

### モバイル

- `pointerType === 'mouse'` チェックでタッチイベントを除外するため、タイマーは起動しない
- タップ = `click` = 詳細ページ遷移（変更なし）

## アクセシビリティ

- オーバーレイ: `aria-hidden="true"`（装飾扱い。同情報はリンク先の詳細ページで閲覧可能）
- 画像ホバーの `group-hover:scale-105` は既存のまま維持
- `prefers-reduced-motion: reduce` 時はトランジションを無効化

## 料金表記

- 英語略記: `/h`、`/day`（サイトの「日本語メイン + 英語アクセント」デザイン言語に準拠）
- カードの既存表記 `¥X,XXX/h` と統一
- 日額がないスペースは時間料金のみ表示

## 影響ファイル

| ファイル                                                   | 変更内容                                                  |
| ---------------------------------------------------------- | --------------------------------------------------------- |
| `src/shared/domain/spaces/public-queries.ts`               | `spaceListSelect` 拡張、`mapSpaceListItem()` ヘルパー追加 |
| `src/shared/domain/sections/queries.ts`                    | `getShowcaseSpaces` のフィールド拡張                      |
| `src/app/(public)/spaces/_components/space-card.tsx`       | `"use client"` 化、props 追加、ホバーオーバーレイ追加     |
| `src/app/(public)/spaces/_components/space-grid.tsx`       | `Space` interface に新フィールド追加                      |
| `src/app/(public)/_components/homepage/space-showcase.tsx` | インラインマークアップを SpaceCard に置き換え             |

## 対象外

- 予約ページの `LocationSelector`
- `SpaceListSection.tsx`（カスタムページ用セクション — 独自クエリ・独自マークアップ。将来的に SpaceCard 統一可能だが今回はスコープ外）
- 設備の追加/編集 UI
- テスト（ホバータイマーは UI インタラクションのため、E2E テストが適切。今回はスコープ外とし、機能確認は手動で行う）
