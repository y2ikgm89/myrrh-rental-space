# Myrrh Rental Space

レンタルスペース予約管理システム

## 技術スタック

| カテゴリ | 技術 | バージョン |
|---------|------|-----------|
| フレームワーク | Next.js (App Router) | 16.1.1 |
| UI ライブラリ | React | 19.2.3 |
| 言語 | TypeScript | 5.9.3 |
| ランタイム | Bun | 1.3.5 |
| ORM | Prisma | 7.2.0 |
| データベース | PostgreSQL | 16 |
| 認証 | Auth.js (NextAuth v5) | 5.0.0-beta.30 |
| スタイリング | Tailwind CSS | 4.x |

## 開発環境セットアップ

### 前提条件

- [Bun](https://bun.sh/) 1.3.5+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

### 1. リポジトリのクローン

```bash
git clone <repository-url>
cd myrrh-rental-space
```

### 2. 依存関係のインストール

```bash
bun install
```

### 3. 環境変数の設定

```bash
cp .env.example .env.local
```

### 4. データベースの起動

```bash
# PostgreSQL コンテナを起動
docker compose up -d

# 起動確認
docker compose ps
```

### 5. Prisma マイグレーション

```bash
# スキーマをデータベースに反映
bunx prisma migrate dev

# Prisma Client を生成
bunx prisma generate
```

### 6. 開発サーバーの起動

```bash
bun dev
```

http://localhost:3000 でアクセスできます。

## コマンド一覧

| コマンド | 説明 |
|---------|------|
| `bun dev` | 開発サーバー起動 |
| `bun run build` | プロダクションビルド |
| `bun start` | 本番サーバー起動 |
| `bun run lint` | ESLint 実行 |
| `bun run type-check` | TypeScript 型チェック |
| `bunx prisma studio` | Prisma Studio（DB GUI）起動 |
| `bunx prisma migrate dev` | マイグレーション実行 |
| `docker compose up -d` | DB コンテナ起動 |
| `docker compose down` | DB コンテナ停止 |

## データベース

### 開発環境

Docker Desktop で PostgreSQL 16 を使用します。

```bash
# 起動
docker compose up -d

# 停止
docker compose down

# ログ確認
docker compose logs -f db

# データを完全削除して再起動
docker compose down -v && docker compose up -d
```

### 本番環境

Supabase Cloud を使用します。`.env.production` で接続情報を設定してください。

## ディレクトリ構造

```
src/
├── app/                    # Next.js App Router
│   ├── (public)/          # 公開ページ
│   ├── admin/             # 管理画面
│   └── api/               # API Routes
├── components/            # React コンポーネント
├── lib/                   # ユーティリティ
├── actions/               # Server Actions
├── hooks/                 # カスタムフック
└── types/                 # 型定義
```

## ドキュメント

- [AGENTS.md](./AGENTS.md) - プロジェクト仕様書
- [docs/README.md](./docs/README.md) - ドキュメントインデックス

## ライセンス

Private
