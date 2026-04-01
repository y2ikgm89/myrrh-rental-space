# イベントカレンダー Phase 1 実装計画

**開始日**: 2026-04-01  
**対象ブランチ**: `feature/event-calendar-phase1`  
**マイルストーン**: 予約管理カレンダーコアのみ（ドラッグ・色分け・時間ブロック選択は Phase 2）

---

## 目的

管理画面の「予約管理」リソースをリスト表示から **完全なカレンダービュー** に統合し、以下を実現:

1. **月 / 週 / 日 ビューの切替** — Full Calendar.io (`@fullcalendar/react`) で実装
2. **時間帯ビジュアライゼーション** — 予約時間を色分け表示（ステータス別）
3. **キャッシュ戦略** — 分単位での動的キャッシュ + `updateTag` による即時無効化
4. **権限チェック** — `SUPER_ADMIN/ADMIN/VIEWER` 以上のみアクセス可能
5. **フィルタリング** — スペース・ステータス・日付範囲で絞り込み可能

---

## スコープ

### ✅ Phase 1 に含まれる

1. **ページ構造**
   - `/admin/calendar` — メインカレンダーページ
   - `/admin/calendar/[reservationId]` — 詳細モーダル（予約情報表示）

2. **UI コンポーネント**
   - `CalendarView.tsx` — Full Calendar ビューコンポーネント
   - `CalendarFilters.tsx` — スペース/ステータス/日付フィルター
   - `ReservationCard.tsx` — イベントラベル表示
   - `ReservationModal.tsx` — 詳細表示（読み取り専用）

3. **データ層**
   - `queries.ts` — `getReservationsByDateRange()` / `getCalendarStats()`
   - `actions.ts` — キャッシュ無効化用 Server Actions（削除・ステータス変更時の `updateTag` トリガー）
   - nuqs パーサー — `calendarSearchParams` (startDate, endDate, spaceId, status)

4. **権限・キャッシュ**
   - 権限チェック — `hasPermission(role, "reservation", "read")`
   - キャッシュ — `getCacheTag.reservations.calendar()` + `CACHE_LIFE.DYNAMIC_DATA` (分単位)

### ❌ Phase 2 以降

- ドラッグ&ドロップ（予約時間変更）
- ダブルクリック新規予約
- 色分けカスタマイズ（管理画面設定）
- Google Calendar / iCal 双方向同期（既存機能活用）
- Reservation モデルへの「イベント表示設定」フィールド追加
- CSV エクスポート（予約スケジュール）

---

## アーキテクチャ決定

### 1. 技術スタック

| 層            | 選択           | 理由                                          |
| ------------- | -------------- | --------------------------------------------- |
| カレンダー UI | Full Calendar  | React 統合・Month/Week/Day ビュー・イベント API |
| ビューモード  | URL パラメータ | `?view=month&startDate=2026-04&spaceId=xxx`   |
| キャッシュ    | `'use cache'`  | `CACHE_LIFE.DYNAMIC_DATA` (分単位)            |
| 状態管理      | (不要)         | ビューモードはURL パラメータで管理             |

### 2. データ取得フロー

```
Client (URL フィルター)
  ↓
CalendarFilters → nuqs parse
  ↓
Server Component (CalendarView)
  ↓
getReservationsByDateRange('use cache')
  ↓
Prisma (select: { id, spaceId, startTime, endTime, status, ... })
  ↓
計算済みイベント配列 → Full Calendar イベント形式
  ↓
Client Component で render
```

### 3. ステータス色マッピング

```typescript
const RESERVATION_STATUS_COLORS = {
  PENDING: "#fbbf24",    // amber-400
  CONFIRMED: "#10b981",  // emerald-500
  COMPLETED: "#6b7280",  // gray-500
  CANCELLED: "#ef4444",  // red-500
  NO_SHOW: "#8b5cf6",    // violet-500
} as const;
```

