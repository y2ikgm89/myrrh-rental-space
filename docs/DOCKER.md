# Docker設定ガイド

> **Note**: このドキュメントには、Next.js 16.1.1 + Bun 1.3.5 + Prisma 7.2.0プロジェクト用のDocker設定の設計と実装詳細が記載されています。技術スタックの詳細については、[`AGENTS.md`](../AGENTS.md)を参照してください。デプロイメント手順については、[`DEPLOYMENT.md`](./DEPLOYMENT.md)を参照してください。

---

## 概要

このプロジェクトは、Google Cloud Runへのデプロイ用にDockerコンテナを使用します。マルチステージビルドを採用し、最適化された本番イメージとローカル開発環境の両方を提供します。

---

## ファイル構成

```
myrrh-rental-space/
├── Dockerfile          # 本番ビルド用（マルチステージ）
├── docker-compose.yml  # ローカル開発用
└── .dockerignore      # Dockerビルド時の除外ファイル
```

---

## Dockerfileの設計

### アーキテクチャ概要

マルチステージビルドを採用し、以下の3つのステージで構成されます：

1. **`deps`**: 依存関係のインストール
2. **`builder`**: アプリケーションのビルド
3. **`runner`**: 本番実行環境

### ステージ1: 依存関係インストール (`deps`)

```dockerfile
FROM oven/bun:1.3.5 AS deps
WORKDIR /app

# 依存関係ファイルをコピー
COPY package.json bun.lockb ./

# 依存関係をインストール（ロックファイルを使用）
RUN bun install --frozen-lockfile
```

**設計のポイント**:
- **ベースイメージ**: `oven/bun:1.3.5`（バージョン明示で再現性を確保）
- **レイヤーキャッシュ最適化**: 依存関係ファイルのみを先にコピーし、ソースコード変更時でもキャッシュを活用
- **`--frozen-lockfile`**: ロックファイルに基づいて厳密にインストール（再現性向上）

### ステージ2: ビルド (`builder`)

```dockerfile
FROM oven/bun:1.3.5 AS builder
WORKDIR /app

# 依存関係を前ステージからコピー
COPY --from=deps /app/node_modules ./node_modules

# ソースコードをコピー
COPY . .

# Prismaクライアントを生成
RUN bunx prisma generate

# Next.jsアプリケーションをビルド
RUN bun run build
```

**設計のポイント**:
- **Prismaクライアント生成**: ビルド前にPrismaクライアントを生成（`bunx prisma generate`）
- **Next.jsビルド**: `bun run build`でNext.jsアプリケーションをビルド
- **重要**: `next.config.js`で`output: 'standalone'`が設定されている必要がある

### ステージ3: 本番実行 (`runner`)

```dockerfile
FROM oven/bun:1.3.5 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

# 非rootユーザーを作成（セキュリティ強化）
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# Next.js standalone出力をコピー
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 公開ファイルをコピー
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prismaスキーマとマイグレーションファイルをコピー
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Prismaクライアント関連ファイルをコピー
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# 非rootユーザーに切り替え
USER nextjs

# ポートを公開
EXPOSE 3000

# アプリケーションを起動
CMD ["bun", "run", "start"]
```

**設計のポイント**:
- **非rootユーザー**: `groupadd`と`useradd`を使用（Debianベースのため）
  - UID/GID: 1001（システムユーザーとして作成）
  - ユーザー名: `nextjs`、グループ名: `nodejs`
- **ファイル所有権**: `--chown=nextjs:nodejs`で適切な所有権を設定
- **Next.js standalone出力**: `.next/standalone/`から必要なファイルのみをコピー
- **Prisma対応**: スキーマ、マイグレーションファイル、生成済みクライアントをコピー
- **環境変数**: `HOSTNAME="0.0.0.0"`を設定（Cloud Run対応）

### 完全なDockerfile例

