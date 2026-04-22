# よくある落とし穴・禁止事項

> 親 skill: [../SKILL.md](../SKILL.md)

## よくある落とし穴

- **`syncToCalendar` が呼ばれていない** — 予約作成・更新・キャンセル Server Action に `syncToCalendar()` が含まれているか確認。`fireAndForget` でラップされているか
- **サービスアカウントがカレンダーに共有されていない** — 403 Forbidden の最多原因。Google Calendar の設定 > 特定のユーザーと共有 > サービスアカウントメールを「編集者」で追加
- **ENCRYPTION_KEY の不一致** — DB に暗号化保存した OAuth credentials は、保存時と異なる `ENCRYPTION_KEY` では復号できない。Cloud Run の Secret を更新したら再認証が必要
- **Webhook チャンネル失効後の無音停止** — ポーリングと違い Webhook は失効すると通知が来なくなる。定期的に Cloud Scheduler でチャンネルを更新する
- **iCal トークン流出** — `space.icalToken` は URL に含まれるため、予約情報の公開に繋がる。トークンをログに出力しない
- **双方向同期の競合** — カレンダー側からの削除に対して予約を維持し同期拒否メールを送信する設計。この動作を変えると予約が誤削除されるリスクがある

## 禁止事項

- `GOOGLE_CLIENT_SECRET` をログに出力しない
- OAuth トークン（`accessToken` / `refreshToken`）をログに含めない
- リフレッシュトークンをコードにハードコードしない
- `googleCalendarCredential` テーブルを手動で編集しない（整合性が崩れる）
- `google-calendar.ts` / `google-oauth-credentials.ts` を Client Component から import しない（`server-only`）
- `syncToCalendar` / `syncFromCalendar` を `await` でブロックしない（`fireAndForget` 必須）
- 文字列リテラル `'polling'` / `'webhook'` を使わず `CalendarSyncMethod` enum を使う
