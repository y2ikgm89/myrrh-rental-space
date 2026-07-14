# -----------------------------------------------------------------------------
# Load Balancer for admin service (Phase 7 skeleton)
# -----------------------------------------------------------------------------
#
# external HTTPS Application LB → Cloud Run NEG → admin service の path。
# admin ingress は internal-and-cloud-load-balancing に絞られているため、
# LB 経由でのみ管理画面へアクセスできる契約 (docs/gcp-production-setup.md)。
#
# skeleton 方針: HTTP path のみ宣言、attribute の詳細は import 後の plan 差分で
# 実測値に合わせる。誤削除は prevent_destroy で block。

locals {
  admin_domain = "admin.myrrh-jp.com"
}

# -----------------------------------------------------------------------------
# Import blocks (Terraform 1.7+) — adopt pre-existing GCP resources into state
# instead of attempting create (avoids 409 on fresh state, first-time bootstrap).
# These are no-op after the first apply; safe to keep long-term for docs.
#
# LB HTTP → HTTPS redirect chain naming note: the HCL resource block names use
# `admin_http_v4` / `admin_http_v6`, but the actual GCP forwarding-rule names
# are `myrrh-admin-http-rule` / `myrrh-admin-http-rule-ipv6` (verified against
# `gcloud compute forwarding-rules list --global` on 2026-07-14). This matches
# Codex #1063 discrepancy note; import IDs use the GCP names, not the HCL names.
# -----------------------------------------------------------------------------
import {
  to = google_compute_global_address.admin_lb_ipv4
  id = "projects/${var.project_id}/global/addresses/myrrh-admin-lb-ip"
}

import {
  to = google_compute_global_address.admin_lb_ipv6
  id = "projects/${var.project_id}/global/addresses/myrrh-admin-lb-ipv6"
}

import {
  to = google_compute_region_network_endpoint_group.admin_neg
  id = "projects/${var.project_id}/regions/${var.region}/networkEndpointGroups/myrrh-admin-neg"
}

import {
  to = google_compute_backend_service.admin_backend
  id = "projects/${var.project_id}/global/backendServices/myrrh-admin-backend"
}

import {
  to = google_compute_url_map.admin_url_map
  id = "projects/${var.project_id}/global/urlMaps/myrrh-admin-url-map"
}

import {
  to = google_compute_managed_ssl_certificate.admin_cert
  id = "projects/${var.project_id}/global/sslCertificates/myrrh-admin-cert-20260705"
}

import {
  to = google_compute_target_https_proxy.admin_https_proxy
  id = "projects/${var.project_id}/global/targetHttpsProxies/myrrh-admin-https-proxy"
}

import {
  to = google_compute_global_forwarding_rule.admin_https_v4
  id = "projects/${var.project_id}/global/forwardingRules/myrrh-admin-https-rule"
}

import {
  to = google_compute_global_forwarding_rule.admin_https_v6
  id = "projects/${var.project_id}/global/forwardingRules/myrrh-admin-https-rule-ipv6"
}

import {
  to = google_compute_url_map.admin_http_redirect
  id = "projects/${var.project_id}/global/urlMaps/myrrh-admin-http-redirect"
}

import {
  to = google_compute_target_http_proxy.admin_http_proxy
  id = "projects/${var.project_id}/global/targetHttpProxies/myrrh-admin-http-proxy"
}

import {
  to = google_compute_global_forwarding_rule.admin_http_v4
  id = "projects/${var.project_id}/global/forwardingRules/myrrh-admin-http-rule"
}

import {
  to = google_compute_global_forwarding_rule.admin_http_v6
  id = "projects/${var.project_id}/global/forwardingRules/myrrh-admin-http-rule-ipv6"
}

# Reserved static IP (v4 / v6)
resource "google_compute_global_address" "admin_lb_ipv4" {
  project      = var.project_id
  name         = "myrrh-admin-lb-ip"
  ip_version   = "IPV4"
  address_type = "EXTERNAL"

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_compute_global_address" "admin_lb_ipv6" {
  project      = var.project_id
  name         = "myrrh-admin-lb-ipv6"
  ip_version   = "IPV6"
  address_type = "EXTERNAL"

  lifecycle {
    prevent_destroy = true
  }
}

# Cloud Run NEG (region-scoped, admin service target)
resource "google_compute_region_network_endpoint_group" "admin_neg" {
  project               = var.project_id
  name                  = "myrrh-admin-neg"
  region                = var.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = google_cloud_run_v2_service.admin.name
  }
}

