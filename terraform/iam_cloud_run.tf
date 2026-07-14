# -----------------------------------------------------------------------------
# Cloud Run resource-scoped IAM (Phase 6)
# -----------------------------------------------------------------------------
#
# Cloud Run service / job および Artifact Registry repository に対する
# **resource-scoped** IAM を集約管理する。project-level 付与は避け、resource 単位で
# 最小権限を厳守 (Google Cloud IAM 公式推奨)。
#
# ## bootstrap-owns-all-project-IAM 契約との切り分け (2026-07-14 F1 refactor)
#
# 以下 2 系統は Terraform では **宣言しない** (bootstrap の SSoT):
#   - runtime / build / scheduler SAs の metadata (create)
#   - project-level bindings (runtime-sa の secretAccessor、build-sa の
#     cloudbuild.builds.builder / logging.logWriter 等)
#   - cross-SA impersonation bindings (build → runtime actAs、runner → scheduler
#     actAs) — 過去はこのファイルにあった `build_sa_uses_runtime_sa` は削除、
#     bootstrap-terraform.sh の SA-scoped impersonation grant に移管
#
# 一方、Cloud Run service / job の resource IAM は本 config で扱う。runner は
# `roles/run.admin` / `roles/artifactregistry.admin` を持つため、これらの
# resource 内の IAM policy 書き込みは Terraform で問題なく管理できる。

# build SA → run.admin @ public service (deploy 権限)
resource "google_cloud_run_v2_service_iam_member" "build_sa_public_admin" {
  project  = google_cloud_run_v2_service.public.project
  location = google_cloud_run_v2_service.public.location
  name     = google_cloud_run_v2_service.public.name
  role     = "roles/run.admin"
  member   = "serviceAccount:${var.build_sa_email}"
}

# build SA → run.admin @ admin service (deploy 権限)
resource "google_cloud_run_v2_service_iam_member" "build_sa_admin_admin" {
  project  = google_cloud_run_v2_service.admin.project
  location = google_cloud_run_v2_service.admin.location
  name     = google_cloud_run_v2_service.admin.name
  role     = "roles/run.admin"
  member   = "serviceAccount:${var.build_sa_email}"
}

# build SA → run.admin @ prisma-migrate job (image update 権限)
resource "google_cloud_run_v2_job_iam_member" "build_sa_migrate_admin" {
  project  = google_cloud_run_v2_job.prisma_migrate.project
  location = google_cloud_run_v2_job.prisma_migrate.location
  name     = google_cloud_run_v2_job.prisma_migrate.name
  role     = "roles/run.admin"
  member   = "serviceAccount:${var.build_sa_email}"
}

# scheduler SA → run.invoker @ public service (Cloud Scheduler cron 呼び出し用)
resource "google_cloud_run_v2_service_iam_member" "scheduler_sa_public_invoker" {
  project  = google_cloud_run_v2_service.public.project
  location = google_cloud_run_v2_service.public.location
  name     = google_cloud_run_v2_service.public.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.scheduler_sa_email}"
}

# build SA → artifactregistry.writer @ Docker repo (image push)
resource "google_artifact_registry_repository_iam_member" "build_sa_docker_writer" {
  project    = google_artifact_registry_repository.docker.project
  location   = google_artifact_registry_repository.docker.location
  repository = google_artifact_registry_repository.docker.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${var.build_sa_email}"
}
