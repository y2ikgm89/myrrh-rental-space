# -----------------------------------------------------------------------------
# Cloud Run runtime env locals (Phase 6b)
# -----------------------------------------------------------------------------
#
# `google_cloud_run_v2_service.template.containers.env` に注入する env vars を
# 集中管理する SSoT。cloudbuild.yaml `--set-env-vars=...` の完全代替として、
# public / admin / migrate Job 用の env set を declarative に構築する。
#
# ## 設計原則
#
# - **共通 env は `cloud_run_common_env` に集約**、public / admin で異なる key
#   のみ各 map で override。DRY (Don't Repeat Yourself) 原則。
# - **secret refs は `secrets.tf` の `google_secret_manager_secret.secret[<id>]`
#   を経由**。secret container の Terraform SSoT を再利用。
# - **secret version pinning は `var.cloud_run_secret_versions` map**。
#   rotation は 1 箇所 (variables.tf) の update で全 secret refs に反映される。
# - **`NEXT_PUBLIC_*` env は build-time にも影響**する (Next.js は build 中に
#   client bundle へ inline 化)。Cloud Run runtime env と build-time (cloudbuild.yaml
#   builder-base の ARG→ENV) の両側で同期が必要 → migration 完了までは
#   cloudbuild.yaml の `_NEXT_PUBLIC_*` substitutions は build 用途で残す。
# -----------------------------------------------------------------------------

locals {
  # ---- 両サービス共通の plain env vars ---------------------------------------
  cloud_run_common_env = {
    NODE_ENV                       = "production"
    NEXT_TELEMETRY_DISABLED        = "1"
    DATABASE_POOL_MAX              = tostring(var.database_pool_max)
    AUDIT_LOG_HMAC_KEY_ID          = var.audit_log_hmac_key_id
    ENCRYPTION_KEY_ID              = var.encryption_key_id
    CRON_OIDC_AUDIENCE             = var.public_domain
    CRON_SERVICE_ACCOUNT_EMAIL     = var.scheduler_sa_email
    NEXT_PUBLIC_BASE_URL           = var.public_domain
    NEXT_PUBLIC_TURNSTILE_SITE_KEY = var.next_public_turnstile_site_key
    NEXT_PUBLIC_GA_MEASUREMENT_ID  = var.next_public_ga_measurement_id
    ADMIN_APP_URL                  = var.admin_domain
    MAX_INSTANCES_HINT             = var.max_instances_hint
    RATE_LIMIT_BACKEND             = var.rate_limit_backend
  }

  # ---- Public service の plain env vars -------------------------------------
  # public は APP_SURFACE=public、NEXT_PUBLIC_APP_URL/BETTER_AUTH_URL は public_domain。
  cloud_run_public_env = merge(local.cloud_run_common_env, {
    APP_SURFACE         = "public"
    NEXT_PUBLIC_APP_URL = var.public_domain
    BETTER_AUTH_URL     = var.public_domain
  })

  # ---- Admin service の plain env vars --------------------------------------
  # admin は APP_SURFACE=admin、NEXT_PUBLIC_APP_URL/BETTER_AUTH_URL は admin_domain、
  # IAP / role groups 系 env が追加。
  cloud_run_admin_env = merge(local.cloud_run_common_env, {
    APP_SURFACE                        = "admin"
    NEXT_PUBLIC_APP_URL                = var.admin_domain
    BETTER_AUTH_URL                    = var.admin_domain
    IAP_JWT_AUDIENCE                   = var.iap_jwt_audience
    ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL = var.admin_role_group_super_admin_email
    ADMIN_ROLE_GROUP_ADMIN_EMAIL       = var.admin_role_group_admin_email
    ADMIN_ROLE_GROUP_EDITOR_EMAIL      = var.admin_role_group_editor_email
    ADMIN_ROLE_GROUP_VIEWER_EMAIL      = var.admin_role_group_viewer_email
  })
}
