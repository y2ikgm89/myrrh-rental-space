#!/usr/bin/env bash
# =============================================================================
# Phase 7 (Load Balancer + IAP) → Terraform state import
# =============================================================================
#
# admin service の external HTTPS Load Balancer と IAP binding を state に
# 取り込む。terraform apply 前に project owner が 1 度だけ実行。
#
# ⚠️ 最要注意 Phase: admin 全滅リスク大。terraform plan の差分を精査し、
# 現行 LB backend / URL map / SSL cert / forwarding rule が変更されない
# ことを確認するまで merge しないこと。
#
# ## リソース名の前提
# 既存 GCP 上の LB / IAP resource は以下の名前で作成されている前提
# (docs/gcp-production-setup.md §LB / SSL certificate — SSoT):
#   - global address v4:         myrrh-admin-lb-ip
#   - global address v6:         myrrh-admin-lb-ipv6
#   - NEG:                       myrrh-admin-neg
#   - backend service:           myrrh-admin-backend
#   - URL map:                   myrrh-admin-url-map
#   - SSL cert:                  myrrh-admin-cert-20260705
#   - HTTPS proxy:               myrrh-admin-https-proxy
#   - HTTPS forwarding rule v4:  myrrh-admin-https-rule
#   - HTTPS forwarding rule v6:  myrrh-admin-https-rule-ipv6
#   - HTTP redirect url map:     myrrh-admin-http-redirect
#   - HTTP proxy:                myrrh-admin-http-proxy
#   - HTTP forwarding rule v4:   myrrh-admin-http-rule
#   - HTTP forwarding rule v6:   myrrh-admin-http-rule-ipv6
#
# 既存 resource がこれと異なる名前で存在する場合、`terraform/lb_admin.tf` を
# 実測名に合わせて修正してから import する。
#
# ## 使い方
#   export PROJECT_ID=myrrh-rental-space
#   bash scripts/import-phase-7.sh
# =============================================================================

set -euo pipefail

: "${PROJECT_ID:?PROJECT_ID is required}"
REGION="${REGION:-asia-northeast1}"
TF_DIR="${TF_DIR:-terraform}"
DRY_RUN="${DRY_RUN:-0}"

echo "[import-phase-7] Project: ${PROJECT_ID}"

pushd "${TF_DIR}" >/dev/null

if [ "${DRY_RUN}" != "1" ]; then
  terraform init -input=false >/dev/null
fi

import_one() {
  local addr="$1"
  local id="$2"
  echo "[import-phase-7] ${addr} ← ${id}"
  if [ "${DRY_RUN}" = "1" ]; then
    printf '[import-phase-7][DRY_RUN] terraform import %q %q\n' "${addr}" "${id}"
    return 0
  fi
  if terraform state show "${addr}" >/dev/null 2>&1; then
    echo "[import-phase-7]   already in state — skipping"
    return 0
  fi
  terraform import -input=false "${addr}" "${id}"
}

# Global addresses (v4 / v6)
import_one \
  "google_compute_global_address.admin_lb_ipv4" \
  "projects/${PROJECT_ID}/global/addresses/myrrh-admin-lb-ip"

import_one \
  "google_compute_global_address.admin_lb_ipv6" \
  "projects/${PROJECT_ID}/global/addresses/myrrh-admin-lb-ipv6"

# Region NEG
import_one \
  "google_compute_region_network_endpoint_group.admin_neg" \
  "projects/${PROJECT_ID}/regions/${REGION}/networkEndpointGroups/myrrh-admin-neg"

# Backend service (global)
import_one \
  "google_compute_backend_service.admin_backend" \
  "projects/${PROJECT_ID}/global/backendServices/myrrh-admin-backend"

# URL map
import_one \
  "google_compute_url_map.admin_url_map" \
  "projects/${PROJECT_ID}/global/urlMaps/myrrh-admin-url-map"

# SSL cert (managed)
import_one \
  "google_compute_managed_ssl_certificate.admin_cert" \
  "projects/${PROJECT_ID}/global/sslCertificates/myrrh-admin-cert-20260705"

# HTTPS proxy
import_one \
  "google_compute_target_https_proxy.admin_https_proxy" \
  "projects/${PROJECT_ID}/global/targetHttpsProxies/myrrh-admin-https-proxy"

# Forwarding rules
import_one \
  "google_compute_global_forwarding_rule.admin_https_v4" \
  "projects/${PROJECT_ID}/global/forwardingRules/myrrh-admin-https-rule"

import_one \
  "google_compute_global_forwarding_rule.admin_https_v6" \
  "projects/${PROJECT_ID}/global/forwardingRules/myrrh-admin-https-rule-ipv6"

# HTTP -> HTTPS redirect chain (port 80)
import_one \
  "google_compute_url_map.admin_http_redirect" \
  "projects/${PROJECT_ID}/global/urlMaps/myrrh-admin-http-redirect"

import_one \
  "google_compute_target_http_proxy.admin_http_proxy" \
  "projects/${PROJECT_ID}/global/targetHttpProxies/myrrh-admin-http-proxy"

import_one \
  "google_compute_global_forwarding_rule.admin_http_v4" \
  "projects/${PROJECT_ID}/global/forwardingRules/myrrh-admin-http-rule"

import_one \
  "google_compute_global_forwarding_rule.admin_http_v6" \
  "projects/${PROJECT_ID}/global/forwardingRules/myrrh-admin-http-rule-ipv6"

# IAP web binding (Cloud Run direct IAP scope, per admin group)。
# 空白区切りの 3-token 形式:
#   <resource> <role> <member>
# resource は Cloud Run service 単位のスコープ:
#   projects/{project}/iap_web/cloud_run-{location}/services/{service}
CLOUD_RUN_ADMIN_SERVICE="${CLOUD_RUN_ADMIN_SERVICE:-myrrh-rental-space-admin}"
IAP_RESOURCE="projects/${PROJECT_ID}/iap_web/cloud_run-${REGION}/services/${CLOUD_RUN_ADMIN_SERVICE}"
for group_key in super_admin admin editor viewer; do
  case "${group_key}" in
    super_admin) group_email="myrrh-super-admins@myrrh-jp.com" ;;
    admin)       group_email="myrrh-admins@myrrh-jp.com" ;;
    editor)      group_email="myrrh-editors@myrrh-jp.com" ;;
    viewer)      group_email="myrrh-viewers@myrrh-jp.com" ;;
  esac
  import_one \
    "google_iap_web_cloud_run_service_iam_member.admin_access[\"${group_key}\"]" \
    "${IAP_RESOURCE} roles/iap.httpsResourceAccessor group:${group_email}"
done

popd >/dev/null

echo "[import-phase-7] done."
echo "[import-phase-7]  - ⚠️  Run 'cd ${TF_DIR} && terraform plan' and precisely audit"
echo "[import-phase-7]    every LB / IAP attribute. Adjust lb_admin.tf / iap.tf to match"
echo "[import-phase-7]    existing state before merging (differences here can break admin access)."
