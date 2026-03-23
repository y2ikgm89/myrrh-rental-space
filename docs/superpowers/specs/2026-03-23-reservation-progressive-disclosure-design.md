# 予約ページ UI/UX 刷新 — プログレッシブ開示型 Location → Space 選択

> **日付**: 2026-03-23
> **ステータス**: Draft
> **破壊的変更**: Yes — 後方互換性なし、クリーン書き直し

## 背景と課題

現在の予約フォームはフラットなスペース一覧（テキストのみカード）で選択する構造。
スペース数が増えると以下の問題が発生する:

- **グリッド縦伸び**: 7個以上で3行超え、カレンダーが遠くなる
- **横スクロールの発見性**: モバイルで4個以上、右にスペースがある視覚的手がかりが弱い
- **比較困難**: 画像なし・情報不足で類似スペースを区別しにくい
- **フィルタリング不在**: カテゴリ・定員・料金での絞り込み手段がない
- **Location（場所）の概念が不在**: データモデルに Location があるのに予約フローで活用されていない

## 設計方針

### 選定アプローチ: プログレッシブ開示型（Approach B）

**却下した代替案:**

- **A. ステップ拡張型**: 3ステップは予約完了まで長く感じる。意思決定が完全直列
- **C. ページ分離型（スペースマーケット方式）**: 自社施設（少数 Location）では過剰。ページ遷移が多い

**選定理由:**

1. 自社施設なので Location は少数（2〜5）。検索ページ不要
2. 「予約する」明確な意図のユーザーに短いフローが最適
3. 選択状態が常に見え、変更も即座に可能
4. 有名サイトの調査結果: Booking.com/Agoda のオプション絞り込みUI、Airbnb のフィルター段階開示に近い体験

## 全体フロー

```
予約ページ (/reservation)
│
├─ Server Component: LocationWithSpaces[] + BusinessHours を取得
│
└─ ReservationForm (Client Component)
    │
    ├── [Location選択] ← Location 2つ以上で表示。1つなら自動選択＆非表示
    │     カード: 画像(16:9) + 名前 + 住所(1行truncate)
    │     選択後 → 下にスムーズスクロール
    │
    ├── [Space選択] ← Location選択後に表示。Space 1つなら自動選択＆非表示
    │     カード: 画像(4:3) + 名前 + 定員 + 時間料金
    │     選択変更 → 日時リセット
    │
    ├── [日時選択] ← Space選択後に表示
    │     2カラム(desktop): カレンダー | 時間スロット + 利用時間 + 人数
    │     縦積み(mobile): カレンダー → 時間 → 利用時間 → 人数
    │
    ├── [予約サマリー + 「次へ」ボタン]
    │     デスクトップ: インラインカード
    │     モバイル: スティッキーボトムバー
    │
    └── Step 2: 顧客情報入力（現行ベース）
```

### 自動スキップロジック

| Location数 | Space数 | 動作                              |
| ---------- | ------- | --------------------------------- |
| 1          | 1       | 両方非表示。即座にカレンダー表示  |
| 1          | 2+      | Location非表示。Space選択から開始 |
| 2+         | -       | Location選択から開始              |

## データモデル

### 新規クエリ: `getPublishedLocationsWithSpaces()`

```typescript
type SpaceOption = {
  id: string;
  name: string;
  capacity: number;
  hourlyPrice: number;
  mainImageUrl: string;
};

type LocationWithSpaces = {
  id: string;
  name: string;
  address: string;
  imageUrl: string;
  spaces: SpaceOption[];
};
```

- `src/shared/domain/locations/public-queries.ts` に新設
- `'use cache'` + `cacheTag(CACHE_TAGS.SPACES)` + `cacheLife(CACHE_LIFE.PUBLIC_CONTENT)` パターン準拠
- Prisma オブジェクトは `toPlainObject()` / `toPlainArray()` で変換後に返す（Client Component に渡すため必須）
- `isPublished: true` かつ `isActive: true` の Location のみ
- 各 Location に紐づく公開・有効な Space を含める（`mainImageUrl` も select）
- `sortOrder` 順
- 既存の `getPublishedSpaces()` は他ページ（`/spaces` 一覧）で使用中のため廃止しない。予約ページのみ新クエリを使用

