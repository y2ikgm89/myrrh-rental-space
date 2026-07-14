# -----------------------------------------------------------------------------
# Cloudflare zone settings (Phase 8 Phase 2a)
# -----------------------------------------------------------------------------
#
# myrrh-jp.com zone の 25 個の zone setting を Terraform state に adopt する
# (`cloudflare_zone_setting` は v5 で setting 単位に 1 resource ずつ配置する
# 契約 — v4 の `cloudflare_zone_settings_override` 塊は廃止)。
#
# ## 対象範囲 (25 / 55 settings)
# Cloudflare API は zone 単位で ~55 個の setting を露出するが、以下 3 グループを
# Terraform 化スコープから除外して 25 個に絞っている:
#   1. **Cloudflare-managed / immutable**: advanced_ddos, http2 (`editable: false`),
#      long_lived_grpc, prefetch_preload, response_buffering, proxy_read_timeout,
#      sort_query_string_for_cache, true_client_ip_header, origin_error_page_pass_thru
#      → provider が書換不可 (drift 検知しても action 不能)
#   2. **Free plan で immutable / deprecated**: waf (Pro+ 限定), rocket_loader
#      (廃止方向), polish (Pro+), mirage (Pro+), webp (auto-managed), minify
#      (Cloudflare が deprecate、Speed → Minify 移行済)
#   3. **default 値のまま / contextual**: development_mode (`off` = default),
#      email_obfuscation (`off`), filter_logs_to_cloudflare (`off`),
#      mobile_redirect (`status: off`), pseudo_ipv4 (`off`), tls_client_auth
#      (`off`), tls_1_2_only (`off`), ipv6 (`on` = default), ip_geolocation,
#      log_to_cloudflare, max_upload, ciphers (`[]` 空), cname_flattening,
#      visitor_ip, privacy_pass, orange_to_orange
#      → 現状既に default で管理対象化する pratical value が薄い
#
# ## Terraform 管理下 (25 settings) の内訳
#
# Security (8):
#   ssl=strict, min_tls_version=1.3, tls_1_3=zrt (0-RTT enabled),
#   always_use_https=on, security_header (HSTS 6mo+preload+subdomains+nosniff),
#   security_level=medium, browser_check=on, challenge_ttl=1800
#
# Performance (6):
#   brotli=on, http3=on, 0rtt=on, early_hints=on, pq_keyex=on (post-quantum
#   key exchange), websockets=on
#
# Cache (4):
#   cache_level=aggressive, browser_cache_ttl=0 (respect origin),
#   edge_cache_ttl=7200 (2h fallback), always_online=on
#
# Privacy / hardening (7):
#   opportunistic_encryption=on, opportunistic_onion=on (Tor .onion service),
#   ech=on (Encrypted Client Hello), hotlink_protection=on,
#   server_side_exclude=on, automatic_https_rewrites=on, replace_insecure_js=on
#
# ## Note on `security_header` value schema
# v5 の `cloudflare_zone_setting` は setting_id ごとに value の型が変わる
# (dynamic-typed field)。security_header は複合 object:
#   value = { strict_transport_security = { enabled/include_subdomains/max_age/nosniff/preload } }
# 他 setting は scalar (string または integer)。
# -----------------------------------------------------------------------------

# ============================================================================
# Import blocks (Terraform 1.7+) — fresh apply 時の adoption
# ============================================================================

import {
  to = cloudflare_zone_setting.ssl
  id = "${var.cloudflare_zone_id}/ssl"
}

import {
  to = cloudflare_zone_setting.min_tls_version
  id = "${var.cloudflare_zone_id}/min_tls_version"
}

import {
  to = cloudflare_zone_setting.tls_1_3
  id = "${var.cloudflare_zone_id}/tls_1_3"
}

import {
  to = cloudflare_zone_setting.always_use_https
  id = "${var.cloudflare_zone_id}/always_use_https"
}

import {
  to = cloudflare_zone_setting.security_header
  id = "${var.cloudflare_zone_id}/security_header"
}

import {
  to = cloudflare_zone_setting.security_level
  id = "${var.cloudflare_zone_id}/security_level"
}

import {
  to = cloudflare_zone_setting.browser_check
  id = "${var.cloudflare_zone_id}/browser_check"
}

import {
  to = cloudflare_zone_setting.challenge_ttl
  id = "${var.cloudflare_zone_id}/challenge_ttl"
}

import {
  to = cloudflare_zone_setting.brotli
  id = "${var.cloudflare_zone_id}/brotli"
}

import {
  to = cloudflare_zone_setting.http3
  id = "${var.cloudflare_zone_id}/http3"
}

import {
  to = cloudflare_zone_setting.zero_rtt
  id = "${var.cloudflare_zone_id}/0rtt"
}

import {
  to = cloudflare_zone_setting.early_hints
  id = "${var.cloudflare_zone_id}/early_hints"
}

