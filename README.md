# Myrrh Rental Space

レンタルスペースの予約・問い合わせと、コンテンツ／予約を運用する管理画面を備えた Web アプリケーションです。公開サイト（`(public)`）と管理ダッシュボード（`(admin)`）を単一の Next.js App Router プロジェクトで提供します。

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)
![React](https://img.shields.io/badge/React-19-149eca?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178c6?logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7-2d3748?logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169e1?logo=postgresql&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-1.3-fbf0df?logo=bun&logoColor=black)
![License](https://img.shields.io/badge/license-Proprietary-lightgrey)

> **Status:** Private / Proprietary — 本リポジトリは非公開のプロプライエタリプロジェクトです。

## 目次

- [主な機能](#主な機能)
- [技術スタック](#技術スタック)
- [前提条件](#前提条件)
- [セットアップ](#セットアップ)
- [環境変数](#環境変数)
- [開発コマンド](#開発コマンド)
- [プロジェクト構成](#プロジェクト構成)
- [テスト](#テスト)
- [デプロイ](#デプロイ)
- [ライセンス](#ライセンス)

## 主な機能

- **公開サイト** — スペース紹介・予約・問い合わせ、ブログ／カテゴリ／タグ、FAQ などの公開ページ
- **管理ダッシュボード** — スペース・予約・顧客・問い合わせ・コンテンツ（ページ／セクション）の管理
- **認証** — [better-auth](https://www.better-auth.com/) によるロールベースアクセス制御（`SUPER_ADMIN` / `ADMIN` / `EDITOR` / `VIEWER` / `USER` / `CUSTOMER`）
- **決済** — Stripe による予約決済
- **メール** — Resend ＋ React Email によるトランザクションメール送信
- **画像ストレージ** — Cloudflare R2（S3 互換）
- **外部連携** — Google Analytics / Google Calendar、Instagram、iCal フィード
- **品質** — Playwright E2E、axe-core によるアクセシビリティ検証、Lighthouse CI

## 技術スタック

| 領域                        | 採用技術                                                                    |
| --------------------------- | --------------------------------------------------------------------------- |
| フレームワーク              | [Next.js 16](https://nextjs.org/)（App Router, Turbopack, React Compiler）  |
| 言語 / UI                   | TypeScript 6 / [React 19](https://react.dev/)                               |
| スタイリング                | [Tailwind CSS 4](https://tailwindcss.com/)、Radix UI、tailwind-variants     |
| データベース                | PostgreSQL 16 ＋ [Prisma 7](https://www.prisma.io/)（`@prisma/adapter-pg`） |
| 認証                        | better-auth                                                                 |
| バリデーション              | Zod 4、Conform                                                              |
| 決済 / メール               | Stripe / Resend ＋ React Email                                              |
| ストレージ                  | Cloudflare R2（`@aws-sdk/client-s3`）                                       |
| ランタイム / パッケージ管理 | [Bun 1.3](https://bun.sh/)                                                  |
| テスト                      | Playwright、Bun テストランナー、axe-core、Lighthouse CI                     |
| Lint / Format               | ESLint 10、Prettier、lefthook                                               |

## 前提条件

- [Bun](https://bun.sh/) `1.3.13` 以上（`package.json` の `packageManager` に準拠）
- PostgreSQL `16`（ローカル、または Neon などのマネージド DB）
- 本番相当の動作には Cloudflare R2、Resend、Stripe、Cloudflare Turnstile などの各サービスの認証情報

## セットアップ

```bash
# 1. 依存関係をインストール（postinstall で Prisma Client を自動生成）
bun install

# 2. 環境変数ファイルを作成
#   PowerShell:
Copy-Item .env.example .env.local
#   bash/zsh:
cp .env.example .env.local

# 3. .env.local を編集（最低限 DATABASE_URL と BETTER_AUTH_SECRET を設定）
#   BETTER_AUTH_SECRET の生成例:
openssl rand -base64 32

# 4. データベースにスキーマを反映
bun run db:migrate      # マイグレーションを適用（開発）
bun run db:seed         # 初期データを投入（任意）

# 5. 開発サーバーを起動
bun run dev             # http://localhost:3000
```

## 環境変数

`.env.example` を `.env.local` にコピーして設定します。代表的な変数は以下のとおりです（完全な一覧は [`.env.example`](.env.example) を参照）。

| 変数                                                                                               | 必須 | 用途                                                        |
| -------------------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------- |
| `DATABASE_URL`                                                                                     | ✅   | PostgreSQL 接続文字列                                       |
| `BETTER_AUTH_SECRET`                                                                               | ✅   | better-auth のセッション署名鍵（`openssl rand -base64 32`） |
| `NEXT_PUBLIC_BASE_URL` / `NEXT_PUBLIC_APP_URL`                                                     | ✅   | サイトの公開 URL                                            |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` / `R2_PUBLIC_URL` | 本番 | Cloudflare R2 画像ストレージ                                |
| `ENCRYPTION_KEY`                                                                                   | 本番 | 機密値の暗号化鍵（`openssl rand -hex 32`）                  |
| `CRON_SECRET`                                                                                      | 本番 | cron エンドポイント保護用シークレット                       |
| `ADMIN_LOGIN_TOKEN`                                                                                | 本番 | 管理ログイン用トークン                                      |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`                                                               | 本番 | Server Actions の暗号化鍵（マルチインスタンス時必須）       |
| `RESEND_API_KEY`                                                                                   | 任意 | メール送信                                                  |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID`                                                                    | 任意 | Google Analytics                                            |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`                                                        | 任意 | Google OAuth / Calendar                                     |
| `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` / `INSTAGRAM_REDIRECT_URI`                             | 任意 | Instagram 連携                                              |

## 開発コマンド

すべて Bun のスクリプト経由で実行します（`package.json` の `scripts` が SSoT）。

| コマンド                   | 説明                                               |
| -------------------------- | -------------------------------------------------- |
| `bun run dev`              | 開発サーバー（Turbopack）を起動                    |
| `bun run build`            | 本番ビルド                                         |
| `bun run start`            | ビルド済みアプリを起動                             |
| `bun run lint`             | ESLint（`src` / `prisma`）                         |
| `bun run type-check`       | 型チェック（Prisma 生成＋`tsc --noEmit`）          |
| `bun run format`           | Prettier で整形                                    |
| `bun run validate`         | `type-check` ＋ `lint`（コミット前の標準チェック） |
| `bun run db:migrate`       | マイグレーション適用（開発）                       |
| `bun run db:push`          | スキーマを DB に直接反映                           |
| `bun run db:seed`          | シードデータ投入                                   |
| `bun run db:studio`        | Prisma Studio を起動                               |
| `bun run test:unit`        | ユニットテスト                                     |
| `bun run test:integration` | 統合テスト                                         |
| `bun run e2e`              | Playwright E2E テスト                              |
| `bun run lhci`             | Lighthouse CI                                      |
| `bun run docs`             | TypeDoc でドキュメント生成                         |

## プロジェクト構成

```
.
├── src/
│   ├── app/
│   │   ├── (public)/     # 公開サイト
│   │   ├── (admin)/      # 管理ダッシュボード
│   │   └── api/          # ルートハンドラ（cron、webhook など）
│   └── shared/           # 横断モジュール
│       ├── components/   # UI コンポーネント
│       ├── db/           # Prisma クライアント・クエリ
│       ├── domain/       # ドメインロジック
│       ├── emails/       # React Email テンプレート
│       ├── lib/          # ユーティリティ・設定
│       └── ...           # contexts / data / hooks / styles / types
├── prisma/
│   ├── schema.prisma     # データモデル定義
│   ├── migrations/       # マイグレーション履歴
│   └── seed.ts           # シードスクリプト
├── e2e/                  # Playwright E2E テスト
├── __tests__/            # ユニット・統合テスト
├── scripts/              # 補助スクリプト
├── Dockerfile            # 本番イメージ
└── cloudbuild.yaml       # Google Cloud Build パイプライン
```

## テスト

```bash
bun run test:unit          # ユニットテスト
bun run test:integration   # 統合テスト
bun run test:all           # ユニット＋統合
bun run e2e                # Playwright E2E
bun run e2e:ui             # Playwright UI モード
```

アクセシビリティは Playwright ＋ axe-core で、パフォーマンスは Lighthouse CI（`bun run lhci`）で検証します。

## デプロイ

[`Dockerfile`](Dockerfile) でコンテナイメージをビルドし、[`cloudbuild.yaml`](cloudbuild.yaml) の Google Cloud Build パイプライン経由で Cloud Run にデプロイする構成です。ローカルでのイメージ検証は以下で行えます。

```bash
docker compose build
```

本番ではマイグレーションを別ジョブとして適用したうえで、上記の「本番」環境変数を Secret として注入します。

## ライセンス

Proprietary（非公開）。`package.json` で `"private": true` を指定しており、本リポジトリのコードは権利者の許諾なく利用・再配布できません。
