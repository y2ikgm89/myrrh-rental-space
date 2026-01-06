# デプロイメント手順

> **Note**: このドキュメントには詳細なデプロイメント手順が記載されています。技術スタックの詳細については、[`AGENTS.md`](../AGENTS.md)を参照してください。Docker固有の設定については、[`DOCKER.md`](./DOCKER.md)を参照してください。

---

## 概要

このシステムはGoogle Cloud Runにデプロイされ、Supabaseをデータベースとストレージとして使用します。Bun 1.3.5ランタイムをDockerコンテナ内で実行します。

---

## 前提条件

### 必要なアカウント

- Google Cloud Platform (GCP) アカウント
- Supabase アカウント
- GitHub アカウント（CI/CD使用時）

### 必要なツール

- `gcloud` CLI（Google Cloud SDK）
- `docker` CLI
- `bun` 1.3.5以上

---

## 環境変数の設定

### 開発環境

1. `.env.example`をコピーして`.env.local`を作成
2. 必要な環境変数を設定

```bash
cp .env.example .env.local
```

**必須環境変数**:
- `DATABASE_URL`: Supabase PostgreSQL接続URL
- `NEXTAUTH_SECRET`: Auth.js用シークレット（`openssl rand -base64 32`で生成）
- `NEXTAUTH_URL`: アプリケーションURL（開発: `http://localhost:3000`）
- `SUPABASE_URL`: SupabaseプロジェクトURL
- `SUPABASE_ANON_KEY`: Supabase匿名キー
- `SUPABASE_SERVICE_ROLE_KEY`: Supabaseサービスロールキー

### 本番環境

Google Secret Managerを使用して環境変数を管理します。

---

## Supabaseセットアップ

### 1. プロジェクト作成

1. Supabaseダッシュボードで新しいプロジェクトを作成
2. プロジェクトURLとAPIキーを取得

### 2. データベース接続

1. Supabaseダッシュボードの「Settings」→「Database」から接続URLを取得
2. 接続プーリング用URLを使用（推奨）

### 3. Prismaマイグレーション

```bash
# 開発環境
bunx prisma migrate dev

# 本番環境
bunx prisma migrate deploy
```

### 4. Row Level Security (RLS)設定

SupabaseダッシュボードでRLSポリシーを設定します。

### 5. Storageバケット作成

1. Supabaseダッシュボードの「Storage」で`spaces`バケットを作成
2. 公開設定を適切に設定

---

## Google Cloud Platformセットアップ

### 1. プロジェクト作成

```bash
gcloud projects create myrrh-rental-space --name="Myrrh Rental Space"
gcloud config set project myrrh-rental-space
```

### 2. 必要なAPIの有効化

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com
```

### 3. Artifact Registryリポジトリ作成

```bash
gcloud artifacts repositories create myrrh-rental-space \
  --repository-format=docker \
  --location=asia-northeast1 \
  --description="Docker repository for Myrrh Rental Space"
```

### 4. Secret Managerでの環境変数設定

```bash
# NEXTAUTH_SECRET
echo -n "your-secret-here" | gcloud secrets create nextauth-secret --data-file=-

# DATABASE_URL
echo -n "your-database-url" | gcloud secrets create database-url --data-file=-

# NEXTAUTH_URL
echo -n "https://your-domain.com" | gcloud secrets create nextauth-url --data-file=-

# SUPABASE_URL
echo -n "your-supabase-url" | gcloud secrets create supabase-url --data-file=-

# SUPABASE_ANON_KEY
echo -n "your-supabase-anon-key" | gcloud secrets create supabase-anon-key --data-file=-

# SUPABASE_SERVICE_ROLE_KEY
echo -n "your-supabase-service-role-key" | gcloud secrets create supabase-service-role-key --data-file=-
```

### 5. サービスアカウントの作成と権限設定

```bash
# サービスアカウント作成
gcloud iam service-accounts create cloud-run-sa \
  --display-name="Cloud Run Service Account"