import {
  to = cloudflare_zone_setting.pq_keyex
  id = "${var.cloudflare_zone_id}/pq_keyex"
}

import {
  to = cloudflare_zone_setting.websockets
  id = "${var.cloudflare_zone_id}/websockets"
}

import {
  to = cloudflare_zone_setting.cache_level
  id = "${var.cloudflare_zone_id}/cache_level"
}

import {
  to = cloudflare_zone_setting.browser_cache_ttl
  id = "${var.cloudflare_zone_id}/browser_cache_ttl"
}

import {
  to = cloudflare_zone_setting.edge_cache_ttl
  id = "${var.cloudflare_zone_id}/edge_cache_ttl"
}

import {
  to = cloudflare_zone_setting.always_online
  id = "${var.cloudflare_zone_id}/always_online"
}

import {
  to = cloudflare_zone_setting.opportunistic_encryption
  id = "${var.cloudflare_zone_id}/opportunistic_encryption"
}

import {
  to = cloudflare_zone_setting.opportunistic_onion
  id = "${var.cloudflare_zone_id}/opportunistic_onion"
}

import {
  to = cloudflare_zone_setting.ech
  id = "${var.cloudflare_zone_id}/ech"
}

import {
  to = cloudflare_zone_setting.hotlink_protection
  id = "${var.cloudflare_zone_id}/hotlink_protection"
}

import {
  to = cloudflare_zone_setting.server_side_exclude
  id = "${var.cloudflare_zone_id}/server_side_exclude"
}

import {
  to = cloudflare_zone_setting.automatic_https_rewrites
  id = "${var.cloudflare_zone_id}/automatic_https_rewrites"
}

import {
  to = cloudflare_zone_setting.replace_insecure_js
  id = "${var.cloudflare_zone_id}/replace_insecure_js"
}

# ============================================================================
# Security (8 settings)
# ============================================================================

resource "cloudflare_zone_setting" "ssl" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "ssl"
  value      = "strict"
}

resource "cloudflare_zone_setting" "min_tls_version" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "min_tls_version"
  value      = "1.3"
}

resource "cloudflare_zone_setting" "tls_1_3" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "tls_1_3"
  value      = "zrt"
}

resource "cloudflare_zone_setting" "always_use_https" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "always_use_https"
  value      = "on"
}

resource "cloudflare_zone_setting" "security_header" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "security_header"
  value = {
    strict_transport_security = {
      enabled            = true
      include_subdomains = true
      max_age            = 15552000
      nosniff            = true
      preload            = true
    }
  }
}

resource "cloudflare_zone_setting" "security_level" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "security_level"
  value      = "medium"
}

resource "cloudflare_zone_setting" "browser_check" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "browser_check"
  value      = "on"
}

resource "cloudflare_zone_setting" "challenge_ttl" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "challenge_ttl"
  value      = 1800
}

# ============================================================================
# Performance (6 settings)
# ============================================================================

resource "cloudflare_zone_setting" "brotli" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "brotli"
  value      = "on"
}

resource "cloudflare_zone_setting" "http3" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "http3"
  value      = "on"
}

resource "cloudflare_zone_setting" "zero_rtt" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "0rtt"
  value      = "on"
}

resource "cloudflare_zone_setting" "early_hints" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "early_hints"
  value      = "on"
}

resource "cloudflare_zone_setting" "pq_keyex" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "pq_keyex"
  value      = "on"
}

resource "cloudflare_zone_setting" "websockets" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "websockets"
  value      = "on"
}

# ============================================================================
# Cache (4 settings)
# ============================================================================

resource "cloudflare_zone_setting" "cache_level" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "cache_level"
  value      = "aggressive"
}

resource "cloudflare_zone_setting" "browser_cache_ttl" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "browser_cache_ttl"
  value      = 0
}

resource "cloudflare_zone_setting" "edge_cache_ttl" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "edge_cache_ttl"
  value      = 7200
}

resource "cloudflare_zone_setting" "always_online" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "always_online"
  value      = "on"
}

# ============================================================================
# Privacy / hardening (7 settings)
# ============================================================================

resource "cloudflare_zone_setting" "opportunistic_encryption" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "opportunistic_encryption"
  value      = "on"
}

resource "cloudflare_zone_setting" "opportunistic_onion" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "opportunistic_onion"
  value      = "on"
}

resource "cloudflare_zone_setting" "ech" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "ech"
  value      = "on"
}

resource "cloudflare_zone_setting" "hotlink_protection" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "hotlink_protection"
  value      = "on"
}

resource "cloudflare_zone_setting" "server_side_exclude" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "server_side_exclude"
  value      = "on"
}

resource "cloudflare_zone_setting" "automatic_https_rewrites" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "automatic_https_rewrites"
  value      = "on"
}

resource "cloudflare_zone_setting" "replace_insecure_js" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "replace_insecure_js"
  value      = "on"
}
