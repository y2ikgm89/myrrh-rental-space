# 予約ステータス拡張設計仕様

> ReservationStatus に COMPLETED / NO_SHOW を追加し、ステータス遷移ルールを導入する

## 背景

現在の `ReservationStatus` は PENDING / CONFIRMED / CANCELLED の3値。利用終了後の予約と未来の確定予約が区別できず、売上統計の正確性や顧客管理（ノーショー追跡）に問題がある。

## 設計方針

- **破壊的変更OK** — 後方互換性ハックなし、クリーンな実装
- **ステータス遷移ルールの導入** — 不正な遷移をドメイン層で拒否
- **統計クエリの正確化** — COMPLETED を売上確定の根拠にする
- **既存バグの修正** — raw SQL のハードコード文字列を enum 定数に統一

## 5ステータスモデル

```prisma
enum ReservationStatus {
  PENDING
  CONFIRMED
  COMPLETED
  CANCELLED
  NO_SHOW
}
```

| ステータス | 日本語         | Badge variant    | 意味                         |
| ---------- | -------------- | ---------------- | ---------------------------- |
| PENDING    | 保留中         | pending (黄)     | 予約受付直後、管理者承認待ち |
| CONFIRMED  | 確認済み       | success (緑)     | 管理者が承認、利用前         |
| COMPLETED  | 完了           | default (グレー) | 利用が実際に行われた         |
| CANCELLED  | キャンセル     | destructive (赤) | 事前キャンセル（連絡あり）   |
| NO_SHOW    | 無断キャンセル | warning (橙)     | 連絡なしで来場しなかった     |

## ステータス遷移ルール

```
PENDING ──→ CONFIRMED ──→ COMPLETED
  │              │
  │              ├──→ NO_SHOW
  │              │
  ↓              ↓
CANCELLED    CANCELLED
```

| From      | To        | 許可 | 備考             |
| --------- | --------- | ---- | ---------------- |
| PENDING   | CONFIRMED | Yes  | 管理者承認       |
| PENDING   | CANCELLED | Yes  | 承認前キャンセル |
| CONFIRMED | COMPLETED | Yes  | 利用完了         |
| CONFIRMED | NO_SHOW   | Yes  | 無断キャンセル   |
| CONFIRMED | CANCELLED | Yes  | 利用前キャンセル |
| COMPLETED | \*        | No   | 終端状態         |
| NO_SHOW   | \*        | No   | 終端状態         |
| CANCELLED | \*        | No   | 終端状態         |

遷移バリデーションは `commands.ts` のドメイン層に `validateStatusTransition()` として実装。不正な遷移は `DomainError("VALIDATION")` で拒否。

## 変更対象ファイル

### 1. Prisma スキーマ + マイグレーション

**`prisma/schema.prisma`**:

```prisma
enum ReservationStatus {
  PENDING
  CONFIRMED
  COMPLETED
  CANCELLED
  NO_SHOW
}
```

マイグレーション: `ALTER TYPE "ReservationStatus" ADD VALUE 'COMPLETED'; ALTER TYPE "ReservationStatus" ADD VALUE 'NO_SHOW';`

### 2. ドメイン層

**`src/shared/domain/reservations/commands.ts`**:

- `validateStatusTransition(from, to): void` — 遷移ルールマップを定義、不正遷移で DomainError
- `updateReservationStatusCommand` — 遷移バリデーション追加
- `updateAdminReservationCommand` — status フィールドにも遷移バリデーション追加（現在はノーチェック）
- `createAdminReservationCommand` — 終端ステータス（COMPLETED, CANCELLED, NO_SHOW）での作成を拒否

**`src/shared/lib/validations/enums/helpers.ts`**:

- `ACTIVE_RESERVATION_STATUSES` — 変更なし（PENDING, CONFIRMED のまま）
- `TERMINAL_RESERVATION_STATUSES` — 新規追加: `[COMPLETED, CANCELLED, NO_SHOW]`
- `CREATABLE_RESERVATION_STATUSES` — 新規追加: `[PENDING, CONFIRMED]`（作成時に許可するステータス）

**`src/shared/lib/validations/enums/guards.ts`**:

- `isValidReservationStatus` — Prisma 生成の enum から自動的に対応（変更不要の見込み）

**`src/app/(admin)/admin/(dashboard)/_shared/lib/validations/admin-reservation.ts`**:

- 作成スキーマ: `z.enum()` に加え、終端ステータスを `.refine()` で拒否

### 3. Server Actions 副作用

**`src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/mutations.ts`**:

- COMPLETED 遷移時: カレンダー変更なし、メール送信なし（過去の予定を保持）
- NO_SHOW 遷移時: カレンダー変更なし、メール送信なし（過去の予定を保持）
- CANCELLED 遷移時: 既存ロジック維持（カレンダー削除 + キャンセルメール）

### 4. UI コンポーネント

**`src/app/(admin)/admin/(dashboard)/_shared/components/status-badges.tsx`**:

```typescript
const reservationStatusConfig: StatusConfig<ReservationStatus> = {
  PENDING: { label: "保留中", variant: "pending" },
  CONFIRMED: { label: "確認済み", variant: "success" },
  COMPLETED: { label: "完了", variant: "default" },
  CANCELLED: { label: "キャンセル", variant: "destructive" },
  NO_SHOW: { label: "無断キャンセル", variant: "warning" },
};
```

