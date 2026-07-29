# Inquiry Overhaul 完遂設計（スレッド・顧客返信・運用・添付・匿名化）

- 日付: 2026-07-24
- 前提: Phase 1 migration（`20260719020000_inquiry_overhaul_phase1`）適用済み。
  スキーマ上の子テーブルは存在するが、アプリ配線は STAFF テキスト返信・status・
  soft-delete・顧客紐づけ・基本メールまでに留まる。
- 方針: **公式推奨寄りの既存パターン踏襲 + clean-break（dual-read / shim なし）**。
  破壊的 schema 変更は可。納品は **stacked PR**（1 PR = 1 logical change）。

## 1. 背景

Phase 1 で `InquiryReply` / `InquiryAttachment` / `InquiryInternalNote` /
`InquiryTag*` / `assigneeId` / `slaExpiresAt` / `anonymizedAt` を導入したが、
コードコメント上の Phase 4（スレッド UI）・Phase 5（CUSTOMER 返信）・
Phase 6（匿名化）は未実装。専用 design doc はこれまで不在だった。

現状の主な穴:

- admin 詳細は最新 STAFF 返信 1 件のみ表示
- CUSTOMER 返信 command / UI なし（`authorType=CUSTOMER` は enum のみ）
- `InquiryReply.authorId` は User FK のみで、CUSTOMER 作者を型安全に表現できない
- assignee / SLA / notes / tags / attachments / status history UI / anonymize は未配線
- 既存 Media R2 は **公開 CDN**（`R2_PUBLIC_URL`）。問い合わせ添付（PII）には不適

## 2. ゴール

1. 双方向メッセージスレッド（admin + ログイン会員 mypage）
2. 顧客→管理者返信（会員のみ）+ 管理者通知
3. 運用面: 担当 / SLA / 内部メモ / タグ / 一覧フィルタ / status history 表示
4. 添付: 認証付き private 配信（公開 CDN 禁止）
5. Inquiry PII 匿名化（顧客 anonymize と同型）

## 3. 非ゴール

- ゲスト（未ログイン）からの返信・添付
- Media ライブラリ公開 URL を inquiry 添付に流用
- assignee 専用メール（予約・イベントもグローバル宛先のみ → 同型維持）
- SLA 超過の自動 cron エスカレーション（手動 `slaExpiresAt` 表示・フィルタのみ。YAGNI）
- 公開お問い合わせフォームへの添付追加（本設計は既存チケットへの返信添付に限定。
  初回投稿添付が必要なら別 spec）

## 4. 確定ルール（推奨値ロック）

| 項目          | 決定                                                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 納品          | stacked PR。1 design / 複数 plan タスク。soft limit 300 行 / 10 file                                                       |
| 顧客返信可否  | `NEW` / `IN_PROGRESS` / `RESOLVED` / `FLAGGED` 可。`CLOSED` / `SPAM` 不可                                                  |
| 返信時 status | `RESOLVED` / `FLAGGED` → `IN_PROGRESS`（history reason `customer-reply-reopen`）。`NEW` / `IN_PROGRESS` は維持             |
| CUSTOMER 作者 | `InquiryReply.authorCustomerId`（Customer FK, SetNull）を追加。`authorId`(User) と排他                                     |
| ゲスト返信    | 不可。mypage + `verifyCustomerSession` + inquiry の `customerId` 所有チェック                                              |
| in-app 通知   | `NOTIFICATION_TYPE.INQUIRY_CUSTOMER_REPLY = "inquiry_customer_reply"` を新設。トグルなし（`INQUIRY_NEW` と同型）           |
| admin email   | `notifyInquiryCustomerReply`（default `true`）を notification settings に追加。`sendContactAdminNotification` と同型ゲート |
| 添付配信      | **private R2 bucket 新設** + server `GetObject` ストリーム。公開カスタムドメイン禁止                                       |
| 添付 MIME     | magic-byte 必須。許可: JPEG/PNG/WebP/PDF（動画・音声・GIF・SVG 不可）。画像 5MB / PDF 10MB                                 |
| 添付紐付け    | Inquiry 本体または特定 `InquiryReply`（`replyId` nullable 既存）                                                           |
| 匿名化        | `anonymizeInquiryCommand`。placeholder 化 + `anonymizedAt` / `anonymizedReason`。冪等 CONFLICT                             |

## 5. データモデル（破壊的変更）

### 5.1 `InquiryReply` — CUSTOMER 作者の型安全化

```prisma
model InquiryReply {
  // 既存
  authorType InquiryReplyAuthorType
  authorId   String? @db.Uuid          // STAFF → User.id
  // 追加
  authorCustomerId String? @db.Uuid    // CUSTOMER → Customer.id

  author         User?     @relation("InquiryReplyAuthor", ...)
  authorCustomer Customer? @relation("InquiryReplyAuthorCustomer", ...)
}
```

DB CHECK（migration SQL）:

User / Customer 削除時の `onDelete: SetNull` を壊さないため、「正しい側 FK の NOT NULL」は
強制しない。禁止するのは **逆側 FK の混入** のみ。