# Secret Managerへのアクセス権限付与
gcloud projects add-iam-policy-binding myrrh-rental-space \
  --member="serviceAccount:cloud-run-sa@myrrh-rental-space.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## Dockerイメージのビルドとプッシュ

### 1. Dockerfileの確認

`Dockerfile`がプロジェクトルートに存在することを確認します。

### 2. イメージのビルド

```bash
docker build -t asia-northeast1-docker.pkg.dev/myrrh-rental-space/myrrh-rental-space/app:latest .
```

### 3. 認証

```bash
gcloud auth configure-docker asia-northeast1-docker.pkg.dev
```

### 4. イメージのプッシュ

```bash
docker push asia-northeast1-docker.pkg.dev/myrrh-rental-space/myrrh-rental-space/app:latest
```

---

## Cloud Runへのデプロイ

### 1. 初回デプロイ

```bash
gcloud run deploy myrrh-rental-space \
  --image asia-northeast1-docker.pkg.dev/myrrh-rental-space/myrrh-rental-space/app:latest \
  --platform managed \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --service-account cloud-run-sa@myrrh-rental-space.iam.gserviceaccount.com \
  --set-secrets DATABASE_URL=database-url:latest,NEXTAUTH_SECRET=nextauth-secret:latest,NEXTAUTH_URL=nextauth-url:latest,SUPABASE_URL=supabase-url:latest,SUPABASE_ANON_KEY=supabase-anon-key:latest,SUPABASE_SERVICE_ROLE_KEY=supabase-service-role-key:latest \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300 \
  --max-instances 10 \
  --min-instances 0
```

### 2. 環境変数の追加設定

Cloud RunコンソールまたはCLIで追加の環境変数を設定できます。

```bash
gcloud run services update myrrh-rental-space \
  --region asia-northeast1 \
  --update-env-vars NODE_ENV=production
```

---

## データベースマイグレーション

### 本番環境でのマイグレーション実行

1. Cloud Runの一時的なジョブとして実行

```bash
gcloud run jobs create prisma-migrate \
  --image asia-northeast1-docker.pkg.dev/myrrh-rental-space/myrrh-rental-space/app:latest \
  --region asia-northeast1 \
  --set-secrets DATABASE_URL=database-url:latest \
  --command "bunx" \
  --args "prisma,migrate,deploy" \
  --service-account cloud-run-sa@myrrh-rental-space.iam.gserviceaccount.com

# マイグレーション実行
gcloud run jobs execute prisma-migrate --region asia-northeast1
```

2. または、ローカルから実行（VPN経由など）

```bash
export DATABASE_URL="your-production-database-url"
bunx prisma migrate deploy
```

---

## CI/CDパイプライン

### GitHub Actions

`.github/workflows/deploy.yml`を作成します。