# Backend service (Cloud Run NEG)
#
# NOTE: Serverless NEG (Cloud Run) backends do NOT support `timeout_sec` per
# Google Cloud LB constraint (400 "Timeout sec is not supported for a backend
# service with Serverless network endpoint groups"). Request timeout is
# controlled by the Cloud Run service itself (`google_cloud_run_v2_service`
# の `template.timeout` フィールド、default 300s)。
# https://cloud.google.com/load-balancing/docs/backend-service#timeout-setting
resource "google_compute_backend_service" "admin_backend" {
  project               = var.project_id
  name                  = "myrrh-admin-backend"
  protocol              = "HTTPS"
  load_balancing_scheme = "EXTERNAL_MANAGED"

  backend {
    group = google_compute_region_network_endpoint_group.admin_neg.id
  }

  log_config {
    enable = true
  }

  lifecycle {
    prevent_destroy = true
  }
}

# URL map
resource "google_compute_url_map" "admin_url_map" {
  project         = var.project_id
  name            = "myrrh-admin-url-map"
  default_service = google_compute_backend_service.admin_backend.id
}

# Managed SSL cert
resource "google_compute_managed_ssl_certificate" "admin_cert" {
  provider = google-beta

  project = var.project_id
  name    = "myrrh-admin-cert-20260705"

  managed {
    domains = [local.admin_domain]
  }

  lifecycle {
    create_before_destroy = true
  }
}

# HTTPS target proxy
resource "google_compute_target_https_proxy" "admin_https_proxy" {
  project          = var.project_id
  name             = "myrrh-admin-https-proxy"
  url_map          = google_compute_url_map.admin_url_map.id
  ssl_certificates = [google_compute_managed_ssl_certificate.admin_cert.id]
}

# Global forwarding rules (v4 + v6)
resource "google_compute_global_forwarding_rule" "admin_https_v4" {
  project               = var.project_id
  name                  = "myrrh-admin-https-rule"
  target                = google_compute_target_https_proxy.admin_https_proxy.id
  port_range            = "443"
  ip_address            = google_compute_global_address.admin_lb_ipv4.address
  load_balancing_scheme = "EXTERNAL_MANAGED"

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_compute_global_forwarding_rule" "admin_https_v6" {
  project               = var.project_id
  name                  = "myrrh-admin-https-rule-ipv6"
  target                = google_compute_target_https_proxy.admin_https_proxy.id
  port_range            = "443"
  ip_address            = google_compute_global_address.admin_lb_ipv6.address
  load_balancing_scheme = "EXTERNAL_MANAGED"

  lifecycle {
    prevent_destroy = true
  }
}

# -----------------------------------------------------------------------------
# HTTP -> HTTPS redirect chain (port 80)
# -----------------------------------------------------------------------------
#
# docs/gcp-production-setup.md §LB / SSL certificate に基づき、port 80 の
# 素の HTTP リクエストは 301 で HTTPS へ redirect する。既存 GCP 上の名前:
#   - url map:        myrrh-admin-http-redirect
#   - target proxy:   myrrh-admin-http-proxy
#   - forwarding v4:  myrrh-admin-http-rule
#   - forwarding v6:  myrrh-admin-http-rule-ipv6
# import は本 file 冒頭の `import{}` blocks (Terraform 1.7+) で fresh state 時に自動 adopt。

resource "google_compute_url_map" "admin_http_redirect" {
  project = var.project_id
  name    = "myrrh-admin-http-redirect"

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "admin_http_proxy" {
  project = var.project_id
  name    = "myrrh-admin-http-proxy"
  url_map = google_compute_url_map.admin_http_redirect.id
}

resource "google_compute_global_forwarding_rule" "admin_http_v4" {
  project               = var.project_id
  name                  = "myrrh-admin-http-rule"
  target                = google_compute_target_http_proxy.admin_http_proxy.id
  port_range            = "80"
  ip_address            = google_compute_global_address.admin_lb_ipv4.address
  load_balancing_scheme = "EXTERNAL_MANAGED"

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_compute_global_forwarding_rule" "admin_http_v6" {
  project               = var.project_id
  name                  = "myrrh-admin-http-rule-ipv6"
  target                = google_compute_target_http_proxy.admin_http_proxy.id
  port_range            = "80"
  ip_address            = google_compute_global_address.admin_lb_ipv6.address
  load_balancing_scheme = "EXTERNAL_MANAGED"

  lifecycle {
    prevent_destroy = true
  }
}
