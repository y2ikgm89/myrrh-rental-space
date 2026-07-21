# Terraform state backend.
#
# The GCS bucket is provisioned by scripts/bootstrap-terraform.sh once per
# project (idempotent). State locking is provided natively by the GCS backend
# via conditional writes on the state object's generation number (this has
# been the GCS backend's locking mechanism since early Terraform releases,
# not something introduced in 1.10) — no separate Cloud Firestore / Cloud
# Storage lock file is required.
terraform {
  backend "gcs" {
    bucket = "myrrh-rental-space-terraform-state"
    prefix = "prod"
  }
}