```yaml
name: Deploy to Cloud Run

on:
  push:
    branches:
      - main

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test_db
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
    
    steps:
      - uses: actions/checkout@v6
      
      - name: Install Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.5
      
      - name: Install dependencies
        run: bun install --frozen-lockfile
      
      - name: Set up test database
        run: |
          DATABASE_URL="postgresql://test:test@localhost:5432/test_db" \
          bunx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/test_db
      
      - name: Run linter
        run: bun run lint
      
      - name: Run type check
        run: bun run type-check
      
      - name: Run unit and integration tests
        run: bun run test
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/test_db
          NEXTAUTH_SECRET: ${{ secrets.TEST_NEXTAUTH_SECRET }}
          NEXTAUTH_URL: http://localhost:3000
          SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.TEST_SUPABASE_ANON_KEY }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.TEST_SUPABASE_SERVICE_ROLE_KEY }}
      
      - name: Install Playwright browsers
        run: bunx playwright install --with-deps
      
      - name: Run E2E tests
        run: bun run test:e2e
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/test_db
          NEXTAUTH_SECRET: ${{ secrets.TEST_NEXTAUTH_SECRET }}
          NEXTAUTH_URL: http://localhost:3000
  
  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      
      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v1
        with:
          service_account_key: ${{ secrets.GCP_SA_KEY }}
          project_id: myrrh-rental-space
      
      - name: Configure Docker
        run: gcloud auth configure-docker asia-northeast1-docker.pkg.dev
      
      - name: Build and push Docker image
        run: |
          docker build -t asia-northeast1-docker.pkg.dev/myrrh-rental-space/myrrh-rental-space/app:${{ github.sha }} .
          docker push asia-northeast1-docker.pkg.dev/myrrh-rental-space/myrrh-rental-space/app:${{ github.sha }}
      
      - name: Deploy to Cloud Run
        run: |
          gcloud run deploy myrrh-rental-space \
            --image asia-northeast1-docker.pkg.dev/myrrh-rental-space/myrrh-rental-space/app:${{ github.sha }} \
            --platform managed \
            --region asia-northeast1 \
            --service-account cloud-run-sa@myrrh-rental-space.iam.gserviceaccount.com \
            --set-secrets DATABASE_URL=database-url:latest,NEXTAUTH_SECRET=nextauth-secret:latest,NEXTAUTH_URL=nextauth-url:latest,SUPABASE_URL=supabase-url:latest,SUPABASE_ANON_KEY=supabase-anon-key:latest,SUPABASE_SERVICE_ROLE_KEY=supabase-service-role-key:latest
      
      - name: Run database migrations
        run: |
          gcloud run jobs execute prisma-migrate --region asia-northeast1 --wait
```

### Google Cloud Build

`cloudbuild.yaml`を作成します。

```yaml
steps:
  # テスト実行
  - name: 'oven/bun:1.3.5'
    entrypoint: 'bun'
    args: ['install', '--frozen-lockfile']
  
  - name: 'oven/bun:1.3.5'
    entrypoint: 'bun'
    args: ['run', 'lint']
  
  - name: 'oven/bun:1.3.5'
    entrypoint: 'bun'
    args: ['run', 'type-check']
  
  - name: 'oven/bun:1.3.5'
    entrypoint: 'bun'
    args: ['run', 'test']
    env:
      - 'DATABASE_URL=${_TEST_DATABASE_URL}'
      - 'NEXTAUTH_SECRET=${_TEST_NEXTAUTH_SECRET}'
      - 'NEXTAUTH_URL=http://localhost:3000'
  
  # ビルド（テスト通過後）
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'asia-northeast1-docker.pkg.dev/$PROJECT_ID/myrrh-rental-space/app:$SHORT_SHA', '.']
  
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'asia-northeast1-docker.pkg.dev/$PROJECT_ID/myrrh-rental-space/app:$SHORT_SHA']
  
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - 'run'
      - 'deploy'
      - 'myrrh-rental-space'
      - '--image'
      - 'asia-northeast1-docker.pkg.dev/$PROJECT_ID/myrrh-rental-space/app:$SHORT_SHA'
      - '--region'
      - 'asia-northeast1'
      - '--platform'
      - 'managed'

options:
  machineType: 'E2_HIGHCPU_8'
```

---

## ロールバック手順

### 1. 以前のリビジョンへのロールバック

```bash
# 利用可能なリビジョンを確認
gcloud run revisions list --service myrrh-rental-space --region asia-northeast1

# 特定のリビジョンにロールバック
gcloud run services update-traffic myrrh-rental-space \
  --to-revisions REVISION_NAME=100 \
  --region asia-northeast1
```

### 2. データベースマイグレーションのロールバック

Prismaは自動ロールバックをサポートしていないため、手動でマイグレーションファイルを確認し、逆の操作を実行する必要があります。

---

## 監視・ログ設定

### Cloud Logging

Cloud Runのログは自動的にCloud Loggingに送信されます。

```bash
# ログの確認
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=myrrh-rental-space" --limit 50
```

### エラー通知

Cloud Monitoringでアラートを設定します。

1. Cloud Consoleで「Monitoring」→「Alerting」に移動
2. 新しいポリシーを作成
3. エラー率やレイテンシーに基づいてアラートを設定

