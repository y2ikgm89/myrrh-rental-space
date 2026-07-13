# -----------------------------------------------------------------------------
# Cloud Run resource-scoped IAM (Phase 6)
# -----------------------------------------------------------------------------
#
# Cloud Run service / job に対する resource-scoped IAM を集約管理する。
# project-level 付与は避け、resource 単位で最小権限を厳守 (Google Cloud IAM
# 公式推奨)。

# build SA → run.admin @ public service (deploy 権限)
resource "google_cloud_run_v2_service_iam_member" "build_sa_public_admin" {
  project  = google_cloud_run_v2_service.public.project
  location = google_cloud_run_v2_service.public.location
  name     = google_cloud_run_v2_service.public.name
  role     = "roles/run.admin"
  member   = "serviceAccount:${google_service_account.sa["build"].email}"
}

# build SA → run.admin @ admin service (deploy 権限)
resource "google_cloud_run_v2_service_iam_member" "build_sa_admin_admin" {
  project  = google_cloud_run_v2_service.admin.project
  location = google_cloud_run_v2_service.admin.location
  name     = google_cloud_run_v2_service.admin.name
  role     = "roles/run.admin"
  member   = "serviceAccount:${google_service_account.sa["build"].email}"
}

# build SA → run.admin @ prisma-migrate job (image update 権限)
resource "google_cloud_run_v2_job_iam_member" "build_sa_migrate_admin" {
  project  = google_cloud_run_v2_job.prisma_migrate.project
  location = google_cloud_run_v2_job.prisma_migrate.location
  name     = google_cloud_run_v2_job.prisma_migrate.name
  role     = "roles/run.admin"
  member   = "serviceAccount:${google_service_account.sa["build"].email}"
}

# build SA → iam.serviceAccountUser @ runtime SA (deploy 時に runtime SA を actAs)
resource "google_service_account_iam_member" "build_sa_uses_runtime_sa" {
  service_account_id = google_service_account.sa["runtime"].name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.sa["build"].email}"
}

# scheduler SA → run.invoker @ public service (Cloud Scheduler cron 呼び出し用)
resource "google_cloud_run_v2_service_iam_member" "scheduler_sa_public_invoker" {
  project  = google_cloud_run_v2_service.public.project
  location = google_cloud_run_v2_service.public.location
  name     = google_cloud_run_v2_service.public.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.sa["scheduler"].email}"
}

# build SA → artifactregistry.writer @ Docker repo (image push)
resource "google_artifact_registry_repository_iam_member" "build_sa_docker_writer" {
  project    = google_artifact_registry_repository.docker.project
  location   = google_artifact_registry_repository.docker.location
  repository = google_artifact_registry_repository.docker.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.sa["build"].email}"
}
