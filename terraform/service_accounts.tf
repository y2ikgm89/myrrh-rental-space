# -----------------------------------------------------------------------------
# Service Accounts (Phase 5)
# -----------------------------------------------------------------------------
#
# GCP project 内の Cloud Run runtime / Cloud Build / Cloud Scheduler の各 SA を
# 宣言的に管理する。既存 SA は `scripts/import-phase-5.sh` で state に取り込む。
#
# Terraform runner SA (`terraform-runner@...`) 自体は `scripts/bootstrap-terraform.sh`
# が作成する (chicken-and-egg 回避)。ただし本 Terraform config で import して
# 状態を管理下に置くため display_name / description の drift 検出は行われる。
#
# ## Runner IAM 所有モデル (2026-07-14 更新)
#
# terraform runner SA 自身の project-level bindings は Terraform で宣言しない
# (Google 公式パターン — cloud.google.com/architecture/setup-terraform-cicd)。
# `scripts/bootstrap-terraform.sh` が SSoT で、runner が自分自身の IAM policy を
# self-declare する chicken-egg cycle を物理的に排除する。cross-SA impersonation
# (runner が scheduler SA を actAs するなど) は Terraform で宣言できる
# (grantor と grantee が異なる SA なので self-declare にはならない)。

locals {
  service_accounts = {
    runtime = {
      account_id   = "myrrh-rental-space-runtime"
      display_name = "Cloud Run runtime + Prisma migrate Job"
      description  = "Runs Cloud Run public / admin services and the prisma-migrate Cloud Run Job. Reads runtime secrets via Secret Manager."
    }
    build = {
      account_id   = "myrrh-rental-space-build"
      display_name = "Cloud Build deploy pipeline"
      description  = "Runs Cloud Build steps (image build/push, Cloud Run deploy). Impersonated by GitHub Actions deploy-production.yml via WIF."
    }
    scheduler = {
      account_id   = "myrrh-rental-space-scheduler"
      display_name = "Cloud Scheduler OIDC caller"
      description  = "Issues OIDC tokens for Cloud Scheduler → Cloud Run cron invocations."
    }
    terraform_runner = {
      account_id   = "terraform-runner"
      display_name = "Terraform runner (GitHub Actions)"
      description  = "Impersonated by .github/workflows/terraform.yml via WIF. Applies infra config declared in terraform/."
    }
  }
}

resource "google_service_account" "sa" {
  for_each = local.service_accounts

  project      = var.project_id
  account_id   = each.value.account_id
  display_name = each.value.display_name
  description  = each.value.description
}

# -----------------------------------------------------------------------------
# Cross-SA impersonation (Phase 2)
# -----------------------------------------------------------------------------
#
# Cloud Scheduler job は OIDC token 発行のために scheduler SA を service_account
# として指定する。Terraform runner が job resource を作成する際、その SA を
# `actAs` する権限が必要 (Google Cloud IAM の serviceAccountUser 契約)。
#
# 本 binding は grantor (runner SA) と grantee (scheduler SA) が異なる SA への
# 権限付与なので、bootstrap-only runner IAM の設計不変式 (runner 自身の
# project-level bindings は Terraform で扱わない) には抵触しない。ゆえに
# Terraform 側の SSoT で維持する。scheduler SA という target resource の
# 定義箇所と局所化するため、resource locality の観点で service_accounts.tf
# に配置する (2026-07-14 に conditions.tf 削除に伴い当ファイルへ再配置)。
resource "google_service_account_iam_member" "terraform_runner_uses_scheduler_sa" {
  service_account_id = "projects/${var.project_id}/serviceAccounts/${var.scheduler_sa_email}"
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${var.terraform_runner_sa_email}"
}
