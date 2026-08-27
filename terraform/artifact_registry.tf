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
  # 1 デプロイで増える version は **2 個**（cloudbuild.yaml Step 2 / 2b）:
  #
  #   digest 1  tag `${SHORT_SHA}` と `cache`   約 132 MB  `--target=runner`
  #   digest 2  tag `migrate-${SHORT_SHA}`      約 429 MB  `--target=migrator`
  #
  # **`cache` は別 image ではない。** Step 2 が runner を `-t :${SHORT_SHA}`
  # と `-t :cache` の 2 つで tag するだけなので、**同一 digest に tag が 2 つ**
  # 付く。移動 tag なので、次のデプロイで新しい runner 側へ移る。
  #
  # migrator が本体の 3 倍あるのは意図的な設計で、Prisma CLI と migration 一式を
  # 実行時 image から外して runner を 132 MB に保っている。同梱すると Cloud Run
  # が常時 429 MB の image を起動することになる。
  #
  # **稼働中の image を消さないことの担保:**
  #
  # 1. **DELETE 側に年齢条件が付いている**（tag なし 7 日 / それ以外 30 日）。
  #    keep 枠から溢れても、**30 日以内の image はどの DELETE 条件にも一致
  #    しない**。これが主たる防御。
  # 2. GCP の仕様で **KEEP は DELETE より優先される**。`keep-recent-versions`
  #    に入る version は、下の DELETE 条件に一致しても消えない。
  # 3. image は Deploy Production でしか push されない（cloudbuild.yaml は
  #    この workflow からのみ起動する）。デプロイは手動のみなので、放置期間に
  #    勝手に version が増えて枠を押し出すことも無い。
  #
  # Cloud Run のリビジョンは image を digest で参照するため、参照先を消すと
  # スケールアップもロールバックも不能になる。上の 2 点がそれを防いでいる。
  #
  # **ただし `delete-untagged` はこの担保の外にある。** tag なし digest は
  # 「同一 commit を再デプロイした」ときに生まれる — 新しい build に
  # `${SHORT_SHA}` tag が移り、前の digest が tag を失う。そのとき、**移る前に
  # 作られた Cloud Run リビジョンはその digest を参照したまま**なので、消すと
  # そのリビジョンへは戻れなくなる。`older_than` の 7 日はそのための猶予で、
  # 完全な保証ではない。
  #
  # **dry run は 2026-08-27 に解除した (#2158 で入れた検証の結論)。**
  #
  # 解除前の実測 (gcloud、2026-08-27):
  #
  #   repository            約 332 GB / version 1,471 件
  #   30 日超の version     1,415 件 (96%) = DELETE 対象
  #   稼働中 digest         sha256:c52af97… (public / admin 共通、当日 build)
  #                         → **DELETE 対象に含まれないことを確認済み**
  #   traffic               両サービスとも 100% LATEST。旧 revision に配分なし
  #
  # **失うもの: 672 revision へのロールバック。** 既存 revision が参照する
  # digest は 699 件あり、うち 672 件が 30 日超で DELETE 対象に入る。ただし
  # いずれも migration を挟んでいるため image だけ戻しても整合しない（上の
  # keep_count の項に書いた理由がそのまま当てはまる）。稼働中および直近 10
  # version は KEEP 側で守られる。
  cleanup_policy_dry_run = false

  cleanup_policies {
    id     = "keep-recent-versions"
    action = "KEEP"

    # 1 デプロイ 2 version なので 10 = **5 デプロイ分**。
    #
    # **keep_count は主たる防御ではない。** 稼働中 image を守っているのは主に
    # 下の DELETE 側の**年齢条件**で、keep 枠から溢れても 30 日以内の image は
    # 消えない。keep_count はその二次的な保険。
    #
    # 深いロールバック余地を積む意味は薄い:
    #
    # - デプロイは `workflow_dispatch` の**手動のみ**（push-to-main の自動
    #   デプロイは gate で禁止）。人が意図して実行し結果を見ているので、
    #   「N デプロイ後に過去のデプロイが悪かったと気付く」事故が起きない。
    #   戻す先は実質「いまやったデプロイの 1 つ前」。
    # - migration があるので、image だけ戻しても DB は戻らない。破壊的 DDL を
    #   含むデプロイ以降は image のロールバック自体が成立しない。
    # - image には build 時に `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` が焼き込まれ
    #   ている。世代を積むことは**鍵入り image の保管数を増やす**ことでもある。
    #   鍵をローテートしても古い image の旧鍵は残る。
    #
    # 下限を決めているのは失敗デプロイのバースト。Cloud Build は Step 3 で
    # push した後 Step 6 のデプロイで落ちうるので、**失敗しても image は増える**。
    # 実測 2026-08-11: image を push した失敗の連続は **最大 2 回**（7/24）。
    # 7/19 の 6 連続失敗は terraform-apply 段階で deploy job ごと skip されて
    # いるため image を増やしていない。10 はその 2.5 倍の余裕にあたる。
    most_recent_versions {
      keep_count = 10
    }
  }

  cleanup_policies {
    id     = "delete-untagged"
    action = "DELETE"

    # 同一 commit の再デプロイで tag が新しい digest へ移り、前の digest が
    # 孤児になる。実測 2026-08-11 時点でも 7/24 のリトライ由来の孤児が
    # 複数残っていた（132.7 MB と 429.5 MB の対）。
    #
    # **「tag が無い = 誰も参照していない」ではない。** 上の注記のとおり、
    # tag が移る前に作られた Cloud Run リビジョンは digest 参照を保持している。
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
