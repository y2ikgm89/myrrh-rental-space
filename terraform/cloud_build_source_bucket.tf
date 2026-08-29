# -----------------------------------------------------------------------------
# Cloud Build source staging bucket
# -----------------------------------------------------------------------------
#
# `gcloud beta builds submit` (.github/workflows/deploy-production.yml) が毎回
# リポジトリを tarball にして置く場所。**Cloud Build が初回 submit 時に自動生成
# する**ため Terraform 宣言が無く、lifecycle rule も付いていなかった。
#
# 保管料は artifact_registry.tf と同じ「置いてある量 × 時間」だけで決まる構造。
# あちらは cleanup policy で止めたが、こちらは素通りしていた。**減る要素が無い
# ので、デプロイを重ねるほど単調増加する。**
#
# 実測 2026-08-30 (gcloud storage ls -l):
#
#   528 objects / 19.88 GiB   最古 2026-06-27 / 最新 2026-08-29
#   30 日超     498 件 18.31 GiB (92%)  ← 下の lifecycle_rule の削除対象
#   0-7d         18 件  0.97 GiB
#   7-30d        12 件  0.60 GiB
#
# US multi-region STANDARD なので ¥4.25737/GiB/month (Cloud Billing Catalog,
# currencyCode=JPY) = 月 約 ¥85。うち約 ¥78 が 30 日超ぶん。
#
# **消して失うのは Cloud Build コンソールからの過去ビルド再実行だけ。**
# ビルドは submit のたびに新しい tarball を作る方式で、cloudbuild.yaml は保存済み
# source を一切参照しない。稼働中のサービスはここを読まない。
#
# **保持期間を 30 日にした理由**: artifact_registry.tf の `delete-old-versions`
# と同一。ソース tarball とイメージは同じ 1 デプロイの産物なので、別々の保持期間
# を持つ理由が無い。あちらの 30 日は実測付きで根拠が書かれた決定なので、揃える
# 限りここで新たに正当化する必要が無い。ずらすなら両方の根拠を書き直すこと。
#
# **削除しても請求は即座には下がらない。** soft delete 期間中のオブジェクトも
# 課金対象なので、lifecycle rule が走ってさらに 7 日後に反映される
# (下の soft_delete_policy)。

# -----------------------------------------------------------------------------
# Import blocks (Terraform 1.7+) — adopt pre-existing GCP resources into state
# instead of attempting create (avoids 409 on fresh state, first-time bootstrap).
# These are no-op after the first apply; safe to keep long-term for docs.
# -----------------------------------------------------------------------------
#
# `google_storage_bucket` の import ID は `bucket_name` か `project/bucket_name`
# の 2 形式（provider の resourceStorageBucketStateImporter が `/` で split する）。
# project を明示する後者を使う。
import {
  to = google_storage_bucket.cloud_build_source
  id = "${var.project_id}/${var.project_id}_cloudbuild"
}

resource "google_storage_bucket" "cloud_build_source" {
  project = var.project_id

  # Cloud Build が自動生成するバケット名は `<project_id>_cloudbuild` 固定。
  name     = "${var.project_id}_cloudbuild"
  location = "US"

  # ---- 実測値の写し (2026-08-30 `gcloud storage buckets describe`) ----
  #
  # 自動生成されたバケットの現状。ここがずれると plan に差分が出る。とくに
  # `location` は ForceNew なので、間違えると **作り直し** になる。
  storage_class               = "STANDARD"
  uniform_bucket_level_access = false
  public_access_prevention    = "inherited"

  # GCS 既定と同じ 7 日。誤削除の猶予として明示的に宣言しておく
  # （Optional + Computed なので省略しても差分は出ないが、下の lifecycle_rule が
  # 消したものがどれだけ戻せるかは、この値を見ないと分からない）。
  soft_delete_policy {
    retention_duration_seconds = 604800 # 7d
  }

  # ---- 本体 ----
  lifecycle_rule {
    action {
      type = "Delete"
    }

    condition {
      age = 30
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}
