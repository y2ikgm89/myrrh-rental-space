# メール送信機能 要件定義

> **Note**: このドキュメントにはメール送信機能の詳細な要件定義が記載されています。技術スタックの詳細については、[`CLAUDE.md`](../CLAUDE.md)を参照してください。API仕様については、[`API.md`](../guides/coding-standards.md)を参照してください。機能要件の概要については、[`README.md`](./README.md)を参照してください。

---

## 目的と背景

### メール送信機能の目的

予約システムにおいて、以下の目的でメール送信機能を実装します：

1. **予約確認の提供**: ゲストに予約内容を確認してもらい、予約の信頼性を向上させる
2. **変更通知**: 予約の変更やキャンセルを迅速に通知し、混乱を防ぐ
3. **管理者通知**: 新規予約や重要な変更を管理者に通知し、迅速な対応を可能にする
4. **ユーザー体験の向上**: プロフェッショナルなメール送信により、サービスの信頼性を高める

### ビジネス要件

- 予約完了時に自動的に確認メールを送信
- 予約の変更・キャンセル時に通知メールを送信
- 管理者への通知により、迅速な対応を実現
- メール送信の失敗が予約操作をブロックしない（非同期処理）

### ユーザー体験への影響

- **ゲスト**: 予約内容の確認、変更・キャンセル通知の受信により、安心してサービスを利用できる
- **管理者**: 新規予約の即座の通知により、迅速な対応が可能になる

---

## 送信メールの種類とタイミング

### 1. 予約確認メール（ゲスト宛）

#### 送信タイミング

- 予約作成成功時（`createReservation` Server Action実行後、データベースへの保存が完了した後）

#### 送信先

- **To**: 予約者のメールアドレス（`customer.email`）
- **CC**: なし
- **BCC**: なし

#### 件名

```
[Myrrh Rental Space] 予約確認 - {スペース名} - {開始日時}
```

例: `[Myrrh Rental Space] 予約確認 - 会議室A - 2026-01-15 14:00`

#### 必須項目

- 予約ID（一意識別子）
- スペース名
- 予約日時（開始日時・終了日時、タイムゾーン含む）
- ゲスト名（姓名、表示時は「姓 名 様」形式）
- 料金（合計金額、内訳があれば表示）
- スペース住所
- アクセス情報（スペースの`access`フィールドから取得）

#### オプション項目

- キャンセルリンク（予約キャンセルページへのリンク、将来的に実装）
- 予約変更リンク（将来的に実装）
- スペースのメイン画像（`mainImageUrl`）
- 設備情報（`facilities`配列）
- 営業時間情報

#### メール本文の構造

1. ヘッダー（ロゴ、ブランド名）
2. 挨拶文
3. 予約確認メッセージ
4. 予約詳細（表形式で表示）
5. スペース情報（住所、アクセス）
6. 注意事項・連絡先
7. フッター（コピーライト、配信停止リンク）

---

### 2. 予約キャンセル通知メール（ゲスト宛）

#### 送信タイミング

- 予約がキャンセルされた時（`updateReservation` Server Actionで`status`が`cancelled`に変更された時）
- 予約が削除された時（`deleteReservation` Server Action実行時）

#### 送信先

- **To**: 予約者のメールアドレス（`customer.email`）
- **CC**: なし
- **BCC**: なし

#### 件名

```
[Myrrh Rental Space] 予約キャンセルのご連絡 - {スペース名}
```

例: `[Myrrh Rental Space] 予約キャンセルのご連絡 - 会議室A`

#### 必須項目

- キャンセルされた予約の詳細（予約ID、スペース名、予約日時）
- キャンセル日時
- 返金情報（該当する場合、将来的に実装）
- キャンセル理由（管理者が入力した場合、オプション）

#### オプション項目

- 再予約へのリンク（スペース一覧ページへのリンク）

#### メール本文の構造

1. ヘッダー
2. 挨拶文
3. キャンセル通知メッセージ
4. キャンセルされた予約詳細
5. 返金情報（該当する場合）
6. 再予約への案内
7. フッター

---

### 3. 予約変更通知メール（ゲスト宛）

#### 送信タイミング

- 予約が更新された時（`updateReservation` Server Action実行時）
- `status`が`cancelled`以外の変更があった場合のみ送信
- 変更があった場合のみ送信（変更前後の比較）

#### 送信先

- **To**: 予約者のメールアドレス（`customer.email`）
- **CC**: なし
- **BCC**: なし