### 4. キャッシュ無効化パターン

**予約削除 / ステータス変更 / 顧客キャンセル時**:

```typescript
await updateTag(CACHE_TAGS.RESERVATIONS);
await updateTag(getCacheTag.reservations.calendar());
await updateTag(getCacheTag.reservations.detail(reservationId));
```

→ 既存コマンド（`deleteReservationCommand` 等）に統合

---

## 実装タスク

### フェーズ A: ページ構造 & Server Component 基盤 (5 タスク)

#### A1. `/admin/calendar` ページ作成
- [ ] `src/app/(admin)/admin/(dashboard)/calendar/page.tsx` 作成
- [ ] メタデータ設定 (`title: "予約カレンダー | Myrrh Rental Space"`)
- [ ] nuqs パーサー統合 (`calendarSearchParams` の定義・parse)
- [ ] 権限チェック (`hasPermission(role, "reservation", "read")`)
- [ ] `getReservationsByDateRange()` クエリ呼び出し
- テスト: `bun run type-check` 通過

#### A2. nuqs パーサー定義 (`src/shared/lib/nuqs/parsers.ts`)
- [ ] `calendarSearchParams` 定義
  - `startDate`: ISO 8601 日付文字列 (default: 当月1日)
  - `endDate`: ISO 8601 日付文字列 (default: 当月末日)
  - `spaceId`: UUID 文字列 (optional)
  - `status`: ReservationStatus (optional)
  - `view`: `"month" | "week" | "day"` (default: "month")
- [ ] Server-side parse 関数実装
- テスト: ブラウザパラメータ遷移確認

#### A3. Reservation クエリ (`_shared/queries.ts` 新規)
- [ ] `getReservationsByDateRange(startDate, endDate, filters)`
  - Prisma `findMany` with `select: { id, spaceId, customerId, startTime, endTime, status, space: { select: { name } } }`
  - `where: { spaceId?, status?, deletedAt: null, startTime >= startDate, endTime <= endDate }`
  - `orderBy: { startTime: 'asc' }`
- [ ] ローカルタイム処理 (JST)
- [ ] 戻り値型: `CalendarEvent[]` with `{ id, spaceId, spaceName, startTime, endTime, status }`
- テスト: `bun run type-check` + unit テスト

#### A4. `'use cache'` データ取得関数
- [ ] Server Component で `'use cache'` 関数を実装
- [ ] `cacheLife(CACHE_LIFE.DYNAMIC_DATA)` (分単位)
- [ ] `cacheTag(getCacheTag.reservations.calendar())`
- [ ] `toPlainArray()` で Client に渡す（Date → ISO 8601 string）
- テスト: キャッシュタグ確認

#### A5. メインページレイアウト
- [ ] `<div className="space-y-6">` で `h1` + Filters + CalendarView
- [ ] `<h1 className="text-2xl font-bold">予約カレンダー</h1>`
- [ ] `<p className="text-sm text-muted-foreground">スペース別に予約スケジュールを表示します</p>`
- [ ] Suspense boundary (`<Suspense fallback={<LoadingState />}>`)
- テスト: ビジュアル確認

---

### フェーズ B: UI コンポーネント (4 タスク)

#### B1. CalendarView コンポーネント (`_components/CalendarView.tsx`)
- [ ] `"use client"` コンポーネント
- [ ] `@fullcalendar/react` インストール・設定
  - `@fullcalendar/daygrid`（月ビュー）
  - `@fullcalendar/timegrid`（週・日ビュー）
  - `@fullcalendar/interaction`（クリック）
- [ ] Props: `events: CalendarEvent[]`, `view: "month" | "week" | "day"`, `onDateSelect?: (date: Date) => void`
- [ ] イベント配列を Full Calendar 形式に変換
  - `{ id, title, start, end, backgroundColor, borderColor, extendedProps: { status, spaceId } }`
