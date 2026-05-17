---
name: debug-google-calendar
description: >
  Google Calendar 同期の診断スキル。OAuth トークン期限切れ、サービスアカウント設定ミス、
  双方向同期エラー、Webhook チャンネル失効、iCal フィード異常の特定と対処を行う。
  「カレンダーに予約が反映されない」「同期が止まった」場面で使用する。
when_to_use: Google Calendar 同期に問題が発生したとき。開発者が状況判断して手動で起動する。AI による自動起動は不可、`/debug-google-calendar` slash command 経由のみ。
disable-model-invocation: true
user-invocable: true
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
```

**関連ファイル**: `src/shared/lib/google-calendar.ts` / `calendar-sync.ts` / `google-oauth-credentials.ts`
/ `src/app/api/webhooks/google-calendar/route.ts` / `src/app/api/cron/calendar-sync/route.ts`
/ `src/app/api/ical/[token]/route.ts`

---

## 診断ステップ

### Step 1 — DB の設定状況確認

```bash
bun run db:studio  # settings テーブルの singleton レコードを確認
```

確認項目: `googleCalendarEnabled` / `googleCalendarId` / `googleCalendarConnectionStatus`
/ `googleOAuthClientId` / `googleCalendarTwoWaySyncEnabled` / `googleCalendarSyncMethod`
（詳細は `reference/commands.md` §Settings フィールド一覧）

### Step 2 — 認証情報の確認

```bash
# Cloud Run 環境変数（Google 関連）
gcloud run services describe myrrh-rental-space --region=asia-northeast1 \
  --format="yaml" | grep -A5 "env:"
```

OAuth トークン確認: `bun run db:studio` → `googleCalendarCredential` テーブル
（`accessToken` / `refreshToken` / `expiresAt` / `calendarId`）

### Step 3 — 同期失敗の原因別対処

接続テストエラー別対処（詳細は `reference/commands.md` §エラー別対処）:

| エラー                        | 対処                                                        |
| ----------------------------- | ----------------------------------------------------------- |
| `Invalid Credentials` / `401` | 管理画面から OAuth 再認証                                   |
| `Calendar not found` / `404`  | Google Calendar でカレンダー ID を再確認                    |
| `403 Forbidden`               | サービスアカウントを Google Calendar で「編集者」として共有 |
| `Cannot decrypt`              | Cloud Run の `ENCRYPTION_KEY` が DB 保存時と同じか確認      |

### Step 4 — 双方向同期の診断

**Webhook モード**: `bun run db:studio` → `google_calendar_webhook_channels` テーブルで expiration 確認。
失効時は `POST /api/cron/calendar-sync` を手動実行（`renewWebhookIfNeeded()` が呼ばれる）。

**ポーリングモード**: Cloud Scheduler > `calendar-sync-job` が有効か確認。
手動実行: `reference/commands.md` §Cron 手動実行 参照。

### Step 5 — iCal フィードの確認

```bash
curl https://<app-url>/api/ical/<token>  # token は DB の space.icalToken
```

レスポンスが `BEGIN:VCALENDAR` で始まり、`Content-Type: text/calendar` が返るか確認。

### Step 6 — Cloud Run ログ確認

```bash
gcloud logging read \
  'resource.type="cloud_run_revision" AND textPayload=~"calendar|Calendar|CALENDAR"' \
  --limit=50 \
  --format="table(timestamp, textPayload)"
```

---

## コード修正時の注意

- **`google-calendar.ts` / `google-oauth-credentials.ts` は `server-only`** — Client Component から import 禁止
- **OAuth 認証情報は必ず暗号化して DB に保存** — `encrypt()` / `safeDecrypt()` を使用
- **Prisma enum を使う**: `CalendarSyncMethod.polling` / `CalendarSyncMethod.webhook`（文字列リテラル禁止）
- **`syncToCalendar` / `syncFromCalendar` は `fireAndForget`** — 予約 Server Action をブロックしない
- **競合時は予約優先**: カレンダー側の変更でイベントが削除された場合も予約は維持し、同期拒否メールを送信

---

## 参考ファイル

- `reference/commands.md` — Settings フィールド詳細・エラー別対処・Webhook ヘッダー・Cron 手動実行
- `reference/pitfalls.md` — よくある落とし穴・禁止事項