```sql
ALTER TABLE inquiry_replies ADD CONSTRAINT inquiry_replies_author_side_check CHECK (
  ( "authorType" = 'STAFF' AND "authorCustomerId" IS NULL )
  OR
  ( "authorType" = 'CUSTOMER' AND "authorId" IS NULL )
);
```

作成時のアプリ assert（create 経路）:

- STAFF → `authorId` 必須・`authorCustomerId` null
- CUSTOMER → `authorCustomerId` 必須・`authorId` null

既存行はすべて STAFF（Phase 1 data migration）のため backfill 不要。

`InquiryReplyItem.authorName`:

- STAFF → `author.name`
- CUSTOMER → 顧客表示名（`lastName + firstName`）。匿名化後はプレースホルダ

### 5.2 添付 private bucket

- Terraform: `cloudflare_r2_bucket.myrrh_rental_space_inquiries`（**public access / カスタムドメインなし**）
- Env: `R2_INQUIRIES_BUCKET_NAME`（既存 `R2_*` クレデンシャル流用可なら account 共通キー）
- `STORAGE_PREFIXES` に `INQUIRIES: "inquiries"` を追加するが、**公開 URL builder は呼ばない**
- `src/shared/lib/r2/download.ts` に `getObjectStream(key)` を新設（S3 `GetObjectCommand`）
- Route Handlers:
  - Admin: `/admin/api/inquiries/attachments/[id]`（admin session + inquiry permission）
  - Customer: `/api/mypage/inquiries/attachments/[id]`（customer session + ownership）
- Retention `purgeExpiredInquiries`: DB cascade 前に attachment `r2Key` を集め R2 delete（失敗は log + 続行、orphan は別 cron 検討だが本設計では同期削除を必須）

### 5.3 Notification / Settings

- `NOTIFICATION_TYPE` に `INQUIRY_CUSTOMER_REPLY` 追加（LABELS / ICONS / BADGE も同時）
- Notification settings（`SettingsNotification.notifyNewInquiry` と同じテーブル）に
  `notifyInquiryCustomerReply: boolean`（default `true`）を clean-break 追加
- seed のレガシー `INQUIRY_RECEIVED` は runtime で未使用なら seed を `inquiry_new` に揃える（PR3 内）

### 5.4 変更しないもの

- `InquiryStatus` enum / `INQUIRY_STATUS_TRANSITIONS` の CLOSED→[] / SPAM→CLOSED のみ、は維持
- Media 公開 bucket の公開方針は変更しない（inquiry と分離）

## 6. Domain / Action 契約

### 6.1 顧客返信

`replyToInquiryAsCustomerCommand(inquiryId, customerId, body)`:

1. inquiry 取得（`deletedAt` / `anonymizedAt` null、`customerId` 一致）
2. status ∈ {CLOSED, SPAM} → `DomainError VALIDATION`
3. transaction:
   - `InquiryReply` create（`CUSTOMER`, `authorCustomerId`）
   - status ∈ {RESOLVED, FLAGGED} → `IN_PROGRESS` + statusHistory
4. 戻り値: `{ inquiryId, replyId, emailContext }`（admin 通知用）

Public Server Action（mypage）: session → customer → command →  
`fireAndForget(createNotificationCommand(INQUIRY_CUSTOMER_REPLY))` +  
`fireAndForget(sendInquiryCustomerReplyAdminEmail(...))`（settings ゲート）  
→ `updateTag` inquiries。

STAFF 既存 `replyToInquiryCommand` は維持。顧客メールは現行どおり。

### 6.2 スレッド読取

- admin `getInquiryById` / customer `getCustomerInquiryById`: **全 replies**（createdAt asc）。  
  STAFF のみフィルタを削除（clean-break）
- admin UI: 初回 `message` + replies を時系列カード。内部メモは別セクション（顧客非公開）
- mypage UI: 同様。内部メモ・タグ・assignee は出さない。返信フォーム（CLOSED/SPAM 時は非表示 + 説明）

### 6.3 運用コマンド（admin）

| Command                                                                           | 内容                                                                              |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `assignInquiryCommand`                                                            | `assigneeId` set/clear。AuditLog                                                  |
| `updateInquirySlaCommand`                                                         | `slaExpiresAt` set/clear                                                          |
| `createInquiryInternalNoteCommand` / `deleteInquiryInternalNoteCommand`           | スタッフのみ。顧客非公開                                                          |
| `setInquiryTagsCommand`                                                           | tag ids 全置換（または add/remove。推奨: 全置換で単純化）                         |
| `createInquiryTagCommand` / `updateInquiryTagCommand` / `deleteInquiryTagCommand` | マスタ CRUD                                                                       |
| list filters                                                                      | `assigneeId`, `tagId`, `customerType`, `slaExpired`（`slaExpiresAt < now`）, 期間 |

Status history: detail サイドバーに createdAt asc で表示（read-only）。

### 6.4 添付

| Command                          | 内容                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------- |
| `uploadInquiryAttachmentCommand` | magic-byte + size → private bucket PutObject → DB row。失敗時 R2 orphan 削除 |
| `deleteInquiryAttachmentCommand` | R2 delete → DB delete（権限: アップロード者 or admin）                       |