- [ ] ステータス色マッピング適用
- [ ] クリックハンドラー → 詳細モーダルナビゲーション
- テスト: `bun run type-check` + Playwright E2E

#### B2. CalendarFilters コンポーネント (`_components/CalendarFilters.tsx`)
- [ ] `"use client"` コンポーネント
- [ ] フィルター要素
  - Space SelectBox（全 Space リスト）
  - Status SelectBox（ReservationStatus enum）
  - Date Range Picker（startDate ~ endDate）
  - View Mode RadioGroup（month / week / day）
- [ ] `onChange` → `useRouter.push()` で URL 更新 (nuqs)
- [ ] `useSearchParams()` で現在値を反映
- テスト: フィルター変更時の URL 確認

#### B3. ReservationCard コンポーネント (`_components/ReservationCard.tsx`)
- [ ] Server Component（純粋な表示）
- [ ] Props: `reservation: CalendarEvent`
- [ ] 表示内容
  - スペース名
  - 顧客名（顧客情報は別クエリで取得必要に応じて）
  - 開始時刻～終了時刻（日本語フォーマット）
  - ステータスバッジ（色付き）
- テスト: `bun run type-check`

#### B4. ReservationModal コンポーネント (`_components/ReservationModal.tsx`)
- [ ] Client Component（Dialog primitive）
- [ ] Props: `reservation: Reservation`, `open: boolean`, `onClose: () => void`
- [ ] レイアウト
  - `Dialog.Root` + `Dialog.Trigger` + `Dialog.Content`
  - 予約ID, スペース, 顧客, 開始～終了時刻, ステータス, 金額
  - 「詳細を編集」ボタン（`/admin/reservations/[id]` へリンク）
  - 「キャンセル」ボタン（`deleteReservationCommand` トリガー）
- [ ] Server Component へのリンク（read-only）
- テスト: Playwright モーダル開閉

---

### フェーズ C: API統合 & キャッシュ (3 タスク)

#### C1. Server Actions 統合 (`_shared/actions.ts`)
- [ ] `deleteReservationFromCalendarAction(id)`
  - `deleteReservationCommand(id)` ラップ
  - `await updateTag(CACHE_TAGS.RESERVATIONS)`
  - `await updateTag(getCacheTag.reservations.calendar())`
  - `await updateTag(getCacheTag.reservations.detail(id))`
- [ ] `updateReservationStatusAction(id, newStatus)`
  - ステータス遷移ロジック (`RESERVATION_STATUS_TRANSITIONS` 参照)
  - 同じキャッシュ無効化
- テスト: キャッシュ無効化動作確認

#### C2. 既存 Reservation コマンドへのキャッシュ無効化追加
- [ ] `src/shared/domain/reservations/commands/delete-reservation.ts`
  - 既存: `deleteReservationCommand(id, customerId)`
  - 追加: `updateTag(getCacheTag.reservations.calendar())`
- [ ] `src/shared/domain/reservations/commands/cancel-customer-reservation.ts`
  - 同様に `updateTag(getCacheTag.reservations.calendar())`
- [ ] `updateReservationStatusCommand` (存在すれば)
- テスト: `bun run type-check`

#### C3. 権限・レート制限
- [ ] `src/app/(admin)/admin/(dashboard)/calendar/page.tsx` で `hasPermission()` チェック
  - 権限なし → empty state 表示
- [ ] 管理画面のため `formSubmitRateLimiter` は不要（セッション認証済み）
- テスト: 権限チェック動作確認

---

### フェーズ D: ナビゲーション & 統合 (2 タスク)

#### D1. サイドバー項目追加
- [ ] `src/app/(admin)/admin/(dashboard)/_components/sidebar-items.tsx`
- [ ] エントリ追加
  ```typescript
  {
    label: "予約カレンダー",
    href: "/admin/calendar",
    icon: <IconCalendarMonth className="h-5 w-5" />,
  },
  ```
