# terraform/

Google Cloud infra の宣言的管理 (IaC)。**terraform apply が正規更新経路** で、
手動 `gcloud add-iam-policy-binding` などは行わない (**bootstrap-owns-all-project-IAM
契約** に該当する project-level bindings と SA metadata を除く — 下記
"Bootstrap-owns-all-project-IAM 契約" 参照)。

**環境構成**: 単一環境 (prod only) で運用する。multi-env (dev/staging/prod)
分離を提案する前に [ADR 0001](../docs/adr/0001-single-env-terraform.md) を
読むこと (rejected alternatives と re-evaluate すべき migration triggers を
記載)。

## Phase 進捗

このディレクトリは Phase を追って全 GCP infra を段階的に取り込む:

| Phase | スコープ                                                                              | 状態      |
| ----- | ------------------------------------------------------------------------------------- | --------- |
| 1     | Secret Manager IAM (bootstrap 化、詳細は下記契約 section)                             | ✅ 完了   |
| 2     | Cloud Scheduler (13 cron jobs)                                                        | ✅ 完了   |
| 3     | Secret Manager secrets 本体 (16 secrets の metadata)                                  | ✅ 完了   |
| 4     | Artifact Registry + Cloud Build worker pool                                           | ✅ 完了   |
| 5     | Service Accounts + project-level IAM (bootstrap 化) + WIF Pool/Provider               | ✅ 完了   |
| 6a    | Cloud Run services + Job skeleton + resource-scoped IAM (env/secrets 移管は Phase 6b) | ✅ 完了   |
| 7     | Load Balancer + IAP (admin service 用、DNS は Cloudflare 側で管理のため対象外)        | 🚧 実装中 |
| 8     | Cloudflare (myrrh-jp.com zone): DNS / Transform Rule / Cache Rules / R2 / Turnstile   | ✅ 完了   |

## ファイル構成

| ファイル                      | 責務                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `versions.tf`                 | Terraform / provider の version pin                                                                                       |
| `backend.tf`                  | GCS state backend (`myrrh-rental-space-terraform-state`)                                                                  |
| `variables.tf`                | project_id / region / SA email 等の入力                                                                                   |
| `service_accounts.tf`         | (ドキュメンテーション目的の空 config — SA metadata は bootstrap の SSoT)                                                  |
| `cloud_scheduler.tf`          | Phase 2: `google_cloud_scheduler_job` × 13 cron jobs (Cloud Run `/api/cron/*` を OIDC で叩く)                             |
| `secrets.tf`                  | Phase 3: `google_secret_manager_secret` × 16 secrets の metadata (値は Terraform 対象外、prevent_destroy で誤削除 block)  |
| `artifact_registry.tf`        | Phase 4: `google_artifact_registry_repository` (Docker)                                                                   |
| `cloud_build_worker_pool.tf`  | Phase 4: `google_cloudbuild_worker_pool` (myrrh-deploy-pool)                                                              |
| `wif.tf`                      | Phase 5: Workload Identity Pool / Provider (`github-actions`)                                                             |
| `iam_cloud_run.tf`            | Phase 6a: Cloud Run service **resource-scoped** IAM (project-level IAM は bootstrap の SSoT — 下記契約参照)               |
| `cloud_run_public.tf`         | Phase 6a: public service skeleton                                                                                         |
| `cloud_run_admin.tf`          | Phase 6a: admin service skeleton                                                                                          |
| `cloud_run_migrate_job.tf`    | Phase 6a: prisma-migrate Cloud Run Job skeleton                                                                           |
| `lb_admin.tf`                 | Phase 7: admin service 用 HTTPS LB (backend service + URL map + SSL cert + forwarding rule)                               |
| `iap.tf`                      | Phase 7: IAP OAuth client + resource IAM binding                                                                          |
| `cloudflare_provider.tf`      | Phase 8 Foundation: Cloudflare provider (`~> 5`) の宣言のみ                                                               |
| `cloudflare_dns.tf`           | Phase 8 Phase 2a: 8 DNS records (admin A/AAAA、rental-space CNAME、SES MX/SPF/DKIM、GSC TXT × 2) を import block で adopt |
| `cloudflare_zone_settings.tf` | Phase 8 Phase 2a: 25 zone settings (security 8 / perf 6 / cache 4 / privacy 7) を import block で adopt                   |
| `cloudflare_rulesets.tf`      | Phase 8 Phase 2b: Cache Rules + Transform Rules (x-cloudflare-origin-secret 注入、rate-limit trust chain) を import       |
| `cloudflare_r2.tf`            | Phase 8 Phase 2b: R2 bucket `myrrh-rental-space` を import (location は import で state 追従)                             |
| `cloudflare_turnstile.tf`     | Phase 8 Phase 2b: Turnstile widget `Myrrh Rental Space` (sitekey=0x4AAA..、mode=managed) を import                        |

