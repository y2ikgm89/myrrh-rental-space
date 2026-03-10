# 013 - Google Calendar Integration

## Overview

予約システムにGoogle Calendar連携機能を追加。

## 実装内容

### Phase 1（実装済み）

#### 1. サービスアカウント連携（共有カレンダー）

- サービスアカウントJSON認証情報を暗号化保存
- 予約作成時に共有カレンダーへ自動登録
- 予約キャンセル時にイベント削除
- 接続テスト機能

#### 2. OAuth連携（管理者個人カレンダー）

- Auth.js 5にGoogleプロバイダー追加
- Calendar APIスコープ（calendar.events）
- トークンリフレッシュ自動処理
- 個人カレンダーへのイベント登録（オプション）

#### 3. 予約者向けカレンダー追加

- iCalファイル（.ics）生成
- 確認メールにiCal添付（オプション）
- Add to Calendarリンク生成
  - Google Calendar
  - Outlook Web
  - Apple Calendar

### Phase 2（実装済み）

予約変更時のカレンダー同期

**実装内容**:

- ステータス→CONFIRMED: カレンダーイベント更新（または新規作成）
- ステータス→CANCELLED: カレンダーイベント削除
- 予約削除: カレンダーイベント削除

**変更ファイル**:

- `src/actions/admin/reservation.ts` - updateReservationStatus, deleteReservationにカレンダー同期追加

### Phase 3（実装済み）

iCalフィードURL公開（外部カレンダー購読用）

**実装内容**:

- トークンベース認証によるiCalフィード配信API
- トークン管理（作成・削除・有効期限）
- スペース単位またはすべての予約対象
- 管理画面からの設定・トークン管理UI

**新規ファイル**:

- `src/app/api/ical/[token]/route.ts` - iCalフィード配信API
- `src/actions/admin/ical-tokens.ts` - トークン管理Server Actions
- `src/app/(admin)/admin/settings/_components/sections/ICalFeedSection.tsx` - 管理UI
- `prisma/schema.prisma` - ICalTokenモデル追加

### Phase 4（実装済み）

双方向同期（カレンダー → 予約システム）

**実装内容**:

- ポーリング方式: 設定した間隔（1〜60分）でカレンダー変更をチェック
- Webhook方式: Google Calendar Push Notificationsで即時通知
- 両方使用可能（推奨）
- 手動同期ボタン

**検出する変更**:

- カレンダーでイベント削除 → 予約キャンセル
- カレンダーでイベント時間変更 → 予約時間更新

**新規ファイル**:

- `src/app/api/cron/calendar-sync/route.ts` - Cron用ポーリングAPI
- `src/app/api/webhooks/google-calendar/route.ts` - Webhook受信API
- `src/app/(admin)/admin/settings/_components/sections/TwoWaySyncSection.tsx` - 管理UI

**変更ファイル**:

- `prisma/schema.prisma` - 双方向同期設定フィールド追加
- `src/lib/google-calendar.ts` - fetchCalendarChanges, Webhook関連関数追加
- `src/lib/calendar-sync.ts` - syncFromCalendar, processCalendarChange追加
- `src/actions/admin/settings.ts` - 双方向同期設定Server Actions追加

**セキュリティ**:

- Cron API: CRON_SECRET環境変数による認証（本番必須）
- Webhook: channelId/resourceIdによる検証
- 同期処理の競合防止（メモリロック）

**既知の制限**:

- 時間変更時の重複チェックは未実装（将来対応予定）
- Webhookは最大7日間有効（自動更新なし）

## 新規ファイル

| ファイル                                                                        | 説明                            |
| ------------------------------------------------------------------------------- | ------------------------------- |
| `src/lib/google-calendar.ts`                                                    | Google Calendar APIクライアント |
| `src/lib/calendar-sync.ts`                                                      | 予約同期サービス                |
| `src/lib/ical.ts`                                                               | iCal生成・Add to Calendarリンク |
| `src/app/(admin)/admin/settings/_components/sections/GoogleCalendarSection.tsx` | 管理画面設定UI                  |
| `src/app/(admin)/admin/settings/_components/sections/ICalFeedSection.tsx`       | iCalフィード管理UI              |
| `src/app/(admin)/admin/settings/_components/sections/TwoWaySyncSection.tsx`     | 双方向同期設定UI                |
| `src/app/api/ical/[token]/route.ts`                                             | iCalフィード配信API             |
| `src/app/api/cron/calendar-sync/route.ts`                                       | ポーリング用Cron API            |
| `src/app/api/webhooks/google-calendar/route.ts`                                 | Webhook受信API                  |
| `src/actions/admin/ical-tokens.ts`                                              | iCalトークン管理Actions         |

