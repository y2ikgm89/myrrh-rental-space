# 002: Stripe決済設定 + 画像アップロード統合

## 概要

管理画面に決済設定機能（Stripe）を追加し、TipTapエディタの画像アップロードを強化する。

## 実装内容

### 1. 画像アップロード統合（小規模）

**変更ファイル**:
- `src/components/admin/editor/EditorToolbar.tsx`

**内容**:
- 既存のURL入力のみのダイアログを`ImageUploadDialog`に置き換え
- Supabase Storageへのアップロード機能を統合

### 2. Stripe決済設定（中規模）

**新規作成ファイル**:
| ファイル | 説明 |
|---------|------|
| `src/lib/crypto.ts` | AES-256-GCM暗号化/復号化ユーティリティ |
| `src/lib/stripe.ts` | Stripe初期化・接続テスト・ヘルパー関数 |
| `src/lib/validations/stripe.ts` | Zodバリデーションスキーマ |
| `src/app/admin/settings/_components/sections/StripeSection.tsx` | Stripe設定UIセクション |
| `src/app/admin/settings/_components/tabs/PaymentTab.tsx` | 決済タブコンポーネント |

**変更ファイル**:
| ファイル | 変更内容 |
|---------|---------|
| `prisma/schema.prisma` | Stripe関連フィールド追加 |
| `src/actions/admin/settings.ts` | Stripe設定アクション追加 |
| `src/app/admin/settings/_components/SettingsTabs.tsx` | 決済タブ追加 |
| `package.json` | stripeパッケージ追加 |

## アーキテクチャ決定

| 項目 | 決定 |
|------|------|
| タブ構成 | 新規「決済」タブを7番目に追加 |
| APIキー保存 | 環境変数優先 + DB暗号化保存 |
| 暗号化方式 | AES-256-GCM (Node.js crypto) |
| スコープ | 設定管理・接続テストまで（決済処理は別タスク） |

## Prismaスキーマ追加

```prisma
model Settings {
  // Stripe Payment Settings
  stripeEnabled          Boolean  @default(false)
  stripeTestMode         Boolean  @default(true)
  stripePublishableKey   String?
  stripeSecretKey        String?  @db.Text  // 暗号化
  stripeWebhookSecret    String?  @db.Text  // 暗号化
  stripeAccountId        String?
  stripeCurrency         String   @default("jpy")
  stripeLastTestedAt     DateTime?
  stripeConnectionStatus String?
}
```

## セキュリティ対策

1. **暗号化**: シークレットキーはAES-256-GCMで暗号化してDB保存
2. **マスク表示**: クライアントには`sk_test_xxxx...xxxx`形式で返却
3. **環境変数優先**: `STRIPE_SECRET_KEY`があればDB設定より優先
4. **入力保護**: `type="text"` + CSS text-security + `autoComplete="off"`でブラウザ拡張対策
5. **XSS対策**: `maskSecretKey()`に正規表現バリデーション追加

## 検証結果

- type-check: 通過
- lint: 通過（既存警告のみ）
- build: DB接続必要（コード起因のエラーなし）

## 残タスク

- DBマイグレーション: `bunx prisma migrate dev --name add_stripe_settings`

## ステータス

**完了** (2026-01-10)
