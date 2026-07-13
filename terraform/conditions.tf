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
