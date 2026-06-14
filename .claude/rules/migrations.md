---
paths:
  - "prisma/schema.prisma"
  - "prisma/migrations/**"
---

# マイグレーション安全規約（expand / contract）

破壊的スキーマ変更（`DROP COLUMN` / `DROP TABLE` / 型変更 / 列リネーム / 既存列への `NOT NULL` 追加）は **expand → migrate → contract** に分割し、1 マイグレーション・1 デプロイに「追加」と「破壊」を混在させない。

## なぜ（この構成での具体リスク）

本番は Cloud Build → Cloud Run。`migrate deploy` は `cloudbuild.yaml` の独立 Step で新リビジョン deploy より **先行実行**される（完了を `waitFor` で保証）。しかし Cloud Run はローリング切替で、**migrate 完了〜新リビジョンが ready になるまで旧リビジョンがトラフィックを処理し続ける**。この窓で旧コードが「破壊済みの新スキーマ」を叩くと `PrismaClientKnownRequestError`（unknown column 等）で 500 になる。

→ スキーマ変更を **後方互換（旧コードでも壊れない）に保ったまま先行適用**し、破壊（DROP 等）は旧コードが本番から消えた後の別デプロイで行えば、この窓が構造的に消える。業界標準: [Martin Fowler "Parallel Change"](https://martinfowler.com/bliki/ParallelChange.html) / [Stripe "Online migrations at scale"](https://stripe.com/blog/online-migrations) / [GitLab "Avoiding downtime in migrations"](https://docs.gitlab.com/development/database/avoiding_downtime_in_migrations) / [strong_migrations](https://github.com/ankane/strong_migrations)。

## 破壊操作別の手順

### 列削除（DROP COLUMN）/ テーブル削除（DROP TABLE）

1. **PR A（expand / 参照除去）**: アプリ・ドメイン層・`schema.prisma` から対象列／テーブルへの read/write 参照を **すべて** 除去してデプロイ。DB にはまだ列／テーブルが残る（＝旧コードと後方互換）。
2. **PR B（contract）**: PR A が本番に行き渡った後、`DROP COLUMN` / `DROP TABLE` のみの別マイグレーションを別 PR でデプロイ。DROP は不可逆なので直前にバックアップ／論理削除猶予を置く（GitLab の `remove_after` 相当）。

### 列リネーム・型変更

一発 `ALTER`（テーブル全書き換え＝長時間 `ACCESS EXCLUSIVE` ロック）を避ける: (1) 新列追加 → (2) アプリで新旧両方に書く（dual write）→ (3) 既存行を backfill（小トランザクション分割）→ (4) 読み取りを新列へ → (5) 旧列への書込停止 → (6) 別デプロイで旧列 DROP。

### NOT NULL 追加（既存 populated 列）

直接 `SET NOT NULL`（全行スキャンで読み書きブロック）を避ける: `ADD CONSTRAINT ... CHECK (col IS NOT NULL) NOT VALID` → 別ステップで `VALIDATE CONSTRAINT`（弱いロック）→ `SET NOT NULL` → CHECK 制約削除。

## この repo の運用・制約

- `prisma/migrations/**` への直接 Write は deny（`.claude/settings.json`）。schema 変更は **`bun run db:migrate`（`migrate dev`）のユーザー対話実行**で生成する。手で migration ディレクトリを mkdir/Write しない。
- 破壊的変更は `prisma migrate dev --create-only` で SQL 草案を生成 → 手編集で expand/contract に分割 → 適用、が公式手順（[Customizing migrations](https://www.prisma.io/docs/orm/prisma-migrate/workflows/customizing-migrations)）。
- **1 PR = 1 論理変更**。expand と contract は **別 PR / 別デプロイ**にする。
- 本番適用前にバックアップ。可能なら本番データのコピーで先にテスト。

## 強制（CI ゲート — squawk）

この規約は文章だけでなく CI で機械的に強制される。

- `migration-safety` job（`.github/workflows/ci.yml`）が PR で変更された `prisma/migrations/**/migration.sql` を [Squawk](https://squawkhq.com/) で lint し、**後方互換を壊す変更（`DROP COLUMN` / `DROP TABLE` / `DROP DATABASE`・列/テーブルのリネーム・型変更・既存列への `NOT NULL` 追加）を検出したら CI を落とす**。設定は repo 直下 `.squawk.toml`、実行ラッパーは `scripts/lint-migrations.ts`。
- スコープは Risk 1（後方互換）に限定。lock / 型スタイル系 rule（`require-concurrent-index-creation` / `prefer-timestamptz` 等）は低トラフィック単一インスタンス（Cloud Run min0/max1）構成では過剰なため除外している（理由は `.squawk.toml` のコメント参照）。マルチインスタンス化・高トラフィック化したら lock 系を再有効化して再評価する。
- **escape hatch（contract フェーズの意図的 DROP）**: 新規 migration SQL の対象文の直前行に `-- squawk-ignore <rule>` を書く（例: `-- squawk-ignore ban-drop-column`）。理由をコメントで併記し、expand PR が本番に行き渡ったことを確認してから contract する。新規 migration ファイルの追加・編集は許可されている（`scripts/check-protected-files.sh` がブロックするのは既存ファイルの改変のみ）。
- squawk は公式リリースの生バイナリを **SHA256 ピン**して実行する（`ci.yml` の `SQUAWK_VERSION` / `SQUAWK_SHA256`）。npm ラッパー（`squawk-cli`）は spawn 失敗時に exit 0 を返し偽陰性を生むため使わない。バージョン更新時は SHA256 も更新し、追加された rule の有無を確認する。
- ゲートは毎回 fixture（`scripts/lint-migrations.fixtures/`：unsafe→検出 / safe→通過 / ignored→通過）で self-test し、実環境での挙動とスコープ設定を実証する。

## 例外（big-bang を許容してよい条件）

pre-release / never-indexed / アクティブユーザーなし、または「DB とアプリを同期デプロイでき短時間ダウンタイムを許容できる」場合は一発破壊も正当（expand/contract 原典の [Pete Hodgson](https://blog.thepete.net/blog/2023/12/05/expand/contract-making-a-breaking-change-without-a-big-bang/) / Tim Wellhausen も条件付きで容認）。本番 live・無停止が要件のときは原則 expand/contract。