**`src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationStatusSelect.tsx`**:

- 遷移ルールに基づき、現在のステータスから遷移可能な選択肢のみ表示
- 終端ステータス（COMPLETED, CANCELLED, NO_SHOW）の場合はセレクト無効化

**`src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationFilters.tsx`**:

- `STATUS_OPTIONS` に COMPLETED / NO_SHOW を追加

**`src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationEditForm.tsx`**:

- `RESERVATION_STATUS_OPTIONS` を遷移ルールに基づく動的リストに変更

**`src/app/(admin)/admin/(dashboard)/reservations/_components/calendar/EventDetailDialog.tsx`**:

- カレンダービューのステータス変更セレクトを遷移ルール対応に

**`src/app/(admin)/admin/(dashboard)/_shared/lib/calendar/calendar-domain.ts`**:

- `getStatusColorClass()` に COMPLETED / NO_SHOW のカラーマッピング追加

### 5. ダッシュボード統計

**`src/shared/domain/dashboard/queries.ts`**:

| 集計        | 現在                                      | 変更後                               |
| ----------- | ----------------------------------------- | ------------------------------------ |
| 予約数      | `status != CANCELLED`                     | `status NOT IN (CANCELLED, NO_SHOW)` |
| 売上        | `status = CONFIRMED`                      | `status IN (CONFIRMED, COMPLETED)`   |
| 当日予約    | `status != CANCELLED`                     | `status NOT IN (CANCELLED, NO_SHOW)` |
| チャートSQL | ハードコード `'CANCELLED'`, `'CONFIRMED'` | enum 定数使用 + COMPLETED 追加       |

### 6. 時間枠・重複チェック

**`src/shared/domain/reservations/availability.ts`**:

- `getReservationsForDateQuery` — `ACTIVE_RESERVATION_STATUSES` 使用済み（変更不要）
- `checkReservationOverlapQuery` — `ACTIVE_RESERVATION_STATUSES` 使用済み（変更不要）

COMPLETED / NO_SHOW / CANCELLED は `ACTIVE_RESERVATION_STATUSES` に含まれないため、自動的に時間枠から除外される。

### 7. カレンダー同期

**`src/shared/domain/reservations/calendar-sync.ts`**:

- `ACTIVE_RESERVATION_STATUSES` 参照箇所 — 変更不要
- `cancelReservationFromCalendar` — CANCELLED への遷移のまま維持
- インバウンド同期（`applyCalendarTimeChange`）— `ACTIVE_RESERVATION_STATUSES` で終端ステータスは自動除外（変更不要）

**カレンダー副作用の詳細**:

| 遷移先    | カレンダー動作                  | 理由                                               |
| --------- | ------------------------------- | -------------------------------------------------- |
| COMPLETED | 変更なし                        | 過去の予定なので更新不要。カレンダー履歴を保持     |
| NO_SHOW   | 変更なし                        | 過去の予定。カレンダーから削除すると履歴が失われる |
| CANCELLED | イベント削除 + キャンセルメール | 既存ロジック維持                                   |

### 8. 管理画面フォーム

**`src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationForm.tsx`**:

- 新規作成時のステータス選択: PENDING / CONFIRMED のみ（終端ステータスで作成不可に制限）
- 編集時のステータス選択: 遷移ルールに基づく

**`src/app/(admin)/admin/(dashboard)/reservations/_components/reservation-form-helpers.ts`**:

- `RESERVATION_STATUS_OPTIONS` — 変更なし（作成用: CONFIRMED, PENDING のまま。意図的）

### 9. 管理画面予約一覧

**`src/shared/domain/reservations/admin-queries.ts`**:

- フィルタードロップダウンに COMPLETED / NO_SHOW を追加
- `getReservationStatsQuery()` — COMPLETED / NO_SHOW のカウントを追加
- 既存の `status` フィルターは enum ベースなので自動対応

### 10. Seed データ

**`prisma/seed.ts`**:

- 予約ステータス型に COMPLETED / NO_SHOW を追加
- テスト用に COMPLETED / NO_SHOW の予約サンプルデータを追加

## テスト

- `validateStatusTransition` の全遷移パターン（許可/拒否）
- 終端ステータスでの作成拒否
- ダッシュボード統計で COMPLETED が売上に含まれることを確認
- 時間枠で CANCELLED / NO_SHOW / COMPLETED が除外されることを確認
- 既存テストの COMPLETED / NO_SHOW フィクスチャ追加

## 既存バグ修正（同時対応）

1. **チャート raw SQL のハードコード文字列** — `'CANCELLED'`, `'CONFIRMED'` を Prisma enum 参照に変更
2. **管理者が CANCELLED で新規作成可能** — 終端ステータスでの作成を禁止

## 対象外

- 自動 COMPLETED 遷移（cron ジョブ） — 将来検討。今回は手動遷移のみ
- NO_SHOW 顧客ブラックリスト連動 — 将来検討
- キャンセル料計算 — スコープ外