### バリデーションスキーマ変更

```typescript
// public-reservation.ts
z.object({
  locationId: z.string().uuid(), // 新規追加
  spaceId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  numberOfGuests: z.number().int().min(1).max(500),
  lastName: z.string().min(1).max(50),
  firstName: z.string().min(1).max(50),
  email: z.string().email(),
  phoneNumber: z.string().max(20).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
  agreeToTerms: z.literal(true),
  turnstileToken: z.string().optional(),
});
```

### Server Action 変更

- `submitReservation`: Action 内の手続きロジックで `Space.locationId === input.locationId` を検証（`refine` ではなく DB 問い合わせ後）。DB には `locationId` を保存しない（Space 経由で辿れる）
- `fetchAvailableSlots`: 変更なし（`spaceId + date` のまま）

## コンポーネント設計

### ファイル構成

```
reservation/
├── page.tsx                    # Server Component（データ取得を変更）
└── _components/
    ├── reservation-form.tsx    # 全体オーケストレーター（書き直し）
    ├── location-selector.tsx   # 新規: Location カード選択
    ├── space-selector.tsx      # 書き直し: 画像付きカード
    ├── date-time-section.tsx   # 新規: 日時選択の統合ラッパー
    ├── calendar-picker.tsx     # 改善: props整理
    ├── time-slot-grid.tsx      # 改善: 軽微な調整
    ├── duration-pills.tsx      # 維持
    ├── guest-stepper.tsx       # 維持
    ├── booking-summary.tsx     # 改善: Location名追加
    ├── customer-step.tsx       # 維持（軽微修正）
    └── sticky-bottom-bar.tsx   # 維持
```

### `location-selector.tsx`（新規）

- Props: `locations: LocationWithSpaces[]`, `selectedId: string | null`, `onSelect: (id: string) => void`
- 型名は `LocationWithSpaces`（データモデル節と統一。location-selector は `spaces` フィールドは使わないが、親から渡す型をそのまま受ける）
- カード内容: `imageUrl`（アスペクト比 16:9、`ImageFrame` 使用）+ `name`（font-heading）+ `address`（1行 truncate、text-muted）
- レイアウト: 2カラム（デスクトップ）、1カラム（モバイル）
- 選択状態: `border-accent ring-2 ring-accent/20 bg-accent/5`
- ARIA: `role="radiogroup"` / `role="radio"`, `aria-checked`

### `space-selector.tsx`（書き直し）

- Props: `spaces: SpaceOption[]`, `selectedId: string | null`, `onSelect: (id: string) => void`
- カード内容: `mainImageUrl`（4:3、`ImageFrame`）+ `name` + `定員N名` + 料金表示（accent色）
- 料金の `¥` 記号: Turbopack エスケープ問題回避のため、モジュールレベル定数 `"\u00A5"` またはフォーマッター関数で生成（JSX 属性内に直接 `¥` を書かない）
- レイアウト: 3カラム（デスクトップ）、横スクロール snap-x（モバイル、2枚目チラ見え `min-w-[75vw]`）
- 選択アニメーション: `ring-2 ring-accent` + `bg-accent/5`
- ARIA: `role="radiogroup"` / `role="radio"`

### `date-time-section.tsx`（新規 — 統合ラッパー）

- CalendarPicker + TimeSlotGrid + DurationPills + GuestStepper を1セクションにまとめる
- 2カラムレイアウト（デスクトップ: カレンダー左 | 時間選択右）、縦積み（モバイル）
- 日時関連のフェッチロジック（`fetchAvailableSlots`、スロット state）をこのコンポーネントに局所化
- 個別の onChange コールバック（既存パターン踏襲）:
  - `onDateChange: (date: Date | undefined) => void`
  - `onStartTimeChange: (time: string | null) => void`
  - `onDurationChange: (minutes: number | null) => void`
  - `onGuestsChange: (count: number) => void`