**削除済** (2026-07-14 F1 refactor):

- `secret_iam.tf` — runtime-sa / build-sa への project-level `secretAccessor`
  binding は bootstrap の SSoT に移管
- `iam_project.tf` — build-sa への project-level `cloudbuild.builds.builder` /
  `logging.logWriter` binding は bootstrap の SSoT に移管

## Bootstrap-owns-all-project-IAM 契約

**project-level IAM (project scope の `google_project_iam_member` 相当) と
SA metadata (`google_service_account` resource) は `scripts/bootstrap-terraform.sh`
が単一 SSoT。** Terraform config はこれらを一切宣言しない (設計不変式)。

### なぜ

過去は「runner 自身の bindings のみ bootstrap、他 SA の bindings は Terraform」
の分割 SSoT だったが、以下 2 経路の privilege escalation が構造的に残っていた
(research: `f1-residual-attack-analysis`):

- **Chain 1 (`projectIamAdmin`)**: runner は conditional `projectIamAdmin`
  (with CEL `hasOnly ['secretAccessor']`) を持つ。CEL は「grant する role」を
  絞るが「grantee は誰か」は絞らない。attacker が新規 SA を作って
  `secretAccessor` を付与、その SA を impersonate、で secret 値を読める chain が
  残る (Deny Policy は runner-principal のみ block、他 SA には無効)。
- **Chain 2 (`serviceAccountAdmin`)**: runner は任意 SA の
  `iam.serviceAccounts.setIamPolicy` を呼べる → 任意 SA を impersonate する
  tokenCreator を自分に付与 → runtime-sa を impersonate して secret 値を読める。

**構造的閉じ方**: `projectIamAdmin` と `serviceAccountAdmin` を runner から
外し、runner が触れない全 project-level IAM (SA create、SA-scoped
impersonation、runtime/build SA への secretAccessor 等) を bootstrap に集約。
runner は「自 IAM も他 SA IAM も触れない」構造になり両 chain が物理的に消える。

