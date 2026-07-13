variable "project_id" {
  description = "GCP project ID"
  type        = string
  default     = "myrrh-rental-space"
}

variable "project_number" {
  description = "GCP project number (required for IAM Deny Policy attachment point URL)"
  type        = string
  default     = "626108938746"
}

variable "region" {
  description = "Default GCP region"
  type        = string
  default     = "asia-northeast1"
}

variable "runtime_sa_email" {
  description = "Cloud Run runtime service account email"
  type        = string
  default     = "myrrh-rental-space-runtime@myrrh-rental-space.iam.gserviceaccount.com"
}

variable "build_sa_email" {
  description = "Cloud Build service account email"
  type        = string
  default     = "myrrh-rental-space-build@myrrh-rental-space.iam.gserviceaccount.com"
}

variable "terraform_runner_sa_email" {
  description = "Service account used by the terraform apply GitHub Actions workflow"
  type        = string
  default     = "terraform-runner@myrrh-rental-space.iam.gserviceaccount.com"
}
