# 予約ページ日時選択 UI 完全刷新 — 設計スペック

## 概要

公開ページの予約フォーム（`/reservation`）を破壊的変更でゼロベース再設計。

- 3ステップウィザード → **2ステップ**（確認専用画面を廃止）
- ネイティブ `<input type="date">` → **react-day-picker v9 ビジュアルカレンダー**
- `<select>` ドロップダウン × 2 → **タイムスロットグリッド + Duration pill**
- ハードコード 9:00-22:00 → **DB 営業時間 + リアルタイム空き状況**
- 基本的なレスポンシブ → **アダプティブレイアウト（2カラム / スタック + Sticky CTA）**

## 技術選定

| 技術                   | 理由                                                                |
| ---------------------- | ------------------------------------------------------------------- |
| react-day-picker v9    | date-fns v4 共有、~15KB gzip、WCAG 2.1 AA、Tailwind classNames 対応 |
| カスタム TimeSlotGrid  | 空き可視化 + 範囲制約はライブラリで解決不可                         |
| カスタム DurationPills | 動的 max duration。シンプルな pill 行                               |
| カスタム GuestStepper  | `<input type="number">` よりタッチフレンドリー                      |

## Step 1: 日時選択 — アダプティブレイアウト

### デスクトップ (≥768px): 2カラム

```
┌──────────────────────────────────────────────────────────────┐
│ スペース選択（カード 3列グリッド）                            │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐                │
│ │ Room A     │ │ ● Room B   │ │ Room C     │                │
│ │ ¥3,000/h   │ │ ¥5,000/h   │ │ ¥8,000/h   │                │
│ └────────────┘ └────────────┘ └────────────┘                │
│                                                              │
│ ┌─── カレンダー ─────────────┬─── 時間・人数 ─────────────┐ │
│ │   ◀  2026年3月  ▶         │ 開始時間                    │ │
│ │   月  火  水  木  金 土 日 │ ┌────┬────┬────┬────┐       │ │
│ │   ...  [23] ...            │ │9:00│9:30│10: │10: │       │ │
│ │                            │ │... │... │... │... │       │ │
│ │   ● 選択  ○ 空き  ─ 休業 │ └────┴────┴────┴────┘       │ │
│ │                            │                            │ │
│ │                            │ 利用時間                    │ │
│ │                            │ (30分)(1h)[1.5h](2h)(3h)   │ │
│ │                            │                            │ │
│ │                            │ 利用人数  [- 3 +]          │ │
│ │                            │                            │ │
│ │                            │ ┌────────────────────────┐ │ │
│ │                            │ │ 3/23 11:00-12:30 2h   │ │ │
│ │                            │ │ Room B ¥7,500          │ │ │
│ │                            │ └────────────────────────┘ │ │
│ │                            │   [お客様情報の入力へ →]    │ │
│ └────────────────────────────┴────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### モバイル (<768px): スタック + Sticky Bottom Bar

```
┌────────────────────────────┐
│ ● Room B  ¥5,000/h        │ ← 横スクロール snap カード
│                            │
│ ┌── カレンダー ──────────┐ │
│ │   ◀  3月  ▶            │ │
│ │  月 火 水 木 金 土 日   │ │ ← min-h-11 (44px) セル
│ │  ...  [23]  ...        │ │
│ └────────────────────────┘ │
│                            │
│ 開始時間                    │ ← 日付選択後に出現 + scrollIntoView
│ ┌────┬────┬────┐           │
│ │9:00│9:30│10: │           │ ← 3列グリッド
│ │... │... │... │           │
│ └────┴────┴────┘           │
│                            │
│ 利用時間                    │ ← 横スクロール pill
│ (30分)(1h)(1.5h)(2h)(3h)   │
│                            │
│ 利用人数  [- 3 +]          │
│                            │
│ ┏━━━━━━━━━━━━━━━━━━━━━━━┓ │
│ ┃ ¥7,500  [情報入力へ→] ┃ │ ← fixed bottom-0
│ ┗━━━━━━━━━━━━━━━━━━━━━━━┛ │    safe-area-inset 対応
└────────────────────────────┘
```

## Step 2: 顧客情報 + 確認 + 送信（統合）

```
┌──────────────────────────────┐
│ ┌─ 予約内容 ──────────────┐  │ ← 常時表示のサマリーカード
│ │ Room B  3/23 11:00-12:30│  │
│ │ 3名  ¥7,500  [変更する] │  │
│ └─────────────────────────┘  │
│                              │
│ 姓 [    ]  名 [    ]        │ ← md:grid-cols-2
│ メール [              ]     │
│ 電話(任意) [          ]     │
│ 備考(任意) [          ]     │
│                              │
│ □ 利用規約に同意します       │
│                              │
│ [予約を確定する]             │ ← モバイルは sticky bottom
└──────────────────────────────┘
```

## レスポンシブ詳細

| 要素               | Mobile (<768px)                       | Desktop (≥768px)         |
| ------------------ | ------------------------------------- | ------------------------ |
| Container          | `default` + padding                   | `default` + `max-w-4xl`  |
| Step 1 レイアウト  | `flex-col` スタック                   | `grid grid-cols-2 gap-8` |
| スペース選択       | `overflow-x-auto snap-x` 横スクロール | `grid grid-cols-3 gap-3` |
| カレンダーセル     | `min-h-11` (44px) touch target        | `min-h-10` (40px)        |
| タイムグリッド列数 | `grid-cols-3`                         | `grid-cols-4`            |
| Duration pills     | `overflow-x-auto flex-nowrap`         | `flex flex-wrap gap-2`   |
| 料金 + CTA         | `fixed bottom-0` Sticky bar           | 右パネル内インライン     |
| Step 2 姓名        | `grid-cols-1`                         | `grid-cols-2`            |
| Step 2 送信        | `fixed bottom-0`                      | インライン               |

## Sticky Bottom Bar（モバイル専用）

- `fixed inset-x-0 bottom-0 z-40`
- `pb-[env(safe-area-inset-bottom)]` — iPhone ホームバー対応
- `bg-background/95 backdrop-blur-sm border-t border-border`
- Step 1: 概算料金 + CTA ボタン
- Step 2: 送信ボタン（フル幅）
- メインコンテンツに `pb-20 md:pb-0` で sticky bar 分の余白

## プログレッシブ出現（モバイル）

```
スペース選択 → カレンダー出現
  → 日付タップ → 時間グリッド出現 (scrollIntoView)
    → 開始タップ → Duration pills 出現
      → Duration 選択 → 人数 + Sticky bar 出現