- [ ] アイコンは Tabler 統一（`IconCalendarMonth` / `IconCalendarEvent` など）
- テスト: サイドバー表示確認

#### D2. 既存「予約管理」リスト との関係調整
- [ ] `/admin/reservations` (リスト) は維持
- [ ] `/admin/calendar` (カレンダー) は新規追加
- [ ] UI で両者を明確に区別（サイドバー + breadcrumb）
- [ ] メモ: Phase 2 で「リスト ↔ カレンダー切替」ボタン検討

---

### フェーズ E: テスト & バリデーション (3 タスク)

#### E1. 型チェック & Lint
- [ ] `bun run validate` (type-check + lint)
- [ ] ESLint `@eslint-react/purity`（Server Component），`React.ComponentProps` 修正
- [ ] `exactOptionalPropertyTypes` チェック
- テスト: ビルド成功確認

#### E2. 単体テスト
- [ ] `__tests__/unit/domain/reservations/calendar-queries.test.ts`
  - `getReservationsByDateRange()` with filters
  - ソフトデリート (`deletedAt: null`) フィルター確認
  - タイムゾーン処理 (JST)
- [ ] `__tests__/unit/admin/calendar-utils.test.ts`
  - ステータス色マッピング
  - イベント配列→Full Calendar 形式変換
- テスト: `bun run test:unit`

#### E3. 統合テスト & E2E
- [ ] `__tests__/integration/admin/calendar.test.ts`
  - `/admin/calendar` GET → 200 OK
  - フィルター applied → 正しいイベント数
  - キャッシュタグ確認
- [ ] Playwright E2E
  - カレンダーレンダリング確認
  - フィルター変更時のリロード
  - モーダル open/close
- テスト: `bun run test:integration && bun run e2e`

---

## 細部設計

### 1. Reservation ソフトデリート処理

**既存制約**: 全 `findUnique` / `findFirst` / `findMany` に `where: { deletedAt: null }` 必須

**新規関数**:
```typescript
// _shared/queries.ts
async function getReservationsByDateRange(
  startDate: Date,
  endDate: Date,
  filters?: { spaceId?: string; status?: ReservationStatus }
) {
  return await prisma.reservation.findMany({
    where: {
      deletedAt: null,  // ← 必須
      startTime: { gte: startDate },
      endTime: { lte: endDate },
      ...(filters?.spaceId && { spaceId: filters.spaceId }),
      ...(filters?.status && { status: filters.status }),
    },
    select: {
      id: true,
      spaceId: true,
      customerId: true,
      startTime: true,
      endTime: true,
      status: true,
      space: { select: { name: true } },
      customer: { select: { firstName: true, lastName: true } },
    },
    orderBy: { startTime: 'asc' },
  })
}
```

### 2. キャッシュタグ 3 点セット

**削除 / ステータス変更 / 顧客キャンセル**:

```typescript
// 既存コマンド内 (delete-reservation.ts など)
await updateTag(CACHE_TAGS.RESERVATIONS);
await updateTag(getCacheTag.reservations.calendar());
await updateTag(getCacheTag.reservations.detail(reservationId));
```

→ cache.ts に `getCacheTag.reservations.calendar()` は既に定義済み

### 3. Date → ISO 8601 string 変換

Server Component の `'use cache'` 関数から Client コンポーネントへ返す際:

```typescript
// NG: Date を直接返す（React 19 シリアライゼーションエラー）
return reservations;

// OK: ISO string に変換してから返す
import { toPlainArray } from '@/shared/lib/serialize'

return toPlainArray(
  reservations.map(r => ({
    ...r,
    startTime: r.startTime.toISOString(),
    endTime: r.endTime.toISOString(),
  }))
);
```

### 4. Full Calendar イベント形式