#### 件名

```
[Myrrh Rental Space] 予約変更のご連絡 - {スペース名}
```

例: `[Myrrh Rental Space] 予約変更のご連絡 - 会議室A`

#### 必須項目

- 変更前の予約詳細（予約ID、スペース名、日時、ゲスト名、料金）
- 変更後の予約詳細（変更された項目のみ強調表示）
- 変更日時
- 変更理由（管理者が入力した場合、オプション）

#### オプション項目

- 変更された項目のハイライト表示

#### メール本文の構造

1. ヘッダー
2. 挨拶文
3. 変更通知メッセージ
4. 変更前の予約詳細
5. 変更後の予約詳細（変更箇所を強調）
6. 変更理由（該当する場合）
7. フッター

---

### 4. 管理者通知メール

#### 送信タイミング

- **新規予約作成時**: `createReservation` Server Action実行後（必須）
- **予約変更時**: `updateReservation` Server Action実行時（オプション、将来的に実装）
- **予約キャンセル時**: `updateReservation`で`status`が`cancelled`に変更された時（オプション、将来的に実装）

#### 送信先

- **To**: 管理者のメールアドレス（環境変数`RESEND_ADMIN_EMAIL`から取得、複数可能）
- **CC**: なし
- **BCC**: なし

#### 件名（新規予約の場合）

```
[Myrrh Rental Space] 新規予約のお知らせ - {スペース名} - {開始日時}
```

例: `[Myrrh Rental Space] 新規予約のお知らせ - 会議室A - 2026-01-15 14:00`

#### 必須項目

- 予約詳細（予約ID、スペース名、予約日時、ゲスト名、ゲストメールアドレス、料金）
- ゲスト情報（名前、メールアドレス）
- 予約ID
- 管理画面へのリンク（予約詳細ページへの直接リンク）

#### オプション項目

- 予約作成日時
- スペースの基本情報

#### メール本文の構造

1. ヘッダー
2. 通知メッセージ
3. 予約詳細（表形式）
4. ゲスト情報
5. 管理画面へのリンク（ボタン形式）
6. フッター

---

## メールテンプレート要件

### デザイン要件

#### ブランドカラー

- サイトのブランドカラーを使用（設定可能、将来的に`Settings`テーブルから取得）
- プライマリカラー: メールの主要な要素（ボタン、リンク）に使用
- セカンダリカラー: 補助的な要素に使用

#### ロゴ

- ヘッダーロゴを使用（`Settings.headerLogoUrl`から取得）
- ロゴが設定されていない場合は、テキストロゴ（ブランド名）を表示
- ロゴの最大幅: 200px
- ロゴの最大高さ: 60px

#### フォント

- メールクライアント互換性の高いフォントファミリーを使用
- 推奨: `Arial, Helvetica, sans-serif`
- フォントサイズ: 本文 14px、見出し 18-24px

#### レイアウト

- シンプルで読みやすい1カラムレイアウト
- 最大幅: 600px（メールクライアント互換性のため）
- パディング: 20px

### レスポンシブデザイン

#### モバイルデバイス対応

- モバイルデバイスでの表示最適化
- テーブルベースのレイアウト（メールクライアント互換性）
- 画像の自動リサイズ（最大幅: 100%）
- ボタン・リンクのタップ領域を十分に確保（最小: 44px × 44px）

#### テーブルベースレイアウト

- HTMLテーブルを使用（`<table>`タグ）
- インラインCSSを使用（メールクライアント互換性）
- メディアクエリの使用は限定的（一部のメールクライアントでサポートされないため）

### アクセシビリティ要件

#### コントラスト比

- テキストと背景のコントラスト比: WCAG 2.1 AA基準を満たす（4.5:1以上）
- 大きなテキスト（18px以上）: 3:1以上

#### 画像のaltテキスト

- すべての画像に適切なaltテキストを設定
- 装飾的な画像は空のaltテキスト（`alt=""`）を設定

#### セマンティックなHTML構造

- 適切な見出しタグ（`<h1>`, `<h2>`など）を使用
- リストは`<ul>`, `<ol>`タグを使用
- リンクは明確なテキストを使用（「こちらをクリック」などは避ける）

---

## 技術要件

### メール送信サービス

#### サービス選択

- **サービス**: Resend
- **選択理由**:
  - Next.js 16とBunランタイムとの完全な互換性
  - React Email 5.0によるReactコンポーネントベースのテンプレート
  - シンプルなAPIと実装の容易さ
  - 無料枠（月3,000通）とコスト効率
  - Webhook、分析、テンプレート管理などの高度な機能