```dockerfile
# Stage 1: 依存関係インストール
FROM oven/bun:1.3.5 AS deps
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Stage 2: ビルド
FROM oven/bun:1.3.5 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bunx prisma generate
RUN bun run build

# Stage 3: 本番実行
FROM oven/bun:1.3.5 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

# 非rootユーザーを作成
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# Next.js standalone出力をコピー
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 公開ファイルをコピー
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma関連ファイルをコピー
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# 非rootユーザーに切り替え
USER nextjs

EXPOSE 3000

CMD ["bun", "run", "start"]
```

---

## docker-compose.ymlの設計

### ローカル開発環境

```yaml
version: '3.8'

services:
  app:
    image: oven/bun:1.3.5
    container_name: myrrh-rental-space-dev
    working_dir: /app
    volumes:
      - .:/app
      - /app/node_modules
    ports:
      - "3000:3000"
    env_file:
      - .env.local
    command: bun run dev
    stdin_open: true
    tty: true
```

**設計のポイント**:
- **ベースイメージ**: `oven/bun:1.3.5`（開発環境でも本番と同じバージョンを使用）
- **ボリュームマウント**: 
  - `.:/app`: ソースコードをマウント（ホットリロード対応）
  - `/app/node_modules`: 匿名ボリュームでnode_modulesを保護（ホストのnode_modulesを上書きしない）
- **環境変数**: `.env.local`から読み込み
- **ポートマッピング**: `3000:3000`（ホスト:コンテナ）
- **コマンド**: `bun run dev`（開発サーバー起動）
- **インタラクティブモード**: `stdin_open: true`と`tty: true`でターミナル操作を可能に

---

## .dockerignoreの設計

### 除外ファイル一覧

```
# 依存関係
node_modules
.pnp
.pnp.js

# ビルド出力
.next
out
dist
build

# 環境変数ファイル（機密情報）
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# ログファイル
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

# テスト関連
coverage
.nyc_output
*.test.ts
*.test.tsx
*.spec.ts
*.spec.tsx
tests
__tests__

# IDE設定
.vscode
.idea
*.swp
*.swo
*~

# OS関連
.DS_Store
Thumbs.db

# Git関連
.git
.gitignore
.gitattributes

# Docker関連
Dockerfile
docker-compose.yml
.dockerignore

# ドキュメント
README.md
docs
*.md

# CI/CD
.github
.gitlab-ci.yml
.travis.yml

# その他
.cache
.temp
.tmp
```

**設計のポイント**:
- **機密情報の除外**: `.env*`ファイルを確実に除外
- **ビルド時間の短縮**: `node_modules`、`.next`などの大きなディレクトリを除外
- **イメージサイズの最適化**: 不要なファイルを除外してイメージサイズを最小化
- **セキュリティ**: テストファイル、ドキュメント、CI/CD設定などを除外

---

## 前提条件

### Next.js設定

`next.config.js`で`output: 'standalone'`が設定されている必要があります：

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // その他の設定...
}

module.exports = nextConfig
```

この設定により、Next.jsは`.next/standalone/`ディレクトリに最小限の依存関係のみを含むビルドを生成します。

---

## 使用方法

### ローカル開発

```bash
# コンテナを起動
docker-compose up

# バックグラウンドで起動
docker-compose up -d

# ログを確認
docker-compose logs -f

# コンテナを停止
docker-compose down
```

### 本番ビルド

```bash
# Dockerイメージをビルド
docker build -t myrrh-rental-space:latest .

# イメージを確認
docker images myrrh-rental-space

