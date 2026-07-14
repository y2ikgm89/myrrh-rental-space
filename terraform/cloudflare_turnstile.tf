# -----------------------------------------------------------------------------
# Cloudflare Turnstile widgets (Phase 8 Phase 2b)
# -----------------------------------------------------------------------------
#
# public site の contact form / event 予約 / review 投稿 の bot 対策で使用する
# Turnstile widget を Terraform state に adopt。現状 1 widget のみ。
#
# ## Widget 概要
#
# - sitekey: `0x4AAAAAADi6Bqavj97fu7JG` (公開情報、`NEXT_PUBLIC_TURNSTILE_SITE_KEY` env に注入)
# - mode: `managed` (Cloudflare が挙動を自動判定、visible/invisible 切替)
# - domains: `rental-space.myrrh-jp.com` のみ (Cloud Run public service の domain)
# - region: `world` (Cloudflare edge 全域)
#
# ## Import ID 形式
#
# `<account_id>/<sitekey>` — cloudflare_turnstile_widget resource は sitekey を primary ID として使用。
#
# ## Note on domains
#
# v5 provider で `domains` は list (v4 では set)、**alphabetical order 必須** — 順序 drift 誤検知回避。
# -----------------------------------------------------------------------------

import {
  to = cloudflare_turnstile_widget.myrrh_rental_space
  id = "${var.cloudflare_account_id}/0x4AAAAAADi6Bqavj97fu7JG"
}

resource "cloudflare_turnstile_widget" "myrrh_rental_space" {
  account_id     = var.cloudflare_account_id
  name           = "Myrrh Rental Space"
  mode           = "managed"
  domains        = ["rental-space.myrrh-jp.com"]
  region         = "world"
  bot_fight_mode = false
  offlabel       = false
}
