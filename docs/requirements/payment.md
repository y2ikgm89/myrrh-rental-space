# 決済機能要件

## 概要

レンタルスペース予約システムにおけるオンライン決済機能の要件定義。

## Phase 1: 決済設定管理（実装済み）

### 機能要件

#### 1. Stripe設定管理

| 機能 | 説明 | ステータス |
|------|------|-----------|
| 有効/無効切り替え | Stripe決済の有効化トグル | 実装済み |
| テストモード切り替え | test/live モードの切り替え | 実装済み |
| APIキー設定 | 公開可能キー・シークレットキーの設定 | 実装済み |
| Webhookシークレット | Webhook署名検証用シークレット設定 | 実装済み |
| 通貨設定 | JPY/USD/EUR から選択 | 実装済み |
| 接続テスト | Stripe APIへの接続確認 | 実装済み |

#### 2. セキュリティ要件

| 要件 | 実装方法 |
|------|---------|
| シークレットキー暗号化 | AES-256-GCM で暗号化してDB保存 |
| 環境変数優先 | `STRIPE_SECRET_KEY` が設定されていればDB設定より優先 |
| マスク表示 | クライアントには `sk_test_xxxx...xxxx` 形式で返却 |
| ブラウザ拡張対策 | `type="text"` + CSS text-security + `autoComplete="off"` |
| XSS対策 | 入力値の正規表現バリデーション |

### 技術仕様

#### Prismaスキーマ

```prisma
model Settings {
  stripeEnabled          Boolean  @default(false)
  stripeTestMode         Boolean  @default(true)
  stripePublishableKey   String?
  stripeSecretKey        String?  @db.Text
  stripeWebhookSecret    String?  @db.Text
  stripeAccountId        String?
  stripeCurrency         String   @default("jpy")
  stripeLastTestedAt     DateTime?
  stripeConnectionStatus String?
}
```

#### 暗号化仕様

- アルゴリズム: AES-256-GCM
- キー長: 256bit（環境変数 `ENCRYPTION_KEY` で設定）
- IV: 16バイト（ランダム生成）
- AuthTag: 16バイト
- フォーマット: `enc:<base64(iv)>:<base64(encrypted)>:<base64(authTag)>`

---

## Phase 2: 決済処理（未実装）

### 予定機能

| 機能 | 説明 |
|------|------|
| Checkout Session作成 | 予約確定時にStripe Checkout Sessionを生成 |
| 決済完了処理 | Webhook経由で決済完了を受信・予約ステータス更新 |
| 返金処理 | キャンセル時の返金処理 |
| 領収書発行 | Stripe Receipt URLの表示 |

### Webhook対応イベント

- `checkout.session.completed`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `charge.refunded`

---

## Phase 3: 管理機能（未実装）

### 予定機能

| 機能 | 説明 |
|------|------|
| 決済履歴一覧 | 管理画面での決済履歴表示 |
| 売上レポート | 期間別売上集計 |
| 返金管理 | 管理画面からの返金操作 |

---

## 環境変数

| 変数名 | 必須 | 説明 |
|--------|------|------|
| `ENCRYPTION_KEY` | Yes | 暗号化キー（64文字の16進数） |
| `STRIPE_SECRET_KEY` | No | Stripeシークレットキー（環境変数優先時） |
| `STRIPE_WEBHOOK_SECRET` | No | Webhookシークレット（将来用） |

---

## 関連ファイル

- `src/lib/crypto.ts` - 暗号化ユーティリティ
- `src/lib/stripe.ts` - Stripeヘルパー関数
- `src/lib/validations/stripe.ts` - バリデーションスキーマ
- `src/actions/admin/settings.ts` - 設定Server Actions
- `src/app/admin/settings/_components/sections/StripeSection.tsx` - 設定UI
