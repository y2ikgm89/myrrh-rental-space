# Events Calendar Redesign — Design Spec

> FullCalendar 6 パッケージを完全削除し、Editorial Magazine デザインの自作イベント一覧 + カレンダービューに置き換える。

## Goal

- FullCalendar を削除してバンドルサイズを大幅削減
- Editorial Magazine (Kinfolk/Cereal) デザインに完全準拠
- 一覧ビュー + カレンダービューの切替
- 公式ベストプラクティス準拠、後方互換性なしのクリーン実装

## Scope

### In Scope

- `/events` 一覧ページの完全リライト（FullCalendar → 自作）
- FullCalendar 6 パッケージの `package.json` からの削除
- 旧 `event-calendar/` コンポーネント 3 ファイルの削除
- `DEFAULT_PAGE_SECTIONS` の events エントリ（前セッションで追加済み）
- DB セクションシステム統合（hero + trailing sections）

### Out of Scope

- `/events/[slug]` 詳細ページのリデザイン（別タスク）
- イベント登録フォームの変更
- 管理画面のイベント管理 UI

## Architecture

### ファイル構成

```
src/app/(public)/events/
├── page.tsx                          # SC: データ取得 + セクション統合
├── loading.tsx                       # 既存維持
├── _components/
│   ├── events-view-switcher.tsx      # CC: タブ切替 (nuqs URL同期)
│   ├── event-list-view.tsx           # SC: 月グループ + カード一覧
│   ├── event-calendar-view.tsx       # CC: 月間カレンダーグリッド
│   ├── month-picker.tsx              # CC: 年月ジャンプ picker
│   └── event-card.tsx                # SC: 共通イベントカード
├── [slug]/
│   ├── page.tsx                      # 既存維持（変更なし）
│   └── ...
```

### SC/CC 分離方針

- `page.tsx`: Server Component — `connection()` + DB 取得 + セクション統合
- `events-view-switcher.tsx`: Client Component — nuqs によるビュー切替
- `event-list-view.tsx`: **Server Component** — state/effect なし。月グループ化 + カード描画のみ
- `event-calendar-view.tsx`: Client Component — useState (月送り、日付選択)
- `month-picker.tsx`: Client Component — ポップオーバー state
- `event-card.tsx`: Server Component — リスト/サイドパネル共通のカード UI

### データフロー

```
page.tsx (SC)
  ├── getPageSectionsWithFallback("events") → hero + trailing
  ├── getPublishedEvents() → events[]
  └── EventsViewSwitcher (CC)
        ├── view === "list"  → EventListView (SC, passed as children)
        └── view === "calendar" → EventCalendarView (CC)
              └── SideDayPanel → EventCard (SC pattern)
```

**注意**: `EventListView` は SC だが、`EventsViewSwitcher` (CC) の children として切替表示されるため、page.tsx から両方のビューを children/props で渡す設計。CC 内で SC を条件レンダリングはできないため、CSS display 切替 or children slot パターンを使う。

### URL 状態管理 (nuqs)

```typescript
// search-params.ts に追加
const EVENT_VIEWS = ["list", "calendar"] as const;

export const eventsSearchParamsParsers = {
  view: parseAsStringLiteral(EVENT_VIEWS).withDefault("list"),
};

export const eventsSearchParams = createSearchParamsCache(
  eventsSearchParamsParsers,
);
```

- URL: `/events?view=list` / `/events?view=calendar`
- デフォルト: `list`（URL パラメータなし時）

## Component Designs

### 1. page.tsx (Server Component)

```typescript
export default async function EventsPage({ searchParams }) {
  await connection();
  const params = await eventsSearchParams.parse(searchParams);
  const [sections, events] = await Promise.all([
    getPageSectionsWithFallback("events"),
    getPublishedEvents(),
  ]);
  // hero/trailing フィルタ（spaces/page.tsx と同パターン）
  // EventsViewSwitcher に events + activeView を渡す
}
```

### 2. EventsViewSwitcher (Client Component)

- Journal ページのタブパターン準拠（`border-b` + accent アンダーライン）
- nuqs `useQueryStates` で `view` パラメータを管理
- `shallow: false` で SC 再レンダリングを発火
- `role="tablist"` / `role="tab"` + `aria-selected` + `id` / `aria-labelledby` の完全な a11y
- ビュー切替: CSS `hidden` で DOM を保持し、SC children の再マウントを回避

