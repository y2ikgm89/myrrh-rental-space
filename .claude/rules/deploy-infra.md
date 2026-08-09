---
paths:
  - "terraform/**"
  - ".github/workflows/**"
  - "cloudbuild.yaml"
  - "Dockerfile"
  - "infra/**"
  - "scripts/bootstrap-terraform.sh"
  - "scripts/audit-gcp-production-iap.ts"
  - "scripts/gcp-production-audit-model.ts"
---

# デプロイと基盤

GCP プロジェクト `myrrh-rental-space` / リージョン `asia-northeast1`。
1 つのイメージを 2 つの Cloud Run サービスに配る。

| サービス                   | 役割                               | 入口                                        |
| -------------------------- | ---------------------------------- | ------------------------------------------- |
| `myrrh-rental-space`       | 公開サイト（`APP_SURFACE=public`） | `rental-space.myrrh-jp.com`                 |
| `myrrh-rental-space-admin` | 管理画面（`APP_SURFACE=admin`）    | `admin.myrrh-jp.com` + Cloud Run direct IAP |

Bun のバージョンは `package.json` の `packageManager` と `engines.bun` の
2 フィールドが SSoT。Dockerfile / devcontainer / CI はこの pin に追従する
（`__tests__/unit/architecture/runtime-version-contract.test.ts`）。

## 本番反映は手動だけ

`main` へのマージでは Cloud Run に何も出ない。反映は GitHub Actions の
**Deploy Production**（`.github/workflows/deploy-production.yml`）を
`workflow_dispatch` で実行する。ref は `main` のみ。順序は

1. `terraform-apply`（IAM の前提を先に作る）
2. `deploy`（Cloud Build → Artifact Registry → Cloud Run）

migrate は Cloud Run Job として新リビジョンのデプロイ**より先**に走る。
破壊的 DDL を含むと両サービスを scale 0 にして 310 秒 drain する計画
ダウンタイムモードに入る。発動条件は下記のいずれかで、判定の SSoT は workflow
内の正規表現。この列挙がそこから導出した集合と一致することは
`__tests__/unit/architecture/breaking-migration-detection.test.ts` が強制する。

<!-- breaking-triggers:start -->

ALTER TABLE ... ALTER COLUMN ... DROP DEFAULT /
ALTER TABLE ... ALTER COLUMN ... SET NOT NULL /
ALTER TABLE ... ALTER COLUMN ... TYPE /
ALTER TABLE ... DROP COLUMN /
ALTER TABLE ... DROP CONSTRAINT /
ALTER TABLE ... RENAME COLUMN /
ALTER TABLE ... RENAME TO /
ALTER TYPE ... RENAME TO /
ALTER TYPE ... RENAME VALUE /
DROP TABLE /
DROP TYPE

<!-- breaking-triggers:end -->

migration 側の書き方は `.claude/rules/migrations.md`。

## Terraform の 4 つの契約

いずれも `__tests__/unit/architecture-boundaries.test.ts` が機械強制する。
再検討する前に、まずそこの test 名とコメントを読むこと。

1. **project-level IAM は bootstrap が全部持つ（F1 structural closure）。**
   `terraform/*.tf` に project-level IAM binding とサービスアカウントの
   metadata を宣言しない。必要な grant は `scripts/bootstrap-terraform.sh`
   側に足す。
2. **既存 GCP リソースには同一ファイル内に `import{}` block を置く。**
   無いと Deploy Production が 409 で落ちる。
3. **Cloudflare provider v5 の import ID はリソース種別ごとの公式フォーマット
   に一致させる。** ここのずれで 2026-07-14 に 4 連続でデプロイが落ちている。
4. **Cloud Scheduler の cron job は
   `terraform/cloud_scheduler.tf` と `REQUIRED_CLOUD_SCHEDULER_CRON_JOB_IDS`
   を完全同期する。** 片方だけ足すと job が存在しないまま緑になる。

secret を消すときは 3 段階（state から orphan 化 → `gcloud` で削除 →
`removed` block）。単純に消すと main のデプロイが壊れる。

その他の機械強制:

- `cloudbuild.yaml` の `substitutions` に定義した key は必ず body で参照する
  （未参照だと Cloud Build が `INVALID_ARGUMENT`）。
- `branch-protection.json` の required context に対応する workflow は
  path filter を持たない（filter で skip されると required check が
  `MISSING` のまま永久に埋まらない）。
- Cloud Run deploy は Server Actions の暗号鍵を build 時だけでなく
  **runtime にも**注入する。

## CI（`.github/workflows/ci.yml`）

`changes` job が変更範囲を検出し、必須ゲートを回す:
`migration-safety` / `dependency-audit` / `lint-format` / `type-check` /
`unit-tests` / `smoke-e2e` / `build`。

重い job（広域 E2E・Visual・Lighthouse）は `workflow_dispatch` の
`run_full_ci=true` で opt-in。広域 E2E と Visual は main の nightly
（18:00 UTC = 03:00 JST）でも自動実行される。

```sh
gh workflow run ci.yml --ref <branch> -f run_full_ci=true
```

shell の落とし穴: GitHub Actions の既定 shell は `pipefail` が無い。
判定に使うパイプラインは `set -o pipefail` を明示し、`grep -q` は
SIGPIPE でマッチを不一致に反転させるので使わない
（`__tests__/unit/architecture/workflow-shell-pipefail.test.ts`）。

## 監査

```sh
bun run gcp:audit-production-iap    # IAP / IAM の実構成を宣言と突き合わせる
```

運用手順の正本は `docs/gcp-production-setup.md` と `docs/runbooks/`。
デプロイが落ちたときの切り分けは `.claude/skills/deploy-debug/`。
