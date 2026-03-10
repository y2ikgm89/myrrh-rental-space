# 045: 管理者用予約作成機能

## 概要

電話予約など、管理者が手動で予約を入力する必要がある場合に対応する機能。
予約一覧ページに「新規予約」ボタンを追加し、管理者が顧客情報・スペース・日時を選択して予約を作成できるようにする。

## 背景

- 現在の管理画面には予約の閲覧・ステータス変更・削除機能しかない
- 公開サイトからの予約のみ対応しており、電話・対面予約に対応できない
- 顧客管理機能はあるが、予約作成と連携していない

## 機能要件

### 必須機能

1. **新規予約ボタン**: 予約一覧ページのヘッダーに追加
2. **スペース選択**: 公開中のスペースからドロップダウンで選択
3. **日時選択**: カレンダー + 時間枠選択（空き状況表示付き）
4. **顧客情報入力**:
   - 既存顧客から検索・選択
   - または新規顧客として入力（姓・名・メール・電話番号）
5. **料金自動計算**: スペースの時間単価 × 利用時間
6. **オプション設定**: 備品選択など（スペースに設定がある場合）
7. **メール通知**: 予約確認メールを顧客に送信（ON/OFF切り替え可）

### フル機能（今回実装）

1. **顧客検索・選択**: 既存顧客からの検索（名前・メール・電話番号）
2. **新規顧客作成**: 予約と同時に顧客レコードも作成
3. **料金手動調整**: 自動計算後に手動で調整可能（割引・追加料金）
4. **予約ステータス選択**: PENDING / CONFIRMED 選択可能（電話予約は即CONFIRMED想定）
5. **メモ入力**: 管理者メモ（「電話予約」「紹介」など）
6. **メール送信設定**: 確認メールを送信するかどうかを選択
7. **カレンダー同期**: Google Calendar / iCal 同期

## 技術設計

### 新規ファイル

```
src/admin/actions/reservation.ts
  └── createAdminReservation()  // 追加

src/admin/lib/validations/admin-reservation.ts  // 新規
  └── adminReservationSchema

src/app/(admin)/admin/(dashboard)/reservations/new/page.tsx  // 新規
  └── 予約作成ページ

src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationForm.tsx  // 新規
  └── 予約作成フォーム

src/app/(admin)/admin/(dashboard)/reservations/_components/CustomerSelector.tsx  // 新規
  └── 顧客検索・選択コンポーネント

src/app/(admin)/admin/(dashboard)/reservations/_components/TimeSlotSelector.tsx  // 新規
  └── 空き時間選択コンポーネント
```

### 変更ファイル

```
src/app/(admin)/admin/(dashboard)/reservations/page.tsx
  └── 「新規予約」ボタン追加

src/admin/actions/customer.ts
  └── searchCustomers() 追加（予約フォームでの検索用）
```

### データフロー

```
ReservationForm
  ├── SpaceSelector → getSpacesForSelection()
  ├── CustomerSelector → searchCustomers() / createQuickCustomer()
  ├── TimeSlotSelector → getAvailableTimeSlots()
  └── Submit → createAdminReservation()
        ├── Validation
        ├── Overlap Check
        ├── Customer Create/Update
        ├── Reservation Create
        ├── Email Send (optional)
        └── Calendar Sync
```

### バリデーションスキーマ

```typescript
const adminReservationSchema = z.object({
  spaceId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),

  // 顧客情報（既存 or 新規）
  customerId: z.string().uuid().optional(),
  customerData: z
    .object({
      lastName: z.string().min(1),
      firstName: z.string().min(1),
      email: z.string().email(),
      phoneNumber: z.string().optional(),
    })
    .optional(),

  // オプション
  totalPrice: z.number().positive().optional(), // 手動調整時
  status: z.enum(["PENDING", "CONFIRMED"]).default("CONFIRMED"),
  notes: z.string().optional(),
  sendEmail: z.boolean().default(true),
});
```

## 実装フェーズ

### Phase 1: 基盤 `cc:TODO`

- [ ] `src/admin/lib/validations/admin-reservation.ts` 作成
- [ ] `createAdminReservation` Server Action 追加
- [ ] 予約一覧ページに「新規予約」ボタン追加

### Phase 2: フォームUI `cc:DONE`

- [x] `/reservations/new/page.tsx` 作成
- [x] `ReservationForm.tsx` 作成
  - スペース選択
  - 日付・時間選択（9:00-21:00、1時間刻み）
  - 料金自動計算+手動調整
  - ステータス選択（CONFIRMED/PENDING）
  - メモ入力
  - メール送信トグル
  - CustomerSelector（Placeholder - Phase 3で完成）

### Phase 3: 顧客選択 `cc:TODO`

- [ ] `CustomerSelector.tsx` 作成
  - 検索フィールド（名前・メール・電話）
  - 検索結果リスト
  - 新規顧客入力フォーム切り替え
- [ ] `searchCustomers()` Server Action 追加

### Phase 4: 空き時間選択 `cc:TODO`

- [ ] `TimeSlotSelector.tsx` 作成
  - 日付選択カレンダー
  - 時間枠グリッド（空き/予約済み表示）
  - 公開サイトの既存ロジック活用

### Phase 5: 検証 `cc:TODO`

- [ ] type-check / lint / build
- [ ] 動作確認
- [ ] Plans.md 更新

## UI/UX設計

### 予約一覧ページ

```
+------------------------------------------+
| 予約管理                [新規予約] [カレンダー表示] |
| 予約の確認・ステータス変更・...             |
+------------------------------------------+
```

### 予約作成フォーム（2カラムレイアウト）

```
+------------------------+------------------------+
| スペース選択            | 顧客情報               |
| [ドロップダウン ▼]      | ○ 既存顧客を検索        |
|                        |   [検索入力]            |
| 日時選択                |   [検索結果リスト]       |
| [カレンダー]            | ○ 新規顧客として入力     |
| [開始時間 ▼][終了時間 ▼] |   姓 [___] 名 [___]    |
|                        |   メール [___]          |
| 料金                    |   電話番号 [___]        |
| ¥15,000（3時間 × ¥5,000）|                        |
| [手動で調整]            |                        |
|                        |                        |
| ステータス              | メモ                    |
| ○ 確定 ● 保留          | [テキストエリア]         |
|                        |                        |
| □ 確認メールを送信する   |                        |
+------------------------+------------------------+
                     [キャンセル] [予約を作成]
```

## 権限

- `reservations` リソースの `create` 権限が必要
- SUPER_ADMIN, ADMIN, EDITOR が実行可能（現行の権限設定を継承）

## 考慮事項

### 公開サイトとの違い

| 項目       | 公開サイト     | 管理画面                 |
| ---------- | -------------- | ------------------------ |
| Turnstile  | 必須           | 不要（認証済み）         |
| 規約同意   | 必須（設定時） | 不要（電話確認済み想定） |
| ステータス | PENDING固定    | 選択可能                 |
| 料金       | 自動計算のみ   | 手動調整可               |
| 顧客       | 新規入力       | 検索+新規                |

### 既存ロジックの活用

- `checkReservationOverlap()` - 予約重複チェック
- `getAvailableTimeSlots()` - 空き時間取得
- `sendReservationConfirmationEmail()` - メール送信
- `syncReservationToCalendar()` - カレンダー同期

## 関連計画

- 031-terms-agreement-management.md（規約管理）
- 014-reservation-calendar.md（カレンダービュー）
- 013-google-calendar-integration.md（カレンダー連携）