### 3. EventListView (Server Component)

- 月ごとにグループ化（JST ベースの月キー生成）
- 月ヘッダー: serif italic + 水平線
- EventCard: 左に大きな serif 日付番号、右にイベント情報
- 空状態: 中央テキスト + editorial ボタン

### 4. EventCalendarView (Client Component)

- 自作月間カレンダーグリッド（日曜始まり）
- 曜日ヘッダー: 枠線 + surface 背景、日=赤 / 土=青
- セルの日付番号: 日=赤 / 土=青、今日=bronze 丸
- イベントがある日: セル内に bronze ラベル (max 2 + overflow count)
- 日付クリック → 右サイドパネル (lg) / 下展開 (mobile) にイベントカード表示
- 2カラムレイアウト: `lg:grid-cols-[1fr_20rem]` + `items-stretch`
- MonthPicker: クリックで年月セレクター表示、年のキーボード入力対応

### 5. EventCard (Server Component)

リストビューとサイドパネルで共有。variant prop でサイズ調整:

- `"list"`: 大きな日付番号 + 詳細テキスト + 矢印
- `"compact"`: サイドパネル用の縮小版

## レビュー指摘の修正事項

| #   | 問題                                  | 修正                                                                                 |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | `e.target as Node` 型アサーション     | event target 許可例外として維持（DOM API の型制約）                                  |
| 2   | `requestAnimationFrame` purity        | `useEffect` + `isEditingYear` 依存でフォーカス管理                                   |
| 3   | MonthPicker の2つの useEffect         | 1つの useEffect にマージ                                                             |
| 4   | カレンダーセルの `key={i}`            | `key={\`${cell.year}-${cell.month}-${cell.day}\`}`                                   |
| 5   | tabpanel に aria-labelledby なし      | tab に `id` 付与 + tabpanel に `aria-labelledby`                                     |
| 6   | SC での `new Date()` PPR 問題         | page.tsx で `connection()` 後にデータ取得。カレンダーは CC 内なので問題なし          |
| 7   | getMonthKey が UTC 使用               | JST ベースの月キー生成（`Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" })`） |
| 8   | formatPrice 重複                      | `@/public/lib/format-event-date.ts` に統合                                           |
| 9   | disabled ボタンの冗長 if ガード       | if ガード削除（disabled で onClick 不発火）                                          |
| 10  | event-list-view の不要な "use client" | Server Component 化                                                                  |

## 削除対象

### ファイル削除

- `src/app/(public)/_shared/components/event-calendar/event-calendar.tsx`
- `src/app/(public)/_shared/components/event-calendar/event-modal.tsx`
- `src/app/(public)/_shared/components/event-calendar/calendar-skeleton.tsx`
- `src/app/(public)/events-design-demo/` (デモページ全体)

### パッケージ削除

```
@fullcalendar/core
@fullcalendar/daygrid
@fullcalendar/interaction
@fullcalendar/list
@fullcalendar/react
@fullcalendar/timegrid
```

### SectionRenderer の event-calendar case

`section-renderer.tsx` の `SectionType.EVENT_CALENDAR` case は null を返す既存実装のまま維持（DB にセクションが残る可能性があるため）。

## Design Tokens (Editorial Magazine 準拠)

- カード: `border border-border` シャープエッジ（rounded/shadow 禁止）
- hover: `hover:text-foreground`（accent 禁止）、矢印のみ `group-hover:text-accent`
- 日付番号: `font-heading font-light`（Cormorant Garamond）
- セクションラベル: `text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground`
- 今日マーカー: `bg-accent text-accent-foreground rounded-full`
- イベントラベル: `bg-accent/10 text-accent`
- ボタン: シャープエッジ（rounded-full 禁止）
- 曜日色: 日=`text-destructive`、土=`text-info`、平日=`text-foreground/70`

## Testing

- 型チェック: `bun run type-check`
- lint: `bun run validate`
- ビルド: `bun run build`
- 手動確認: `/events` で一覧/カレンダー切替、月送り、MonthPicker、日付クリック、レスポンシブ
