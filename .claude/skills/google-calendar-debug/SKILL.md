---
name: google-calendar-debug
description: >
  Google Calendar 同期の診断スキル。OAuth トークン期限切れ、サービスアカウント設定ミス、
  双方向同期エラー、Webhook チャンネル失効、iCal フィード異常の特定と対処を行う。
  「カレンダーに予約が反映されない」「同期が止まった」場面で使用する。
---

# Google Calendar デバッグ

> Myrrh Rental Space の Google Calendar 統合診断ガイド

## アーキテクチャ概要

```
接続方式（CalendarSyncMethod enum）:
  polling  →  定期ポーリング（cron: /api/cron/calendar-sync）
  webhook  →  プッシュ通知（Google → /api/webhooks/google-calendar）

認証方式（同時使用可）:
  サービスアカウント  →  共有カレンダーへの書き込み（推奨）
  OAuth              →  管理者個人カレンダーへのアクセス（オプション）

データフロー:
  予約作成/更新/キャンセル
    → calendar-sync.ts (syncToCalendar)
    → google-calendar.ts (createCalendarEvent / updateCalendarEvent / deleteCalendarEvent)
    → Google Calendar API

  カレンダー変更
    → /api/webhooks/google-calendar または /api/cron/calendar-sync
    → calendar-sync.ts (syncFromCalendar)
    → 予約DB更新（競合時は予約優先・変更拒否）
```

**関連ファイル**:

| ファイル                                        | 役割                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| `src/shared/lib/google-calendar.ts`             | Google Calendar API クライアント・全操作関数（`server-only`）          |
| `src/shared/lib/calendar-sync.ts`               | 同期サービス・`syncToCalendar` / `syncFromCalendar`（`server-only`）   |
| `src/shared/lib/google-oauth-credentials.ts`    | OAuth 認証情報取得（DB優先 → 環境変数フォールバック）（`server-only`） |
| `src/app/api/webhooks/google-calendar/route.ts` | Webhook 受信エンドポイント                                             |
| `src/app/api/cron/calendar-sync/route.ts`       | 定期同期 Cron エンドポイント                                           |
| `src/app/api/ical/[token]/route.ts`             | iCal フィード（外部カレンダーアプリ用）                                |

---

## 診断ステップ

### Step 1 — DB の設定状況確認

```bash
# Prisma Studio で settings テーブルの singleton レコードを確認
bun run db:studio
```

**確認する Settings フィールド**:

| フィールド                        | 確認内容                                                                |
| --------------------------------- | ----------------------------------------------------------------------- |
| `googleCalendarEnabled`           | `true` になっているか                                                   |
| `googleCalendarId`                | カレンダー ID が設定されているか（例: `abc@group.calendar.google.com`） |
| `googleCalendarConnectionStatus`  | `'connected'` か `'error'` か `null` か                                 |
| `googleCalendarLastTestedAt`      | 最後にテストした日時                                                    |
| `googleOAuthClientId`             | OAuth Client ID（未設定なら `null`）                                    |
| `googleOAuthClientSecret`         | 暗号化済み OAuth Client Secret（未設定なら `null`）                     |
| `googleCalendarTwoWaySyncEnabled` | 双方向同期が有効か                                                      |
| `googleCalendarSyncMethod`        | `'polling'` または `'webhook'`                                          |

### Step 2 — 認証情報の確認

#### 環境変数（フォールバック）

```bash
# Cloud Run 環境変数を確認
gcloud run services describe myrrh-rental-space --region=asia-northeast1 --format="yaml" | grep -A5 "env:"
```

**必要な環境変数（Google 関連）**:

- `GOOGLE_CLIENT_ID` — OAuth Client ID（DBに設定済みなら不要）
- `GOOGLE_CLIENT_SECRET` — OAuth Client Secret（DBに設定済みなら不要）

#### OAuth トークンの期限確認（DB）

```bash
# Prisma Studio で google_calendar_credentials テーブルを確認
# または：
bun run db:studio  → googleCalendarCredential テーブル
```

**確認項目**:

- `accessToken`: 期限切れの場合は空か古い日付
- `refreshToken`: 存在しない場合は再認証が必要
- `expiresAt`: 現在時刻と比較（期限切れなら自動更新されるはずだが確認）
- `calendarId`: 正しいカレンダー ID が紐付いているか

### Step 3 — 同期失敗の原因別対処

#### カレンダーに予約が反映されない

