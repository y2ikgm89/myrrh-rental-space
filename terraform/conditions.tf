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
#
# 過去は Google predefined `roles/secretmanager.admin` を無条件付与していたが、
# それには `secretmanager.secrets.setIamPolicy` / `.getIamPolicy` が含まれるため、
# runner compromise 時に per-secret `SetIamPolicy` を直接叩いて任意 principal に
# `roles/secretmanager.secretAccessor` を付ける self-grant 経路が残っていた
# (deny.tf の deny は grantee identity ベースなので、他 principal 宛の grant は
# 素通りする — Codex P1 F1)。
#
# そこで custom role にして `setIamPolicy` / `getIamPolicy` を **明示的に除外** する。
# secret metadata の CRUD (create/delete/get/list/update)、version 管理
# (add/destroy/disable/enable/get/list) は残す — value の read (versions.access)
# は deny.tf が二重に封じる。
#
# Secret Manager IAM 反映は project-level binding (secret_iam.tf) に一本化し、
# per-secret SetIamPolicy は使わない (Google predefined `roles/secretmanager.admin`
# が担っていた per-secret binding は削除)。project-level `secretAccessor` 付与は
# conditions.tf 冒頭の conditional `projectIamAdmin`
# (modifiedGrantsByRole hasOnly ['roles/secretmanager.secretAccessor']) で
# 引き続き runner が実行できる。
resource "google_project_iam_custom_role" "terraform_runner_secretmanager" {
  project     = var.project_id
  role_id     = "terraformRunnerSecretManagerNoPolicyMgmt"
  title       = "TF Runner Secret Manager (no IAM policy mgmt)"
  stage       = "GA"
  description = "Closes Codex P1 F1: compromised runner otherwise grants secretAccessor to attacker-controlled principal via per-secret SetIamPolicy, bypassing deny.tf."
  permissions = [
    # secret metadata CRUD (含まれない: setIamPolicy / getIamPolicy → self-grant 遮断)
    "secretmanager.secrets.create",
    "secretmanager.secrets.delete",
    "secretmanager.secrets.get",
    "secretmanager.secrets.list",
    "secretmanager.secrets.update",
    # version 管理 (含まれない: versions.access → deny.tf が別途封鎖)
    "secretmanager.versions.add",
    "secretmanager.versions.destroy",
    "secretmanager.versions.disable",
    "secretmanager.versions.enable",
    "secretmanager.versions.get",
    "secretmanager.versions.list",
    # provider が refresh のために project 情報を読む
    "resourcemanager.projects.get",
  ]
}

resource "google_project_iam_member" "terraform_runner_secretmanager_admin" {
  project = var.project_id
  role    = google_project_iam_custom_role.terraform_runner_secretmanager.id
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

# Phase 5: Service Account admin (SA の CRUD / metadata 管理)。
# 実際の SA impersonation (actAs) は roles/iam.serviceAccountUser で個別に
# 管理し、runner 自身は他 SA として run する能力を持たない。
resource "google_project_iam_member" "terraform_runner_iam_sa_admin" {
  project = var.project_id
  role    = "roles/iam.serviceAccountAdmin"
  member  = "serviceAccount:${var.terraform_runner_sa_email}"
}

# Phase 5: Workload Identity Pool admin (WIF Pool + Provider CRUD)。
# 既存の `github-actions` pool を管理下に取るために必要。
resource "google_project_iam_member" "terraform_runner_wif_admin" {
  project = var.project_id
  role    = "roles/iam.workloadIdentityPoolAdmin"
  member  = "serviceAccount:${var.terraform_runner_sa_email}"
}

# Phase 6: Cloud Run admin (public / admin services + prisma-migrate job)。
# Terraform runner が Cloud Run resource を管理するのに必要。
# 実際のトラフィック管理 (traffic split 等) は Cloud Build が担うので、
# runner は shape の変更に閉じる (image tag は ignore_changes で cloudbuild
# 側に委譲、Phase 6b で完全移管予定)。
resource "google_project_iam_member" "terraform_runner_run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${var.terraform_runner_sa_email}"
}

# Phase 7: Compute Network admin (LB resources: address, backend service,
# URL map, SSL cert, target proxy, forwarding rule)。
resource "google_project_iam_member" "terraform_runner_compute_network_admin" {
  project = var.project_id
  role    = "roles/compute.networkAdmin"
  member  = "serviceAccount:${var.terraform_runner_sa_email}"
}

# Phase 7: Compute Security admin (SSL cert)。
resource "google_project_iam_member" "terraform_runner_compute_security_admin" {
  project = var.project_id
  role    = "roles/compute.securityAdmin"
  member  = "serviceAccount:${var.terraform_runner_sa_email}"
}

# Phase 7: IAP admin (OAuth client + resource IAM binding)。
resource "google_project_iam_member" "terraform_runner_iap_admin" {
  project = var.project_id
  role    = "roles/iap.admin"
  member  = "serviceAccount:${var.terraform_runner_sa_email}"
}

# Codex P1 F7: deny.tf の `google_iam_deny_policy` を runner SA が subsequent
# apply で refresh / update できるようにする。`iam.denypolicies.{get,create,
# update,delete,setIamPolicy}` は Google predefined `roles/iam.denyAdmin` の
# みが bundle しているため他に代替なし。projectIamAdmin の condition は
# `modifiedGrantsByRole` のみを見るため、denyAdmin 経路とは干渉しない。
resource "google_project_iam_member" "terraform_runner_deny_admin" {
  project = var.project_id
  role    = "roles/iam.denyAdmin"
  member  = "serviceAccount:${var.terraform_runner_sa_email}"
}
