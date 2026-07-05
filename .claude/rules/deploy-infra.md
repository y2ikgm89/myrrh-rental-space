---
paths:
  [
    "Dockerfile",
    "cloudbuild.yaml",
    ".github/workflows/**",
    "docker-compose.yml",
    ".dockerignore",
    "scripts/bun-ci-install.sh",
  ]
---

# デプロイ・インフラ（Cloud Build / Cloud Run）

## デプロイ経路

- **main への push = 即・本番デプロイ**（deploy-production.yml →
  `gcloud beta builds submit`）。PR merge は本番リリースを意味する
- workflow が migration diff を grep し、DROP COLUMN / RENAME COLUMN / RENAME TO /
  DROP TABLE / DROP TYPE を検出すると自動で breaking migration mode
  （両サービス scaling=0 + 310 秒 drain = 計画ダウンタイム）に切り替わる
- 単一 runner イメージを APP_SURFACE env の違いで public / admin の 2 サービスに配る

## Dockerfile（6 ステージ、順序に意味がある）

- base → deps → builder-base → builder → migrator → **runner（必ず末尾）**。
  `docker build` は `--target` 未指定で末尾ステージをビルドするため、
  末尾に別ステージを足すと service に誤ったイメージが入る事故になる
- migrate Job は **migrator ステージ**（完全な node_modules）のイメージを使う。
  runner（pruned）を指定すると bunx の実行時再 DL で prisma.config.ts が
  ロードできず migrate が exit(1) する
- `NEXT_PUBLIC_*` はビルド時にクライアント JS へインライン化されるため
  builder-base で **ARG → ENV 変換が必須**（ARG のままでは空文字が焼き込まれる）。
  \_NEXT_PUBLIC_BASE_URL / \_NEXT_PUBLIC_APP_URL / \_NEXT_PUBLIC_TURNSTILE_SITE_KEY の
  substitutions に空デフォルトを復活させない（GA_MEASUREMENT_ID のみ optional で空可）
- ビルドは DB 非接続（placeholder DATABASE_URL）。runner の Prisma prune ガードが
  Prisma minor bump で fail したら prune リストを更新する（握りつぶさない）

## env / バージョン契約

- `SKIP_ENV_VALIDATION` は build / CI 専用。本番 runtime に設定すると
  `validateProductionEnv()` の本番必須チェックが丸ごと無効化される
- Bun バージョンは package.json `packageManager` / Dockerfile FROM / .devcontainer の
  3 箇所同時更新（`runtime-version-contract.test.ts` が不一致で fail）
- bunfig.toml の `[run] noOrphans` は Lexical TDZ regression のため有効化禁止

## ヘルスチェック

- startup/liveness probe は `/api/live`（**外部依存ゼロ**）。DB チェックを足すと
  DB 一時断でコンテナが kill され連鎖障害になる。DB 疎通は `/api/health` の責務

## ローカル環境

- `docker compose up -d db` = 開発 DB（5432 / myrrh_rental）、
  `test-db`（5433 / myrrh_test）は `bun run test:db:migrate`
  （test:integration の前段）が自動起動
- 本番相当ビルドの再現は `bun run build:skip-env`
- CI/Docker の install は `scripts/bun-ci-install.sh`（リトライ + キャッシュ消去 +
  network-concurrency 4 の耐 flake 版）に統一されている
- Lighthouse CI（.lighthouserc.json のバジェット）は workflow_dispatch の
  run_full_ci=true か `codex/full-ci/` prefix の PR branch でのみ実行
