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
# ## Transform Rule secret value の取扱い
#
# `x-cloudflare-origin-secret` の value (`gbcSujIrlsriYJWW+e5Q+pA3toYQAIUyxQ6K+XGI0q0=`) は
# Cloud Run 側 Secret Manager `CLOUDFLARE_ORIGIN_HEADER_SECRET` と一致させる共有 secret。
# **Terraform config には literal を書かず** placeholder + `lifecycle.ignore_changes = [rules]` で
# state 経由の初回 adoption 後は value drift を無視する:
#
# - **Import 時**: 実 value が Cloudflare API から取得され state に格納 (state file は GCS 側で
#   encrypted-at-rest、IAM 制限あり)。git にも .tf にも value は入らない。
# - **以降の apply**: `ignore_changes = [rules]` により rule 全体 (expression / operation /
#   header name / value) が drift 未検知になる。**現状の trade-off** で、rule 構造変更も
#   detect できない代わりに、value を config に literal 書かずに済む。
#
# 将来的な改善案 (別 PR で検討可): `variable "cloudflare_origin_header_secret"` を
# `sensitive = true` で導入し、`TF_VAR_...` 経由で GitHub Secret から供給 → drift-detect 完全化。
# 現状は user 追加作業ゼロで済む Option B (ignore_changes) を採用。
#
# ## Rotation 手順 (out-of-band manual、Terraform 経由しない)
#
# 1. 新 value を生成 (`openssl rand -base64 32` 相当、URL-safe)
# 2. `gcloud secrets versions add CLOUDFLARE_ORIGIN_HEADER_SECRET --data-file=-` で
#    Secret Manager に新 version 追加
# 3. Cloud Run runtime service を新 revision で deploy (新 secret version を参照)
# 4. **数分待ち** (旧 revision draining 中に header がずれると rate-limit が誤 block 発火)
# 5. Cloudflare Dashboard → Rules → Transform Rules → 該当 rule → value を新 value に更新
# 6. Terraform apply は不要 (`ignore_changes` により value drift は無視される)
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
# ⚠ `lifecycle.ignore_changes = [rules]` の意義:
#   x-cloudflare-origin-secret の value を .tf / git / plan 出力に露出させないため、
#   import 経由で state に value を格納した後は rules 全体を drift 未検知にする。
#   rotation は out-of-band 手動 (上記ファイルヘッダーの "Rotation 手順" 参照)。
#   trade-off: rule 追加/削除・expression 変更も detect できない。secret 露出回避を優先。
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
          # value は placeholder。実 value は import 経由で state に adopt 済み、
          # rotation は Dashboard で行う (lifecycle.ignore_changes で value drift 無視)。
          "x-cloudflare-origin-secret" = {
            operation = "set"
            value     = "MANAGED_OUT_OF_BAND_SEE_FILE_HEADER"
          }
        }
      }
    }
  ]

  lifecycle {
    ignore_changes = [rules]
  }
}
