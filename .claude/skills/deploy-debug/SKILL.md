---
name: deploy-debug
description: 本番デプロイ（Deploy Production workflow / Cloud Build / Cloud Run / Terraform apply / migrate job）が失敗したときの切り分け手順。デプロイが落ちた・本番が 500 を返す・IAP で管理画面に入れない・migration が P3009 で詰まった、といった調査に使う。
---

# 本番デプロイの切り分け

本番反映は **Actions → Deploy Production → Run workflow**
（`.github/workflows/deploy-production.yml`、`workflow_dispatch` のみ）。
`main` へのマージでは何も出ない。まず**どの段で落ちたか**を確定させてから
原因を探す。推測でログを読む前に、実際の run とログを取ってくること。

```sh
gh run list --workflow=deploy-production.yml --limit 5
gh run view <run-id> --log-failed
```

## 段は 2 つ、Cloud Build の step は 12

workflow job:

1. `terraform-apply` — IAM 等の前提を作る
2. `deploy` — Cloud Build を submit する

Cloud Build（`cloudbuild.yaml`）の step id は次の順:

`validate-production-substitutions` → `pull-cache` → `build-image` →
`build-migrator` → `push-image` → `migrate-update` →
（破壊的 migration 時のみ）`disable-public-for-breaking-migration` →
`disable-admin-for-breaking-migration` → `wait-for-breaking-migration-drain` →
`migrate-execute` → `deploy-public` → `deploy-admin`

```sh
gcloud builds list --project=myrrh-rental-space --region=asia-northeast1 --limit=5
gcloud builds log <build-id> --project=myrrh-rental-space --region=asia-northeast1
```

## 段ごとの典型原因

### terraform-apply で落ちる

- **409 already exists** — 既存の GCP リソースに `import{}` block が無い。
  該当リソースと同じ `.tf` ファイル内に置く。
- **project-level IAM の permission denied** — grant は Terraform ではなく
  `scripts/bootstrap-terraform.sh` が持つ契約（F1 structural closure）。
  `.tf` に IAM binding を足して解決しようとしない。
- **Cloudflare の import ID 不正** — provider v5 はリソース種別ごとに
  ID フォーマットが違う。
- secret の削除で壊れた場合は 3 段階（state から orphan 化 → `gcloud` で削除
  → `removed` block）を踏み直す。

### validate-production-substitutions で落ちる

`cloudbuild.yaml` の `substitutions` に定義した key が body で未参照、または
workflow が渡す key が cloudbuild 側に無い。Cloud Build は unmatched key を
`INVALID_ARGUMENT` で拒否する。

### build-image で落ちる

CI の `build` job が通っているなら env の差分を疑う。Cloud Run deploy は
Server Actions の暗号鍵を **build 時と runtime の両方**に注入する契約なので、
片方だけ抜けていると build は通って本番だけ壊れる。

### migrate-execute で落ちる

`prisma migrate deploy` が失敗すると `_prisma_migrations` に失敗が記録され、
**以降のデプロイが全部止まる**（P3009）。この repo の migration は
`BEGIN;` / `COMMIT;` で包む契約なので、出るエラーは実際の違反ではなく
`current transaction is aborted, commands ignored until end of transaction block`
だけになる。原因はリハーサルで特定する:

```sh
bun scripts/migration-preconditions.ts --url <本番と同じスキーマの DB>
```

復旧は `prisma migrate resolve --rolled-back <migration_name>` の後に
修正版 migration を追加する。**失敗した migration の SQL を編集しない。**

なお `prisma migrate deploy` の exit 0 はデプロイ成功の証拠にならない。
接続先が別 DB でも `No pending migrations to apply.` を返す。切替を伴う
作業では `bun scripts/db-census.ts` でスキーマの実体を確認する。

### deploy-public / deploy-admin で落ちる、または出た後に 500

- **旧 revision が新スキーマを叩いている** — ローリング切替窓の事故。
  破壊的 DDL なのに計画ダウンタイムモードに入っていなかった可能性を疑う。
- **Server Action が永久 pending** — Next.js 16.2 系の上流 React バグ。
  `revalidate` を伴う Server Action 後に解決しない。16.3.0 で修正済み。
- **CSP で JS が全ブロック** — static prelude が空でないと nonce が固定化する。
  `bun scripts/check-static-prelude-empty.ts`（`bun run build` に同梱）。

### 管理画面に入れない

```sh
bun run gcp:audit-production-iap
```

管理画面は Cloud Run direct IAP + Google Group（super-admins / admins /
editors / viewers）で守られている。**IAP が通っても、同じメールアドレスの
スタッフ user が DB に無ければ入れない**。公開ドメイン側の `/admin/*` は
404 を返すのが正しい挙動。

## 破壊的 migration = 計画ダウンタイム

適用対象の migration SQL が下記のいずれかを含むと、両サービスを scale 0 に
して 310 秒 drain するモードに入る（`disable-*-for-breaking-migration` と
`wait-for-breaking-migration-drain` の step が出るかどうかで判別できる）。
判定の SSoT は `deploy-production.yml` 内の正規表現で、この列挙がそこから
導出した集合と一致することは
`__tests__/unit/architecture/breaking-migration-detection.test.ts` が強制する。

<!-- breaking-triggers:start -->

ALTER TABLE ... ALTER COLUMN ... DROP DEFAULT /
ALTER TABLE ... ALTER COLUMN ... SET NOT NULL /
ALTER TABLE ... ALTER COLUMN ... TYPE /
ALTER TABLE ... DROP COLUMN /
ALTER TABLE ... DROP CONSTRAINT /
ALTER TABLE ... RENAME COLUMN /
ALTER TABLE ... RENAME TO /
ALTER TYPE ... RENAME TO /
ALTER TYPE ... RENAME VALUE /
DROP TABLE /
DROP TYPE

<!-- breaking-triggers:end -->

判定の base は **Cloud Run 上の現行 image tag**。解決できないときは
fail-closed で履歴全体を走査し、計画ダウンタイムありに倒す。ここが黙って
「直前 1 コミット」へ縮退すると、既に merge 済みの破壊的 migration が
無停止で本番に出る。

## 関連

- 運用手順: `docs/gcp-production-setup.md`、`docs/runbooks/`
- 監視・アラート: `docs/observability/alerting.md`
- 基盤の契約: `.claude/rules/deploy-infra.md`
- migration の書き方: `.claude/rules/migrations.md`
