# コマンド詳細

> 親 skill: [../SKILL.md](../SKILL.md)

## Settings フィールド一覧

Prisma Studio（`bun run db:studio`）で確認する settings singleton のフィールド:

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

## カレンダーに予約が反映されない — チェックリスト

| 症状                           | 原因                              | 確認場所                                             | 対処                                                            |
| ------------------------------ | --------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| 新規予約が反映されない         | `syncToCalendar` が呼ばれていない | `calendar-sync.ts` の呼び出し元 Server Action を確認 | 予約作成 Server Action で `syncToCalendar()` を呼んでいるか確認 |
| `googleCalendarEnabled: false` | 設定が無効                        | 管理画面 > 設定 > Google Calendar                    | 有効に切り替える                                                |
| `calendarId` が未設定          | カレンダー ID なし                | DB settings                                          | 管理画面でカレンダー ID を設定                                  |
| `connectionStatus: 'error'`    | 接続テスト失敗                    | 管理画面の接続テストボタン                           | エラー別対処（下記）へ                                          |
| OAuth トークン期限切れ         | アクセストークンが失効            | `googleCalendarCredential` テーブル                  | 管理画面から再認証フロー実行                                    |

## 接続テストのエラー別対処

| エラーメッセージ              | 原因                                             | 対処                                                             |
| ----------------------------- | ------------------------------------------------ | ---------------------------------------------------------------- |
| `Invalid Credentials` / `401` | OAuth トークン期限切れ or 無効                   | 管理画面から OAuth 再認証                                        |
| `Calendar not found` / `404`  | カレンダー ID が不正                             | Google Calendar でカレンダー ID を再確認                         |
| `403 Forbidden`               | サービスアカウントにカレンダーへのアクセス権なし | Google Calendar の設定でサービスアカウントを「編集者」として共有 |
| `Client ID not configured`    | `GOOGLE_CLIENT_ID` 未設定かつ DB にもなし        | 環境変数または管理画面で設定                                     |
| `Cannot decrypt`              | `ENCRYPTION_KEY` の不一致                        | Cloud Run の `ENCRYPTION_KEY` が DB 保存時と同じか確認           |

## Webhook ヘッダー仕様

```
POST /api/webhooks/google-calendar

必須ヘッダー（Google から送信される）:
  X-Goog-Channel-ID: <チャンネルID>
  X-Goog-Resource-ID: <リソースID>
  X-Goog-Resource-State: sync | exists | not_exists
  X-Goog-Message-Number: <通し番号>
```

Webhook チャンネルの有効期限は通常 7 日。Cloud Scheduler で自動更新される。
失効時は Cron を手動実行（下記）または管理画面の「Webhook を更新」ボタン。

## Cron 手動実行

```bash
# Cloud Run デプロイ済みの場合
curl -X POST https://<cloud-run-url>/api/cron/calendar-sync \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)"
```

Cloud Scheduler 確認: `calendar-sync-job` ジョブが有効か / 最終実行のステータスが成功か。

## 環境変数（フォールバック）

Cloud Run 環境変数として設定する Google 関連変数（DB 設定済みなら不要）:

- `GOOGLE_CLIENT_ID` — OAuth Client ID
- `GOOGLE_CLIENT_SECRET` — OAuth Client Secret