これは Google 公式パターン
[Set up CI/CD for Terraform](https://cloud.google.com/architecture/setup-terraform-cicd)
と [terraform-google-bootstrap](https://github.com/terraform-google-modules/terraform-example-foundation/tree/master/0-bootstrap)
の "0-bootstrap phase handles IAM the runner cannot self-manage" 原則に沿う。

### 現在の bootstrap-owned レイアウト

`scripts/bootstrap-terraform.sh` が 1 スクリプトで idempotent に構成する:

1. GCS state bucket (`gs://…-terraform-state`, versioning ON)
2. terraform-runner SA
3. runtime / build / scheduler SAs (旧 `service_accounts.tf` から移管)
4. state bucket への runner SA の `roles/storage.objectAdmin` (bucket-scope)
5. WIF binding (`github-actions` principalSet)
6. Secret Manager custom role `terraformRunnerSecretManagerNoPolicyMgmt` の
   create/update (`gcloud iam roles create/update --stage=GA`、12 permissions)
7. custom role D1 の runner SA への grant
8. runtime-sa / build-sa への project-level 直接 grants (旧 `secret_iam.tf` +
   `iam_project.tf` から移管):
   - runtime-sa: `roles/secretmanager.secretAccessor`
   - build-sa: `roles/secretmanager.secretAccessor`
   - build-sa: `roles/cloudbuild.builds.builder`
   - build-sa: `roles/logging.logWriter`
9. SA-scoped impersonation grants:
   - build-sa uses runtime-sa (`roles/iam.serviceAccountUser`)
   - runner uses scheduler-sa (`roles/iam.serviceAccountUser`)
10. IAM Deny Policy `block-terraform-runner-secret-value-read`
    (optional defense-in-depth — org-admin 権限がない環境では
    `SKIP_DENY_POLICY=1` で明示 skip 可能、または permission denied で
    自動 skip + warning)
11. 残り predefined roles の runner grant (下表)

runner に付与される predefined roles (F1 structural closure の後):

| #   | Role                                                          | 用途                                                                                        |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | `roles/cloudscheduler.admin`                                  | Phase 2: cron job CRUD                                                                      |
| 2   | `roles/artifactregistry.admin`                                | Phase 4: Docker repository metadata / IAM                                                   |
| 3   | `roles/cloudbuild.workerPoolOwner`                            | Phase 4: private pool CRUD (build submit 権限は含まず)                                      |
| 4   | `roles/iam.workloadIdentityPoolAdmin`                         | Phase 5: WIF Pool / Provider CRUD                                                           |
| 5   | `roles/run.admin`                                             | Phase 6a: Cloud Run resource shape 管理                                                     |
| 6   | `roles/compute.networkAdmin`                                  | Phase 7: LB address / backend / URL map / forwarding                                        |
| 7   | `roles/compute.securityAdmin`                                 | Phase 7: SSL cert                                                                           |
| 8   | `roles/iap.admin`                                             | Phase 7: IAP OAuth client + resource IAM                                                    |
| 9   | `roles/serviceusage.serviceUsageAdmin`                        | `google_project_service` (API enablement)                                                   |
| —   | (`projects/…/roles/terraformRunnerSecretManagerNoPolicyMgmt`) | custom role D1 (Secret Manager metadata / version CRUD、setIamPolicy / getIamPolicy を除外) |

**削除済** (F1 structural closure):

- ~~`roles/resourcemanager.projectIamAdmin`~~ (with `hasOnly` CEL) —
  Chain 1 の起点
- ~~`roles/iam.serviceAccountAdmin`~~ — Chain 2 の起点

### 追加 role が必要になったら

1. `scripts/bootstrap-terraform.sh` の該当箇所 (通常は `BOOTSTRAP_RUNNER_ROLES`
   または section 8 / 9) に追記
2. commit / PR / merge
3. project owner が bootstrap を再実行 (`bash scripts/bootstrap-terraform.sh`、
   idempotent)

Terraform 側の project-level `google_project_iam_member` 追記は **禁止**
(F1 structural closure を破ることになる)。break-glass 時は
`gcloud projects add-iam-policy-binding` を owner 権限で直接叩いてもよいが、
その場合も後で bootstrap script に反映して SSoT を維持する。

### Resource-scoped IAM は Terraform 側 SSoT

`iam_cloud_run.tf` の Cloud Run service / job IAM (build SA の run.admin、
scheduler SA の run.invoker) と Artifact Registry repo IAM (build SA の
artifactregistry.writer) は Terraform で継続管理する。これらは各 resource の
setIamPolicy 権限で書き込むため (runner は `roles/run.admin` /
`roles/artifactregistry.admin` を持つ)、F1 の構造上の問題は生じない。

## Custom role lifecycle (D1)

`terraformRunnerSecretManagerNoPolicyMgmt` (Secret Manager metadata / version
管理用 custom role) は bootstrap が SSoT で管理する。permissions を変更する
場合は `scripts/bootstrap-terraform.sh` の `CUSTOM_ROLE_PERMISSIONS` を
編集し、bootstrap を再実行する (`gcloud iam roles update` は idempotent)。

Terraform 側での `google_project_iam_custom_role` 宣言は **禁止** (runner が
`iam.roles.create` を持たないため fresh apply で F8 になる)。

## 初回セットアップ (1 度だけ、project owner が実行)

```bash
export PROJECT_ID=myrrh-rental-space
bash scripts/bootstrap-terraform.sh
```

**org-admin (`roles/iam.denyAdmin` at Organization / Folder scope) 権限は不要**
(Deny Policy は optional defense-in-depth に降格した後は project-owner のみで
完結する)。org-admin がない環境では Deny Policy step が warning で skip される
(または `SKIP_DENY_POLICY=1` で明示 skip)。primary control は runner の
structural closure (no `projectIamAdmin`, no `serviceAccountAdmin`) なので、
Deny Policy がなくても F1 は塞がっている。

bootstrap 完了後、`.github/workflows/terraform.yml` が

- **PR 時**: `terraform/**` の変更に対して `terraform plan` を実行 (PR コメント風の差分レビュー)
- **main への merge 時**: `terraform apply -auto-approve` を実行

を担う。

## 通常運用 (secret 追加時のフロー)

1. `cloudbuild.yaml` の `--set-secrets=` に新 secret を追加
2. `terraform/secrets.tf` の `runtime_secrets` (Cloud Build が読むなら
   `build_secrets` も) に追加
3. PR を出す → GitHub Actions で `terraform plan` が実行され差分表示
4. PR merge → `terraform apply` (secret metadata のみ差分反映)
5. Cloud Build deploy trigger → Cloud Run が新 secret を読める
   (runtime/build SA への project-level `secretAccessor` binding は bootstrap
   で既に付与済のため、追加 IAM 操作は不要 — project 内の全 secret に
   automatic access)

## ローカル運用 (差分確認したいとき、任意)

```bash
# GCS backend への access が必要 (bootstrap 完了後の project owner のみ)
cd terraform
terraform init
terraform plan
```

## F1 攻撃面のクロージャ理論

`roles/resourcemanager.projectIamAdmin` (with CEL) と
`roles/iam.serviceAccountAdmin` を runner から外したことで、runner
compromise 時の secret 漏洩経路は以下いずれも塞がる:

- **直接 read**: custom role D1 が `secretmanager.versions.access` を含まない
  (custom role は Secret Manager metadata / version 管理のみ)
- **runtime-sa impersonate**: `serviceAccountAdmin` がないため runtime-sa の
  IAM policy に tokenCreator を書き込めない
- **新 SA create → secretAccessor 付与**: `iam.serviceAccounts.create` が
  runner に無い (serviceAccountAdmin の一部)。加えて `projectIamAdmin` が
  無いため secretAccessor を新 SA に grant する経路もない
- **create-then-grant chain**: 上記いずれもゼロなので合成攻撃も不成立

追加の防御 (belt-and-suspenders):

- **Custom role D1** (`terraformRunnerSecretManagerNoPolicyMgmt`, bootstrap 管理):
  Secret Manager metadata / version 管理から `setIamPolicy` / `getIamPolicy` を
  除外することで、per-secret `SetIamPolicy` 経由の任意 principal への
  secretAccessor grant を封鎖 (Codex P1 F1 のオリジナル対応)
- **IAM Deny Policy** (optional、bootstrap 管理): runner-principal からの
  `secretmanager.versions.access/add/destroy/disable/enable` を deny。
  structural closure 後は理論上不要だが「後から手動 (Console) で runner に
  強力 role を付けた場合の belt-and-suspenders」として維持する価値あり。
  org-admin 権限がない環境では skip 可能。

## Appendix: 既存 project への one-time 移行 (2026-07-14 F1 refactor)

過去 (dual-SSoT: 一部 IAM が Terraform 側にあった) から新契約 (bootstrap-only)
への移行手順:

1. 本 PR を merge (`terraform/secret_iam.tf` + `terraform/iam_project.tf`
   削除、`service_accounts.tf` 内容の刈り込み、bootstrap script 拡張)
2. project owner が `bash scripts/bootstrap-terraform.sh` を再実行
   (`gcloud iam service-accounts create` は既存 SA でも describe-first で skip、
   `gcloud iam roles create/update` は idempotent、`gcloud …
add-iam-policy-binding` も idempotent)
3. Terraform state から下記 address を除去
   (GCP 側の実 binding は bootstrap で維持しているので `terraform state rm`
   のみで OK、実際の revocation は起きない):

   ```
   google_service_account.sa["runtime"]
   google_service_account.sa["build"]
   google_service_account.sa["scheduler"]
   google_service_account.sa["terraform_runner"]
   google_project_iam_member.runtime_secret_accessor
   google_project_iam_member.build_secret_accessor
   google_project_iam_member.build_sa_cloudbuild_builder
   google_project_iam_member.build_sa_log_writer
   google_service_account_iam_member.terraform_runner_uses_scheduler_sa
   google_service_account_iam_member.build_sa_uses_runtime_sa
   ```

4. `terraform apply` を実行し、drift ゼロ (No changes) を確認。
   destructive な変更が plan に出た場合、state rm が不完全 → apply しない、
   step 3 を再実行

新規 project (未 apply の fresh state) の場合は上記 step 3 は不要。

## F1 structural closure の検証 (attacker simulation)

以下いずれも `PERMISSION_DENIED` で失敗すれば F1 が塞がっている:

```bash
# Chain 2 の起点: 新規 SA 作成
gcloud iam service-accounts create attacker-test \
  --project="$PROJECT_ID" \
  --impersonate-service-account="$TERRAFORM_SA"

# Chain 1 の起点: project-level tokenCreator の付与
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$RUNTIME_SA" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --impersonate-service-account="$TERRAFORM_SA"

# Chain 2: 任意 SA への setIamPolicy
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:$TERRAFORM_SA" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --impersonate-service-account="$TERRAFORM_SA"
```

## Phase 8: Cloudflare (myrrh-jp.com zone)

Cloudflare (DNS / edge cache / Transform Rule / R2 / Turnstile) はこれまで
Dashboard 手動運用だったが、Sprint 3 で Terraform 管理下に取り込む
(drift 検知の nightly `terraform plan` に統合)。

**現状 (Foundation PR、この PR)**:

- `terraform/cloudflare_provider.tf` — Cloudflare provider `~> 5` の宣言のみ
- `terraform/versions.tf` の `required_providers` に `cloudflare = { source =
"cloudflare/cloudflare", version = "~> 5" }` を追加
- `terraform/variables.tf` に `cloudflare_zone_id` (default:
  `71192d17d6e20d432b9fe0ad48291277`) を追加
- CI 側 3 workflow (`deploy-production.yml` / `terraform.yml` /
  `terraform-drift.yml`) の Terraform init/plan/apply step に
  `CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_TERRAFORM_API_TOKEN }}` を注入

**現状の Foundation では実 resource は宣言しない** (v5 syntax は v4 と完全に
非互換な破壊的 rewrite で、既存 Cloudflare state を安全に adopt するには
`import {}` blocks と正確な resource ID mapping が必要)。次 PR (Phase 8 Step 2)
で existing state の inventory を元に実 resource + import blocks を宣言する。

### CLOUDFLARE_TERRAFORM_API_TOKEN

GitHub repo secret に user が保管済 (project owner が Cloudflare Dashboard で
発行、Zone.DNS Write / Zone.Zone Settings Write / Zone.Cache Rules Write /
Zone.Transform Rules Write / Zone.Rulesets Write / Account.R2 Storage Write /
Account.Turnstile Write を包含する広域 token)。

runtime 側 (Cloud Run) の `CLOUDFLARE_API_TOKEN` (Secret Manager 管理、Zone.Cache
Purge only) とは scope 分離してあり、rotation も独立して回す。詳細は
`terraform/cloudflare_provider.tf` の header comment 参照。

発行手順 (再発行時):
[Cloudflare docs / Create API token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)
を参照し、Zone Resources に "myrrh-jp.com" を limit するカスタム template で作成。

### user 実行手順 (Phase 8 Step 2 準備)

`scripts/enumerate-cloudflare.sh` が current Cloudflare state を dump する
helper。user が local で実行して inventory を Claude に共有 → Claude が
inventory 元に Phase 8 Step 2 PR (実 resource + import blocks) を書く。

```bash
# GitHub secret UI から CLOUDFLARE_TERRAFORM_API_TOKEN の値をコピー
export CLOUDFLARE_API_TOKEN="cf-tf-..."
bash scripts/enumerate-cloudflare.sh > cloudflare-inventory.txt
# cloudflare-inventory.txt は .gitignore 対象 (commit しない)。Claude に貼り付ける
```

## 関連 runbook

- [`docs/runbooks/gcp-dead-resource-cleanup.md`](../docs/runbooks/gcp-dead-resource-cleanup.md)
  — `CRON_SECRET` (Secret Manager) と
  `calendar-sync@myrrh-rental-space.iam.gserviceaccount.com` (SA) の削除手順。
  bootstrap-owned scope の破壊操作 (`secretmanager.secrets.delete` /
  `iam.serviceAccounts.delete`) は runner に権限が無いため project owner が
  手元で実行する。事前 grep 0-hits 確認 + gcloud delete + post-delete
  `gcloud secrets list` / `gcloud iam service-accounts list` までを checklist 化。

## References

- [Set up CI/CD for Terraform](https://cloud.google.com/architecture/setup-terraform-cicd) —
  runner authority を out-of-band で provision する公式パターン
- [terraform-google-bootstrap](https://github.com/terraform-google-modules/terraform-example-foundation/tree/master/0-bootstrap) —
  runner IAM を bootstrap で扱う reference implementation
- [Running infrastructure code with the least privilege possible](https://cloud.google.com/blog/products/devops-sre/running-infrastructure-code-least-privilege-possible) —
  self-declare cycle を避ける設計指針
- [Deny Policies overview](https://cloud.google.com/iam/docs/deny-overview) —
  Deny Policy 理論的裏付け
- [Setting limits on granting roles](https://cloud.google.com/iam/docs/setting-limits-on-granting-roles) —
  conditional `projectIamAdmin` の `modifiedGrantsByRole` CEL リファレンス
  (廃止された旧設計の参考)
