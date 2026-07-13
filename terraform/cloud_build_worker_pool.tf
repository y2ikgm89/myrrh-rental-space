# -----------------------------------------------------------------------------
# Cloud Build worker pool (Phase 4)
# -----------------------------------------------------------------------------
#
# `cloudbuild.yaml` の options.pool で参照される private worker pool。
# deploy pipeline がこの pool で走る。実運用中の pool を Terraform 管理下に
# 取るため、Phase 4 の apply 前に `scripts/import-phase-4.sh` で state に
# 取り込む。取り込み後 `terraform plan` が「変更なし」で終わることを確認
# してから merge。差分が出た場合は本 resource の attributes を実測値に合わせる。

resource "google_cloudbuild_worker_pool" "deploy_pool" {
  name     = "myrrh-deploy-pool"
  location = var.region
  project  = var.project_id

  worker_config {
    disk_size_gb = 100

    # `e2-standard-2` (旧 declaration) は 8GB RAM しかなく、production build の
    # `next build` + Docker build が OOM で INTERNAL_ERROR を起こす (実例 #600 系)。
    # docs/gcp-production-setup.md L710 と cloudbuild.yaml L350-353 で
    # `e2-highmem-4` (32GB RAM) を必須と明記しているため、この Terraform
    # declaration も同じ値に固定する (Codex P1 F5)。
    machine_type   = "e2-highmem-4"
    no_external_ip = false
  }

  lifecycle {
    prevent_destroy = true
  }
}
