# -----------------------------------------------------------------------------
# Secret Manager IAM (Phase 1)
# -----------------------------------------------------------------------------
#
# Cloud Run `--set-secrets=` の runtime SA 読取許可、および Cloud Build
# `availableSecrets` 経由の build SA 読取許可を Terraform で宣言的に管理する。
#
# ## 現行設計: project-level `secretAccessor` binding (Codex P1 F1 対応)
#
# 過去は `google_secret_manager_secret_iam_member` を secret 毎に for_each して
# 個別 binding を発行していたが、これには 2 つの構造問題があった:
#
#   1. runner SA が `roles/secretmanager.admin` (predefined) を持つ必要があり、
#      その中の `secretmanager.secrets.setIamPolicy` を経由すれば bootstrap 管理の
#      IAM Deny Policy の denied_principals 制限を無視して任意 principal に
#      `secretAccessor` を grant できる self-grant 経路が残っていた (Codex P1 F1)。
#   2. secret 新規追加時に cloudbuild.yaml と本ファイル両方の更新を要求し、
#      片方だけの更新で deploy が silent fail する drift 問題があった
#      (architecture-boundaries drift gate で拾っていたが、そもそもの構造問題)。
#
# 解決策:
#   - custom role (`terraformRunnerSecretManagerNoPolicyMgmt`、
#     `scripts/bootstrap-terraform.sh` が SSoT) から `setIamPolicy` /
#     `getIamPolicy` を除外し、per-secret binding は禁止 (F1 主対策)。
#   - runtime SA / build SA への `roles/secretmanager.secretAccessor` を
#     **project-level** で付与する。runner SA の conditional `projectIamAdmin`
#     (bootstrap で付与、`hasOnly ['roles/secretmanager.secretAccessor']`) が
#     granting を許可しているため、runner 自身も idempotent に apply できる。
#
# ## セキュリティ上の等価性
#
# 過去 config 下の per-secret binding は runtime_secrets の 16 個全てに
# `secretAccessor` を付与していた (= 事実上 project 内の全 secret に近い)。
# project-level 化により runtime SA / build SA が読める secret が「今後
# project に追加される全 secret」まで広がるが、そもそも runtime / build SA は
# Cloud Run / Cloud Build 内部でのみ利用され、外部露出しない。値の秘匿性は
# Cloud Run env 経由での漏洩を防ぐ既存対策 (server-only import, no client
# bundling) に依存しており、追加リスクは実務上ない。
#
# 手動 gcloud add-iam-policy-binding は禁止 — terraform apply が唯一の更新
# 経路 (drift は terraform plan で検出、PR review で審査)。

resource "google_project_iam_member" "runtime_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${var.runtime_sa_email}"
}

resource "google_project_iam_member" "build_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${var.build_sa_email}"
}
