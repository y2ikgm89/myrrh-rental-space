# -----------------------------------------------------------------------------
# Cloudflare zone rulesets (Phase 8 Phase 2b)
# -----------------------------------------------------------------------------
#
# myrrh-jp.com zone の zone-owned rulesets 2 個 (Cache Rules / Transform Rules) を
# Terraform state に adopt。3 番目 (URL Normalize、`fb9413d7...`) は Cloudflare 側の
# permission 制約で user token では fetch/write 不可のため Terraform 化スコープ外。
#
# ## 対象範囲 (2 / 6 rulesets)
#
# ### Zone-owned rulesets (Terraform 管理下)
#
# 1. **Cache Rules** (`10cdb82ec6da47b08a63ec3e280732d4`, phase=`http_request_cache_settings`)
#    - 1 rule "public-pages-cacheable" — 公開ページのみ edge cache (`browser_ttl=respect_origin`,
#      `edge_ttl=bypass_by_default`, `respect_strong_etags=true`)、admin/api/reservation/mypage/
#      login/contact/preview prefix は bypass
#    - `browser_cache_ttl=0` (zone setting) + `edge_ttl=bypass_by_default` (rule) の組合わせで
#      "デフォルト cache しない → 公開ページのみ強く cache" を実現
#
# 2. **Transform Rules** (`8a8f3f173cd7443eb24296e21bf60f0f`, phase=`http_request_late_transform`)
#    - 1 rule "Add origin secret header for Cloud Run" — rental-space / admin の Cloud Run 到達
#      request に `x-cloudflare-origin-secret: <shared_secret>` header を注入
#    - **⚠️ SECURITY-CRITICAL**: これが `src/shared/lib/rate-limit.ts` の trust chain。
#      Origin 側 (Cloud Run) は `CLOUDFLARE_ORIGIN_HEADER_SECRET` (Secret Manager) と timing-safe
#      比較 → 一致時のみ `cf-connecting-ip` を trust して rate-limit の bucket key に使う。
#      この Rule が silent に削除されると全 request が同一 bucket に collapse → rate-limit bypass。
#
# ### Skip (Terraform 化対象外、README で明記)
#
# - Managed rulesets 3 個 (Cloudflare Normalization / WAF Free / DDoS L7) — Cloudflare 側で
#   閉じた管理、user token では read/write 不可 (`request is not authorized`)
# - URL Normalize (`fb9413d7...`) zone-owned だが user token に必要な scope が付与不能
#   (Cloudflare 側 read/write 権限が「managed rulesets 相当」扱い)。Dashboard 手動運用継続。
# - Page Rules — 現状 0 個 (Free plan max 3 の枠は未使用)
#
# ## Transform Rule secret value の取扱い (Phase 2c: Option A、完全 drift-detect)
#
# `x-cloudflare-origin-secret` の value は Cloud Run 側 Secret Manager
# `CLOUDFLARE_ORIGIN_HEADER_SECRET` と一致させる共有 secret。**Terraform config には
# literal を書かず** `var.cloudflare_origin_header_secret` (sensitive) 経由で
# GitHub Secret `CLOUDFLARE_ORIGIN_HEADER_SECRET_TF` から `TF_VAR_...` env 供給:
#
# - **`.tf` / `.tfvars` に literal 露出なし** (git blame / plan diff で secret 見えない)
# - **`terraform plan` 出力は `(sensitive value)` 表示** (sensitive = true の効果)
# - **state file には値が格納される**が GCS backend encrypted-at-rest + IAM 制限で保護
# - **rule 構造 (expression / operation / header name) + value 全て drift-detect 有効**
#   (Phase 2b の `lifecycle.ignore_changes = [rules]` を撤去)
#
# ## Rotation 手順 (完全 IaC、`variables.tf` の cloudflare_origin_header_secret 参照)
#
# 1. 新 value 生成: `openssl rand -base64 32 | tr -d '=' | head -c 43`
# 2. Secret Manager に新 version 追加:
#    `printf '%s' "$new_value" | gcloud secrets versions add CLOUDFLARE_ORIGIN_HEADER_SECRET --data-file=-`
# 3. Cloud Run 新 revision deploy (新 Secret Manager version を参照)
# 4. **数分待ち** (旧 revision draining 中に header ずれると rate-limit 誤 block 発火)
# 5. GH Secret 更新: `printf '%s' "$new_value" | gh secret set CLOUDFLARE_ORIGIN_HEADER_SECRET_TF`
# 6. 次回 push で `terraform apply` が Cloudflare Transform Rule を自動同期
# -----------------------------------------------------------------------------

# ============================================================================
# Import blocks (Terraform 1.7+) — fresh apply 時の adoption
# ============================================================================

import {
  to = cloudflare_ruleset.cache_rules
  id = "${var.cloudflare_zone_id}/10cdb82ec6da47b08a63ec3e280732d4"
}

import {
  to = cloudflare_ruleset.transform_rules_late
  id = "${var.cloudflare_zone_id}/8a8f3f173cd7443eb24296e21bf60f0f"
}

# ============================================================================
# Cache Rules (phase=http_request_cache_settings)
# ============================================================================

resource "cloudflare_ruleset" "cache_rules" {
  zone_id = var.cloudflare_zone_id
  name    = "default"
  kind    = "zone"
  phase   = "http_request_cache_settings"

  rules = [
    {
      description = "public-pages-cacheable"
      enabled     = true
      action      = "set_cache_settings"
      expression  = "(not starts_with(http.request.uri.path, \"/admin\")) and\n(not starts_with(http.request.uri.path, \"/api\")) and\n(not starts_with(http.request.uri.path, \"/reservation\")) and\n(not starts_with(http.request.uri.path, \"/mypage\")) and\n(not starts_with(http.request.uri.path, \"/login\")) and\n(not starts_with(http.request.uri.path, \"/contact\")) and\n(not starts_with(http.request.uri.path, \"/preview\"))"
      action_parameters = {
        cache = true
        browser_ttl = {
          mode = "respect_origin"
        }
        edge_ttl = {
          mode = "bypass_by_default"
        }
        respect_strong_etags = true
        serve_stale = {
          disable_stale_while_updating = false
        }
      }
    }
  ]
}

# ============================================================================
# Transform Rules — Late (phase=http_request_late_transform)
# ============================================================================
#
# Phase 2c 移行 (2026-07-14): Option B (lifecycle.ignore_changes) → Option A
# (sensitive TF_VAR + GH Secret) に完全移行。rule 構造 + value drift 全 detect。
resource "cloudflare_ruleset" "transform_rules_late" {
  zone_id = var.cloudflare_zone_id
  name    = "default"
  kind    = "zone"
  phase   = "http_request_late_transform"

  rules = [
    {
      description = "Add origin secret header for Cloud Run"
      enabled     = true
      action      = "rewrite"
      expression  = "(http.host eq \"rental-space.myrrh-jp.com\" or http.host eq \"admin.myrrh-jp.com\")"
      action_parameters = {
        headers = {
          # value は sensitive TF_VAR 経由 (GH Secret CLOUDFLARE_ORIGIN_HEADER_SECRET_TF)。
          # `.tf` / `.tfvars` に literal 露出なし、plan 出力は `(sensitive value)`。
          "x-cloudflare-origin-secret" = {
            operation = "set"
            value     = var.cloudflare_origin_header_secret
          }
        }
      }
    }
  ]
}