#### SDK

- **パッケージ**: `resend` (Node.js SDK)
- **バージョン**: 最新安定版
- **インストール**: `bun add resend`

#### テンプレートエンジン

- **パッケージ**: React Email 5.0（開発時のテンプレート作成・プレビュー用）
- **コンポーネント**: `@react-email/components`
- **バージョン**: 最新版（Next.js 16とReact 19.2をサポート）
- **インストール**: `bun add react-email @react-email/components`

#### Resendテンプレート機能

- **機能**: Resendのテンプレート機能を使用してメール送信
- **利点**:
  - 管理画面からテンプレートを簡単に編集可能（開発者の介入不要）
  - テンプレートのバージョン管理（Draft/Published）
  - テンプレート変数による動的コンテンツの挿入
  - テンプレートのプレビュー機能
- **実装方法**: Resend APIを使用してテンプレートを管理し、テンプレートIDと変数でメール送信
- **詳細**: 以下の「Resendテンプレート機能の統合」セクションを参照

### 統合方法

#### 実装場所

- **メール送信ユーティリティ**: `src/lib/email/` ディレクトリ
  - `resend.ts`: Resendクライアントの初期化と設定
  - `service.ts`: メール送信サービスの実装（Resendテンプレート機能対応）
  - `types.ts`: 型定義
- **メールテンプレート（開発用）**: `src/components/emails/` ディレクトリ
  - `reservation-confirmation.tsx`: 予約確認メールテンプレート（React Emailコンポーネント）
  - `reservation-cancelled.tsx`: キャンセル通知メールテンプレート（React Emailコンポーネント）
  - `reservation-updated.tsx`: 変更通知メールテンプレート（React Emailコンポーネント）
  - `admin-notification.tsx`: 管理者通知メールテンプレート（React Emailコンポーネント）
- **メールテンプレート管理**: `src/actions/admin/email-templates.ts`
  - Resend APIを使用したテンプレートの取得・作成・更新・削除機能
- **管理画面**: `src/app/(admin)/admin/settings/email/page.tsx`
  - メールテンプレート管理UI（テンプレート編集、プレビュー、公開機能）

#### Server Actions統合

- **統合先**: `src/actions/reservation.ts`
- **統合方法**:
  - `createReservation`: 予約作成成功後、非同期でメール送信
  - `updateReservation`: 予約更新後、変更内容に応じてメール送信
  - `deleteReservation`: 予約削除前、キャンセル通知メール送信

#### 非同期処理

- メール送信は予約操作をブロックしない
- メール送信は`Promise`として非同期で実行
- メール送信の失敗は予約操作の成功/失敗に影響しない

### 環境変数

#### 必須環境変数

- `RESEND_API_KEY`: Resend APIキー（必須）
  - 取得方法: ResendダッシュボードからAPIキーを生成
  - 形式: `re_`で始まる文字列

- `RESEND_FROM_EMAIL`: 送信元メールアドレス（必須）
  - 形式: 有効なメールアドレス
  - 例: `[email protected]`
  - 注意: Resendでドメイン認証が必要な場合あり

#### オプション環境変数

- `RESEND_FROM_NAME`: 送信元名（オプション）
  - デフォルト値: `"Myrrh Rental Space"`
  - 例: `"Myrrh Rental Space"`

- `RESEND_ADMIN_EMAIL`: 管理者通知先メールアドレス（オプション）
  - 複数のメールアドレスをカンマ区切りで指定可能
  - 例: `[email protected],[email protected]`
  - 注意: 新規予約通知メールの送信先

- `EMAIL_ENABLED`: メール送信の有効/無効化（オプション）
  - デフォルト値: `"true"`
  - 開発環境では`"false"`に設定可能

#### テンプレートID用の環境変数（オプション、開発環境用）

- `RESEND_TEMPLATE_RESERVATION_CONFIRMATION`: 予約確認メールテンプレートID（オプション）
- `RESEND_TEMPLATE_RESERVATION_CANCELLED`: キャンセル通知メールテンプレートID（オプション）
- `RESEND_TEMPLATE_RESERVATION_UPDATED`: 変更通知メールテンプレートID（オプション）
- `RESEND_TEMPLATE_ADMIN_NOTIFICATION`: 管理者通知メールテンプレートID（オプション）
- **注意**: 本番環境では、SettingsテーブルまたはResend APIからテンプレートIDを取得することを推奨

