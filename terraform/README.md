# terraform/

Google Cloud infra の宣言的管理 (IaC)。**terraform apply が唯一の正規更新経路** で、
手動 `gcloud add-iam-policy-binding` などは行わない (Terraform runner SA 自身の
project-level IAM を除く — 下記 "Runner IAM ownership contract" 参照)。

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

| ファイル                     | 責務                                                                                                                                                                                                                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `versions.tf`                | Terraform / provider の version pin                                                                                                                                                                                                                                                                      |
| `backend.tf`                 | GCS state backend (`myrrh-rental-space-terraform-state`)                                                                                                                                                                                                                                                 |
| `variables.tf`               | project_id / region / SA email 等の入力                                                                                                                                                                                                                                                                  |
| `secret_iam.tf`              | Phase 1: runtime SA / build SA への `roles/secretmanager.secretAccessor` project-level binding                                                                                                                                                                                                           |
| `deny.tf`                    | Phase 1: `google_iam_deny_policy` (Terraform runner SA から secret 値読取・version 破壊を deny、`prevent_destroy=true`)。refresh には project-scope custom role `terraformRunnerDenyPolicyManager` が必要で bootstrap が付与済み (`roles/iam.denyAdmin` は Organization/Folder scope 専用のため使用不可) |
| `service_accounts.tf`        | Phase 5: 4 SA (runtime / build / scheduler / terraform_runner) と cross-SA impersonation (runner → scheduler SA `actAs`, Phase 2)                                                                                                                                                                        |
| `iam_project.tf`             | Phase 5: build SA への project-level bindings (cloudbuild.builds.builder / logging.logWriter)。runner 自身の bindings は Terraform で扱わない (bootstrap-only 契約 — 下記参照)                                                                                                                           |
| `cloud_scheduler.tf`         | Phase 2: `google_cloud_scheduler_job` × 13 cron jobs (Cloud Run `/api/cron/*` を OIDC で叩く)                                                                                                                                                                                                            |
| `secrets.tf`                 | Phase 3: `google_secret_manager_secret` × 16 secrets の metadata (値は Terraform 対象外、prevent_destroy で誤削除 block)                                                                                                                                                                                 |
| `artifact_registry.tf`       | Phase 4: `google_artifact_registry_repository` (Docker)                                                                                                                                                                                                                                                  |
| `cloud_build_worker_pool.tf` | Phase 4: `google_cloudbuild_worker_pool` (myrrh-deploy-pool)                                                                                                                                                                                                                                             |
| `wif.tf`                     | Phase 5: Workload Identity Pool / Provider (`github-actions`)                                                                                                                                                                                                                                            |
| `iam_cloud_run.tf`           | Phase 6a: Cloud Run service resource-scoped IAM                                                                                                                                                                                                                                                          |
| `cloud_run_public.tf`        | Phase 6a: public service skeleton                                                                                                                                                                                                                                                                        |
| `cloud_run_admin.tf`         | Phase 6a: admin service skeleton                                                                                                                                                                                                                                                                         |
| `cloud_run_migrate_job.tf`   | Phase 6a: prisma-migrate Cloud Run Job skeleton                                                                                                                                                                                                                                                          |
| `lb_admin.tf`                | Phase 7: admin service 用 HTTPS LB (backend service + URL map + SSL cert + forwarding rule)                                                                                                                                                                                                              |
| `iap.tf`                     | Phase 7: IAP OAuth client + resource IAM binding                                                                                                                                                                                                                                                         |

## Runner IAM ownership contract

**Terraform runner SA (`terraform-runner@…`) の project-level IAM は
`scripts/bootstrap-terraform.sh` が単一 SSoT。** Terraform config は runner
自身の project-level bindings を宣言しない (設計不変式)。

