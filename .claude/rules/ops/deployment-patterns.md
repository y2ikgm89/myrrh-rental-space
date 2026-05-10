---
paths:
  - Dockerfile
  - cloudbuild.yaml
  - .dockerignore
  - .gcloudignore
  - docs/how-to/deploy.md
  - docs/how-to/docker.md
  - docs/how-to/cloudflare.md
  - docs/how-to/cron-schedule.md
  - src/**
  - .github/workflows/**
---

# デプロイパターンルール

> Docker / Cloud Run / Cloud Build / Artifact Registry 対応

> 詳細サブルール（path-scoped auto-load）:
>
> - **Dockerfile 3-stage build + Prisma WASM + STANDALONE + NEXT_PUBLIC ARG** — `ops/deployment/dockerfile.md`
> - **Cloud Build + Cloud Run runtime + migrate Job + secret pinning** — `ops/deployment/cloudbuild.md`
> - **シークレット管理 + .dockerignore / .gcloudignore** — `ops/deployment/secrets-and-ignore.md`
> - **Deploy / Build / Tailwind+Turbopack の Gotchas** — `ops/deployment/gotchas.md`

## アーキテクチャ概要

Cloud Run (Gen2) + Artifact Registry + Cloud Build によるデプロイ。
Bun ランタイム + Prisma 7 WASM エンジン。

| コンポーネント     | 技術                                                       |
| ------------------ | ---------------------------------------------------------- |
| コンテナランタイム | Bun 1.3.x（Cold Start 高速）                               |
| Prisma エンジン    | `engineType = "client"` + `runtime = "bun"`（WASM ベース） |
| Docker ビルド      | 3-stage multi-stage（deps → builder → runner）             |
| キャッシュ         | BuildKit + BUILDKIT_INLINE_CACHE                           |
| CI/CD              | Cloud Build → Artifact Registry → Cloud Run                |

## マイグレーション

Prisma マイグレーションは cloudbuild.yaml 内の `prisma-migrate` Cloud Run Job で自動実行される（schema と DB の drift 防止）。手動実行は緊急時のみ:

```bash
gcloud run jobs execute prisma-migrate --region asia-northeast1 --wait
```

初回の Job 作成は `docs/how-to/deploy.md` §6 を参照。

## 禁止事項

1. **`--set-secrets` / `--set-env-vars` 禁止**
   - 手動追加の任意シークレット/環境変数が消える
   - `--update-secrets` / `--update-env-vars` を使用

2. **`openssl` パッケージ禁止**
   - Prisma 7 `engineType = "client"` は WASM ベース。OpenSSL 不要
   - `libc6-compat` のみ必要（bcrypt 等のネイティブモジュール互換）

3. **`node_modules/.prisma` コピー禁止**
   - Prisma 7 カスタム output では `node_modules/.prisma/` は空
   - `node_modules/@prisma` をコピー（WASM ランタイムエンジン）

4. **`NEXT_PUBLIC_*` のランタイムのみ注入禁止**
   - ビルド時 Docker ARG が必須（クライアント JS へのインライン化）
   - ランタイム env var のみではクライアント側で `undefined` になる

5. **シークレットバージョン `latest` 禁止**
   - 固定バージョン番号を使用（cloudbuild.yaml の substitutions で管理）

6. **Docker ビルド内での `bun install` 二重実行禁止**
   - deps ステージでのみ `bun install`。builder は `COPY --from=deps` で取得

7. **`generated` の builder COPY 漏れ禁止**
   - `.gitignore` で除外されているため Cloud Build に含まれない
   - `COPY --from=deps /app/generated ./generated` が必須

8. **root ユーザーでの実行禁止**
   - `adduser --system nextjs` + `USER nextjs` で非 root 実行

9. **Dockerfile で `ENV PORT=...` を書かない**
   - Cloud Run Container Runtime Contract が PORT を自動注入する
   - hardcode すると `gcloud run deploy --port=<N>` の override が silent に壊れる
   - `HOSTNAME=0.0.0.0` のみ保持（Next.js standalone が listen address として読む）

10. **Cloud Run デプロイで `--service-account` 省略禁止**
    - デフォルトは Compute Engine default SA（広範な権限 = 最小権限原則違反）
    - dedicated SA を作成して `_SERVICE_ACCOUNT` substitution 必須

11. **liveness-probe に `/api/health` を指定禁止**
    - `/api/health` は DB 疎通を含むため、DB 一時断でコンテナが連鎖 kill される
    - liveness は `/api/live`（DB 非依存）を使う。`/api/health` は監視・手動確認用

12. **Cloud Run `--cpu-throttling`（default）で `fireAndForget` を使うと副作用が切られる**
    - request 返却後に CPU が即座に停止し、メール送信・通知生成・カレンダー同期が midway で中断
    - `--no-cpu-throttling`（CPU always-allocated）を指定する（コスト影響あり、公式推奨）

13. **schema.prisma 変更を含むコミットのデプロイで migrate Job 実行を飛ばさない**
    - cloudbuild.yaml の `migrate-update` → `migrate-execute` を deploy step の `waitFor` に入れる
    - 飛ばすと schema と DB の drift で production の P2021（table not found）等の runtime エラー

14. **`validateProductionEnv()` に `NEXT_PUBLIC_BASE_URL` / `NEXT_PUBLIC_APP_URL` 必須チェック維持**
    - Cloud Build substitution で未指定だと `""` でビルドされ silent failure
    - `instrumentation.register()` で fail-fast（起動時 throw）

15. **Cloud Run probe endpoint (`/api/live`, `/api/health`) を `proxy.ts` の rate-limit 対象から外す**
    - Cloud Run probe は `x-forwarded-for` 未設定 → `getClientIp()` が `"unknown"` を返し全 probe が同一 bucket に合算
    - burst 時に `apiRateLimiter` (100/min) を超過 → 429 → liveness 失敗 → コンテナ kill 連鎖
    - `proxy.ts` の `/api/webhooks` / `/api/cron` 早期リターンと同列に probe も除外する

## ファイル配置

| パス                           | 内容                                                  |
| ------------------------------ | ----------------------------------------------------- |
| `Dockerfile`                   | multi-stage（deps / builder-base / builder / runner） |
| `cloudbuild.yaml`              | Cloud Build + Cloud Run deploy                        |
| `.dockerignore`                | Docker ビルドコンテキスト除外                         |
| `.gcloudignore`                | Cloud Build ソースアップロード除外                    |
| `docs/how-to/deploy.md`        | デプロイ手順・IAM・シークレット管理                   |
| `src/shared/lib/env/server.ts` | サーバー環境変数定義                                  |
| `src/shared/lib/env/client.ts` | クライアント環境変数定義（NEXT*PUBLIC*\*）            |

## 参考

- [Next.js Docker Deployment](https://nextjs.org/docs/app/getting-started/deploying#docker)
- [Cloud Run Docs](https://cloud.google.com/run/docs)
- [Cloud Build Docs](https://cloud.google.com/build/docs)
- [Prisma 7 Client Engine](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/client-engine)
