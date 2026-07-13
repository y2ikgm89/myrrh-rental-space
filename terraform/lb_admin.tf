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
  admin_lb_ipv4 = "8.233.111.15"
  admin_lb_ipv6 = "2600:1901:0:6b8e::"
  admin_domain  = "admin.myrrh-jp.com"
}

# Reserved static IP (v4 / v6)
resource "google_compute_global_address" "admin_lb_ipv4" {
  project      = var.project_id
  name         = "myrrh-admin-lb-ipv4"
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
resource "google_compute_backend_service" "admin_backend" {
  project               = var.project_id
  name                  = "myrrh-admin-backend"
  protocol              = "HTTPS"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  timeout_sec           = 300

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
  name    = "myrrh-admin-cert"

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
  name                  = "myrrh-admin-https-v4"
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
  name                  = "myrrh-admin-https-v6"
  target                = google_compute_target_https_proxy.admin_https_proxy.id
  port_range            = "443"
  ip_address            = google_compute_global_address.admin_lb_ipv6.address
  load_balancing_scheme = "EXTERNAL_MANAGED"

  lifecycle {
    prevent_destroy = true
  }
}
