---
description: Cloud Build パターン (Docker layer cache / update-secrets / NEXT_PUBLIC dual-injection / Cloud Run runtime / migrate Job / secret version pinning)
paths:
  - cloudbuild.yaml
  - .github/workflows/**
---

# Cloud Build パターン

> Docker レイヤーキャッシュ + `--update-*` (vs `--set-*`) + NEXT_PUBLIC 二重注入 + Cloud Run runtime ベストプラクティス + Prisma migrate Cloud Run Job + シークレットバージョン固定。

## Docker レイヤーキャッシュ

```yaml
options:
  env:
    - DOCKER_BUILDKIT=1

steps:
  # キャッシュイメージ pull（初回は skip）
  - name: gcr.io/cloud-builders/docker
    entrypoint: bash
    args: [-c, "docker pull .../:cache || true"]

  # ビルド（キャッシュ利用 + インラインキャッシュ埋め込み）
  - name: gcr.io/cloud-builders/docker
    args:
      - build
      - --build-arg=BUILDKIT_INLINE_CACHE=1
      - --cache-from=.../:cache
      - -t=.../:${SHORT_SHA}
      - -t=.../:cache
      - .
```

## --update-secrets / --update-env-vars

Cloud Run デプロイでは `--update-*`（マージ）を使用。`--set-*`（全置換）は禁止:

```yaml
# OK: 既存の手動追加シークレットを保持
- --update-secrets=DATABASE_URL=DATABASE_URL:${_VERSION}
- --update-env-vars=NODE_ENV=production,...

# NG: 手動追加の任意シークレットが消える
- --set-secrets=DATABASE_URL=DATABASE_URL:${_VERSION}
- --set-env-vars=NODE_ENV=production,...
```

## NEXT*PUBLIC*\* の二重注入

`NEXT_PUBLIC_*` はビルド時（Docker ARG）とランタイム（Cloud Run env var）の両方で必要:

| 用途       | 注入方法            | 理由                                      |
| ---------- | ------------------- | ----------------------------------------- |
| ビルド時   | `--build-arg`       | クライアント JS へインライン化            |
| ランタイム | `--update-env-vars` | Server Components / Server Actions で使用 |

## サーバー専用環境変数

`NEXT_PUBLIC_*` 以外のサーバー側 env var はランタイムのみ注入（ビルド時は不要）:

```yaml
# cloudbuild.yaml — deploy ステップ
- --update-env-vars=NODE_ENV=production,NEXT_TELEMETRY_DISABLED=1,DATABASE_POOL_MAX=${_DATABASE_POOL_MAX},...,BETTER_AUTH_URL=${_BETTER_AUTH_URL}
```

| 変数                      | 用途                                                    |
| ------------------------- | ------------------------------------------------------- |
| `BETTER_AUTH_URL`         | Better Auth のベース URL（ランタイムのみ）              |
| `NODE_ENV`                | production 設定                                         |
| `NEXT_TELEMETRY_DISABLED` | Next.js テレメトリー無効化                              |
| `DATABASE_POOL_MAX`       | pg Pool 最大接続数（Cloud Run 1 vCPU 想定で `10` 推奨） |

## Cloud Run runtime 設定（公式ベストプラクティス準拠）

| 設定                      | 値 / 例                                                                    | 根拠                                                                                           |
| ------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `--service-account`       | dedicated SA（Compute default SA 禁止）                                    | [最小権限原則](https://cloud.google.com/run/docs/configuring/service-accounts)                 |
| `--execution-environment` | `gen2`                                                                     | 公式推奨（syscall 互換性・ストレージ）                                                         |
| `--cpu-boost`             | 有効                                                                       | Cold Start 高速化                                                                              |
| `--no-cpu-throttling`     | 有効（CPU always-allocated）                                               | [fireAndForget / after() 安定化](https://cloud.google.com/run/docs/configuring/cpu-allocation) |
| `--port`                  | `8080`                                                                     | Cloud Run container port（Container Runtime Contract）                                         |
| `--startup-probe`         | `httpGet.path=/api/live,port=8080,failureThreshold=9,periodSeconds=10`     | DB 非依存の軽量 alive チェック                                                                 |
| `--liveness-probe`        | `httpGet.path=/api/live,port=8080,initialDelaySeconds=10,periodSeconds=30` | `/api/health`（DB 依存）禁止                                                                   |

## Prisma migrate Cloud Run Job（cloudbuild.yaml 組込）

schema commit と migration 適用の drift を防ぐため、deploy 前に migrate Job を実行する:

```yaml
# Step N-1: migrate Job の image を新 SHA に更新
- name: gcr.io/google.com/cloudsdktool/cloud-sdk
  id: migrate-update
  entrypoint: gcloud
  args:
    - run
    - jobs
    - update
    - ${_MIGRATE_JOB_NAME}
    - --region=${_REGION}
    - --image=${_AR_HOST}/${PROJECT_ID}/${_REPOSITORY}/${_SERVICE_NAME}:${SHORT_SHA}

# Step N: migrate 実行（--wait で完了待機、fail 時はデプロイ全体停止）
- name: gcr.io/google.com/cloudsdktool/cloud-sdk
  id: migrate-execute
  entrypoint: gcloud
  args: [run, jobs, execute, ${_MIGRATE_JOB_NAME}, --region=${_REGION}, --wait]
```

**初回のみ**: Job の作成は手動で行う（`gcloud run jobs create prisma-migrate --command bunx --args --bun,prisma,migrate,deploy ...`）。手順は `docs/how-to/deploy.md` §6。

## シークレットバージョン固定

Cloud Run シークレットは固定バージョンで参照（`latest` 禁止）:

```yaml
substitutions:
  _DATABASE_URL_SECRET_VERSION: '1'    # 固定バージョン

# deploy ステップ
- --update-secrets=DATABASE_URL=DATABASE_URL:${_DATABASE_URL_SECRET_VERSION}
```
