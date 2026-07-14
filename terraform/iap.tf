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

# -----------------------------------------------------------------------------
# Import blocks (Terraform 1.7+) — adopt pre-existing GCP resources into state
# instead of attempting create (avoids 409 on fresh state, first-time bootstrap).
# These are no-op after the first apply; safe to keep long-term for docs.
#
# `google_iap_web_cloud_run_service_iam_member` import ID format is:
#   projects/{project}/iap_web/cloud_run-{region}-{service} {role} {member}
# (space-separated 3-part ID per Terraform google provider docs).
# -----------------------------------------------------------------------------
import {
  for_each = local.admin_role_groups
  to       = google_iap_web_cloud_run_service_iam_member.admin_access[each.key]
  id       = "projects/${var.project_id}/iap_web/cloud_run-${var.region}-myrrh-rental-space-admin roles/iap.httpsResourceAccessor group:${each.value}"
}

# IAP OAuth brand + client は初回 setup で Console から作成される。
# Terraform で新規作成すると本番 IAP を壊すため import 前提 (google_iap_brand
# は project-level singleton、`google_iap_client` は brand への child)。
# ここでは brand は宣言せず client のみ扱う。project owner が Console で
# brand を作成しておく前提 (既存)。

# 4 admin groups に httpsResourceAccessor を付与 (Cloud Run direct IAP のスコープ)。
#
# `google_iap_web_type_compute_iam_member` は Compute Engine backend
# (LB backend service) のための resource で、Cloud Run direct IAP には
# scope が合わない (実際 admin service に対する IAP アクセスを制御しない)。
# docs/gcp-production-setup.md §admin service = Cloud Run direct IAP に合わせ、
# `google_iap_web_cloud_run_service_iam_member` を使う (Codex P1 #1063 follow-up)。
resource "google_iap_web_cloud_run_service_iam_member" "admin_access" {
  for_each = local.admin_role_groups

  project                = var.project_id
  location               = var.region
  cloud_run_service_name = google_cloud_run_v2_service.admin.name
  role                   = "roles/iap.httpsResourceAccessor"
  member                 = "group:${each.value}"
}