```

デスクトップ: 右パネルに全要素を最初から表示。未選択部分は disabled/muted。

## スペース選択 UI

- 現行 `<select>` → カード選択
- 選択中: `border-accent ring-2 ring-accent/20`
- スペース1つ: カード1枚（選択不要、自動選択）
- スペース2-3: 並列表示
- スペース4+: モバイルは横スクロール + `scroll-snap-type: x mandatory`

## 人数ステッパー

```
[−] 3 [+]
```

- 各ボタン `min-h-11 min-w-11` (touch target)
- `aria-label="利用人数を減らす"` / `"増やす"`
- min=1, max=選択スペースの capacity
- capacity 到達で `+` を `disabled`

## バックエンド変更

### time-slots.ts: 30分刻み対応

現行: `for (let hour = start.hour; hour < end.hour; hour++)`（1時間刻み固定）

変更: 引数 `intervalMinutes = 30` で30分刻み。各スロットの `time` は `"HH:MM"` 形式を維持。

### 新規 Server Action: fetchAvailableSlots

`(public)/_shared/actions/availability.ts` に追加。既存 `getAvailableTimeSlots()` をラップ。

### 営業時間の初期データ

`page.tsx` で `getBusinessHoursSettingsQuery()` を呼び、休業日情報をカレンダーに渡す。

## Zod スキーマ

`publicReservationSchema` は変更なし。フロント内部で `startTime + duration → endTime` に変換し、既存スキーマの `startTime` + `endTime` フィールドに set する。

## ファイル構成

### 新規作成

- `reservation/_components/space-selector.tsx`
- `reservation/_components/calendar-picker.tsx`
- `reservation/_components/time-slot-grid.tsx`
- `reservation/_components/duration-pills.tsx`
- `reservation/_components/guest-stepper.tsx`
- `reservation/_components/booking-summary.tsx`
- `reservation/_components/sticky-bottom-bar.tsx`
- `(public)/_shared/actions/availability.ts`

### 全面書換

- `reservation/_components/reservation-form.tsx`
- `reservation/_components/customer-step.tsx` — サマリーカード統合
- `reservation/page.tsx` — Container variant 変更、営業時間データ取得

### 削除

- `reservation/_components/date-time-step.tsx`
- `reservation/_components/confirmation-step.tsx`

### 変更

- `shared/lib/reservation/time-slots.ts` — 30分刻み対応
- `_shared/components/ui/step-indicator.tsx` — 2ステップ対応（STEPS 定数変更）

### 変更なし

- `shared/lib/validations/public-reservation.ts`
- `(public)/_shared/actions/reservation.ts`
- `shared/lib/reservation/types.ts`
- `shared/lib/pricing/reservation.ts`