# ローカルで実行（テスト用）
docker run -p 3000:3000 --env-file .env.local myrrh-rental-space:latest
```

### Cloud Runデプロイ

詳細な手順は[`docs/DEPLOYMENT.md`](DEPLOYMENT.md)を参照してください。

---

## ベストプラクティス（2026-01-05時点）

### セキュリティ

1. **非rootユーザーで実行**
   - 最小権限の原則に従い、非rootユーザーでアプリケーションを実行
   - UID/GIDを明示的に指定（1001:1001）

2. **機密情報の保護**
   - `.dockerignore`で`.env*`ファイルを確実に除外
   - 本番環境ではGoogle Secret Managerを使用

3. **最小限の依存関係**
   - 本番イメージには開発依存関係を含めない
   - Next.js standalone outputを使用して必要なファイルのみを含める

### パフォーマンス

1. **レイヤーキャッシュの活用**
   - 依存関係ファイルを先にコピーしてレイヤーキャッシュを最大化
   - ソースコード変更時でも依存関係レイヤーは再利用される

2. **マルチステージビルド**
   - ビルド環境と実行環境を分離
   - 最終イメージサイズを最小化

3. **.dockerignoreの活用**
   - 不要なファイルをビルドコンテキストから除外
   - ビルド時間とイメージサイズを削減

### 保守性

1. **バージョン明示**
   - ベースイメージのバージョンを明示的に指定（`oven/bun:1.3.5`）
   - 再現性を確保

2. **適切なファイル所有権**
   - `--chown`オプションで適切な所有権を設定
   - 非rootユーザーがファイルにアクセス可能にする

---

## 技術的制約と考慮事項

### PrismaとEdge Runtime

- **PrismaはEdge Runtimeをサポートしない**
- Next.js API RoutesとServer Actionsは`runtime = "nodejs"`を指定（またはデフォルト）
- BunランタイムはNode.js互換性があるため、Prismaと互換

### Cloud RunでのBun使用

- **✅ フルBunで実行可能**: このプロジェクトはDockerイメージ内でBun 1.3.5を完全に使用
- **Cloud RunはBunランタイムをネイティブサポートしていないが、DockerコンテナとしてBunを使用可能**
- **実装**: `oven/bun:1.3.5`ベースイメージを使用し、開発から本番までBunで統一
- **利点**: 
  - 開発環境と本番環境のランタイム統一
  - Bunの高速なパフォーマンスを本番環境でも活用
  - Prisma、Next.js、Auth.jsすべてBunで動作

### Prismaマイグレーション

- **本番環境ではマイグレーションを別途実行**
- Cloud Run Jobsを使用してマイグレーションを実行（コンテナ起動時の自動実行は推奨しない）
- 詳細は[`docs/DEPLOYMENT.md`](DEPLOYMENT.md)を参照

### Next.js Standalone Output

- **`output: 'standalone'`が必須**
- `.next/standalone/`ディレクトリに必要なファイルのみが出力される
- Prismaクライアント関連ファイルは手動でコピーする必要がある

---

## トラブルシューティング

### ビルドエラー

**問題**: `next.config.js`で`output: 'standalone'`が設定されていない

**解決策**:
```javascript
// next.config.js
module.exports = {
  output: 'standalone',
}
```

### Prismaクライアントエラー

**問題**: 実行時にPrismaクライアントが見つからない

**解決策**:
- Dockerfileの`runner`ステージでPrismaクライアント関連ファイルを確実にコピー
- `node_modules/.prisma`と`node_modules/@prisma`をコピー

### 権限エラー

**問題**: 非rootユーザーがファイルにアクセスできない

**解決策**:
- `COPY`コマンドで`--chown=nextjs:nodejs`を指定
- ファイル所有権を適切に設定

### ポートバインディングエラー

**問題**: ポート3000が既に使用されている

**解決策**:
```bash
# 使用中のポートを確認
netstat -ano | findstr :3000

# docker-compose.ymlでポートを変更
ports:
  - "3001:3000"  # ホストの3001ポートを使用
```

### 環境変数が読み込まれない

**問題**: コンテナ内で環境変数が設定されていない

**解決策**:
- `.env.local`ファイルが存在することを確認
- `docker-compose.yml`で`env_file: .env.local`が設定されていることを確認
- 本番環境ではGoogle Secret Managerから環境変数を注入

---

## 参考資料

- [Next.js Docker Documentation](https://nextjs.org/docs/deployment#docker-image)
- [Bun Docker Guide](https://bun.sh/guides/ecosystem/docker)
- [Prisma Deployment Guide](https://www.prisma.io/docs/guides/deployment)
- [Google Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)

---

## 更新履歴

- **2026-01-05**: ドキュメント整理・統合
  - `AGENTS.md`への参照を追加
  - `DEPLOYMENT.md`との役割を明確化
  - 重複情報を削除