---

## パフォーマンス最適化

### スケーリング設定

```bash
gcloud run services update myrrh-rental-space \
  --region asia-northeast1 \
  --min-instances 1 \
  --max-instances 20 \
  --cpu 2 \
  --memory 2Gi
```

### 接続プーリング

Supabase接続プーリングURLを使用してデータベース接続を最適化します。

---

## セキュリティ設定

### HTTPSの強制

Cloud RunはデフォルトでHTTPSを提供します。

### カスタムドメイン

```bash
gcloud run domain-mappings create \
  --service myrrh-rental-space \
  --domain your-domain.com \
  --region asia-northeast1
```

### CORS設定

`next.config.js`でCORS設定を適切に構成します。

---

## Cloudflare CDN統合（推奨）

Cloudflare CDNを導入することで、Cloud Runの帯域幅コストを70-90%削減し、パフォーマンスを向上させることができます。

### 概要

- **帯域幅コスト削減**: Cloud Runの帯域幅コストを70-90%削減
- **パフォーマンス向上**: グローバルCDNによる配信速度向上（TTFB 50%以上改善、LCP 30%以上改善）
- **セキュリティ強化**: DDoS保護、WAF（有料プラン）、Bot管理
- **コスト最適化**: Cloudflare無料プランで十分な機能を提供

### セットアップ手順

詳細な手順は [`docs/CLOUDFLARE_CDN.md`](./CLOUDFLARE_CDN.md) を参照してください。

#### 1. Cloudflareアカウント作成とドメイン追加

1. [Cloudflare](https://www.cloudflare.com/)でアカウントを作成
2. Cloudflareダッシュボードで「Add a Site」をクリック
3. ドメイン名を入力

#### 2. DNS設定

1. Cloud RunのカスタムドメインのIPアドレスを取得
2. CloudflareでAレコードまたはCNAMEレコードを追加
3. **重要**: プロキシモードを有効にする（オレンジの雲アイコン）

#### 3. SSL/TLS設定

1. 「SSL/TLS」→「Overview」に移動
2. **モード**: 「Full (strict)」を選択
3. 「Always Use HTTPS」を有効化

#### 4. Cache Rules設定

詳細は [`docs/CLOUDFLARE_CDN.md`](./CLOUDFLARE_CDN.md) の「Cache Rules設定」セクションを参照してください。

### Next.js設定

`next.config.js` にキャッシュヘッダー設定を追加します。詳細は [`docs/CLOUDFLARE_CDN.md`](./CLOUDFLARE_CDN.md) の「Next.js設定実装」セクションを参照してください。

---

## トラブルシューティング

### よくある問題

1. **環境変数が読み込まれない**
   - Secret Managerの権限を確認
   - サービスアカウントに`secretAccessor`ロールが付与されているか確認

2. **データベース接続エラー**
   - 接続URLが正しいか確認
   - SupabaseのIP制限設定を確認
   - 接続プーリングURLを使用しているか確認

3. **マイグレーションエラー**
   - マイグレーションファイルの整合性を確認
   - 本番環境のデータベースバックアップを取得

4. **メモリ不足エラー**
   - Cloud Runのメモリ設定を増やす
   - アプリケーションのメモリ使用量を確認

---

## 参考資料

### プロジェクトドキュメント

- [`AGENTS.md`](../AGENTS.md) - プロジェクト全体の仕様書
- [`DOCKER.md`](./DOCKER.md) - Docker設定ガイド
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) - システムアーキテクチャ
- [`DATABASE_DESIGN.md`](./DATABASE_DESIGN.md) - データベース設計
- [`SECURITY.md`](./SECURITY.md) - セキュリティポリシー
- [`CLOUDFLARE_CDN.md`](./CLOUDFLARE_CDN.md) - Cloudflare CDN統合ガイド

### 外部リソース

- [Google Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Prisma Deployment Guide](https://www.prisma.io/docs/guides/deployment)
- [Next.js Deployment Documentation](https://nextjs.org/docs/deployment)
