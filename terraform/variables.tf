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

variable "scheduler_sa_email" {
  description = "Cloud Scheduler OIDC service account (Phase 2)"
  type        = string
  default     = "myrrh-rental-space-scheduler@myrrh-rental-space.iam.gserviceaccount.com"
}

variable "public_domain" {
  description = "Public canonical domain (cron target URL prefix)"
  type        = string
  default     = "https://rental-space.myrrh-jp.com"
}

# WIF attribute assertions — bootstrap 済み provider の attribute_condition と
# 一致させるために必要 (Codex P1 F3)。docs/gcp-production-setup.md §WIF で
# 既存 provider を作成した際の値を tfvars に固定 (repository_id は GitHub
# repository の数値 ID、repository_owner_id は owner user/org の数値 ID)。
variable "github_repository_id" {
  description = "GitHub repository numeric ID for WIF attribute_condition (immutable across renames — prevents mapping bypass; docs/gcp-production-setup.md L155)"
  type        = string
  default     = "1128842422"
}

variable "github_repository_owner_id" {
  description = "GitHub repository owner (user/org) numeric ID for WIF attribute_condition (docs/gcp-production-setup.md L156)"
  type        = string
  default     = "69025248"
}

# -----------------------------------------------------------------------------
# Cloudflare (Phase 8)
# -----------------------------------------------------------------------------
# Cloudflare API token は変数化しない — provider v5 は環境変数
# `CLOUDFLARE_API_TOKEN` を自動採用する契約 (CI 側 workflow の env: に
# `CLOUDFLARE_TERRAFORM_API_TOKEN` secret を注入する)。tfvars / variables.tf に
# 露出させないことで、`terraform plan` の diff 出力や state file への literal
# token 漏洩リスクを最小化する。
# -----------------------------------------------------------------------------

variable "cloudflare_zone_id" {
  description = "Cloudflare Zone ID for myrrh-jp.com (Dashboard の Overview 右サイドバー 'API' 欄からコピー)"
  type        = string
  default     = "71192d17d6e20d432b9fe0ad48291277"
}