これは Google 公式パターン
[Set up CI/CD for Terraform](https://cloud.google.com/architecture/setup-terraform-cicd)
と [terraform-google-bootstrap](https://github.com/terraform-google-modules/terraform-example-foundation/tree/master/0-bootstrap)
の "runner authority は out-of-band、Terraform は downstream infra を管理"
原則に沿う。過去の dual-SSoT (bootstrap と Terraform の両方で同じ binding を
宣言) はチキンエッグを構造的に排除できず、下記 2 系統の障害を反復させた:

- **F8 chicken-egg**: 新規 role を Terraform 側に足すと、runner にはまだ
  該当 permission が無いため apply が Permission denied で落ちる。bootstrap
  も同時に更新すれば済むが、順序依存 (先に bootstrap 実行) が必須になり、
  fresh project の初回セットアップと既存 project の追加変更で運用手順が分岐する。
- **Codex P1 D1 fallout**: runner の `projectIamAdmin` に conditional
  `modifiedGrantsByRole hasOnly ['roles/secretmanager.secretAccessor']` を
  かけているため、runner が自分自身の bindings を再宣言する SetIamPolicy
  呼び出しさえ 403 (grant 対象 role が secretAccessor 以外を含むと condition
  で拒否)。dual-SSoT はこの条件と両立できない。

### 現在の bootstrap-only レイアウト

`scripts/bootstrap-terraform.sh` が runner SA へ以下を idempotent に付与する
(下記は [Set up CI/CD for Terraform](https://cloud.google.com/architecture/setup-terraform-cicd)
の "grant the pipeline account the roles it needs to manage infrastructure"
step と 1:1 対応):

| #   | Role                                                                    | 条件 / 備考                                                                                                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `roles/resourcemanager.projectIamAdmin`                                 | conditional (`modifiedGrantsByRole hasOnly ['roles/secretmanager.secretAccessor']`) — secretAccessor grant 専用                                                                                                                                                  |
| 2   | `projects/${PROJECT_ID}/roles/terraformRunnerSecretManagerNoPolicyMgmt` | custom role (GA、12 permissions)。setIamPolicy / getIamPolicy を除外し F1 self-grant 経路を封鎖                                                                                                                                                                  |
| 3   | `roles/cloudscheduler.admin`                                            | Phase 2: cron job CRUD                                                                                                                                                                                                                                           |
| 4   | `roles/artifactregistry.admin`                                          | Phase 4: Docker repository metadata / IAM                                                                                                                                                                                                                        |
| 5   | `roles/cloudbuild.workerPoolOwner`                                      | Phase 4: private pool CRUD (build submit 権限は含まず)                                                                                                                                                                                                           |
| 6   | `roles/iam.serviceAccountAdmin`                                         | Phase 5: 他 SA の CRUD                                                                                                                                                                                                                                           |
| 7   | `roles/iam.workloadIdentityPoolAdmin`                                   | Phase 5: WIF Pool / Provider CRUD                                                                                                                                                                                                                                |
| 8   | custom role `terraformRunnerDenyPolicyManager` (GA、4 permissions)      | Phase 1: `deny.tf` refresh (`iam.denypolicies.{create,get,list,update}`)。`delete` / `setIamPolicy` を除外して compromised runner が deny policy を破棄・IAM 委譲する経路を封鎖。predefined `roles/iam.denyAdmin` は Org/Folder 専用のため使用不可 (Codex P1 F7) |
| 9   | `roles/run.admin`                                                       | Phase 6a: Cloud Run resource shape 管理 (traffic split は Cloud Build)                                                                                                                                                                                           |
| 10  | `roles/compute.networkAdmin`                                            | Phase 7: LB address / backend service / URL map / target proxy / forwarding rule                                                                                                                                                                                 |
| 11  | `roles/compute.securityAdmin`                                           | Phase 7: SSL cert                                                                                                                                                                                                                                                |
| 12  | `roles/iap.admin`                                                       | Phase 7: IAP OAuth client + resource IAM                                                                                                                                                                                                                         |

これに加えて `roles/storage.objectAdmin` を state bucket (`gs://…-terraform-state`)
に bucket-scope で付与し、`roles/iam.workloadIdentityUser` を WIF principalSet
に対して SA-level で付与する。

### 追加 role が必要になったら

1. `scripts/bootstrap-terraform.sh` の該当箇所 (通常は `BOOTSTRAP_RUNNER_ROLES`) に追記
2. commit / PR / merge
3. project owner が bootstrap を再実行 (`bash scripts/bootstrap-terraform.sh`、idempotent)

Terraform 側の追記は **禁止** (dual SSoT を再導入すると F8 が再発する)。
break-glass 時は `gcloud projects add-iam-policy-binding` を owner 権限で
直接叩いてもよいが、その場合も後で bootstrap script に反映して SSoT を維持する。

### Cross-SA impersonation は Terraform 側 SSoT

`service_accounts.tf` の
`google_service_account_iam_member.terraform_runner_uses_scheduler_sa` (runner
が scheduler SA を `actAs` する権限) は例外的に Terraform で宣言する。理由は
grantor (runner) と grantee (scheduler SA) が異なる SA なので、runner が
自分自身の policy を触るわけではなく、bootstrap-only 制約に抵触しない
(project-level `projectIamAdmin` ではなく SA-level `serviceAccountUser` として
scheduler SA の IAM policy に書き込む — runner の `iam.serviceAccountAdmin`
権限で可能)。

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

上記は以下を idempotent に構成する:

1. GCS state bucket (`gs://myrrh-rental-space-terraform-state`, versioning ON)
2. Terraform runner service account (`terraform-runner@...`)
3. state bucket への runner SA の書込許可 (`roles/storage.objectAdmin` @ bucket)
4. Workload Identity Federation binding (既存 pool `github-actions` を再利用)
5. runner SA への conditional `projectIamAdmin` (secretAccessor grant 専用)
6. Secret Manager custom role `terraformRunnerSecretManagerNoPolicyMgmt` の
   create/update (`gcloud iam roles create/update --stage=GA`、12 permissions)
7. custom role の runner SA への grant
8. 残り 10 個の predefined roles (Phase 2-7 に必要な最小権限セット) の grant

bootstrap 完了後、`.github/workflows/terraform.yml` が

- **PR 時**: `terraform/**` の変更に対して `terraform plan` を実行 (PR コメント風の差分レビュー)
- **main への merge 時**: `terraform apply -auto-approve` を実行

を担う。

## 通常運用 (secret 追加時のフロー)

1. `cloudbuild.yaml` の `--set-secrets=` に新 secret を追加
2. `terraform/secret_iam.tf` は無変更で OK (project-level binding なので新 secret も自動で accessible)
3. PR を出す → GitHub Actions で `terraform plan` が実行され差分表示
4. PR merge → `terraform apply` (secret metadata のみ差分反映)
5. Cloud Build deploy trigger → Cloud Run が新 secret を読める

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

- **Conditions** (bootstrap の `--condition` フラグで CEL 適用): grantable roles を
  `secretmanager.secretAccessor` のみに絞ることで、runner が他の role
  (`secretmanager.admin` など) を self-grant して権限拡大するのを block。
  過去は `terraform/conditions.tf` の `google_project_iam_member` に
  `condition {}` block として宣言していたが、2026-07-14 の bootstrap-only
  refactor でファイル自体を削除し、gcloud の `--condition` フラグで直接付与
  する構成に移した (semantic は完全同一)。
- **Deny Policy** (`deny.tf`): `secretmanager.googleapis.com/versions.access` /
  `.add` / `.destroy` / `.disable` / `.enable` を runner SA に対して deny する
  ことで、self-grant で secretAccessor を得ても secret 値そのものは読めない
  / 破壊できない (allow policy に優先する)。Terraform で declarative に維持し、
  refresh は bootstrap-granted custom role `terraformRunnerDenyPolicyManager`
  で runner が行う (`roles/iam.denyAdmin` predefined は Org/Folder 専用)。
  `iam.denypolicies.delete` を除外 + `lifecycle { prevent_destroy = true }`
  の 2 層防御で compromised runner が guard を bypass するため deny policy を
  削除する経路を封鎖。
- **Custom role D1** (`terraformRunnerSecretManagerNoPolicyMgmt`, bootstrap 管理):
  Secret Manager metadata / version 管理から `setIamPolicy` / `getIamPolicy`
  を除外することで、per-secret `SetIamPolicy` 経由の任意 principal への
  secretAccessor grant (Codex P1 F1) を封鎖。
- **Custom role D2** (`terraformRunnerDenyPolicyManager`, bootstrap 管理):
  Deny Policy 管理から `iam.denypolicies.delete` / `setIamPolicy` / `getIamPolicy`
  を除外することで、compromised runner が deny policy を消して secret guard を
  bypass する経路 / deny policy 自身の IAM を委譲する経路を封鎖 (Codex P1 F7)。

この 3 層防御で **runner SA の compromise ケースでも secret 漏洩ゼロ** を保証する。

## Appendix: 既存 project への one-time 移行 (2026-07-14 refactor)

過去の dual-SSoT (Terraform runner 自身の bindings が `conditions.tf` にも
declare されていた) 状態から bootstrap-only へ移行する場合の手順:

1. 本 PR を merge (`terraform/conditions.tf` 削除 + bootstrap script 拡張)
2. project owner が `bash scripts/bootstrap-terraform.sh` を再実行
   (`gcloud iam roles create/update` は既存 role でも idempotent に動く)
3. Terraform state から下記 13 個の address を除去
   (GCP 側の実 binding は bootstrap で維持しているので `terraform state rm`
   のみで OK、実際の revocation は起きない):

   ```
   google_project_iam_member.terraform_runner_secret_iam_admin
   google_project_iam_member.terraform_runner_scheduler_admin
   google_project_iam_custom_role.terraform_runner_secretmanager
   google_project_iam_member.terraform_runner_secretmanager_admin
   google_project_iam_member.terraform_runner_artifactregistry_admin
   google_project_iam_member.terraform_runner_cloudbuild_workerpool_owner
   google_project_iam_member.terraform_runner_iam_sa_admin
   google_project_iam_member.terraform_runner_wif_admin
   google_project_iam_member.terraform_runner_deny_admin
   google_project_iam_member.terraform_runner_run_admin
   google_project_iam_member.terraform_runner_compute_network_admin
   google_project_iam_member.terraform_runner_compute_security_admin
   google_project_iam_member.terraform_runner_iap_admin
   ```

   `google_service_account_iam_member.terraform_runner_uses_scheduler_sa` は
   ファイル移動 (conditions.tf → service_accounts.tf) だけで、address 自体は
   変わらないので state 操作不要。

4. `terraform apply` を実行し、drift ゼロ (No changes) を確認

新規 project (未 apply の fresh state) の場合は上記 step 3 は不要で、
bootstrap 実行後に最初の `terraform apply` を通せばよい。

## References

- [Set up CI/CD for Terraform](https://cloud.google.com/architecture/setup-terraform-cicd) —
  runner authority を out-of-band で provision する公式パターン
- [terraform-google-bootstrap](https://github.com/terraform-google-modules/terraform-example-foundation/tree/master/0-bootstrap) —
  runner IAM を bootstrap で扱う reference implementation
- [Running infrastructure code with the least privilege possible](https://cloud.google.com/blog/products/devops-sre/running-infrastructure-code-least-privilege-possible) —
  self-declare cycle を避ける設計指針
- [Deny Policies overview](https://cloud.google.com/iam/docs/deny-overview) —
  `deny.tf` の理論的裏付け
- [Setting limits on granting roles](https://cloud.google.com/iam/docs/setting-limits-on-granting-roles) —
  conditional `projectIamAdmin` の `modifiedGrantsByRole` CEL リファレンス
