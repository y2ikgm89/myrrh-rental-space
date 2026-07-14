# -----------------------------------------------------------------------------
# Cloudflare DNS records (Phase 8 Phase 2a)
# -----------------------------------------------------------------------------
#
# myrrh-jp.com zone の全 DNS records (8 件) を Terraform state に adopt する。
# 全 record は import block 経由で既存を取り込み、fresh apply でも 409
# "already exists" にならない (契約 2 — Terraform 1.7+ import{}: SSoT は
# project_terraform-full-adoption-2026-07-14 memory 参照)。
#
# ## Records 概要
#   - admin.myrrh-jp.com A/AAAA — DNS-only (proxied=false)、admin service の
#     Global External LB (Phase 7 `lb_admin.tf`) を指す。CF proxy を通すと IAP
#     の client-facing SSL 検査が二重化されるため proxied=false 固定。
#   - rental-space.myrrh-jp.com CNAME → ghs.googlehosted.com (proxied=true)。
#     Cloud Run Domain Mapping (auto-managed cert) 経由で public service を
#     配信。Cloudflare orange-cloud で edge cache + DDoS + Cache Rules を効かせる。
#   - send.rental-space.myrrh-jp.com MX/SPF + resend._domainkey TXT — Resend
#     (transactional email、Amazon SES 経由) の SPF/DKIM。運用は Resend
#     Dashboard、DNS は Cloudflare 側に配置。
#   - myrrh-jp.com TXT × 2 — Google Search Console の site verification。
#     2 件 (`YIClisZ_...` と `eZ2fLSEeW3XaN10RO8Niauza...`) 存在するが、片方は
#     過去の verification 残骸の可能性があり別 PR で dead 判定して整理予定。
#
# ## Record ID → Terraform resource key マッピング
#
# | Cloudflare API record ID           | Terraform resource key    | 用途              |
# | ---------------------------------- | ------------------------- | ----------------- |
# | 3c3f427ca3c461144e244e4b058b96e7   | admin_a                   | admin LB IPv4     |
# | 50390647e49668a220554be286eebe8f   | admin_aaaa                | admin LB IPv6     |
# | 1ede642cdb13783b756b4e3defaacdf7   | rental_space_cname        | public GHS proxy  |
# | be7dc782c1e17001ae35bc738728da84   | send_mx                   | SES/Resend MX     |
# | 158404f49882ef9ff6c2c3a5bf961bb4   | gsc_txt_primary           | GSC verification  |
# | fb17b55313c9e207193a3d1b83c99cd9   | gsc_txt_legacy            | GSC verification  |
# | 03153a9c5b60245e5f949557d78f59fb   | resend_dkim               | Resend DKIM       |
# | 1a49a01981b5c162cf9aeab41eded2f9   | send_spf                  | SPF include SES   |
#
# ## Note on ttl
# Cloudflare API convention: `ttl = 1` は Dashboard 上の "Auto" (Cloudflare が
# proxied record は 300s、DNS-only record は zone default に自動設定)。整数
# `3600` は明示的な 1 時間指定。TXT/MX は用途上明示 3600 が Cloudflare の慣行。
# -----------------------------------------------------------------------------

# ----- import blocks (Terraform 1.7+) — fresh apply 時の 409 回避 -----

import {
  to = cloudflare_dns_record.admin_a
  id = "${var.cloudflare_zone_id}/3c3f427ca3c461144e244e4b058b96e7"
}

import {
  to = cloudflare_dns_record.admin_aaaa
  id = "${var.cloudflare_zone_id}/50390647e49668a220554be286eebe8f"
}

import {
  to = cloudflare_dns_record.rental_space_cname
  id = "${var.cloudflare_zone_id}/1ede642cdb13783b756b4e3defaacdf7"
}

import {
  to = cloudflare_dns_record.send_mx
  id = "${var.cloudflare_zone_id}/be7dc782c1e17001ae35bc738728da84"
}

import {
  to = cloudflare_dns_record.gsc_txt_primary
  id = "${var.cloudflare_zone_id}/158404f49882ef9ff6c2c3a5bf961bb4"
}

import {
  to = cloudflare_dns_record.gsc_txt_legacy
  id = "${var.cloudflare_zone_id}/fb17b55313c9e207193a3d1b83c99cd9"
}

import {
  to = cloudflare_dns_record.resend_dkim
  id = "${var.cloudflare_zone_id}/03153a9c5b60245e5f949557d78f59fb"
}

import {
  to = cloudflare_dns_record.send_spf
  id = "${var.cloudflare_zone_id}/1a49a01981b5c162cf9aeab41eded2f9"
}

# ----- resource declarations -----

resource "cloudflare_dns_record" "admin_a" {
  zone_id = var.cloudflare_zone_id
  name    = "admin.myrrh-jp.com"
  type    = "A"
  content = "8.233.111.15"
  ttl     = 1
  proxied = false
}

resource "cloudflare_dns_record" "admin_aaaa" {
  zone_id = var.cloudflare_zone_id
  name    = "admin.myrrh-jp.com"
  type    = "AAAA"
  content = "2600:1901:0:6b8e::"
  ttl     = 1
  proxied = false
}

resource "cloudflare_dns_record" "rental_space_cname" {
  zone_id = var.cloudflare_zone_id
  name    = "rental-space.myrrh-jp.com"
  type    = "CNAME"
  content = "ghs.googlehosted.com"
  ttl     = 1
  proxied = true
}

resource "cloudflare_dns_record" "send_mx" {
  zone_id  = var.cloudflare_zone_id
  name     = "send.rental-space.myrrh-jp.com"
  type     = "MX"
  content  = "feedback-smtp.ap-northeast-1.amazonses.com"
  priority = 10
  ttl      = 3600
  proxied  = false
}

resource "cloudflare_dns_record" "gsc_txt_primary" {
  zone_id = var.cloudflare_zone_id
  name    = "myrrh-jp.com"
  type    = "TXT"
  content = "\"google-site-verification=YIClisZ_PGy7xd4DAflEgarqGZsOY8wWYx5xAtxIhwo\""
  ttl     = 3600
  proxied = false
}

resource "cloudflare_dns_record" "gsc_txt_legacy" {
  zone_id = var.cloudflare_zone_id
  name    = "myrrh-jp.com"
  type    = "TXT"
  content = "\"google-site-verification=eZ2fLSEeW3XaN10RO8Niauza68t-8Zu0iTwxq32x3-4\""
  ttl     = 1
  proxied = false
}

resource "cloudflare_dns_record" "resend_dkim" {
  zone_id = var.cloudflare_zone_id
  name    = "resend._domainkey.rental-space.myrrh-jp.com"
  type    = "TXT"
  content = "\"p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDDv/dQA3SVrfEZgTliCT2UelzO9UDvuVUHms5xGyX4RIyqo/N96ge8NJ+elapm9YffMG4o9v3yI0N5uwSO1V61/XOgNdtdKL7E0Dk1RT2PC9279SnU0nj8KdsVPiUZbSkwWr8sz/P4Rg4T3OMDBXQ9BE+raJXO0Ft8uJRBl1+KMQIDAQAB\""
  ttl     = 3600
  proxied = false
}

resource "cloudflare_dns_record" "send_spf" {
  zone_id = var.cloudflare_zone_id
  name    = "send.rental-space.myrrh-jp.com"
  type    = "TXT"
  content = "\"v=spf1 include:amazonses.com ~all\""
  ttl     = 3600
  proxied = false
}
