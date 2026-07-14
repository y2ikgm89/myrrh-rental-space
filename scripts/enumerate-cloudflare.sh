#!/usr/bin/env bash
# =============================================================================
# Cloudflare current-state enumerator (Sprint 3 Phase 8 Step 2 準備)
# =============================================================================
#
# myrrh-jp.com zone の DNS records / Zone settings / Cache Rules / Transform
# Rules / Turnstile widgets / R2 buckets を dump し、Terraform 化対象と各
# resource ID を列挙する。出力を Claude に渡して Phase 8 Step 2 の PR
# (実 resource 宣言 + import blocks) の入力として使う。
#
# ## 使い方
#   # GitHub secret UI から CLOUDFLARE_TERRAFORM_API_TOKEN の値を取得して環境変数に export
#   export CLOUDFLARE_API_TOKEN="<GitHub repo secret CLOUDFLARE_TERRAFORM_API_TOKEN と同じ値>"
#   bash scripts/enumerate-cloudflare.sh > cloudflare-inventory.txt
#
# 出力を Claude に共有 (`cloudflare-inventory.txt` は .gitignore 対象、commit しない)。
#
# ## 依存
#   - curl (macOS/Linux/Git-Bash 標準)
#   - python3 (JSON pretty-print 用、macOS/Linux 標準 / Windows は winget install Python.Python.3)
#
# ## 権限要件
#   token scope は `CLOUDFLARE_TERRAFORM_API_TOKEN` (Zone.DNS Read /
#   Zone.Zone Settings Read / Zone.Cache Rules Read / Zone.Transform Rules Read /
#   Zone.Rulesets Read / Account.R2 Storage Read / Account.Turnstile Read を
#   包含する広域 token) を再利用する。runtime token (Cache Purge only) では
#   enumerate できない。
# =============================================================================
set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is required. Set it from CLOUDFLARE_TERRAFORM_API_TOKEN GitHub secret.}"

# Zone ID は terraform/variables.tf の cloudflare_zone_id と同期させる
# (`myrrh-jp.com` zone、Dashboard 右サイドバー "API" 欄からコピー可)。
ZONE_ID="${ZONE_ID:-71192d17d6e20d432b9fe0ad48291277}"

# ---- helpers ----
cf_get() {
  # $1 = path (query string 含む)
  curl -sS \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.cloudflare.com/client/v4/${1}"
}

pretty() {
  # stdin JSON を人間可読 pretty print (失敗しても raw を貼って続行)
  python3 -m json.tool 2>/dev/null || cat
}

section() {
  echo
  echo "## $1"
  echo
}

# ---- 1. Zone metadata + account ID lookup ----
section "Zone metadata"
ZONE_JSON="$(cf_get "zones/${ZONE_ID}")"
echo "Zone ID: ${ZONE_ID}"
ACCOUNT_ID="$(printf '%s' "${ZONE_JSON}" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["result"]["account"]["id"])' 2>/dev/null || echo "unknown")"
echo "Account ID: ${ACCOUNT_ID}"
echo
printf '%s' "${ZONE_JSON}" | pretty

# ---- 2. DNS records (paginated up to 100) ----
section "DNS records"
cf_get "zones/${ZONE_ID}/dns_records?per_page=100" | pretty

# ---- 3. Zone settings (all keys, single blob) ----
section "Zone settings"
cf_get "zones/${ZONE_ID}/settings" | pretty

# ---- 4. Rulesets (phases: cache / transform / rate limit / etc.) ----
# List all rulesets at the zone scope. Claude 側で phase (rulesets の phase
# 属性) ごとに filter して Cache Rules / Transform Rules / Origin Rules を
# 分類する。各 ruleset の詳細 (rules 配列) は下段の "Ruleset detail" で dump。
section "Rulesets (list)"
RULESETS_JSON="$(cf_get "zones/${ZONE_ID}/rulesets")"
printf '%s' "${RULESETS_JSON}" | pretty

# ---- 4a. Ruleset detail (rules 配列を含む full body) ----
# List だけでは各 ruleset 内の rules が返らないため、id ごとに GET し直す。
section "Ruleset detail (per-id)"
printf '%s' "${RULESETS_JSON}" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); [print(r["id"]) for r in d.get("result",[])]' \
  | while read -r RULESET_ID; do
      echo
      echo "### Ruleset: ${RULESET_ID}"
      echo
      cf_get "zones/${ZONE_ID}/rulesets/${RULESET_ID}" | pretty
    done

# ---- 5. R2 buckets (account scope) ----
section "R2 buckets (account scope)"
if [ "${ACCOUNT_ID}" != "unknown" ]; then
  cf_get "accounts/${ACCOUNT_ID}/r2/buckets" | pretty
else
  echo "(account ID lookup failed — R2 enumeration skipped)"
fi

# ---- 6. Turnstile widgets (account scope) ----
section "Turnstile widgets (account scope)"
if [ "${ACCOUNT_ID}" != "unknown" ]; then
  cf_get "accounts/${ACCOUNT_ID}/challenges/widgets" | pretty
else
  echo "(account ID lookup failed — Turnstile enumeration skipped)"
fi

# ---- 7. Zone-level Page Rules (legacy、まだ使っていれば Terraform 化対象) ----
section "Page Rules (legacy)"
cf_get "zones/${ZONE_ID}/pagerules" | pretty

echo
echo "## Done"
echo "出力を Claude に共有し、Phase 8 Step 2 PR の入力として利用する。"
