# terraform/

Google Cloud infra の宣言的管理 (IaC)。**terraform apply が唯一の正規更新経路** で、
手動 `gcloud add-iam-policy-binding` などは行わない。

## Phase 進捗

このディレクトリは Phase を追って全 GCP infra を段階的に取り込む:

| Phase | スコープ                                                                                            | 状態      |
| ----- | --------------------------------------------------------------------------------------------------- | --------- |
| 1     | Secret Manager IAM (runtime SA / build SA 全 secret への secretAccessor) + Deny Policy + Conditions | ✅ 完了   |
| 2     | Cloud Scheduler (13 cron jobs)                                                                      | ✅ 完了   |
| 3     | Secret Manager secrets 本体 (16 secrets の metadata)                                                | ✅ 完了   |
| 4     | Artifact Registry + Cloud Build worker pool                                                         | ✅ 完了   |
| 5     | Service Accounts + project-level IAM + WIF Pool/Provider                                            | ✅ 完了   |
| 6a    | Cloud Run services + Job skeleton + resource-scoped IAM (env/secrets 移管は Phase 6b)               | ✅ 完了   |
| 7     | Load Balancer + IAP (admin service 用、DNS は Cloudflare 側で管理のため対象外)                      | 🚧 実装中 |

## ファイル構成

| ファイル                     | 責務                                                                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `versions.tf`                | Terraform / provider の version pin                                                                                                                                  |
| `backend.tf`                 | GCS state backend (`myrrh-rental-space-terraform-state`)                                                                                                             |
| `variables.tf`               | project_id / region / SA email 等の入力                                                                                                                              |
| `secret_iam.tf`              | Phase 1: `google_secret_manager_secret_iam_member` × 全 secret                                                                                                       |
| `deny.tf`                    | Phase 1: `google_iam_deny_policy` (Terraform runner SA から secret 値読取を deny)                                                                                    |
| `conditions.tf`              | Phase 1: Terraform runner SA への conditional `projectIamAdmin` (secretAccessor のみ grantable) + Phase 2: cloudscheduler.admin / serviceAccountUser on scheduler SA |
| `cloud_scheduler.tf`         | Phase 2: `google_cloud_scheduler_job` × 13 cron jobs (Cloud Run `/api/cron/*` を OIDC で叩く)                                                                        |
| `secrets.tf`                 | Phase 3: `google_secret_manager_secret` × 16 secrets の metadata (値は Terraform 対象外、prevent_destroy で誤削除 block)                                             |
| `artifact_registry.tf`       | Phase 4: `google_artifact_registry_repository` (Docker)                                                                                                              |
| `cloud_build_worker_pool.tf` | Phase 4: `google_cloudbuild_worker_pool` (myrrh-deploy-pool)                                                                                                         |

## 初回セットアップ (1 度だけ、project owner が実行)

```bash
export PROJECT_ID=myrrh-rental-space
bash scripts/bootstrap-terraform.sh
```

上記は以下を idempotent に構成する:

1. GCS state bucket (`gs://myrrh-rental-space-terraform-state`, versioning ON)
2. Terraform runner service account (`terraform-runner@...`)
3. Workload Identity Federation binding (既存 pool `github-actions` を再利用)
4. state bucket への runner SA の書込許可 (`roles/storage.objectAdmin` @ bucket)
5. runner SA への project-level roles bootstrap grant
   (`conditions.tf` の各 role を最初の `terraform apply` が通せるようにする
   chicken-egg 対策。conditional `projectIamAdmin` + `cloudscheduler.admin` /
   `artifactregistry.admin` / `cloudbuild.workerPoolOwner` /
   `iam.serviceAccountAdmin` / `iam.workloadIdentityPoolAdmin` /
   `iam.denyAdmin` (Codex P1 F7 — deny.tf の `google_iam_deny_policy` refresh 用) /
   `run.admin` / `compute.networkAdmin` / `compute.securityAdmin` / `iap.admin`。
   同じ member+role を `conditions.tf` が再宣言するため apply 後は Terraform 側の
   SSoT に取り込まれる。
   `secretmanager.admin` は Codex P1 F1 で削除し、custom role
   `terraformRunnerSecretManagerNoPolicyMgmt` に置換 — この custom role は
   最初の apply (owner 実行) で生成される。)

bootstrap 完了後、`.github/workflows/terraform.yml` が

- **PR 時**: `terraform/**` の変更に対して `terraform plan` を実行 (PR コメント風の差分レビュー)
- **main への merge 時**: `terraform apply -auto-approve` を実行

を担う。

## 通常運用 (secret 追加時のフロー)

1. `cloudbuild.yaml` の `--set-secrets=` に新 secret を追加
2. `terraform/secret_iam.tf` の `runtime_secrets` に同じ secret 名を追加
3. PR を出す → GitHub Actions で `terraform plan` が実行され差分表示
4. PR merge → `terraform apply` で runtime SA へ secretAccessor が反映
5. Cloud Build deploy trigger → Cloud Run が新 secret を読める

`architecture-boundaries.test.ts` の drift gate が step 1 と 2 の同期を CI で
強制するため、片方だけ更新した PR は unit test で block される。

## ローカル運用 (差分確認したいとき、任意)

```bash
# GCS backend への access が必要 (bootstrap 完了後の project owner のみ)
cd terraform
terraform init
terraform plan
```

## Deny Policy と Conditions がある理由

`roles/resourcemanager.projectIamAdmin` を Terraform runner SA に付与すると、
compromise 時に **self-grant で `secretmanager.secretAccessor` を得て全 secret を読む**
経路が理論的に存在する (Codex Cloud Review P1 系列で反復指摘された)。

- **Conditions** (`conditions.tf`): grantable roles を `secretmanager.secretAccessor` のみに絞ることで、runner が他の role (`secretmanager.admin` など) を self-grant して権限拡大するのを block。
- **Deny Policy** (`deny.tf`): `secretmanager.googleapis.com/versions.access` を runner SA に対して deny することで、self-grant で secretAccessor を得ても secret 値そのものは読めない (allow policy に優先する)。

この 2 層防御で **runner SA の compromise ケースでも secret 漏洩ゼロ** を保証する。
