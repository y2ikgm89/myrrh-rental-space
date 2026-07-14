# -----------------------------------------------------------------------------
# Service Accounts — bootstrap-only ownership (2026-07-14 F1 refactor)
# -----------------------------------------------------------------------------
#
# **本 config は SA metadata を宣言しない**。runtime / build / scheduler /
# terraform_runner の 4 SA は `scripts/bootstrap-terraform.sh` が SSoT で
# create/manage する (bootstrap-owns-all-project-IAM 契約)。
#
# 過去はここに `resource "google_service_account" "sa" { for_each = ... }` と
# `resource "google_service_account_iam_member" "terraform_runner_uses_scheduler_sa"`
# を宣言していたが、以下 2 経路で secret 漏洩の抜け道が残っていたため削除:
#
#   - runner が `roles/resourcemanager.projectIamAdmin` (with CEL `hasOnly`) を
#     持つ限り、新規 SA を作成 → その SA に `secretAccessor` を付与 → 自身から
#     tokenCreator で impersonate、の chain で secret 値を読める。CEL は grantable
#     role を絞るが grantee は絞らないので防げない。
#   - runner が `roles/iam.serviceAccountAdmin` を持つ限り、任意 SA の
#     `iam.serviceAccounts.setIamPolicy` を呼べる → 任意 SA を impersonate する
#     tokenCreator を自分に付与できる。
#
# 両 role を runner から外し (F1 structural closure)、runner が touching できない
# 全 project-level IAM (SA create、cross-SA impersonation grant、runtime/build SA
# への secretAccessor など) を bootstrap に集約した。
#
# ## Terraform 側でこの config が担う責務
#
# 何もない (このファイルはドキュメンテーション目的で残す)。他 SA を参照する
# コードは `var.runtime_sa_email` / `var.build_sa_email` / `var.scheduler_sa_email`
# を直接使う (variables.tf で default 済み)。terraform-runner SA は Terraform
# code から参照不要 (自分自身の credential で apply を走らせる、参照必要な
# 場面もない) のため variable も削除済 (2026-07-14 F2 follow-up)。
#
# resource-scoped IAM (Cloud Run service ごと / Artifact Registry repo ごと等)
# は `terraform/iam_cloud_run.tf` に集約 (runner は各 resource の setIamPolicy
# 権限を run.admin / artifactregistry.admin 経由で持つため、Terraform で管理可能)。