- Props: `spaceId`, `spaceCapacity`, `hourlyPrice`, `businessHours` + 上記コールバック群

### `reservation-form.tsx`（書き直し）

ステート管理とプログレッシブ開示の制御に集中:

**ステートの所有権（Single Source of Truth）:**

- `locationId`, `spaceId` は `useState` で管理（選択 UI 制御の正）
- `setValue()` で RHF に一方向同期（送信時のバリデーション用）
- RHF の `useWatch` は使わない（`useState` が正なので逆流不要）
- `date`, `startTime`, `endTime`, `numberOfGuests` も同様に `useState` → `setValue()` パターン

```typescript
// 選択ステート（Single Source of Truth）
const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
  autoLocationId,
);
const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(
  autoSpaceId,
);
const [step, setStep] = useState<1 | 2>(1);

// 派生値
const currentLocation = locations.find((l) => l.id === selectedLocationId);
const currentSpaces = currentLocation?.spaces ?? [];
const currentSpace = currentSpaces.find((s) => s.id === selectedSpaceId);
const showLocationSelector = locations.length > 1;
const showSpaceSelector =
  selectedLocationId != null && currentSpaces.length > 1;
const showDateTimeSection = selectedSpaceId != null;
```

### カスケードリセット

```
Location変更 → Space, Date, Time, Duration すべてリセット
Space変更   → Date, Time, Duration リセット
Date変更    → Time, Duration リセット（スロット再取得）
Time変更    → Duration リセット
```

react-hook-form の `setValue()` で `locationId`, `spaceId` を同期。
Step 1→2 遷移時に `trigger(["locationId","spaceId","date","startTime","endTime","numberOfGuests"])` でバリデーション。

## レスポンシブレイアウト

### デスクトップ（md以上）

- 全体: `Container`（`max-w-4xl`）
- Location: 2カラムグリッド `grid-cols-2`
- Space: 3カラムグリッド `grid-cols-3`（4つ以上でも折り返し）
- 日時: 2カラム `grid-cols-[1fr_1fr]`（カレンダー左 | 選択右）
- サマリー: インラインカード（`bg-surface border rounded-xl p-6`）

### モバイル

- Location: 1カラム（縦積み）
- Space: 横スクロール `flex overflow-x-auto snap-x snap-mandatory gap-3`、各カード `min-w-[75vw]`
- 日時: 縦積み（カレンダー → 時間 → 利用時間 → 人数）
- サマリー: スティッキーボトムバー（`fixed bottom-0`、`backdrop-blur-sm`）

## プログレッシブ開示アニメーション

- 各セクション出現: `opacity: 0→1` + `translateY: 8px→0`、`duration-300 ease-out`
- 実装方法: `public.css` に `@keyframes section-enter` を新規定義。GSAP は使わない（軽量な CSS アニメーションで十分）
  ```css
  @keyframes section-enter {
    from {
      opacity: 0;
      transform: translateY(0.5rem);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  ```
- 新セクション出現時: `ref.scrollIntoView({ behavior, block: "start" })`
  - `behavior`: `prefers-reduced-motion: reduce` 時は `"instant"`、それ以外は `"smooth"`
  - `window.matchMedia("(prefers-reduced-motion: reduce)").matches` で判定
- セクション非表示時: 即座に消える（アニメーションなし — リセット操作は素早く）
- `@media (prefers-reduced-motion: reduce)` 時は `section-enter` アニメーションも無効化（`animation: none`）

## 変更ファイル一覧

### 新規作成

| ファイル                                        | 用途                                |
| ----------------------------------------------- | ----------------------------------- |
| `reservation/_components/location-selector.tsx` | Location カード選択                 |
| `reservation/_components/date-time-section.tsx` | 日時選択の統合ラッパー              |
| `src/shared/domain/locations/public-queries.ts` | `getPublishedLocationsWithSpaces()` |

