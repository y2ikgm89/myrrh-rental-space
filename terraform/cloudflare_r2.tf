# -----------------------------------------------------------------------------
# Cloudflare R2 buckets (Phase 8 Phase 2b)
# -----------------------------------------------------------------------------
#
# myrrh-jp.com zone 属するアカウント (Ikeakie@gmail.com's Account) 配下の R2 buckets を
# Terraform state に adopt。現状 1 bucket (`myrrh-rental-space`, 2026-06-11 作成) のみ。
#
# ## Import ID 形式
#
# `<account_id>/<bucket_name>/<jurisdiction>` (jurisdiction は default/eu/fedramp、
# 明示指定なければ `default`)。cloudflare_r2_bucket resource 内では `location` として
# `apac` / `wnam` / `enam` / `weur` / `eeur` などを指定するが、bucket 作成後は変更不可。
# -----------------------------------------------------------------------------

import {
  to = cloudflare_r2_bucket.myrrh_rental_space
  id = "${var.cloudflare_account_id}/myrrh-rental-space/default"
}

resource "cloudflare_r2_bucket" "myrrh_rental_space" {
  account_id = var.cloudflare_account_id
  name       = "myrrh-rental-space"
  # location は import 経由で adopt 時に state に取り込まれる。明示指定すると
  # bucket 作成後の変更を試みて 400 error になるため、location は省略 (state 追従)。
}

# -----------------------------------------------------------------------------
# お問い合わせ添付 private bucket (inquiry-overhaul completion design §5.2)
# -----------------------------------------------------------------------------
#
# `myrrh_rental_space`（既存メディア bucket、公開カスタムドメイン付き）とは
# 完全に分離した新規 bucket。PII を含む添付ファイルを公開 CDN と混在させない
# ための設計上の隔離であり、意図的に `cloudflare_r2_custom_domain` /
# `cloudflare_record`（public DNS）を一切紐付けない。
#
# 新規 bucket のため import block は不要（`terraform apply` が create する）。
# location は既存 bucket と同じ理由で明示しない（作成後変更不可、adopt 前提の
# 慣習に合わせて未指定のまま state に確定させる）。
resource "cloudflare_r2_bucket" "myrrh_rental_space_inquiries" {
  account_id = var.cloudflare_account_id
  name       = "myrrh-rental-space-inquiries"
}
