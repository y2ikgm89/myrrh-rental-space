variable "project_id" {
  description = "GCP project ID"
  type        = string
  default     = "myrrh-rental-space"
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

variable "cron_oidc_audience" {
  description = "cron service の OIDC custom audience (Cloud Run URL は作成後にしか決まらず自己参照が循環するため固定値を使う。到達先ではなくトークンの aud 値)"
  type        = string
  default     = "https://cron.myrrh-rental-space.invalid"
}

variable "public_domain" {
  description = "Public canonical domain (cron target URL prefix)"
  type        = string
  default     = "https://rental-space.myrrh-jp.com"
}

# -----------------------------------------------------------------------------
# Cloud Run env vars (Phase 6b、cloudbuild.yaml `--set-env-vars` から Terraform 化)
# -----------------------------------------------------------------------------
# default 値は `.github/workflows/deploy-production.yml` の env: block と
# `cloudbuild.yaml` の substitutions block の現行値と一致させている。
# 全て default を持つため CI 側 TF_VAR 追加不要 (drift-detect 完全化)。

# admin の canonical URL は 2026-08-30 に独自ドメインから Cloud Run の run.app URL
# へ移した（LB 全廃、段階 2）。理由は `terraform/cloud_run_admin.tf` の冒頭。
#
# **2 形式あり、どちらも同じサービスを指す**（`gcloud run services describe` の
# `urls`、実測 2026-08-30）:
#
#   https://myrrh-rental-space-admin-626108938746.asia-northeast1.run.app  ← 採用
#   https://myrrh-rental-space-admin-da57q4squa-an.a.run.app               （`uri`）
#
# 前者を採るのは **サービス名 + プロジェクト番号 + リージョンだけで決まり、
# 不透明なハッシュを含まない**ため。後者の `da57q4squa` は由来を説明できず、
# ドキュメントにも gate にも書き写せない。IAP は両方で同一に動く（実測: 3 経路とも
# `x-goog-iap-generated-response: true` で同じ OAuth client へ 302）。
variable "admin_domain" {
  description = "Admin service canonical URL (public URL の同型で BETTER_AUTH_URL/NEXT_PUBLIC_APP_URL に注入)"
  type        = string
  default     = "https://myrrh-rental-space-admin-626108938746.asia-northeast1.run.app"
  validation {
    condition     = can(regex("^https://[^/]+$", var.admin_domain))
    error_message = "admin_domain must be https URL without trailing slash (BETTER_AUTH_URL contract)."
  }
}

variable "next_public_turnstile_site_key" {
  description = "Cloudflare Turnstile widget sitekey (public, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` env)"
  type        = string
  default     = "0x4AAAAAADi6Bqavj97fu7JG"
}

variable "next_public_ga_measurement_id" {
  description = "Google Analytics 4 measurement ID (optional、empty で GA disable)"
  type        = string
  default     = ""
}

variable "database_pool_max" {
  description = "PostgreSQL pool size per Cloud Run instance (Neon cap 30 conn 上限: pool_max × 2 services × max_instances)"
  type        = number
  default     = 12
}

variable "encryption_key_id" {
  description = "Primary encryption key id (kid in v2 wire format). Bumps in atomic pair with ENCRYPTION_KEY secret version rotation"
  type        = string
  default     = "v1"
}

variable "audit_log_hmac_key_id" {
  description = "Primary AuditLog HMAC key id (v2 wire format). Bumps in atomic pair with AUDIT_LOG_HMAC_KEY secret version rotation"
  type        = string
  default     = "v1"
}

variable "max_instances_hint" {
  description = "Cloud Run max instances hint (env, runtime rate-limit backend guard で使用)"
  type        = string
  default     = "1"
}

variable "rate_limit_backend" {
  description = "Runtime rate-limit backend (in-memory only). instrumentation で max_instances_hint と cross-check"
  type        = string
  default     = "in-memory"
  validation {
    condition     = var.rate_limit_backend == "in-memory"
    error_message = "rate_limit_backend must be in-memory (Redis / Memorystore is out of scope)."
  }
}

variable "iap_jwt_audience" {
  description = "IAP JWT audience string (/projects/PROJECT_NUMBER/locations/REGION/services/ADMIN_SERVICE_NAME 形式、iap-jwt-verify.ts で検証)"
  type        = string
  default     = "/projects/626108938746/locations/asia-northeast1/services/myrrh-rental-space-admin"
}

variable "admin_role_group_super_admin_email" {
  description = "Admin role SUPER_ADMIN Google Group email (IAP identity から role 解決)"
  type        = string
  default     = "myrrh-super-admins@myrrh-jp.com"
}

variable "admin_role_group_admin_email" {
  description = "Admin role ADMIN Google Group email"
  type        = string
  default     = "myrrh-admins@myrrh-jp.com"
}

variable "admin_role_group_editor_email" {
  description = "Admin role EDITOR Google Group email"
  type        = string
  default     = "myrrh-editors@myrrh-jp.com"
}

variable "admin_role_group_viewer_email" {
  description = "Admin role VIEWER Google Group email"
  type        = string
  default     = "myrrh-viewers@myrrh-jp.com"
}

# -----------------------------------------------------------------------------
# Secret Manager version pinning (Phase 6b)
# -----------------------------------------------------------------------------
# 各 secret_id → version の map。cloudbuild.yaml の `_*_SECRET_VERSION` 相当。
# rotation 時: (1) Secret Manager に新 version 追加 → (2) map の対応 entry を
# bump → (3) terraform apply で Cloud Run が新 revision で新 version を pin。
# 全 secret を "latest" にしないのは、rotation の atomicity 保護 (Cloud Run が
# 明示的な version pin を持つことで、Secret Manager 側の意図しない自動追従を防ぐ)。

variable "cloud_run_secret_versions" {
  description = "Cloud Run env で pin する Secret Manager version の map (secret_id → version string)"
  type        = map(string)
  default = {
    # `DATABASE_URL` secret は **pooled 接続だけ**を入れる（runtime 専用）。
    # migrate job は `DIRECT_URL` secret を使うので、この secret に direct を
    # 混ぜない——混ぜると「意味を version 番号で区別する」ことになり、切替のたびに
    # pin の張り替えが要る。張り替え忘れは migrate が旧 DB を見て exit 0 で
    # 黙って終わる形になるので、役割ごとに secret を分けてある。
    #
    # v1 = 旧 DB の direct（歴史的経緯。もう誰も参照しない）
    # v2 = 旧 DB の pooled（切り戻し用に残す）
    # v3 = 新しい空 DB の pooled ← WP24 切替でここへ進む
    DATABASE_URL                       = "3"
    BETTER_AUTH_SECRET                 = "1"
    ENCRYPTION_KEY                     = "1"
    SECONDARY_ENCRYPTION_KEYS          = "1"
    AUDIT_LOG_HMAC_KEY                 = "1"
    NEXT_SERVER_ACTIONS_ENCRYPTION_KEY = "1"
    R2_ACCOUNT_ID                      = "1"
    R2_ACCESS_KEY_ID                   = "1"
    R2_SECRET_ACCESS_KEY               = "1"
    R2_BUCKET_NAME                     = "1"
    R2_PUBLIC_URL                      = "1"
    CLOUDFLARE_ZONE_ID                 = "1"
    CLOUDFLARE_API_TOKEN               = "1"
    CLOUDFLARE_ORIGIN_HEADER_SECRET    = "3"
    GOOGLE_CLIENT_ID                   = "1"
    GOOGLE_CLIENT_SECRET               = "1"
    # Phase C (2026-07-24): Phase B で versions/1 ENABLED 確認済み → Cloud Run 配線。
    # required (fail-closed) 化は配線緑確認後の follow-up PR。
    SUPPRESSION_HASH_SECRET = "1"
    # Inquiry attachments private bucket: versions/1 + Cloud Run 配線済み。
    R2_INQUIRIES_BUCKET_NAME = "1"
    # RESEND_WEBHOOK_SECRET: Tier 2 (Settings DB) 完了。ここに戻さない。
  }
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

variable "cloudflare_account_id" {
  description = "Cloudflare Account ID (Ikeakie@gmail.com's Account、Account API scope の resource 指定に使用 — R2 buckets / Turnstile widgets 等)"
  type        = string
  default     = "2c7478b2d4b8e06e50d1e62354026d66"
}

# -----------------------------------------------------------------------------
# Cloudflare shared secret (Phase 8 Phase 2c、Option A: 完全 drift-detect)
# -----------------------------------------------------------------------------
# `x-cloudflare-origin-secret` header の値。以下 3 箇所で同一値を維持する契約:
#   1. Cloudflare Transform Rule (この Terraform resource 経由で書き込む)
#   2. Cloud Run runtime `CLOUDFLARE_ORIGIN_HEADER_SECRET` (Secret Manager)
#   3. `src/shared/lib/rate-limit.ts:161` の timing-safe 比較の base
#
# **値は `.tf` / `.tfvars` に literal を書かず、GitHub Secret
# `CLOUDFLARE_ORIGIN_HEADER_SECRET_TF` から `TF_VAR_cloudflare_origin_header_secret`
# env 経由で供給する。** `.github/workflows/{deploy-production,terraform,terraform-drift}.yml`
# の env: block 参照。
#
# ## Rotation 手順（無停止・3 段）
#
# **同時に切り替えようとしない。** Cloudflare の Transform Rule と Cloud Run の
# revision は原子的に切り替えられないので、片側だけ新値になった瞬間が必ずできる。
# その窓では origin 側の照合が外れ、`extractClientIp` が全 request に `"unknown"` を
# 返す ＝ サイト全体が単一の rate-limit バケットに collapse する（自傷的な締め出し）。
#
# origin 側の `CLOUDFLARE_ORIGIN_HEADER_SECRET` は**受理してよい値の集合**
# （カンマ区切り）なので、「新旧どちらも受理する」状態を挟めば窓は消える。
# Cloudflare が注入する値は常に 1 個で、別の GH Secret から供給される。
#
# **`cloud_run_secret_versions` の pin を必ず一緒に上げる。** Cloud Run は
# `latest` ではなく明示 version を pin しているので、Secret Manager に version を
# 足しただけでは runtime は古い値のまま。deploy しても何も変わらず、
# 「反映されない」と誤診する原因になる。
#
# 0. 新 value 生成: `openssl rand -base64 32 | tr -d '=' | head -c 43`
#
#    旧 value は **`latest` から取らない。** Cloud Run は version を pin しているので
#    `latest` は「いま受理されている値」とは限らない（中断したローテーションが
#    version を残していれば別物になる）。それを `$old` に使うと、第 1 段で
#    `new,<無関係な値>` を配って Cloudflare の送る値が受理されなくなり、
#    この手順が避けようとしている collapse をその場で起こす。
#
#    **いま動いている revision が参照している version** から取る。まず version を読む:
#      gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format=json | jq -r '.spec.template.spec.containers[0].env[] | select(.name=="CLOUDFLARE_ORIGIN_HEADER_SECRET") | .valueFrom.secretKeyRef.key'
#    その番号で旧 value を取る:
#      old=$(gcloud secrets versions access "<番号>" --secret=CLOUDFLARE_ORIGIN_HEADER_SECRET)
#
#    `variables.tf` の map と食い違ったら、map を編集したまま deploy していない。
#    先にそれを解消する（動いている revision が正）。
#
# 1. **origin を両受理にする**（Cloudflare はまだ旧値を送る。挙動は変わらない）
#    a. `printf '%s' "$new,$old" | gcloud secrets versions add CLOUDFLARE_ORIGIN_HEADER_SECRET --data-file=-`
#       → 返ってきた version 番号を控える
#    b. この map の `CLOUDFLARE_ORIGIN_HEADER_SECRET` を その番号へ bump して main へ push
#    c. Deploy Production を実行（terraform apply が pin を張り替え、新 revision が両受理になる）
#
# 2. **Cloudflare を新値へ切り替える**
#    a. `printf '%s' "$new" | gh secret set CLOUDFLARE_ORIGIN_HEADER_SECRET_TF`
#    b. Deploy Production を実行（terraform apply が Transform Rule を同期）
#    origin は両方受理しているので、この切替に窓は無い。
#
# 3. **旧値を落とす**
#    a. `printf '%s' "$new" | gcloud secrets versions add CLOUDFLARE_ORIGIN_HEADER_SECRET --data-file=-`
#    b. この map を その番号へ bump して main へ push
#    c. Deploy Production を実行。旧値は以後受理されない。
#    旧 version の disable は運用判断（ロールバック余地を残すなら残す）。
#    **2026-08-21 確認:** version 1・2 は 2026-08-14 に DESTROYED。
#    DESTROYED は不可逆で `versions disable` は FAILED_PRECONDITION。
#    触ってよい ENABLED は pin の 3 だけ。
#
# **各段のあとに検証する。** 本番へ `x-cloudflare-origin-secret` 無しで直接到達し、
# rate-limit が効く（＝ `"unknown"` に落ちていない）ことを確認してから次へ進む。
# -----------------------------------------------------------------------------

variable "monitoring_alert_email" {
  description = "Cloud Monitoring alert notification email. Set via TF_VAR_monitoring_alert_email from GH Secret MONITORING_ALERT_EMAIL_TF. Not committed."
  type        = string
  sensitive   = true
  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.monitoring_alert_email))
    error_message = "monitoring_alert_email must be a valid email address. Set TF_VAR_monitoring_alert_email from GH Secret MONITORING_ALERT_EMAIL_TF."
  }
}

variable "cloudflare_origin_header_secret" {
  description = "Shared secret injected into `x-cloudflare-origin-secret` header by Cloudflare Transform Rule; must equal Cloud Run runtime `CLOUDFLARE_ORIGIN_HEADER_SECRET` Secret Manager value. Set via TF_VAR from GH Secret CLOUDFLARE_ORIGIN_HEADER_SECRET_TF."
  type        = string
  sensitive   = true
  # No default — TF_VAR must be provided from env.
  # Fail-closed: 空値だと `terraform apply` が validation error で abort
  # (rate-limit trust chain の silent 破損を防ぐ)。
  validation {
    condition     = length(var.cloudflare_origin_header_secret) >= 32
    error_message = "cloudflare_origin_header_secret must be at least 32 chars (rate-limit trust chain shared secret). Set TF_VAR_cloudflare_origin_header_secret from GH Secret CLOUDFLARE_ORIGIN_HEADER_SECRET_TF."
  }
}
