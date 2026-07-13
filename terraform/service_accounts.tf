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
