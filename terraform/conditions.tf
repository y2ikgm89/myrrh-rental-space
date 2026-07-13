# -----------------------------------------------------------------------------
# IAM Conditions — Terraform runner SA の grantable roles を最小化
# -----------------------------------------------------------------------------
#
# Terraform runner SA は project-level で `roles/resourcemanager.projectIamAdmin`
# を持つ必要があるが、そのままだと任意の role を任意の principal に付与可能
# (privilege escalation の温床)。IAM Conditions で `modifiedGrantsByRole` を
# `secretmanager.secretAccessor` のみに制限し、grant 対象の role 種類を絞る。
#
# ただし IAM Conditions は「誰に付与できるか」の member 条件は書けないため、
# self-grant は文法上まだ可能。しかし self-grant で secretAccessor を得ても
# deny.tf の Deny Policy が versions.access を deny するため、実際に値を
# 読む経路は閉塞している (二重防御)。
#
# 参考:
#   - https://cloud.google.com/iam/docs/setting-limits-on-granting-roles
resource "google_project_iam_member" "terraform_runner_secret_iam_admin" {
  project = var.project_id
  role    = "roles/resourcemanager.projectIamAdmin"
  member  = "serviceAccount:${var.terraform_runner_sa_email}"

  condition {
    title       = "only_grant_secretmanager_secretAccessor"
    description = "Restrict grantable roles to Secret Manager secretAccessor only (privilege escalation guard, Codex P1 #1053)"
    expression  = "api.getAttribute('iam.googleapis.com/modifiedGrantsByRole', []).hasOnly(['roles/secretmanager.secretAccessor'])"
  }
}

# Phase 2: Cloud Scheduler resource admin for Terraform runner SA.
# job の CRUD が必要。cloudscheduler.admin は Cloud Scheduler service に閉じた
# 権限で、他 GCP resource への影響なし (data 漏洩 / privilege escalation なし)。
resource "google_project_iam_member" "terraform_runner_scheduler_admin" {
  project = var.project_id
  role    = "roles/cloudscheduler.admin"
  member  = "serviceAccount:${var.terraform_runner_sa_email}"
}

# Cloud Scheduler job は OIDC token 発行のために scheduler SA を service_account
# として指定する。Terraform runner が job resource を作成する際、その SA を
# `actAs` する権限が必要 (Google Cloud IAM の serviceAccountUser 契約)。
resource "google_service_account_iam_member" "terraform_runner_uses_scheduler_sa" {
  service_account_id = "projects/${var.project_id}/serviceAccounts/${var.scheduler_sa_email}"
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${var.terraform_runner_sa_email}"
}

# Phase 3: Secret Manager admin for Terraform runner SA (secret metadata の CRUD)。
# 値の read (versions.access) は deny.tf の Deny Policy で拒否されるため、
# compromise 時にも secret 値の漏洩は起きない。値の write (versions.add) は
# Terraform 側で扱わないため runner は使わない (runbook で project owner が
# gcloud を直接叩く運用)。
resource "google_project_iam_member" "terraform_runner_secretmanager_admin" {
  project = var.project_id
  role    = "roles/secretmanager.admin"
  member  = "serviceAccount:${var.terraform_runner_sa_email}"
}

# Phase 4: Artifact Registry admin (Docker repository の CRUD)。
# repository への image push は build SA が担うので、runner は image を
# push しない (metadata / IAM policy のみ管理)。
resource "google_project_iam_member" "terraform_runner_artifactregistry_admin" {
  project = var.project_id
  role    = "roles/artifactregistry.admin"
  member  = "serviceAccount:${var.terraform_runner_sa_email}"
}

# Phase 4: Cloud Build worker pool owner (private pool の CRUD)。
# 個別 build の submit 権限は含まないので、runner が deploy を横取りする経路は
# 作らない (deploy-production.yml が build SA として submit する既存契約を維持)。
resource "google_project_iam_member" "terraform_runner_cloudbuild_workerpool_owner" {
  project = var.project_id
  role    = "roles/cloudbuild.workerPoolOwner"
  member  = "serviceAccount:${var.terraform_runner_sa_email}"
}