#### 環境変数のバリデーション

- アプリケーション起動時にZodスキーマでバリデーション
- 必須環境変数が設定されていない場合は警告をログに記録（メール送信はスキップ）

### エラーハンドリング

#### メール送信失敗時の動作

- メール送信失敗は予約操作をブロックしない
- エラーはログに記録（構造化ログ）
- エラー詳細（メールアドレス、エラーメッセージ）をログに記録

#### リトライロジック

- 初回失敗時の自動リトライ（将来的に実装）
- 最大リトライ回数: 3回
- 指数バックオフ（1秒、2秒、4秒）

#### エラーログの形式

```typescript
{
  type: 'email_send_error',
  emailType: 'reservation_confirmation',
  recipient: '[email protected]', // マスク処理
  error: 'Error message',
  timestamp: '2026-01-15T14:00:00Z',
  reservationId: 'reservation-id'
}
```

---

## セキュリティ要件

### メールアドレスのバリデーション

#### バリデーション方法

- Zodスキーマによるバリデーション
- メールアドレス形式の検証（RFC 5322準拠）
- ドメインブラックリスト（将来的に実装）

#### バリデーションタイミング

- Server Action実行時（予約作成・更新時）
- メール送信前（追加のバリデーション）

### スパム対策

#### Resend側の機能

- Resend側のスパム対策機能を活用
- SPF/DKIM/DMARC設定（Resend側で管理）
- 送信ドメインの認証（Resendダッシュボードで設定）

#### アプリケーション側の対策（受信フォームのスパム対策）

**コンテンツベースのスパム検出**:

- キーワードフィルタリング（データベースにスパムキーワードリストを保存）
- パターンマッチング（URL、メールアドレスのパターン）

**実装方法**:

- フォーム送信時にスパム検出を実行
- スパムと判定された場合は送信を拒否し、IPアドレスをブロック（オプション）

**詳細**: [`../security/protection.md`](./../security/protection.md)の「スパム対策」セクションを参照してください。

#### メール送信側の対策

**レート制限の実装**:

- 既存のレート制限実装を活用（[`SECURITY.md`](../security/README.md)参照）
- 送信頻度の監視
- 異常な送信パターンの検出

**詳細**: [`../security/protection.md`](./../security/protection.md)を参照してください。

### レート制限

#### Resend側の制限

- Resend側のレート制限に従う
- 無料プラン: 月3,000通
- 有料プラン: プランに応じた制限

#### アプリケーション側の制限

**実装方法**:

- 既存のレート制限実装（`@upstash/ratelimit`無料プラン）を活用
- 同一メールアドレスへの送信頻度制限
- 同一IPアドレスからの送信頻度制限

**詳細**: [`SECURITY.md`](../security/README.md)の「レート制限」セクションを参照してください。

### 機密情報の取り扱い

#### ログ記録時の注意

- メールアドレスはマスク処理（例: `u***@example.com`）
- 予約ID、スペース名などの機密情報はログに記録しない（必要最小限のみ）

#### メール本文の注意

- 機密情報（クレジットカード情報など）をメール本文に含めない
- 個人情報の取り扱いに注意（GDPR、個人情報保護法に準拠）

---

## パフォーマンス要件

### 送信速度

#### 非同期処理

- メール送信は非同期処理
- 予約操作のレスポンス時間に影響を与えない
- 目標: 予約操作のレスポンス時間 < 100ms（メール送信を含まない）

#### 送信タイムアウト

- メール送信のタイムアウト: 10秒
- タイムアウト時はエラーログに記録し、予約操作は成功として扱う

### リトライロジック

#### 実装方針（将来的に）

- 初回失敗時の自動リトライ
- 最大リトライ回数: 3回
- 指数バックオフ（1秒、2秒、4秒）

#### リトライ条件

- ネットワークエラー
- タイムアウトエラー
- 一時的なサーバーエラー（5xxエラー）

#### リトライしない条件

- バリデーションエラー（4xxエラー）
- 認証エラー（401, 403）
- 無効なメールアドレス

### バッチ送信（将来的に）

#### 実装方針

- 複数のメールを一度に送信する機能（将来的に実装）
- 管理者通知メールのバッチ送信
- 送信キューの実装（将来的に）

---

## 監視・ログ要件

### ログ記録

#### 送信成功ログ