## 変更ファイル

| ファイル                                  | 変更内容                                                  |
| ----------------------------------------- | --------------------------------------------------------- |
| `prisma/schema.prisma`                    | Reservation/Settings モデルにカレンダー関連フィールド追加 |
| `src/lib/auth.ts`                         | Googleプロバイダー追加                                    |
| `src/actions/admin/settings.ts`           | Google Calendar設定Server Actions追加                     |
| `src/actions/reservation.ts`              | カレンダー同期呼び出し追加                                |
| `src/lib/email-service.ts`                | iCal添付・カレンダーリンク追加                            |
| `src/emails/reservation-confirmation.tsx` | カレンダーリンクセクション追加                            |

## 環境変数

```bash
# Google OAuth（管理者連携用）
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx

# 暗号化キー（既存）
ENCRYPTION_KEY=xxx  # サービスアカウントJSON暗号化用

# 双方向同期（Phase 4）
CRON_SECRET=xxx  # ポーリングAPIの認証（本番必須）
NEXT_PUBLIC_APP_URL=https://example.com  # Webhook URL生成用
```

## 設定項目（管理画面）

- Google Calendar同期有効/無効
- カレンダーID
- サービスアカウントJSON（暗号化保存）
- iCalメール添付有効/無効
- Add to Calendarリンク表示有効/無効

## セットアップ手順

### 1. Google Cloud Consoleで設定

1. プロジェクト作成/選択
2. Google Calendar API有効化
3. OAuth同意画面設定
4. OAuth クライアントID作成（Webアプリケーション）
5. サービスアカウント作成・JSONキー発行

### 2. Google Calendarでサービスアカウント権限付与

1. 共有カレンダー作成
2. サービスアカウントのメールアドレスに編集権限を付与
3. カレンダーIDをコピー

### 3. 管理画面で設定

1. 設定 → 予約タブ → Google Calendar連携
2. サービスアカウントJSON貼り付け
3. カレンダーID入力
4. 接続テスト実行
5. 同期有効化

### 4. 双方向同期設定（Phase 4）

1. Vercel環境変数設定
   - `CRON_SECRET`: ランダムな文字列（例: `openssl rand -hex 32`）
   - `NEXT_PUBLIC_APP_URL`: デプロイ先URL

2. Vercel Cron設定（`vercel.json`）

```json
{
  "crons": [
    {
      "path": "/api/cron/calendar-sync",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

3. 管理画面 → 設定 → 予約タブ → 双方向同期
   - 双方向同期を有効化
   - 同期方式選択（ポーリング/Webhook/両方）
   - Webhook設定（必要時）

## テクニカルノート

### RFC 5545 iCal準拠

- 日時はUTC形式（Zサフィックス）
- 行の折り返し（75オクテット制限）
- テキストエスケープ（改行、カンマ、セミコロン）

### セキュリティ

- サービスアカウントJSONはAES-256-GCMで暗号化
- OAuthトークンはAccountテーブルで管理
- refresh_tokenローテーション対応

### パフォーマンス

- カレンダー同期はバックグラウンド実行
- 失敗しても予約自体は成功として処理
- リトライ機構（Phase 2で実装予定）

## Status

### Phase 1-3

- [x] Prismaスキーマ更新
- [x] googleapisインストール
- [x] Google Calendar APIクライアント
- [x] Auth.js Googleプロバイダー
- [x] 接続テスト・バリデーション
- [x] 設定管理Server Actions
- [x] 管理画面設定UI
- [x] iCal生成・Add to Calendarリンク
- [x] メールにiCal添付・リンク追加
- [x] 予約作成時のカレンダー同期
- [x] 予約キャンセル時のイベント削除
- [x] 予約更新時のカレンダー同期（Phase 2）
- [x] iCalフィードURL公開（Phase 3）
- [x] type-check / lint / build
- [x] code-simplifier / code-reviewer
- [x] ドキュメント作成

### Phase 4（双方向同期）

- [x] Prismaスキーマ更新（双方向同期フィールド）
- [x] カレンダー変更検出ロジック
- [x] ポーリング用Cron APIエンドポイント
- [x] Webhook用APIエンドポイント
- [x] 設定画面UI（TwoWaySyncSection）
- [x] Server Actions（設定・Webhook管理・手動同期）
- [x] type-check / lint / build
- [x] code-reviewer
