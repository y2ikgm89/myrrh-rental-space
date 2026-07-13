# -----------------------------------------------------------------------------
# Project-level IAM bindings (Phase 5)
# -----------------------------------------------------------------------------
#
# project-level で付与する必要のある IAM binding を宣言的に管理する。
# resource-scoped IAM (Cloud Run service ごと / Artifact Registry repo ごと等)
# は Phase 6-7 で該当 resource と併せて Terraform 化する。
#
# 現行の grants (docs/gcp-production-setup.md から抽出):
#   - build SA:
#       - cloudbuild.builds.builder  (build 実行に必須)
#       - logging.logWriter           (Cloud Logging 書込)
#   - scheduler SA:
#       - (Cloud Scheduler service agent は Google 管理、Terraform 対象外)
#   - runtime SA:
#       - (Secret Manager は Phase 1、他は Phase 6 で resource-scoped)
#
# 参考: docs/gcp-production-setup.md の "Grant the build identity only the
# deployment permissions it needs" section。project-level grant は最小に留め、
# 詳細は resource-scoped で付与する原則。

resource "google_project_iam_member" "build_sa_cloudbuild_builder" {
  project = var.project_id
  role    = "roles/cloudbuild.builds.builder"
  member  = "serviceAccount:${google_service_account.sa["build"].email}"
}

resource "google_project_iam_member" "build_sa_log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.sa["build"].email}"
}
