# 予約全項目編集機能 設計書

**日付**: 2026-02-18
**ステータス**: 承認済み

## 概要

管理画面の予約詳細ページに「全項目編集」機能を追加する。現状はステータス変更・メモ編集のみ可能だが、スペース・日時・顧客・料金・クーポンを含む全フィールドを編集できるようにする。

## 設計方針

- **別ページ** `/admin/reservations/[id]/edit` に編集フォームを配置（`/new` パターンと統一）
- **破壊的変更 OK**: 後方互換性ハックなし、クリーンな実装
- **顧客変更は既存顧客への切り替えのみ**（新規作成は顧客管理ページで行う）

## 編集可能フィールド

| フィールド | 処理 |
|-----------|------|
| スペース | 変更時に重複チェック（自分を除く）+ Googleカレンダー更新 |
| 日付・開始/終了時間 | 同上 |
| 顧客 | 既存顧客から選択のみ |
| クーポンコード | 変更時: 旧クーポン使用回数デクリメント、新クーポン検証・インクリメント |
| 手動料金上書き | 空にすれば自動計算に戻る |
| ステータス | PENDING / CONFIRMED / CANCELLED |
| メモ | textarea |
| 変更通知メール | チェックボックス（デフォルト off） |

## アーキテクチャ

### 新規・変更ファイル

```
src/app/(admin)/admin/(dashboard)/reservations/
├── [id]/
│   ├── edit/
│   │   └── page.tsx                   ← 新規：編集ページ（SC）
│   └── _components/
│       ├── ReservationDetail.tsx       ← 変更：「編集」ボタン追加のみ
│       └── ReservationEditForm.tsx     ← 新規：編集フォームCC

src/app/(admin)/admin/(dashboard)/_shared/
├── actions/
│   └── reservation.ts                  ← 変更：updateAdminReservation 追加
└── lib/validations/
    └── admin-reservation.ts            ← 変更：updateReservationSchema 追加
```

### Server Action: `updateAdminReservation`

```
withPermission('reservation', 'update')(async (user, id, input) => {
  1. updateReservationSchema でバリデーション
  2. 現在の予約データ取得（couponId 含む）
  3. 存在チェック
  4. 重複チェック（excludeReservationId: id）
  5. スペース取得（料金計算用）
  6. クーポン変更処理
     - 旧クーポンあり & 変更あり → decrementCouponUsage(旧ID)
     - 新クーポンコードあり → validateCouponCode → incrementCouponUsage(新ID)
  7. 料金再計算（手動上書きがあればそれを優先）
  8. prisma.$transaction でアトミックに更新
  9. updateTag(CACHE_TAGS.RESERVATIONS)
  10. Google Calendar 更新（fireAndForget）
  11. 変更通知メール（sendNotificationEmail=true の場合）
})
```

### Zod スキーマ: `updateReservationSchema`

`adminReservationSchema` と同等だが以下が異なる:
- `customerId`: 必須（`z.string().uuid()`）
- `customerData`: 削除（既存顧客のみ）
- `sendNotificationEmail`: 追加（`z.boolean().default(false)`）
- `sendEmail`: 削除（作成時用）

### コンポーネント: `ReservationEditForm`

`ReservationForm` をベースに以下が異なる:
- 初期値が既存予約データで pre-populate される
- `CustomerSelector` は既存顧客選択のみ（`isNewCustomer` トグル削除）
- 送信先 action: `updateAdminReservation(reservationId, data)`
- 送信後: `router.push(`/admin/reservations/${id}`)` へリダイレクト

## データフロー

```
edit/page.tsx (SC)
  ├── getReservationById(id)       → 既存データ取得
  └── getSpacesForReservation()    → スペース一覧
        ↓ props
ReservationEditForm (CC)
  ├── useForm (react-hook-form + zodResolver)
  ├── defaultValues ← 既存予約データから変換
  └── onSubmit → updateAdminReservation(id, data)
        ↓
reservation.ts (Server Action)
  ├── overlap check (excludeReservationId)
  ├── coupon usage adjustment
  ├── price recalculation
  └── prisma.$transaction → update
```

## 重複チェック

`checkReservationOverlap` は既に `excludeReservationId` をサポート済み。
編集時は `excludeReservationId: id` を渡すだけでOK。

## クーポン使用回数の整合性

| 変更前 | 変更後 | 処理 |
|-------|-------|------|
| クーポンなし | クーポンあり | increment のみ |
| クーポンあり | 同じクーポン | なにもしない |
| クーポンあり | 別のクーポン | 旧 decrement + 新 increment |
| クーポンあり | なし | decrement のみ |

`decrementCouponUsage` は既存関数がないため新規追加（`coupon.ts` に追加）。

## 通知メール

既存の `sendReservationConfirmationEmail` を再利用。
変更通知専用テンプレートは不要（「予約確認」メールで代用、チェックボックスで制御）。

## 検証

実装完了後に `bun run validate` で型チェック・lint を実施。