```typescript
type CalendarEventInput = {
  id: string;
  title: string;       // "スペース名 (顧客名)"
  start: string;       // ISO 8601
  end: string;         // ISO 8601
  backgroundColor: string;
  borderColor: string;
  extendedProps: {
    status: ReservationStatus;
    spaceId: string;
    customerId: string;
  };
};
```

### 5. レスポンシブ対応

- **モバイル**: `md:` breakpoint で Full Calendar リサイズ（自動）
- **フィルター**: `flex-col sm:flex-row` で モバイル縦積み
- **パディング**: `p-4 sm:p-6` で モバイル調整

### 6. アクセシビリティ

- `<div role="region" aria-label="予約カレンダー">` で main region
- `<h1>` タイトル明記
- ステータスバッジ: `<span aria-label="確認済み">CONFIRMED</span>`
- キーボードナビゲーション: Full Calendar built-in

---

## 依存関係

| パッケージ      | Ver    | インストール必要  |
| --------------- | ------ | --------------- |
| @fullcalendar/react | v6   | ✅ 必要          |
| @fullcalendar/daygrid | v6  | ✅ 必要          |
| @fullcalendar/timegrid | v6 | ✅ 必要          |
| @fullcalendar/interaction | v6 | ✅ 必要 (or web) |
| date-fns        | 既存   | 既に導入          |

**インストールコマンド**:
```bash
bun add @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/interaction
```

---

## 検証チェックリスト

### ビルド・検証
- [ ] `bun run validate` (type-check, lint)
- [ ] `bun run build` (Next.js ビルド成功)
- [ ] `bun run test` (全テスト成功)

### 機能確認
- [ ] カレンダー月ビュー表示
- [ ] カレンダー週ビュー表示
- [ ] カレンダー日ビュー表示
- [ ] スペースフィルター動作
- [ ] ステータスフィルター動作
- [ ] 日付範囲フィルター動作
- [ ] イベントクリック → モーダル表示
- [ ] モーダル「詳細編集」→ `/admin/reservations/[id]`
- [ ] モーダル「キャンセル」→ キャッシュ無効化 ＆ UI 更新
- [ ] 権限なしユーザー → empty state

### キャッシュ検証
- [ ] Network タブで `Cache-Control: max-age=60` (分単位)
- [ ] 予約変更後 → `updateTag` トリガー ＆ 即座に UI 反映
- [ ] S3/CDN キャッシュと混同しない（App Router `cacheLife` のスコープ）

### 権限検証
- [ ] SUPER_ADMIN → 表示 OK
- [ ] ADMIN → 表示 OK
- [ ] VIEWER → 表示 OK
- [ ] EDITOR → empty state （権限不足）
- [ ] USER / CUSTOMER → リダイレクト（管理画面アクセス不可）

---

## 成功基準

1. ✅ `/admin/calendar` が全ビューモード（月/週/日）で動作
2. ✅ 予約データが正しく表示され、フィルター機能が有効
3. ✅ ステータス別に色分け表示
4. ✅ 詳細モーダルでステータス変更 → キャッシュ即座無効化
5. ✅ 権限チェック動作確認
6. ✅ `bun run validate && bun run build` 成功
7. ✅ 全テスト（unit, integration, E2E）成功

---

## スケジュール見積もり

| フェーズ | タスク数 | 推定期間 |
| -------- | ------ | ------- |
| A        | 5      | 1 day   |
| B        | 4      | 1 day   |
| C        | 3      | 0.5 day |
| D        | 2      | 0.25 day |
| E        | 3      | 0.75 day |
| **合計** | **17** | **3.5 days** |

---

## 注記

- **Phase 1 後の調査項目**: Full Calendar のライセンス（Community = MIT, Pro = 商用ライセンス）→ 現在 Community で十分か確認
- **UI/UX 検討**: デザイン team と色・レイアウト検証（未定）
- **パフォーマンス**: 大規模予約テーブル（10K+ レコード）でのキャッシュ効率化は Phase 2 検討