```typescript
{
  type: 'email_sent',
  emailType: 'reservation_confirmation',
  recipient: 'u***@example.com', // マスク処理
  reservationId: 'reservation-id',
  timestamp: '2026-01-15T14:00:00Z'
}
```

#### 送信失敗ログ

```typescript
{
  type: 'email_send_error',
  emailType: 'reservation_confirmation',
  recipient: 'u***@example.com', // マスク処理
  error: 'Error message',
  errorCode: 'validation_error',
  reservationId: 'reservation-id',
  timestamp: '2026-01-15T14:00:00Z'
}
```

#### ログレベル

- **開発環境**: `console.log`, `console.error`
- **本番環境**: 構造化ログ（JSON形式）
- ログレベル: `info`（成功）、`error`（失敗）

### 監視

#### メール送信成功率

- メール送信成功率の監視
- 目標: 95%以上
- アラート: 成功率が90%を下回った場合

#### エラー率

- エラー率の監視
- エラー率が5%を超えた場合のアラート

#### Resendダッシュボード

- Resendダッシュボードでの配信状況確認
- 送信統計の確認
- エラー詳細の確認

---

## 運用要件

### メール送信の有効/無効化

#### 環境変数による制御

- `EMAIL_ENABLED`: メール送信の有効/無効化
  - `"true"`: メール送信を有効化（デフォルト）
  - `"false"`: メール送信を無効化（開発環境など）

#### 開発環境での動作

- 開発環境ではデフォルトで無効化可能
- テスト送信機能の提供

### テスト送信機能

#### 開発環境

- 開発環境でのテスト送信機能
- 管理画面からのテスト送信（将来的に実装）

#### テスト送信の要件

- 任意のメールアドレスへのテスト送信
- 各メールタイプのテンプレート確認
- メール本文のプレビュー機能（将来的に）

### 配信レポート

#### Resendダッシュボード

- Resendダッシュボードでの配信状況確認
- 送信統計の確認
- エラー詳細の確認

#### アプリケーション側のレポート（将来的に）

- 管理画面でのメール送信統計
- 送信成功率の表示
- エラー率の表示

---

## Resendテンプレート機能の統合

### テンプレートの作成フロー

1. **開発時**: React Emailコンポーネント（`src/components/emails/`）でテンプレートを作成
2. **HTML生成**: React EmailからHTMLを生成
3. **Resendテンプレート作成**:
   - **方法1（推奨）**: 管理画面からResend APIを使用してテンプレートを作成
   - **方法2（オプション）**: Resendダッシュボードでテンプレートを作成し、HTMLをインポート
4. **変数定義**: テンプレート内で使用する変数を定義（最大20個）
5. **公開**: テンプレートをPublishして使用可能にする
6. **テンプレートID管理**: Resend APIから取得、またはSettingsテーブルにキャッシュとして保存（オプション）

### メール送信時の動作

```typescript
// テンプレートIDが設定されている場合（本番環境）
const templateId = await getTemplateId("reservation_confirmation"); // Resend APIまたはSettingsから取得

if (templateId) {
  await resend.emails.send({
    from: `${senderName} <${senderEmail}>`,
    to: recipientEmail,
    template: {
      id: templateId,
      variables: {
        RESERVATION_ID: reservation.id,
        SPACE_NAME: space.name,
        CUSTOMER_NAME: `${customer.lastName} ${customer.firstName}`,
        START_TIME: formatDateTime(reservation.startTime),
        END_TIME: formatDateTime(reservation.endTime),
        TOTAL_PRICE: reservation.totalPrice?.toString() || "0",
        SPACE_ADDRESS: space.address,
        SPACE_ACCESS: space.access || "",
        SITE_NAME: settings.siteName || "Myrrh Rental Space",
        LOGO_URL: settings.headerLogoUrl || "",
      },
    },
  });
} else {
  // テンプレートIDが設定されていない場合（開発環境用フォールバック）
  const html = render(ReservationConfirmationEmail({ ...props }));
  await resend.emails.send({
    from: `${senderName} <${senderEmail}>`,
    to: recipientEmail,
    subject: emailSubject,
    html,
  });
}
```

### テンプレート変数の定義

#### 予約確認メールの変数例

