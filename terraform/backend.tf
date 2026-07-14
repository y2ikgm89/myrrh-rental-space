# Terraform state backend.
#
# The GCS bucket is provisioned by scripts/bootstrap-terraform.sh once per
# project (idempotent). State locking is provided by GCS conditional writes
# (Terraform 1.10+), so no separate Cloud Firestore / Cloud Storage lock file
# is required.
terraform {
  backend "gcs" {
    bucket = "myrrh-rental-space-terraform-state"
    prefix = "prod"
  }
}
