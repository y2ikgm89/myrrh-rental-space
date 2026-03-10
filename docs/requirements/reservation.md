# 予約機能要件

## 概要

レンタルスペースの予約管理機能。ユーザーからの予約受付から管理者の承認、Google Calendar連携まで。

## 機能要件

### 1. 予約フロー

1. **スペース選択**: 公開中のスペースから選択
2. **日時選択**: カレンダーUIで日時を選択
3. **情報入力**: 利用者情報・目的入力
4. **規約同意**: 利用規約・プライバシーポリシー
5. **確認・送信**: 内容確認後に予約送信
6. **完了**: 確認メール送信

### 2. 予約ステータス

| ステータス | 説明                 |
| ---------- | -------------------- |
| PENDING    | 新規予約（承認待ち） |
| CONFIRMED  | 承認済み             |
| CANCELLED  | キャンセル済み       |

### 3. 管理機能

- 予約一覧表示（フィルタ・検索）
- ステータス変更
- 予約詳細表示
- 予約削除

### 4. Google Calendar連携

- **サービスアカウント連携**: 共有カレンダーへの自動登録
- **OAuth連携**: 管理者個人カレンダー（オプション）
- **iCalフィード**: 外部カレンダーアプリ購読用
- **双方向同期**: カレンダー変更の予約システム反映

詳細は [plans/013-google-calendar.md](../plans/013-google-calendar.md) 参照。

## 非機能要件

### セキュリティ

- Turnstile bot保護
- レート制限（5リクエスト/分）
- 入力値バリデーション（Zod）

### 通知

- 予約者への確認メール（iCal添付オプション）
- 管理者への通知メール

## データモデル

```prisma
model Reservation {
  id              String            @id @default(uuid())
  spaceId         String
  space           Space             @relation(...)
  customerName    String
  customerEmail   String
  customerPhone   String?
  startTime       DateTime
  endTime         DateTime
  purpose         String?
  status          ReservationStatus @default(PENDING)
  termsAgreedAt   DateTime?
  googleEventId   String?
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
}

enum ReservationStatus {
  PENDING
  CONFIRMED
  CANCELLED
}
```

## 実装状況

- [x] 予約フォーム
- [x] 管理画面CRUD
- [x] メール通知
- [x] 規約同意
- [x] Google Calendar連携（Phase 1-4）
- [x] iCalフィード
- [x] 双方向同期
