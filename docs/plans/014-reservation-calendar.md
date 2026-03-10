# 014: 予約管理カレンダービュー

## 概要

予約管理画面にカレンダービュー機能を追加。既存のリスト表示に加えて、月/週/日のカレンダー形式で視覚的に予約を確認・管理できる機能を実装。

## 技術選定

- **カスタム実装**（外部ライブラリ不使用）
  - 理由: ライブラリ破壊的変更時の影響を最小化
  - date-fns（既存）を日付操作に使用
- **Clean Architecture**
  - Domain Layer: 純粋な日付計算・イベント配置ロジック
  - UI Layer: React コンポーネント
  - ロジックの再利用性・テスタビリティ向上

## 実装内容

### 機能

1. **3つのビュー切り替え**: 月表示 / 週表示 / 日表示
2. **ステータス変更**: カレンダー上でクリック → ダイアログ → ステータス変更
3. **スペース表示モード**:
   - 統一表示（色分け）
   - スペース別フィルター
   - スペース別分割（週/日ビュー）
4. **ステータスフィルター**: 全て / 確定のみ / 保留のみ / キャンセル含む
5. **URL状態管理**: view/date/space/status を searchParams で管理

### アーキテクチャ

```
src/lib/calendar/
├── calendar-types.ts       # 型定義（CalendarView, CalendarEvent, etc.）
├── calendar-domain.ts      # 純粋ロジック（日付範囲計算、イベント配置）
└── index.ts                # re-export

src/app/(admin)/admin/reservations/_components/calendar/
├── hooks/
│   ├── use-calendar-state.ts   # URL状態管理 + ナビゲーション
│   ├── use-event-actions.ts    # イベントクリック・ステータス変更
│   └── index.ts
├── views/
│   ├── MonthView.tsx           # 月表示
│   ├── WeekView.tsx            # 週表示
│   ├── DayView.tsx             # 日表示
│   ├── TimeColumn.tsx          # 時間軸共通コンポーネント
│   └── index.ts
├── CalendarToolbar.tsx         # ナビゲーション・フィルター
├── EventCell.tsx               # イベントバッジ
├── EventDetailDialog.tsx       # 詳細ダイアログ
├── CalendarViewWrapper.tsx     # メインラッパー
└── index.ts

src/app/(admin)/admin/reservations/calendar/
└── page.tsx                    # カレンダーページ
```

## 新規ファイル

- `src/lib/calendar/calendar-types.ts` - 型定義
- `src/lib/calendar/calendar-domain.ts` - ドメインロジック
- `src/lib/calendar/index.ts` - re-export
- `src/app/(admin)/admin/reservations/_components/calendar/` - カレンダーコンポーネント一式（14ファイル）
- `src/app/(admin)/admin/reservations/calendar/page.tsx` - カレンダーページ

## 変更ファイル

- `src/actions/admin/reservation.ts` - `getReservationsForCalendar()`, `getSpacesForCalendar()` 追加
- `src/app/(admin)/admin/reservations/page.tsx` - カレンダー表示リンクボタン追加

## ドメインロジック詳細

### 日付範囲計算

- `getCalendarDateRange()`: ビューに応じた表示期間を計算
  - 月: 当月 + 前後月の補完日
  - 週: 日曜始まりの7日間
  - 日: 当日のみ

### イベント配置アルゴリズム

- `layoutOverlappingEvents()`: 重複イベントの列配置を計算
  - 同時間帯のイベントを横並びに配置
  - 各イベントの幅・左位置を自動計算

### 時間スロット生成

- `generateTimeSlots()`: 営業時間内の30分刻みスロット生成
- デフォルト: 9:00〜21:00

## ステータス別カラーコード

| ステータス | 背景色 | ボーダー色 |
| ---------- | ------ | ---------- |
| PENDING    | 黄色   | 黄色       |
| CONFIRMED  | 緑     | 緑         |
| CANCELLED  | 赤     | 赤         |

## 技術詳細

### 日付重複クエリ

```typescript
// 期間と重複する予約を取得
const where = {
  AND: [{ startTime: { lt: endDate } }, { endTime: { gt: startDate } }],
};
```

### Race Condition 対策

```typescript
const handleStatusChange = useCallback(
  async (eventId: string, newStatus: ReservationStatus) => {
    if (isPending) return  // 重複実行防止
    startTransition(async () => { ... })
  },
  [router, isPending]
)
```

### 月変更時の状態リセット

```typescript
// monthKey で展開状態を月ごとに分離
const monthKey = useMemo(
  () => format(dateRange.start, "yyyy-MM"),
  [dateRange.start],
);
const isExpanded = (dayId: string) => expandedDay === `${monthKey}-${dayId}`;
```

## 注意事項

- マイグレーション不要（スキーマ変更なし）
- 既存のリスト表示には影響なし（カレンダーは独立ページ）
