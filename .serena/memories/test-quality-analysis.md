# テスト品質分析レポート

## 1. テストファイル数（2026年2月11日時点）

### テスト構成
- **Unit Tests**: 38ファイル（14,931行）
- **Integration Tests**: 33ファイル（15,106行）
- **E2E Tests**: 11ファイル（7,428行）
- **合計**: 82テストファイル、37,465行

### テストフレームワーク
- **Bun Test**: Unit + Integration
- **Playwright**: E2E

---

## 2. Server Actions テストカバレッジ

### 完全にテストされている Admin Actions（21個）
✅ announcement-bar.ts
✅ api-keys.ts
✅ coupon.ts
✅ customer.ts
✅ faq.ts
✅ inquiry.ts
✅ instagram.ts
✅ location.ts
✅ media.ts
✅ navigation.ts
✅ news.ts
✅ page.ts
✅ page-section.ts
✅ post.ts
✅ reservation.ts
✅ space.ts
✅ space-category.ts
✅ staff-invitation.ts
✅ terms.ts
✅ user.ts

### テストされていない Admin Actions（7個）※重要度別
1. **audit-log.ts** ⚠️ 高
   - 監査ログの記録・検索機能
   - 現在の実装: logAction()関数で記録されているが、取得/フィルタ機能をテストできていない

2. **editor-comment.ts** ⚠️ 中
   - Lexical エディタのコメント機能
   - Server Action として実装されているが、コメント追加/削除のテストがない

3. **post-comment.ts** ⚠️ 中
   - ブログポストのコメント機能
   - 公開ページから送信されるコメント処理

4. **fetch-ogp.ts** ⚠️ 低
   - URLからOGP情報を取得
   - 外部API呼び出しため、モック複雑

5. **homepage-settings.ts** ⚠️ 高
   - ホームページセクション設定
   - DB駆動ホームページの中核機能

6. **ical-tokens.ts** ⚠️ 中
   - iCal フィード用トークン管理
   - 認可・キャッシュ関連のテストが必要

7. **dashboard.ts** ⚠️ 低
   - ダッシュボードデータ取得
   - 統計データのみで、単純なSELECT

### 設定系 Actions のテスト（5個すべて実装）
✅ settings/basic.ts
✅ settings/business.ts
✅ settings/discount.ts
✅ settings/other.ts
✅ settings/stripe.ts

注: 設定系の細部カバレッジは settings-*.test.ts で分割実装

---

## 3. バリデーションテストカバレッジ

### 実装済みバリデーションテスト（22個）
✅ admin-reservation.test.ts
✅ api-keys.test.ts
✅ auth.test.ts
✅ comment.test.ts
✅ coupon.test.ts
✅ customer.test.ts
✅ enums.test.ts
✅ faq.test.ts
✅ homepage-section.test.ts
✅ instagram.test.ts
✅ location.test.ts
✅ media.test.ts
✅ news.test.ts
✅ page.test.ts
✅ post.test.ts
✅ section.test.ts
✅ section-design.test.ts
✅ space.test.ts
✅ space-category.test.ts
✅ staff-invitation.test.ts
✅ stripe.test.ts
✅ terms.test.ts
✅ user.test.ts

### テストされていないバリデーション（4個）
❌ search-params.ts
  - nuqs パーサー定義のみで、フロントエンド層でテスト
  
❌ seo.ts
  - OGP/メタ情報バリデーション
  - 各モデルのSEOフィールドに含まれるが、独立テストなし

❌ sidebar.ts
  - サイドバー構成スキーマ（削除対象？）
  
❌ comment.ts (※インポート重複)
  - コメントバリデーション

---

## 4. ユーティリティ関数テストカバレッジ

### テストされている（10個）
✅ action-helpers.ts
✅ auth.ts
✅ crypto.ts
✅ google-calendar.ts
✅ json-validators.ts
✅ permissions.ts
✅ pricing.ts
✅ serialize.ts
✅ server-action-helpers.ts
✅ turnstile.ts

### テストされていない重要関数（18個）
❌ announcement-bar-utils.ts
  - アナウンスバー表示ロジック

❌ api-keys.ts
  - APIキー管理ユーティリティ
  
❌ async-utils.ts
  - 非同期ユーティリティ
  
❌ calendar-sync.ts
  - Googleカレンダー同期ロジック
  - キャッシュ・エラーハンドリング重要
  
❌ cloudflare.ts
  - Cloudflare R2 ストレージ連携
  
❌ email-service.ts
  - メール送信ロジック
  
❌ form-data.ts
  - フォームデータ処理
  
❌ google-oauth-credentials.ts
  - Google OAuth認証情報管理

❌ logger.ts / errors
  - ロギング・エラーハンドリング
  
❌ rate-limit.ts
  - Rate Limiting ロジック
  
❌ section-defaults.ts
  - セクションデフォルト値
  
❌ slug-validation.ts
  - スラッグ生成・検証
  
