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
    disk_size_gb   = 100
    machine_type   = "e2-standard-2"
    no_external_ip = false
  }

  lifecycle {
    prevent_destroy = true
  }
}
