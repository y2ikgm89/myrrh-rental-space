# 007: 外部サービスAPIキー管理機能

## 概要

管理画面から外部サービスのAPIキー（Resend、Cloudflare Turnstile、Google Maps等）を安全に設定・管理できる機能を実装。

## 要件

- 全APIキーを管理画面から設定可能
- AES-256-GCM暗号化による安全な保存
- マスク表示（例：`re_1234...7890`）
- 各サービスごとの接続テスト機能
- 汎用APIキー管理（任意のサービス用）

## アーキテクチャ

### 設計方針

プリセットサービス（Resend/Turnstile/Google Maps）は専用フィールドで管理し、カスタムAPIキーはJSON型で柔軟に拡張可能な設計。

### データベース

`Settings`モデルに以下のフィールドを追加:

```prisma
// Resend Email Service
resendApiKey           String?   @db.Text // Encrypted
resendLastTestedAt     DateTime?
resendConnectionStatus String?

// Cloudflare Turnstile
turnstileSiteKey           String?
turnstileSecretKey         String?   @db.Text // Encrypted
turnstileLastTestedAt      DateTime?
turnstileConnectionStatus  String?

// Google Maps API
googleMapsApiKey           String?   @db.Text // Encrypted
googleMapsLastTestedAt     DateTime?
googleMapsConnectionStatus String?

// Custom API Keys (Generic)
customApiKeys Json? @default("{}")
```

### ファイル構成

```
src/
├── types/
│   └── api-keys.ts                    # 型定義
├── lib/
│   ├── validations/
│   │   └── api-keys.ts                # Zodスキーマ
│   └── api-keys/
│       ├── helpers.ts                 # マスク関数
│       ├── resend.ts                  # Resend接続テスト
│       ├── turnstile.ts               # Turnstile検証
│       ├── google-maps.ts             # Google Maps接続テスト
│       └── index.ts                   # バレルエクスポート
├── actions/admin/
│   └── api-keys.ts                    # Server Actions
└── app/admin/settings/_components/
    ├── sections/
    │   ├── ResendSection.tsx
    │   ├── TurnstileSection.tsx
    │   ├── GoogleMapsSection.tsx
    │   └── CustomApiKeysSection.tsx
    ├── tabs/
    │   └── ApiKeysTab.tsx
    └── shared/
        └── StatusBanner.tsx           # 共通ステータス表示
```

## 実装詳細

### 接続テスト

| サービス    | テスト方法                             |
| ----------- | -------------------------------------- |
| Resend      | `domains.list()` API呼び出し           |
| Turnstile   | キー形式検証（`0x`プレフィックス確認） |
| Google Maps | Geocoding API呼び出し（address=Tokyo） |

### セキュリティ

- 全Server Actionsで`requireAdmin()`による認証必須
- APIキーは暗号化して保存（`encrypt()`）
- 表示時はマスク処理（`maskApiKey()`）
- エラー時もテスト結果をDBに記録

### UI

設定画面に「APIキー」タブを追加:

- Resend設定セクション
- Cloudflare Turnstile設定セクション
- Google Maps設定セクション
- カスタムAPIキー管理セクション（ダイアログで追加/削除）

## テスト項目

- [ ] 各サービスのAPIキー保存・更新
- [ ] 接続テスト（成功/失敗）
- [ ] キークリア機能
- [ ] カスタムAPIキーの追加/削除
- [ ] 認証なしアクセスの拒否確認

## 完了条件

- [x] Prismaスキーマ拡張
- [x] 型定義・バリデーション
- [x] サービスライブラリ
- [x] Server Actions（認証付き）
- [x] UIコンポーネント
- [x] type-check/lint/build通過
- [x] code-reviewer実行・指摘修正

## 関連

- `src/lib/crypto.ts` - 暗号化/復号化
- `docs/architecture/` - 全体アーキテクチャ