❌ terms-templates.ts
  - 利用規約テンプレート
  
❌ utils.ts
  - 汎用ユーティリティ
  
❌ email.ts
  - メール送信

---

## 5. モック品質評価

### 実装済みモック（7種類）
✅ **auth.ts** (80行)
  - createMockUser / createMockSession
  - setMockSession / clearMockSession
  - 品質: 良好。role別のセッション作成可能

✅ **prisma.ts** (160行)
  - Prismaクライアントのモック
  - 主要モデル (user, post, space等) のモック実装
  - 品質: 中程度。実際のクエリ結果構造を模擬

✅ **google-calendar.ts** (165行)
  - Google Calendar APIモック
  - イベント同期のシミュレーション

✅ **stripe.ts** (180行)
  - Stripe API モック
  - 決済処理のシミュレーション

✅ **resend.ts** (75行)
  - Resend メール送信 API モック

✅ **next.ts** (35行)
  - Next.js 組み込みモック（headers, cookies等）

✅ **index.ts** (15行)
  - モック統合エクスポート

### モック品質の課題
- auth.ts: Better Auth実装との同期不足（セッション構造が簡略化）
- prisma.ts: 全モデル網羅されていない（一部スタブのみ）
- google-calendar.ts: エラーケースのモック不足
- stripe.ts: Webhook処理のモック不足

---

## 6. E2E テストカバレッジ

### 実装済み E2E テスト（11個）

**認証系** (2個)
✅ e2e/auth.spec.ts (520行)
  - ログイン / ログアウト
  - セッション管理
  
✅ e2e/reservation.spec.ts (680行)
  - 予約フロー

**公開ページ** (3個)
✅ e2e/public/homepage.spec.ts
  - ホームページレンダリング
  
✅ e2e/public/contact.spec.ts
  - お問い合わせフォーム送信
  
✅ e2e/public/blog.spec.ts
  - ブログ閲覧・フィルタ

**管理画面** (6個)
✅ e2e/admin/users.spec.ts
  - ユーザー管理
  
✅ e2e/admin/spaces.spec.ts
  - スペース管理
  
✅ e2e/admin/reservations.spec.ts
  - 予約管理・カレンダービュー
  
✅ e2e/admin/news.spec.ts
  - ニュース管理
  
✅ e2e/admin/inquiries.spec.ts
  - 問い合わせ管理
  
✅ e2e/admin/blog.spec.ts
  - ブログ記事管理

### E2E テストされていない機能
❌ ページ編集・セクション管理
  - Lexical エディタの複雑な操作フロー未テスト

❌ メディア管理
  - ファイルアップロード・削除フロー

❌ 設定ページ
  - 各種設定の保存・読み込み動作

❌ FAQと利用規約
  - インラインエディタのテスト未実装

---

## 7. テスト品質スコア（5段階）

| カテゴリ | スコア | コメント |
|---------|--------|---------|
| **Unit Tests** | ⭐⭐⭐⭐ | バリデーション・ユーティリティ充実。ただしEdge Cases不足 |
| **Integration Tests** | ⭐⭐⭐⭐ | Server Actions大部分カバー。監査・ホームページ設定未テスト |
| **E2E Tests** | ⭐⭐⭐ | 主要フロー実装。エディタ・アップロード未テスト |
| **全体** | ⭐⭐⭐⭐ | 約75-80%のカバレッジ推定。重要機能は網羅 |

---

## 8. 優先実装すべきテスト（推奨順）

### 🔴 P0（実装必須）
1. **homepage-settings.ts Integration Test**
   - DB駆動ホームページの中核。セクション保存・取得のテスト

2. **audit-log.ts Integration Test**
   - 監査ログ取得・フィルタ機能のテスト
   - 権限チェックと組み合わせたテスト

3. **calendar-sync.ts Unit Test**
   - Google Calendar 同期ロジック
   - タイムゾーン・重複検出ロジック

4. **E2E: ページ編集フロー**
   - Lexical エディタの操作テスト
   - セクション追加・削除・並び替え

### 🟠 P1（推奨）
1. **editor-comment.ts Integration Test**
   - エディタコメント機能

2. **email-service.ts Unit Test**
   - メール送信成功・失敗ケース

3. **E2E: メディア管理**
   - ファイルアップロード・プレビュー

4. **search-params.ts Unit Test**
   - nuqs パーサーの型安全性検証

### 🟡 P2（余裕があれば）
1. post-comment.ts Integration Test
2. ical-tokens.ts Integration Test
3. E2E: 設定ページ一式
4. E2E: FAQ・利用規約管理

---

## 9. テスト実行コマンド

```bash
# 全テスト実行
bun run test:all

# Unit のみ
bun run test __tests__/unit

# Integration のみ
bun run test __tests__/integration

# 特定ファイル
bun run test __tests__/unit/lib/pricing.test.ts

# E2E（UIモード）
bun run e2e:ui

# E2E（ヘッドレス）
bun run e2e:headless
```