初回お問い合わせ本文への添付は admin が任意タイミングで Inquiry 直下に付与可能。  
返信フォームからは `replyId` 付きで付与。

### 6.5 匿名化

`anonymizeInquiryCommand({ inquiryId, reason })`:

- PII フィールド（name, email, phoneNumber, companyName, message, replies.body）を placeholder
- `anonymizedAt` / `anonymizedReason` 刻印
- 添付は R2 delete + DB 行削除（または filename を redacted にして object 削除）
- 既に anonymized → CONFLICT
- soft-deleted でも可（保持期間中の権利者請求向け）
- Customer 匿名化時は紐づく未匿名化 Inquiry へ `customer-cascade` 理由で連鎖
  anonymize する（`anonymizeInquiryInTx`）。Inquiry 個別 audit 行は作らず、
  customer anonymization audit に `anonymizedInquiryIds` を載せる。
- Customer 匿名化は Inquiry customerId 参照を維持。JOIN で PII に到達しても
  連鎖 anonymize 済みの placeholder 値になる（2026-07-29 実施済み）

## 7. UI

### Admin `InquiryDetail`

- メイン: スレッド（顧客初回 + STAFF/CUSTOMER replies）+ 返信フォーム + 添付リスト
- サイド: status、担当、SLA、タグ、顧客紐づけ、status history、内部メモ、削除

### Admin 一覧

- フィルタ拡張: assignee / tag / SLA 超過 / customerType / 期間
- 列: 担当者名・タグ（折りたたみ可）

### Mypage `[id]`

- 双方向スレッド + 返信フォーム（許可 status のみ）+ 自分の添付 DL
- status マスキング（FLAGGED/SPAM）は現行維持。CLOSED/SPAM では返信不可メッセージ

## 8. メール

| イベント        | 顧客                            | 管理者                                              |
| --------------- | ------------------------------- | --------------------------------------------------- |
| 新規 inquiry    | 確認メール（既存）              | `notifyNewInquiry`（既存）                          |
| STAFF 返信      | `sendInquiryReplyEmail`（既存） | —                                                   |
| 顧客返信        | —                               | in-app 必須 + email（`notifyInquiryCustomerReply`） |
| RESOLVED/CLOSED | 既存 status 通知                | —                                                   |

顧客返信 admin メール件名例:  
`【お問い合わせ続報】{subject} [{receiptNumber}]`

テンプレ: **専用** `src/shared/emails/inquiry-customer-reply-admin.tsx`
（`AdminNotificationEmail` への type 分岐追加はしない。イベント系と同様に専用テンプレ）。

## 9. テスト

- Unit: customer reply status ガード、author XOR、tag 置換、anonymize 冪等
- Unit: architecture grep — inquiry 添付の `buildPublicUrl` 使用 0 件
- Integration: customer reply → reply row + optional reopen + notification side-effect mock
- Integration: attachment upload → private get（未認証 401/403、他顧客 403）
- E2E: mypage 返信 → admin 詳細にスレッド表示（smoke または authenticated project）

## 10. PR / フェーズ分割

| PR  | 内容                                                                                     | migration                                                  |
| --- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1   | `authorCustomerId` + CHECK + Customer relation。queries の authorName 解決更新           | あり（非 DROP、通常デプロイ）                              |
| 2   | admin + mypage 全文スレッド UI（書込なし）                                               | なし                                                       |
| 3   | 顧客返信 command/action/UI + `INQUIRY_CUSTOMER_REPLY` + `notifyInquiryCustomerReply`     | `settings_notifications.notifyInquiryCustomerReply` 列追加 |
| 4   | assignee / SLA / notes / tags / filters / status history UI                              | なし                                                       |
| 5   | private R2 bucket (Terraform) + attachment upload/download/delete + retention R2 cleanup | env 追加                                                   |
| 6   | `anonymizeInquiryCommand` + admin UI                                                     | なし                                                       |

各 PR は `bun run validate` + 該当 unit/integration。破壊的 DROP は本系列では想定しない  
（CHECK 追加・列追加・settings 列追加・新 bucket）。settings split 済みテーブルへの列追加は
当該 settings テーブルの migration skill に従う。

## 11. リスクと緩和

| リスク                                       | 緩和                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| 公開 bucket に PII を誤配置                  | architecture test で `buildPublicUrl` + inquiries key を禁止。専用 bucket |
| CLOSED からの誤再開                          | status ガードを unit で固定。UI でもフォーム非表示                        |
| 添付 orphan                                  | upload 失敗時 deleteFile。purge 時 R2 先行削除                            |
| settings 列追加と split 進行中ブランチの衝突 | main 最新の notification settings テーブルを確認してから PR3 実装         |
| 巨大 PR                                      | soft limit 厳守。本 spec の PR 表を逸脱しない                             |

## 12. 成功条件

- 会員が mypage から続報を送れ、admin が同一スレッドで読める
- CLOSED/SPAM では送れない
- 添付 URL を知っていても未認証では取得できない
- 内部メモが mypage に漏れない
- `anonymizeInquiry` 後、一覧/詳細/メール再送経路に生 PII が残らない（unit + 目視）
