# -----------------------------------------------------------------------------
# IAM Deny Policy — Terraform runner SA の self-grant 経路の封鎖
# -----------------------------------------------------------------------------
#
# 過去の Codex Cloud Review P1 系列 (PR #1053 comment 3572078673 ほか) で
# 指摘された「pipeline SA が setIamPolicy を持つと、compromise 時に自分自身
# に roles/secretmanager.secretAccessor を付与して全 secret を読める」経路
# を、Google Cloud IAM Deny Policies で明示的に封じる。
#
# Deny Policy は allow policy に **無条件で優先**する (Google Cloud IAM 公式仕様、
# https://cloud.google.com/iam/docs/deny-overview)。従って:
#   - Terraform runner が (compromised でも) secretAccessor を self-grant
#   - しかし versions.access permission は Deny Policy で拒否
#   - secret 値は絶対に読めない
#
# 参考:
#   - https://cloud.google.com/iam/docs/deny-overview
#   - https://cloud.google.com/iam/docs/deny-permissions-support
resource "google_iam_deny_policy" "block_terraform_runner_from_reading_secrets" {
  provider = google-beta

  parent       = urlencode("cloudresourcemanager.googleapis.com/projects/${var.project_id}")
  name         = "block-terraform-runner-secret-value-read"
  display_name = "Block Terraform runner SA from reading Secret Manager values"

  rules {
    description = "Terraform runner needs to manage Secret Manager IAM policies and secret containers, but must never read secret values or mutate secret versions, to close both the self-grant-and-read and self-grant-and-inject/destroy paths (Codex P1 #1053, F2 follow-up)."
    deny_rule {
      denied_principals = [
        "principal://iam.googleapis.com/projects/-/serviceAccounts/${var.terraform_runner_sa_email}",
      ]
      denied_permissions = [
        # Read path (Codex P1 #1053).
        "secretmanager.googleapis.com/versions.access",
        # Write / lifecycle path (Codex P1 F2). Terraform never adds versions —
        # secret 値は Terraform 対象外 (secrets.tf のコメント参照) で、
        # docs/runbook/encryption-key-rotation.md に従って project owner
        # 相当 identity が `gcloud secrets versions add` で手動 rotate する
        # 運用のため、runner SA から下記 4 permission を denyしても正規
        # フローは影響を受けない。閉じるリスクは:
        #   - versions.add:      attacker-controlled secret injection
        #   - versions.destroy:  永続 DoS (compact 済み version は復旧不能)
        #   - versions.disable:  可逆 DoS
        #   - versions.enable:   compromised version の再有効化
        "secretmanager.googleapis.com/versions.add",
        "secretmanager.googleapis.com/versions.destroy",
        "secretmanager.googleapis.com/versions.disable",
        "secretmanager.googleapis.com/versions.enable",
      ]
    }
  }
}
