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
# - **`NEXT_PUBLIC_*` env は build 時に client / server bundle へ inline 化される**。
#   単一イメージを public / admin の両サービスへ配る構成なので、**runtime env を
#   surface ごとに変えても効かない**（監査 A-83）。値の SSoT は cloudbuild.yaml の
#   `_NEXT_PUBLIC_*` substitutions 側で、ここの runtime env は監査との突合用に
#   同じ値を置いているだけ。surface ごとに違う値が要るものは NEXT_PUBLIC_* にしない
#   （例: admin ドメインは server-only の `ADMIN_APP_URL`）。
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
    NEXT_PUBLIC_APP_URL            = var.public_domain
    NEXT_PUBLIC_TURNSTILE_SITE_KEY = var.next_public_turnstile_site_key
    NEXT_PUBLIC_GA_MEASUREMENT_ID  = var.next_public_ga_measurement_id
    ADMIN_APP_URL                  = var.admin_domain
    MAX_INSTANCES_HINT             = var.max_instances_hint
    RATE_LIMIT_BACKEND             = var.rate_limit_backend
  }

  # ---- Public service の plain env vars -------------------------------------
  # public は APP_SURFACE=public、BETTER_AUTH_URL は public_domain。
  cloud_run_public_env = merge(local.cloud_run_common_env, {
    APP_SURFACE     = "public"
    BETTER_AUTH_URL = var.public_domain

    # **ハンドオフの受け側。** cron service は runtime SA で public の
    # cron endpoint を叩く（`src/shared/lib/cron-revalidate-handoff.ts`）。
    # Cloud Scheduler の SA しか見ていないと弾かれるので、受け入れる SA を
    # 1 つ足す。cron / admin には入れない。
    CRON_HANDOFF_SERVICE_ACCOUNT_EMAIL = var.runtime_sa_email
  })

  # ---- Cron service の plain env vars ----------------------------------------
  # cron は public surface の image をそのまま動かす (`cloud_run_cron.tf` 冒頭)。
  # public との差は `CRON_OIDC_AUDIENCE` だけ — Cloud Run の IAM invoker check は
  # token の `aud` が service の URL か custom audience に一致することを要求する
  # ので、common env の `var.public_domain` のままでは platform 層で弾かれる。
  cloud_run_cron_env = merge(local.cloud_run_common_env, {
    APP_SURFACE        = "public"
    BETTER_AUTH_URL    = var.public_domain
    CRON_OIDC_AUDIENCE = var.cron_oidc_audience

    # **この env の有無が「自分は cron service か public か」を表す。**
    # 予約公開を検出したとき、public へ再検証を依頼する宛先。public 側では
    # 未設定なので、受けた側から再ディスパッチは起きない（無限ループ防止）。
    # 理由は `src/shared/lib/cron-revalidate-handoff.ts` の docblock。
    CRON_REVALIDATE_HANDOFF_URL = var.public_domain
  })

  # ---- Admin service の plain env vars --------------------------------------
  # admin は APP_SURFACE=admin、BETTER_AUTH_URL は admin_domain、
  # IAP / role groups 系 env が追加。
  #
  # `NEXT_PUBLIC_APP_URL` は common env にある（監査 A-83）。surface ごとに
  # 変えても効かないので、override map に置かないことで構造として示す。
  # admin ドメインが要る箇所は server-only の `ADMIN_APP_URL` → `getAdminAppUrl()`。
  cloud_run_admin_env = merge(local.cloud_run_common_env, {
    APP_SURFACE                        = "admin"
    BETTER_AUTH_URL                    = var.admin_domain
    IAP_JWT_AUDIENCE                   = var.iap_jwt_audience
    ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL = var.admin_role_group_super_admin_email
    ADMIN_ROLE_GROUP_ADMIN_EMAIL       = var.admin_role_group_admin_email
    ADMIN_ROLE_GROUP_EDITOR_EMAIL      = var.admin_role_group_editor_email
    ADMIN_ROLE_GROUP_VIEWER_EMAIL      = var.admin_role_group_viewer_email
  })
}
