# レンタルスペース管理システム

レンタルスペース向けの予約・管理システム。デザイン性の高い公開ページと、実用的な管理画面を提供します。

## 技術スタック

- **React** 19.2.3
- **Next.js** 16.1.1 (App Router)
- **TypeScript** 5.9.3
- **Bun** 1.3.5
- **Prisma** 7.2.0
- **Zod** 4.3.5
- **nuqs** 2.8.5
- **Tailwind CSS** 4.1.18
- **Auth.js** 5.0.0-beta.30
- **Supabase** (PostgreSQL)
- **Google Cloud Run** (デプロイ)

> **Note**: 詳細なバージョン情報とセキュリティ情報については、[`AGENTS.md`](./AGENTS.md)と[`docs/TECH_STACK_VERSIONS.md`](./docs/TECH_STACK_VERSIONS.md)を参照してください。

## プロジェクト構成

詳細は [docs/PROJECT_STRUCTURE.md](./docs/PROJECT_STRUCTURE.md) を参照してください。

## ドキュメント

- **[AGENTS.md](./AGENTS.md)**: プロジェクト仕様書・要件定義
- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)**: システムアーキテクチャ
- **[docs/API.md](./docs/API.md)**: API仕様書
- **[docs/DATABASE_DESIGN.md](./docs/DATABASE_DESIGN.md)**: データベース設計
- **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)**: デプロイメント手順
- **[docs/FEATURE_REQUIREMENTS.md](./docs/FEATURE_REQUIREMENTS.md)**: 機能要件
- **[docs/PROJECT_STRUCTURE.md](./docs/PROJECT_STRUCTURE.md)**: プロジェクト構造
- **[docs/SECURITY.md](./docs/SECURITY.md)**: セキュリティポリシー
- **[docs/EMAIL_REQUIREMENTS.md](./docs/EMAIL_REQUIREMENTS.md)**: メール送信機能要件
- **[docs/SETTINGS_REQUIREMENTS.md](./docs/SETTINGS_REQUIREMENTS.md)**: サイト設定画面要件
- **[docs/JWT_AUTH_REQUIREMENTS.md](./docs/JWT_AUTH_REQUIREMENTS.md)**: JWT認証要件
- **[docs/CLOUDFLARE_CDN.md](./docs/CLOUDFLARE_CDN.md)**: Cloudflare CDN統合ガイド
- **[docs/BLOG_REQUIREMENTS.md](./docs/BLOG_REQUIREMENTS.md)**: ブログ機能詳細要件
- **[docs/TECH_STACK_VERSIONS.md](./docs/TECH_STACK_VERSIONS.md)**: 技術スタック最新バージョン情報
- **[docs/BUN_RUNTIME.md](./docs/BUN_RUNTIME.md)**: Bunランタイムガイド
- **[docs/TURBOPACK_REQUIREMENTS.md](./docs/TURBOPACK_REQUIREMENTS.md)**: Turbopack要件定義
- **[docs/DOCKER.md](./docs/DOCKER.md)**: Docker設定ガイド
- **[docs/CONSISTENCY_CHECK.md](./docs/CONSISTENCY_CHECK.md)**: プロジェクト整合性チェックレポート
- **[docs/BEST_PRACTICES.md](./docs/BEST_PRACTICES.md)**: ベストプラクティスガイド（Next.js 16、React 19、Prisma 7、Auth.js 5）
- **[docs/CACHING_STRATEGY.md](./docs/CACHING_STRATEGY.md)**: キャッシング戦略ガイド（Next.js 16 App Router）
- **[docs/CUSTOMER_NAME_DESIGN.md](./docs/CUSTOMER_NAME_DESIGN.md)**: 顧客名設計ガイド
- **[docs/TURNSTILE_REQUIREMENTS.md](./docs/TURNSTILE_REQUIREMENTS.md)**: Cloudflare Turnstile要件定義
- **[docs/DDOS_PROTECTION_REQUIREMENTS.md](./docs/DDOS_PROTECTION_REQUIREMENTS.md)**: DDoS対策要件定義
- **[docs/ABUSE_PROTECTION_REQUIREMENTS.md](./docs/ABUSE_PROTECTION_REQUIREMENTS.md)**: 荒らし対策要件定義
- **[docs/NUQS_REQUIREMENTS.md](./docs/NUQS_REQUIREMENTS.md)**: nuqsライブラリ要件定義
- **[docs/EXTENSIBILITY_PLAN.md](./docs/EXTENSIBILITY_PLAN.md)**: 拡張性計画
- **[docs/EXTENSIBILITY_PLAN_CONSISTENCY_CHECK.md](./docs/EXTENSIBILITY_PLAN_CONSISTENCY_CHECK.md)**: 拡張性計画整合性チェック
- **[docs/VERIFICATION_REPORT.md](./docs/VERIFICATION_REPORT.md)**: 検証レポート
- **[docs/DOCUMENT_CONSISTENCY_REPORT.md](./docs/DOCUMENT_CONSISTENCY_REPORT.md)**: ドキュメント整合性チェックレポート

## セットアップ

### 前提条件

- Bun 1.3.5以上
- Supabaseアカウント
- Google Cloudアカウント（デプロイ時）

### インストール

```bash
# 依存関係のインストール
bun install

# 環境変数の設定
cp .env.example .env.local
# .env.localを編集して必要な値を設定

# Prismaマイグレーション
bunx prisma migrate dev

# 開発サーバー起動
bun run dev
```

### 環境変数

`.env.example`を参照してください。以下の変数が必要です：

- `DATABASE_URL`: Supabase PostgreSQL接続URL
- `NEXTAUTH_SECRET`: Auth.js用シークレット
- `NEXTAUTH_URL`: アプリケーションURL
- `SUPABASE_URL`: SupabaseプロジェクトURL
- `SUPABASE_ANON_KEY`: Supabase匿名キー
- `SUPABASE_SERVICE_ROLE_KEY`: Supabaseサービスロールキー

## 開発

```bash
# 開発サーバー起動
bun run dev

# ビルド
bun run build

# 本番モードで起動
bun run start

# Prisma Studio起動
bunx prisma studio

# リント
bun run lint

# 型チェック
bun run type-check
```

## デプロイ

詳細は [AGENTS.md](./AGENTS.md) の「デプロイ戦略」セクションを参照してください。

### Google Cloud Runへのデプロイ

1. Dockerイメージをビルド
2. Artifact Registryにプッシュ
3. Cloud Runにデプロイ
4. Secret Managerから環境変数を設定
5. Prismaマイグレーションを実行

## ライセンス

[ライセンス情報を記載]
