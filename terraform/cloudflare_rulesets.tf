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
#    - 1 rule "Add origin secret header for Cloud Run" — Cloud Run 到達 request に
#      `x-cloudflare-origin-secret: <shared_secret>` header を注入
#    - **⚠️ SECURITY-CRITICAL**: これが `src/shared/lib/rate-limit.ts` の trust chain。
#      Origin 側 (Cloud Run) は `CLOUDFLARE_ORIGIN_HEADER_SECRET` (Secret Manager) と timing-safe
#      比較 → 一致時のみ `cf-connecting-ip` を trust して rate-limit の bucket key に使う。
#      この Rule が silent に削除されると全 request が同一 bucket に collapse → rate-limit bypass。
#    - **対象は rental-space だけ**。2026-08-30 に admin 用の外部 LB と
#      `admin.myrrh-jp.com` の DNS を廃止したので、expression から admin の host 条件を
#      外した（存在しない host は永久に一致せず、読む人を誤らせるだけ）。
#      **admin の client IP は Cloud Run direct IAP 経由の `x-forwarded-for` の末尾**
#      から取る — `rate-limit.ts` の `extractGoogleFrontendClientIp`（監査 A-26）。
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
# ## Rotation 手順（無停止・3 段、`variables.tf` にも同じ節がある）
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

# ============================================================================
# Import blocks (Terraform 1.7+) — fresh apply 時の adoption
# ============================================================================

# ⚠ Cloudflare provider v5 の `cloudflare_ruleset` は import ID に discriminator
# prefix (`zones/` or `accounts/`) を必須とする (公式 docs: `<{accounts|zones}/
# {account_id|zone_id}>/<ruleset_id>`)。v4 系の raw ID 形式は v5.22.0+ で reject
# され `Error: invalid discriminator segment` で terraform plan が abort する。
# 参考: https://github.com/cloudflare/terraform-provider-cloudflare/blob/main/docs/resources/ruleset.md
#
# PR #1098 は v4 相当の raw ID 形式で書いてしまい、その後 PR #1099 で lock file を
# commit した際に provider が v5.22.0 に pin されて strict validation が発火、
# 以降 4 連続の deploy-production terraform-apply が失敗していた (auto-merge は
# required check のみ見るので post-merge apply 失敗が silent)。この commit で
# discriminator prefix を追加、drift-detect gate で再発防止 (architecture-boundaries)。
import {
  to = cloudflare_ruleset.cache_rules
  id = "zones/${var.cloudflare_zone_id}/10cdb82ec6da47b08a63ec3e280732d4"
}

import {
  to = cloudflare_ruleset.transform_rules_late
  id = "zones/${var.cloudflare_zone_id}/8a8f3f173cd7443eb24296e21bf60f0f"
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
      expression  = "(http.host eq \"rental-space.myrrh-jp.com\")"
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