| 症状                           | 原因                              | 確認場所                                             | 対処                                                            |
| ------------------------------ | --------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| 新規予約が反映されない         | `syncToCalendar` が呼ばれていない | `calendar-sync.ts` の呼び出し元 Server Action を確認 | 予約作成 Server Action で `syncToCalendar()` を呼んでいるか確認 |
| `googleCalendarEnabled: false` | 設定が無効                        | 管理画面 > 設定 > Google Calendar                    | 有効に切り替える                                                |
| `calendarId` が未設定          | カレンダー ID なし                | DB settings                                          | 管理画面でカレンダー ID を設定                                  |
| `connectionStatus: 'error'`    | 接続テスト失敗                    | 管理画面の接続テストボタン                           | Step 4 のエラー別対処へ                                         |
| OAuth トークン期限切れ         | アクセストークンが失効            | `googleCalendarCredential` テーブル                  | 管理画面から再認証フロー実行                                    |

#### 接続テストのエラー別対処

| エラーメッセージ              | 原因                                             | 対処                                                             |
| ----------------------------- | ------------------------------------------------ | ---------------------------------------------------------------- |
| `Invalid Credentials` / `401` | OAuth トークン期限切れ or 無効                   | 管理画面から OAuth 再認証                                        |
| `Calendar not found` / `404`  | カレンダー ID が不正                             | Google Calendar でカレンダー ID を再確認                         |
| `403 Forbidden`               | サービスアカウントにカレンダーへのアクセス権なし | Google Calendar の設定でサービスアカウントを「編集者」として共有 |
| `Client ID not configured`    | `GOOGLE_CLIENT_ID` 未設定かつ DB にもなし        | 環境変数または管理画面で設定                                     |
| `Cannot decrypt`              | `ENCRYPTION_KEY` の不一致                        | Cloud Run の `ENCRYPTION_KEY` が DB 保存時と同じか確認           |

### Step 4 — 双方向同期の診断

#### Webhook モードの確認

```bash
# Webhook チャンネルが有効か確認
# Prisma Studio で google_calendar_webhook_channels テーブルを確認
# チャンネルの expiration が現在時刻より未来かどうか
bun run db:studio
```

**Webhook チャンネルが失効している場合**:

1. Cron `POST /api/cron/calendar-sync` を手動実行（`renewWebhookIfNeeded()` が呼ばれる）
2. または管理画面から「Webhook を更新」ボタンを押す（実装済みの場合）
3. チャンネルの有効期限は通常 7 日。Cloud Scheduler で自動更新される

**Webhook エンドポイントの確認**:

```
POST /api/webhooks/google-calendar

必須ヘッダー（Google から送信される）:
  X-Goog-Channel-ID: <チャンネルID>
  X-Goog-Resource-ID: <リソースID>
  X-Goog-Resource-State: sync | exists | not_exists
  X-Goog-Message-Number: <通し番号>
```

#### ポーリングモードの確認

```bash
# Cron エンドポイントを手動実行（Cloud Run デプロイ済みの場合）
curl -X POST https://<cloud-run-url>/api/cron/calendar-sync \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)"
```

**Cron のトリガー確認**:

- Cloud Scheduler > `calendar-sync-job` ジョブが有効か
- 最終実行のステータスが成功か

### Step 5 — iCal フィードの確認

```bash
# iCal フィードが正常に生成されるか（token は DB の space.icalToken）
curl https://<app-url>/api/ical/<token>

# ローカルテスト
curl http://localhost:3000/api/ical/<token>
```

**確認項目**:

- レスポンスが `BEGIN:VCALENDAR` で始まるか
- 予約データが正しく含まれているか
- `Content-Type: text/calendar` が返っているか

---

## Cloud Run ログの確認

```bash
# Google Calendar 関連のエラーログを確認
gcloud logging read \
  'resource.type="cloud_run_revision" AND textPayload=~"calendar|Calendar|CALENDAR"' \
  --limit=50 \
  --format="table(timestamp, textPayload)"

# または Cloud Console:
# Cloud Run > サービス > ログタブ > フィルター: calendar
```

---

## コードを修正する際の注意

- **`google-calendar.ts` / `google-oauth-credentials.ts` は `server-only`** — Client Component から import 禁止
- **OAuth 認証情報は必ず暗号化して DB に保存** — `encrypt()` / `safeDecrypt()` を使用
- **Prisma enum を使う**: `CalendarSyncMethod.polling` / `CalendarSyncMethod.webhook`（文字列リテラル禁止）
- **`syncToCalendar` / `syncFromCalendar` は `fireAndForget`** — 予約 Server Action をブロックしない
- **競合時は予約優先**: カレンダー側の変更でイベントが削除された場合も予約は維持し、同期拒否メールを送信する

---

## 禁止事項

- `GOOGLE_CLIENT_SECRET` をログに出力しない
- OAuth トークン（`accessToken` / `refreshToken`）をログに含めない
- リフレッシュトークンをコードにハードコードしない
- `googleCalendarCredential` テーブルを手動で編集しない（整合性が崩れる）
