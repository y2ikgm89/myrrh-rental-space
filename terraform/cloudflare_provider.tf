# -----------------------------------------------------------------------------
# Cloudflare provider (Phase 8)
# -----------------------------------------------------------------------------
#
# myrrh-jp.com zone 配下の全 Cloudflare resource を Terraform 管理下に置く。
# Dashboard 手動運用からの脱却で drift 検知 loop (nightly `terraform plan
# -detailed-exitcode`) に統合する。
#
# ## スコープ (Phase 8 全体)
#   - admin.myrrh-jp.com DNS records (A/AAAA/CNAME を Cloud Run LB へ向ける)
#   - Transform Rule (x-cloudflare-origin-secret request header 注入 =
#     origin shielding、admin service の CF-only ingress を強制)
#   - rental-space.myrrh-jp.com edge cache (Cache Rules / TTL)
#   - R2 bucket (静的資産、favicon 等)
#   - Turnstile widget (contact form の bot 対策)
#
# 本 file は provider 宣言のみ (Foundation PR)。実 resource 宣言と `import {}`
# blocks は次 PR (Phase 8 Step 2) で追加する。user が `scripts/enumerate-cloudflare.sh`
# を local で実行して current state を dump し、その inventory を元に既存 resource
# ID を state に adopt する形で 0 downtime migration を実現する。
#
# ## 認証 (v5 default behavior)
# Cloudflare provider v5 は `CLOUDFLARE_API_TOKEN` 環境変数を自動採用する。
# 明示的な `api_token = ...` argument は宣言しない — 値を HCL に書くと
# state file / plan diff に literal token が漏れるリスクがあるため、環境変数
# 経由が推奨経路。
#
# CI 側:
#   `.github/workflows/{deploy-production,terraform,terraform-drift}.yml` の
#   Terraform init/plan/apply step の `env:` に以下を注入:
#     CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_TERRAFORM_API_TOKEN }}
#
# 手元運用時 (差分確認等):
#   ```bash
#   # GitHub secret UI から CLOUDFLARE_TERRAFORM_API_TOKEN の値を手動でコピー
#   export CLOUDFLARE_API_TOKEN="cf-tf-..."
#   cd terraform
#   terraform init
#   terraform plan
#   ```
#
# ## Terraform 専用 token と runtime token の scope 分離
# runtime (Cloud Run) の `CLOUDFLARE_API_TOKEN` (Secret Manager 管理) は
# 主に「edge cache purge (page publish 時の CDN invalidation)」のみ叩く用途で、
# Zone.Cache Purge 権限のみを持つ最小権限 token。
#
# 本 file が採用する Terraform 側 token (`CLOUDFLARE_TERRAFORM_API_TOKEN`,
# GitHub repo secret 保管) は Zone.DNS Write / Zone.Zone Settings Write /
# Zone.Cache Rules Write / Zone.Transform Rules Write / Zone.Rulesets Write /
# Account.R2 Storage Write / Account.Turnstile Write を持つ広域 token で、
# runtime token とは別発行・別 rotation。scope 分離により runtime container
# compromise が Terraform 管理 resource の書換に発展しない構造。
#
# ## v5 breaking changes (v4 からの移行時の重要ポイント)
# v4 → v5 は全 resource が破壊的分解:
#   - `cloudflare_zone_settings_override` → `cloudflare_zone_setting × N`
#     (setting 単位に個別 resource 化)
#   - `cloudflare_record` → `cloudflare_dns_record` (schema 完全再設計、
#     `data.value` → `content` 等)
#   - `cloudflare_ruleset` の rules block の action_parameters 構造刷新
#
# 本 project は v5 syntax で 0 から書き起こす方針 (Phase 8 Step 2 で導入)。
# `import {}` blocks 経由で existing Cloudflare resource を新 schema へ
# adopt することで、v4 state を経由せず直接 v5 state に到達する。
# -----------------------------------------------------------------------------

provider "cloudflare" {
  # api_token is auto-loaded from CLOUDFLARE_API_TOKEN env var (v5 default).
  # 明示引数を書かないことで state / plan diff への literal token 漏洩を防ぐ。
}
