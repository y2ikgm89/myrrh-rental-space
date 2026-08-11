# -----------------------------------------------------------------------------
# Artifact Registry (Phase 4)
# -----------------------------------------------------------------------------
#
# Cloud Build が push する Docker image の保管先。runner / migrator image を
# `:${SHORT_SHA}` / `:migrate-${SHORT_SHA}` / `:cache` tag で push している
# (cloudbuild.yaml Step 3)。
#
# 実運用中の repository は下部の `import{}` block (Terraform 1.7+) で fresh
# state 時に自動 adopt される。
#
# 保管料は放置すると単調増加する。cleanup policy の根拠と安全性の担保は
# resource 内のコメント参照。

# -----------------------------------------------------------------------------
# Import blocks (Terraform 1.7+) — adopt pre-existing GCP resources into state
# instead of attempting create (avoids 409 on fresh state, first-time bootstrap).
# These are no-op after the first apply; safe to keep long-term for docs.
# -----------------------------------------------------------------------------
import {
  to = google_artifact_registry_repository.docker
  id = "projects/${var.project_id}/locations/${var.region}/repositories/myrrh-rental-space"
}

resource "google_artifact_registry_repository" "docker" {
  project       = var.project_id
  location      = var.region
  repository_id = "myrrh-rental-space"
  format        = "DOCKER"
  description   = "Cloud Build push target for public/admin Cloud Run runner + prisma-migrate migrator images."

  # ---- Cleanup policy ----
  #
  # 掃除しないと **単調増加する**。費用は「置いてある量 × 時間」だけで決まり、
  # push 回数にも pull 回数にも課金されない。減る要素が無いので、デプロイを
  # 重ねるほど増え続ける。
  #
  # 実測 2026-08-11: 2026-06-12 の作成以来 1 度も削除しておらず、version が
  # 100 件超、保管料が **9 日で ¥1,479**（月換算 約 ¥5,000 / 年 約 ¥60,000）
  # に達していた。Cloud Run に次ぐ 2 番目の費目。
  #
  # 1 デプロイで version が 2〜3 個増える:
  #   `:${SHORT_SHA}`         アプリ本体     約 132 MB
  #   `:migrate-${SHORT_SHA}` migration 用   約 429 MB  ← 本体の 3 倍
  #   `:${SHORT_SHA}cache`    build cache    約 136 MB
  #
  # **稼働中の image を消さないことの担保:**
  #
  # 1. GCP の仕様で **KEEP は DELETE より優先される**。`keep-recent-versions`
  #    に入る version は、下の DELETE 条件に一致しても消えない。
  # 2. image は Deploy Production でしか push されない（cloudbuild.yaml は
  #    この workflow からのみ起動する）。したがって **最新 = 現行リビジョン**
  #    であり、現行 image が「最新 30 件」から漏れることは無い。
  #
  # Cloud Run のリビジョンは image を digest で参照するため、参照先を消すと
  # スケールアップもロールバックも不能になる。上の 2 点がそれを防いでいる。
  #
  # **まず dry run で入れる。** `cleanup_policy_dry_run = true` の間は削除が
  # 起きず、対象だけが Artifact Registry のログに出る。実際の削除対象に稼働中
  # digest が含まれないことを確認してから、別 PR で false にする。
  cleanup_policy_dry_run = true

  cleanup_policies {
    id     = "keep-recent-versions"
    action = "KEEP"

    # 1 デプロイ 2〜3 version なので、30 で概ね 10 デプロイ分のロールバック余地。
    # 減らすと削減額はほぼ変わらないまま復旧手段だけが痩せるので、ここは
    # ケチらない。
    most_recent_versions {
      keep_count = 30
    }
  }

  cleanup_policies {
    id     = "delete-untagged"
    action = "DELETE"

    # tag が外れた digest は何からも参照されない。実測でも `migrate-*` の
    # 付け替えで生じた孤児が複数残っていた。
    condition {
      tag_state  = "UNTAGGED"
      older_than = "604800s" # 7d
    }
  }

  cleanup_policies {
    id     = "delete-old-versions"
    action = "DELETE"

    # 30 日より古いものは、上の KEEP に入っていない限り消す。
    condition {
      tag_state  = "ANY"
      older_than = "2592000s" # 30d
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}
