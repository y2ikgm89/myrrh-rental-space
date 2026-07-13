# -----------------------------------------------------------------------------
# Identity-Aware Proxy (IAP) for admin service (Phase 7 skeleton)
# -----------------------------------------------------------------------------
#
# Cloud Run direct IAP を admin service に付けて、Google Workspace / Cloud
# Identity グループ経由の access を制御する。OAuth client 本体 + admin group
# の httpsResourceAccessor binding が Terraform 対象。
#
# 参考: docs/gcp-production-setup.md の IAP setup section。

locals {
  admin_role_groups = {
    super_admin = "myrrh-super-admins@myrrh-jp.com"
    admin       = "myrrh-admins@myrrh-jp.com"
    editor      = "myrrh-editors@myrrh-jp.com"
    viewer      = "myrrh-viewers@myrrh-jp.com"
  }
}

# IAP OAuth brand + client は初回 setup で Console から作成される。
# Terraform で新規作成すると本番 IAP を壊すため import 前提 (google_iap_brand
# は project-level singleton、`google_iap_client` は brand への child)。
# ここでは brand は宣言せず client のみ扱う。project owner が Console で
# brand を作成しておく前提 (既存)。

# 4 admin groups に httpsResourceAccessor を付与 (Cloud Run direct IAP 経由)
resource "google_iap_web_type_compute_iam_member" "admin_access" {
  for_each = local.admin_role_groups

  project = var.project_id
  role    = "roles/iap.httpsResourceAccessor"
  member  = "group:${each.value}"
}