### 書き直し（破壊的変更）

| ファイル                                           | 変更内容                           |
| -------------------------------------------------- | ---------------------------------- |
| `reservation/page.tsx`                             | データ取得を Location ベースに変更 |
| `reservation/_components/reservation-form.tsx`     | 全面書き直し（プログレッシブ開示） |
| `reservation/_components/space-selector.tsx`       | 画像付きカードに拡張               |
| `reservation/_components/booking-summary.tsx`      | Location名を追加表示               |
| `src/shared/lib/validations/public-reservation.ts` | `locationId` フィールド追加        |

### 軽微な修正

| ファイル                                          | 変更内容                      |
| ------------------------------------------------- | ----------------------------- |
| `reservation/_components/calendar-picker.tsx`     | props型整理                   |
| `reservation/_components/customer-step.tsx`       | サマリーにlocation名表示      |
| `src/app/(public)/_shared/actions/reservation.ts` | locationId バリデーション追加 |

### 変更なし

- `time-slot-grid.tsx`, `duration-pills.tsx`, `guest-stepper.tsx`, `sticky-bottom-bar.tsx`
- `time-slots.ts`, `time-slots-utils.ts`, `availability.ts`

### テスト影響

- `public-reservation` スキーマテスト → `locationId` 追加分を更新
- `time-slots.test.ts` → 変更なし
- 新規テスト不要（UI コンポーネントの結合テストは E2E で担保）

## エラーハンドリング・ローディング・エッジケース

### データ取得

- Location 0件（全て非公開/無効）: ページに「現在予約可能なスペースがありません」メッセージ表示。フォーム非表示
- Location はあるが全 Space が 0件: 同上
- Location 画像: Prisma スキーマ上 `imageUrl: String` で必須。空文字チェックは不要（admin バリデーションで担保）

### スロット取得

- `fetchAvailableSlots` のエラー時: 現行と同じく TimeSlotGrid 内でエラーメッセージ表示
- ローディング中: 現行の skeleton ボタン（8個）を維持

### フォームバリデーション

- Step 1→2 遷移時: `trigger()` で全 Step 1 フィールドをバリデーション。失敗時は遷移しない
- `submitReservation` で Location-Space 不一致: Server Action 内で検証し、エラーメッセージを返す（`isMutationError` パターン）

## 技術的判断

### BusinessHours の扱い

現行のグローバル設定（Settings テーブル）をそのまま使用する。
Location / Space 個別の `businessHours` JSON フィールドは存在するが、
今回のスコープでは活用しない（将来対応）。

### locationId の DB 保存

`Reservation` テーブルに `locationId` カラムは追加しない。
`Space.locationId` 経由で常に辿れるため、非正規化は不要。
バリデーション時に `Space` が指定 `Location` に属するかのみ検証する。

### react-hook-form のアプローチ

React Hook Form 公式の Wizard Form 推奨は外部ステート管理だが、
この予約フォームは2ステップのみで、全フィールドが1つの `useForm` で管理可能。
外部ライブラリ（little-state-machine 等）は導入しない。

### 既存コンポーネントの再利用判断

| コンポーネント  | 判断     | 理由                         |
| --------------- | -------- | ---------------------------- |
| CalendarPicker  | 再利用   | props 変更のみ               |
| TimeSlotGrid    | 再利用   | 変更なし                     |
| DurationPills   | 再利用   | 変更なし                     |
| GuestStepper    | 再利用   | 変更なし                     |
| CustomerStep    | 再利用   | Location名表示の軽微修正     |
| StickyBottomBar | 再利用   | 変更なし                     |
| SpaceSelector   | 書き直し | テキスト→画像カードは非互換  |
| ReservationForm | 書き直し | ステート構造が根本的に異なる |
| BookingSummary  | 改善     | Location名追加               |
