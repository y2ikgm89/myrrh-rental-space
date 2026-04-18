---
name: stripe-debug
description: >
  Stripe 決済設定・接続の診断スキル。Stripe キーの設定状況確認、接続テスト失敗の原因特定、
  Webhook 設定のチェックを行う。Stripe 関連のエラーや「決済が動かない」場面で使用する。
---

# Stripe デバッグ

> Myrrh Rental Space の Stripe 統合診断ガイド

## アーキテクチャ概要

```
設定ソース（優先順位）:
  1. 環境変数 STRIPE_SECRET_KEY  →  Cloud Run で直接設定
  2. DB settings.stripeSecretKey  →  管理画面 > 設定 > 決済 で保存（暗号化済み）

キー形式:
  sk_test_*  →  テストモード
  sk_live_*  →  本番モード
  pk_test_*  / pk_live_*  →  公開可能キー（クライアント用）
  whsec_*    →  Webhook シークレット
```

**関連ファイル**:

| ファイル                                                               | 役割                                                 |
| ---------------------------------------------------------------------- | ---------------------------------------------------- |
| `src/app/(admin)/admin/(dashboard)/_shared/lib/stripe.ts`              | Stripe クライアント生成・接続テスト（`server-only`） |
| `src/app/(admin)/admin/(dashboard)/_shared/lib/stripe-shared.ts`       | キー形式バリデーション（クライアント safe）          |
| `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/stripe.ts` | 設定保存・接続テスト Server Action                   |
| `src/app/(admin)/admin/(dashboard)/_shared/lib/validations/stripe.ts`  | Zod スキーマ                                         |

---

## 診断ステップ

### Step 1 — 設定ソースの確認

```bash
# 環境変数が設定されているか確認（Cloud Run コンソール or ローカル .env.local）
# ローカル開発時
grep STRIPE .env.local 2>/dev/null || echo "STRIPE keys not in .env.local"

# DB の設定状況（Prisma Studio で確認するか、以下で確認）
# bun run db:studio → Settings テーブル > singleton レコード
```

**確認項目**:

- `stripeSecretKey`: 暗号化文字列が入っているか（`null` なら未設定）
- `stripePublishableKey`: 公開可能キーが入っているか
- `stripeWebhookSecret`: Webhook シークレットが入っているか
- `stripeEnabled`: `true` になっているか

### Step 2 — キー形式の検証

```typescript
// stripe-shared.ts の isValidSecretKey / isTestKey で検証
// sk_test_* または sk_live_* であること
// よくあるミス: sk_ の前後にスペース、改行が含まれる
```

**確認**: 管理画面 > 設定 > 決済 の接続テストボタンで `testStripeConnection()` が呼ばれる。
エラーが出る場合はそのメッセージを確認する。

### Step 3 — 接続テスト失敗の原因別対処

| エラーメッセージ                                  | 原因                             | 対処                                             |
| ------------------------------------------------- | -------------------------------- | ------------------------------------------------ |
| `No API key found`                                | 環境変数もDBも未設定             | Cloud Run 環境変数 or 管理画面で設定             |
| `Invalid API Key provided`                        | キーのフォーマット不正・削除済み | Stripe ダッシュボードで新しいキーを発行          |
| `You are using a restricted key`                  | Restricted Key で権限不足        | Secret Key (`sk_*`) に変更                       |
| `This account cannot currently make live charges` | テストキーを本番で使用           | テスト環境では `sk_test_*`、本番では `sk_live_*` |
| Timeout / `fetch failed`                          | Cloud Run からの外部アクセス不可 | Cloud Run の VPC 設定・ファイアウォールを確認    |
| `auth.ts` 認証エラー                              | Better Auth のセッション期限切れ | 再ログイン                                       |

### Step 4 — Webhook の確認（将来実装時）

現状、Stripe Webhook ハンドラーは未実装（`src/app/api/webhooks/google-calendar/` のみ存在）。
Webhook を実装する場合の注意:

```typescript
// Webhook ハンドラーでのシグネチャ検証（必須）
// whsec_* シークレットで stripe.webhooks.constructEvent() を呼ぶ
// STRIPE_WEBHOOK_SECRET は Cloud Run の環境変数に設定する

// ローカルテスト: Stripe CLI でフォワード
// stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

### Step 5 — Cloud Run 環境変数の確認

```bash
# Cloud Run でデプロイ済みサービスの環境変数一覧
gcloud run services describe myrrh-rental-space --region=asia-northeast1 --format="yaml" | grep -A5 "env:"

# または Cloud Console:
# Cloud Run > サービス > 環境変数タブ
```

**必要な環境変数（Stripe 関連）**:

- `STRIPE_SECRET_KEY` — オプション（DBで管理する場合は不要）
- `STRIPE_WEBHOOK_SECRET` — Webhook 使用時は必須

---

## テストモード vs 本番モード

| 確認方法                           | 内容                                     |
| ---------------------------------- | ---------------------------------------- |
| キープレフィックス                 | `sk_test_*` = テスト、`sk_live_*` = 本番 |
| `isTestKey()` 関数                 | `stripe-shared.ts` に実装済み            |
| Stripe ダッシュボード              | テストモードのトグルで確認               |
| 接続テスト結果の `mode` フィールド | `'test'` または `'live'` が返る          |

**注意**: 本番デプロイ前に必ず本番キー（`sk_live_*`）に切り替える。
テストキーで本番決済は処理されない（エラーにはならず、Stripe 側でフィルタされる）。

---

## コードを修正する際の注意

- **`stripe.ts` は `server-only`** — Client Component から import 禁止
- **キーは必ず暗号化して DB に保存** — `encrypt()` を使用（`src/shared/lib/crypto.ts`）
- **API バージョン**: `2026-01-28.clover`（`createStripeClient()` に固定済み）
- **型安全**: `Stripe` 型は `stripe` パッケージから import（`import Stripe from 'stripe'`）

---

## 禁止事項

- `STRIPE_SECRET_KEY` を `.env` ファイルに commit しない（`.gitignore` 確認）
- Stripe キーをログに出力しない（`logError` の `context` に含めない）
- テストキーで本番環境をテストしない