- `RESERVATION_ID`: 予約ID（String）
- `SPACE_NAME`: スペース名（String）
- `CUSTOMER_NAME`: 顧客名（String、「姓 名」形式）
- `START_TIME`: 開始日時（String、フォーマット済み）
- `END_TIME`: 終了日時（String、フォーマット済み）
- `TOTAL_PRICE`: 合計金額（String、フォーマット済み）
- `SPACE_ADDRESS`: スペース住所（String）
- `SPACE_ACCESS`: アクセス情報（String）
- `SITE_NAME`: サイト名（String、Settingsから取得）
- `LOGO_URL`: ロゴURL（String、Settingsから取得）

#### 管理者通知メールの変数例

- `RESERVATION_ID`: 予約ID（String）
- `SPACE_NAME`: スペース名（String）
- `CUSTOMER_NAME`: 顧客名（String）
- `CUSTOMER_EMAIL`: 顧客メールアドレス（String）
- `START_TIME`: 開始日時（String）
- `END_TIME`: 終了日時（String）
- `TOTAL_PRICE`: 合計金額（String）
- `ADMIN_LINK`: 管理画面へのリンク（String）

### テンプレートIDの管理

#### Resend APIでの管理（推奨）

- テンプレートIDはResend APIで管理され、管理画面から直接アクセス可能
- メール送信時にResend APIからテンプレートIDを取得
- パフォーマンス向上のため、Settingsテーブルにキャッシュとして保存することも可能

#### Settingsテーブルでの管理（オプション、キャッシュ用）

- `reservationConfirmationTemplateId`: 予約確認メールテンプレートID（String, nullable）
- `reservationCancelledTemplateId`: キャンセル通知メールテンプレートID（String, nullable）
- `reservationUpdatedTemplateId`: 変更通知メールテンプレートID（String, nullable）
- `adminNotificationTemplateId`: 管理者通知メールテンプレートID（String, nullable）

### Resend公式ベストプラクティス

1. **テンプレートの命名規則**: スネークケースを使用（例: `reservation-confirmation`）
2. **変数の命名規則**: 大文字のスネークケースを使用（例: `RESERVATION_ID`）
3. **変数の型定義**: 文字列、数値、日付などの型を明確に定義
4. **フォールバック値**: 変数にフォールバック値を設定（オプション）
5. **テンプレートのバージョン管理**: Draft/Published状態を活用
6. **テスト送信**: テンプレート公開前にテスト送信を実行
7. **予約済み変数名**: 以下の変数名は使用不可: `FIRST_NAME`, `LAST_NAME`, `EMAIL`, `RESEND_UNSUBSCRIBE_URL`, `contact`, `this`

### 管理画面からのテンプレート編集

詳細は [`settings.md`](./settings.md) の「メール設定 - メールテンプレート管理」セクションを参照してください。

---

## 将来の拡張性

### A/Bテスト機能

#### 実装方針（将来的に）

- メールテンプレートのA/Bテスト
- 件名のA/Bテスト
- 送信タイミングの最適化

### A/Bテスト機能

#### 実装方針（将来的に）

- メールテンプレートのA/Bテスト
- 件名のA/Bテスト
- 送信タイミングの最適化

### 多言語対応

#### 実装方針（将来的に）

- メールテンプレートの多言語対応
- 言語設定に基づいた自動切り替え
- 翻訳管理機能

### スケジュール送信

#### 実装方針（将来的に）

- リマインダーメールのスケジュール送信
- 予約前日のリマインダー
- 予約当日のリマインダー

---

## 参考資料

### プロジェクトドキュメント

- [`CLAUDE.md`](../CLAUDE.md) - プロジェクト全体の仕様書
- [`README.md`](./README.md) - 機能要件
- [`API.md`](../guides/coding-standards.md) - API仕様
- [`ARCHITECTURE.md`](../architecture/ARCHITECTURE.md) - システムアーキテクチャ
- [`SECURITY.md`](../security/README.md) - セキュリティポリシー

### 外部リソース

- [Resend Documentation](https://resend.com/docs)
- [React Email Documentation](https://react.email)
- [Resend API Reference](https://resend.com/docs/api-reference/emails)
- [Email Best Practices](https://www.campaignmonitor.com/dev-resources/guides/email-marketing-best-practices/)

---

## 更新履歴

- **2026-01-08**: ドキュメント相互参照パスを修正（SECURITY.md、API.md、ARCHITECTURE.mdへのパスを正しいディレクトリに変更）
- **2026-01-06**: Resendテンプレート機能の統合方法を追加、管理画面からのテンプレート編集機能を追加
- **2026-01-05**: 初版作成、メール送信機能の要件定義を完了
