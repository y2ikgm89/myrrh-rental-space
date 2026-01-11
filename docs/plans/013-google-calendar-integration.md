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

### Phase 3（将来実装）
- カレンダーからの予約更新検出（双方向同期）
- iCal URL公開（TimeTree等での購読用）

## 新規ファイル

| ファイル | 説明 |
|---------|------|
| `src/lib/google-calendar.ts` | Google Calendar APIクライアント |
| `src/lib/calendar-sync.ts` | 予約同期サービス |
| `src/lib/ical.ts` | iCal生成・Add to Calendarリンク |
| `src/app/(admin)/admin/settings/_components/sections/GoogleCalendarSection.tsx` | 管理画面設定UI |

## 変更ファイル

| ファイル | 変更内容 |
|---------|----------|
| `prisma/schema.prisma` | Reservation/Settings モデルにカレンダー関連フィールド追加 |
| `src/lib/auth.ts` | Googleプロバイダー追加 |
| `src/actions/admin/settings.ts` | Google Calendar設定Server Actions追加 |
| `src/actions/reservation.ts` | カレンダー同期呼び出し追加 |
| `src/lib/email-service.ts` | iCal添付・カレンダーリンク追加 |
| `src/emails/reservation-confirmation.tsx` | カレンダーリンクセクション追加 |

## 環境変数

```bash
# Google OAuth（管理者連携用）
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx

# 暗号化キー（既存）
ENCRYPTION_KEY=xxx  # サービスアカウントJSON暗号化用
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
- [x] type-check / lint / build
- [x] code-simplifier / code-reviewer
- [x] ドキュメント作成
