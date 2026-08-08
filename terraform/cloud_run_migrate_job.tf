# -----------------------------------------------------------------------------
# Cloud Run Job: prisma-migrate (Phase 6b — env/secrets Terraform 完全移管)
# -----------------------------------------------------------------------------
#
# cloudbuild.yaml Step 4 (migrate-update) の `--set-secrets=DATABASE_URL=...` は
# 削除済で、Terraform が secret binding の SSoT (Phase 6b、2026-07-14 完成)。
# Step 4 の残り (image / memory / command / args) も Terraform で declarative に
# 宣言し、Cloud Build は `--image=...:migrate-${SHORT_SHA}` の image tag update
# のみを実施する契約。Step 5b (migrate-execute) は job execute のみで env 変更なし。

# -----------------------------------------------------------------------------
# Import blocks (Terraform 1.7+) — adopt pre-existing GCP resources into state
# instead of attempting create (avoids 409 on fresh state, first-time bootstrap).
# These are no-op after the first apply; safe to keep long-term for docs.
# -----------------------------------------------------------------------------
import {
  to = google_cloud_run_v2_job.prisma_migrate
  id = "projects/${var.project_id}/locations/${var.region}/jobs/prisma-migrate"
}

resource "google_cloud_run_v2_job" "prisma_migrate" {
  # 2026-07: no `provider = google-beta` — GA in the standard "google"
  # provider (see terraform/versions.tf header comment).
  name     = "prisma-migrate"
  project  = var.project_id
  location = var.region

  template {
    parallelism = 1
    task_count  = 1

    template {
      service_account       = var.runtime_sa_email
      execution_environment = "EXECUTION_ENVIRONMENT_GEN2"

      timeout     = "600s"
      max_retries = 0

      containers {
        image = "asia-northeast1-docker.pkg.dev/myrrh-rental-space/myrrh-rental-space/myrrh-rental-space:migrate-placeholder"

        # 適用前チェック → migrate。**ここが SSoT**（Dockerfile の CMD はローカル実行用の
        # 控えで、Cloud Run Job はこの command/args で上書きする。両方が同じ順序を持つことは
        # `deploy-packaging-contract.test.ts` が固定する）。
        #
        # `migration-preconditions.ts` は 2 つを見て、どちらかが崩れていれば非 0 で終わる。
        # ①DB の migration 履歴が repo と同じ系譜か（Prisma はここを見ない。接続先が
        # 旧 DB のままでも `No pending migrations to apply.` を exit 0 で返すので、
        # **切替の失敗が成功として表示される**）②未適用 migration を実際に 1 つの
        # トランザクションで流して必ず巻き戻す（落ちるなら失敗した文と PostgreSQL の
        # 本当のエラーが出る）。どちらも migrate を**始める前**に落ちるので
        # `_prisma_migrations` に失敗が残らず、以降のデプロイがブロックされない。
        command = ["sh"]
        args = [
          "-c",
          "bun scripts/migration-preconditions.ts && bunx --bun prisma migrate deploy",
        ]

        resources {
          limits = {
            cpu    = "1"
            memory = "1Gi"
          }
        }

        # Neon 公式: prisma migrate は direct 接続。
        #
        # **`DATABASE_URL` は注入しない。** `prisma/schema.prisma` の datasource は
        # `url` を持たず、接続先は `prisma.config.ts` が組み立てる。その解決順は
        # `DIRECT_URL` → `DATABASE_URL` で、direct が入っていれば `DATABASE_URL` は
        # 一度も読まれない（`scripts/migration-preconditions.ts` の `resolveUrl` も同順）。
        #
        # 以前は「migrate は direct が要る」という理由で `DATABASE_URL` にも direct を
        # 入れていたが、そのために **1 つの secret へ direct と pooled という別物を
        # 詰め、version 番号だけで区別する**形になっていた（v1=direct / v2=pooled）。
        # 意味を番号に持たせると、切替のたびに Terraform 側の pin を張り替える必要が
        # 生まれ、**張り替え忘れると migrate が旧 DB を見て exit 0 で黙って終わる**。
        # 役割ごとに secret を分けて、その失敗モードごと無くす。
        #
        # - DIRECT_URL   : direct 接続。**migrate job だけ**が使う
        # - DATABASE_URL : pooled 接続。**Cloud Run runtime だけ**が使う
        #
        # @see https://neon.com/docs/guides/prisma-migrations
        env {
          name = "DIRECT_URL"
          value_source {
            secret_key_ref {
              # WP24 切替: v2 = 新しい空 DB の direct。旧 DB は v1 に残す（切り戻し用）。
              secret  = google_secret_manager_secret.secret["DIRECT_URL"].secret_id
              version = "2"
            }
          }
        }
      }
    }
  }

  lifecycle {
    prevent_destroy = true
    ignore_changes = [
      # image tag は Cloud Build が毎 deploy で書き換える (`--image=...:migrate-${SHORT_SHA}`)。
      # env は Phase 6b で Terraform 完全管理 (ignore_changes 撤去)。
      template[0].template[0].containers[0].image,
    ]
  }
}
