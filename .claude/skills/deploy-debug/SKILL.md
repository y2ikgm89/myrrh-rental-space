---
name: deploy-debug
description: 本番デプロイ失敗の調査手順書。main への push/merge 後に Cloud Build / Cloud Run のデプロイが失敗した、prisma migrate Job (prisma-migrate) が落ちた、新 revision が startup probe (/api/live) で起動しない、デプロイ成功後に CSP nonce 起因で画面の JS が動かない、などの障害切り分けに使う。deploy-production.yml → cloudbuild.yaml の step 別診断、breaking migration mode の挙動、gcloud builds log 等の調査コマンド、build:skip-env / docker によるローカル再現を含む。
---

# 本番デプロイ (Cloud Build / Cloud Run) 失敗調査

不変条件（Dockerfile ステージ順序・migrator イメージ必須・ARG→ENV・/api/live 外部依存ゼロ等）は
rules の `deploy-infra` を参照。CSP nonce / route 動的化 (ƒ) は rules の `app-structure`、
migration 方針は rules の `migrations` を参照。本 skill は「落ちた時にどう調べるか」に絞る。

## 1. 全体像と最初の切り分け

経路は一本道: main への push（= PR merge は即・本番リリース。workflow_dispatch も main ref 限定）
→ `.github/workflows/deploy-production.yml`（WIF 認証）→ `gcloud beta builds submit
--config=cloudbuild.yaml`。beta submit のため Cloud Build ログ全文が GitHub Actions の
"Cloud Build Deploy" job 出力にストリームされる。**まず Actions ログでどの step id で
止まったかを特定**し、下表の節へ進む。

| step id (cloudbuild.yaml)                                            | 内容                                                                                              | 診断節 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------ |
| (submit 自体が失敗)                                                  | substitution 未設定 / gcloud エラー                                                               | §3-A   |
| validate-production-substitutions                                    | 空値・URL 形式・URL 相互一致の検証                                                                | §3-A   |
| pull-cache                                                           | :cache pull。`\|\| true` で fail-safe、ここでは落ちない                                           | -      |
| build-image                                                          | `docker build --target=runner`（next build 込み）                                                 | §3-B   |
| build-migrator                                                       | `docker build --target=migrator` → `:migrate-SHORT_SHA`                                           | §3-B   |
| push-image                                                           | 全タグ push                                                                                       | -      |
| migrate-update                                                       | `gcloud run jobs update prisma-migrate`（image/memory/command/secret を毎デプロイ宣言的に再適用） | §3-C   |
| disable-*-for-breaking-migration / wait-for-breaking-migration-drain | breaking mode 時のみ scaling=0 + drain                                                            | §2     |
| migrate-execute                                                      | `gcloud run jobs execute prisma-migrate --wait`                                                   | §3-C   |
| deploy-public / deploy-admin                                         | 単一 runner イメージ `:SHORT_SHA` を APP_SURFACE 違いで 2 サービスへ                              | §3-D   |

ビルド status の見方:

- **FAILURE** = step のプロセスが非ゼロ終了。step ログにエラー実体がある。
- **INTERNAL_ERROR** = ワーカー VM 側の異常（過去事例はメモリ枯渇で VM ごと死・
  cloudbuild.yaml の build-image コメント参照）。step ログにエラーが残らないことがある。

## 2. breaking migration mode（計画ダウンタイム）

- **発動条件**: deploy-production.yml が push 差分の `prisma/migrations/**/migration.sql` を
  grep し、`ALTER TABLE ... DROP COLUMN / RENAME COLUMN / RENAME TO`、`DROP TABLE`、
  `DROP TYPE` のいずれかを検出すると自動で `_BREAKING_MIGRATION_DEPLOY=true` を submit する
  （Actions ログに `Breaking migration deploy mode enabled for:` と対象ファイルが出る）。
- **挙動**: migrate 実行前に public/admin 両サービスを `--scaling=0` で停止 →
  `_BREAKING_MIGRATION_DRAIN_SECONDS`（既定 310 秒）drain → migrate → 新 revision deploy で
  `--scaling=auto` 復帰。**この間は意図的な全面ダウンタイム**。
- **判断材料**: breaking mode 中に migrate が失敗すると、サービスは scaling=0 のまま =
  **ダウンが継続する**。復旧を最優先し、migration 修正の再 push か、暫定復旧として
  `gcloud run services update <service> --scaling=auto --region=asia-northeast1` を検討
  （旧 revision は旧スキーマ前提である点に注意）。
- 通常モード（false）では migrate 失敗はダウンではない（§5）。

## 3. 故障モード別診断

### A. submit / substitution 検証で失敗

1. submit 自体のエラー → cloudbuild.yaml は必須 substitution にデフォルトを持たない設計
   （ALLOW_LOOSE 非採用）。未設定はここで fail するのが正常動作。workflow env の欠落を疑う。
2. `validate-production-substitutions` の echo メッセージがそのまま原因
   （`_ADMIN_APP_URL must be https://admin.myrrh-jp.com` / 末尾スラッシュ /
   `_NEXT_PUBLIC_APP_URL must match _NEXT_PUBLIC_BASE_URL` 等）。
3. **空デフォルトを復活させて回避しない**（localhost URL が sitemap/OGP に焼き込まれる
   silent SEO 汚染になる。cloudbuild.yaml の substitutions コメントに経緯）。

### B. build-image / build-migrator 失敗

ログ末尾から順にチェック:

1. `ERROR: NEXT_PUBLIC_BASE_URL / NEXT_PUBLIC_APP_URL は build 時に必須` →
   Dockerfile builder-base の early assert。substitution 欠落・空値。
2. `bun run build`（next build）のコンパイル/型エラー → ローカルで `bun run build:skip-env`
   で再現する（§6）。deploy pipeline は type-check/lint/test を実行しない設計のため、
   next build 内蔵の型チェックがここで初めて落ちることは通常ない（PR CI が担保済み）。
3. `test -f .../query_compiler_fast_bg.postgresql.mjs` で fail → runner ステージの
   Prisma prune ガード。Prisma minor bump で内部ファイル名が変わった。**握りつぶさず**
   Dockerfile の prune リスト（`find ./node_modules/@prisma/client/runtime ...`）を更新する。
4. `bun ci` / tarball 展開エラー → `scripts/bun-ci-install.sh` がリトライ
   （最大 3 回試行 + `bun pm cache rm` + `--network-concurrency 4`）してなお失敗した状態。
   一過性 flake なら Actions の re-run で回復することが多い。
5. 長時間無出力 → builder は 60 秒毎に `[cloudbuild] next build still running` heartbeat を
   出す。heartbeat が続いていればビルドは生きている。heartbeat ごと途絶して
   INTERNAL_ERROR ならワーカー側（VM/メモリ）を疑う。

### C. migrate-update / migrate-execute 失敗（migrate Job）

migrate Job の execution ログを読む（§4）。既知パターン:

1. **exit(1) + `datasource.url` 系エラー** → Job イメージが runner (`:SHORT_SHA`) に
   なっている疑い。migrate Job は **migrator ステージ (`:migrate-SHORT_SHA`・完全な
   node_modules)** が必須。slim runner だと `bunx` が実行時にパッケージを再 DL し、
   c12/jiti が `prisma.config.ts` をロードできず `datasource.url` 未解決で落ちる
   （Dockerfile の migrator ステージコメントに #597/#598/#599 の共通根因として明記）。
   確認: `gcloud run jobs describe prisma-migrate --region=asia-northeast1` の image。
2. **signal 11 / `Out-of-memory event detected`** → OOM。過去に 512Mi + 実行時再 DL で
   発生（cloudbuild.yaml `_MIGRATE_MEMORY` コメント）。現行は migrator 化 + 1Gi で
   構造的に解消済みのため、再発したら Job 設定 drift か依存肥大を調査。
3. **migration SQL 自体のエラー**（constraint 違反・型不一致等）→ prisma migrate deploy の
   エラー出力がそのまま原因。修正方針は rules の `migrations`（expand/contract）に従い、
   ローカルで `bun run test:db:migrate`（使い捨て test DB への migrate deploy。初回のみ
   空 DB — クリーン再現には `docker compose down -v` で volume 削除）で再現・検証してから
   fix-forward する。

- migrate-update は image/memory(1Gi)/command(`bunx --bun prisma migrate deploy`)/
  DATABASE_URL secret を毎デプロイ再適用するため、Job への手動変更は次デプロイで消える
  （= 手動変更で恒久修正しない。cloudbuild.yaml を直す）。

### D. deploy-public / deploy-admin 失敗（新 revision 起動失敗）

症状: `Revision ... failed to become healthy` 系。startup probe は
`/api/live`（`src/app/api/live/route.ts` の `GET`・DB 非依存）を
periodSeconds=10 × failureThreshold=9（≒90 秒）で待つ。

1. revision ログ（§4）で起動時 throw を確認。代表例は
   `src/shared/lib/env/server.ts` の `validateProductionEnv`
   （`src/instrumentation.ts` の `register` から起動時に 1 回実行）:
   - `Missing required environment variables in production: ...` → cloudbuild の
     `--set-env-vars` / `--set-secrets` の欠落・Secret Manager バージョン不整合。
   - `E2E/test-only environment variables are not allowed in production ...` →
     `NEXT_PUBLIC_ENABLE_E2E_LOGIN` / `E2E_RUNTIME` / `ADMIN_TEST_IAP_EMAIL` の混入。
2. ログに `prisma migrate` の出力が出て exit(0) → **誤イメージ**。migrator が service に
   deploy された疑い（#599 回帰: `--target` 未指定 build は Dockerfile 末尾ステージを
   ビルドする）。Dockerfile 末尾が runner か、cloudbuild build-image の `--target=runner` /
   build-migrator の `--target=migrator` が崩れていないか確認。
3. probe 自体を疑う前に: `/api/live` へ DB チェックや rate limit を足していないか
   （禁止。rules の `deploy-infra` / `app-structure`）。

### E. デプロイ成功後、画面の JS が全滅（CSP / nonce）

症状: ボタン無反応・ブラウザ console に CSP violation 多数。

1. 原因は route が静的シェル (◐) 化して framework script に per-request nonce が
   付かないこと（規約と opt-in 構造は rules の `app-structure`）。
2. 確認手順: ローカルで `bun run build` の route 表で対象 route が ƒ かを実測 →
   デプロイ後に `curl -s <URL>` で応答ヘッダ CSP の nonce と HTML 内
   `<script nonce="...">` の一致・付与数を突合する。
3. 修正は「nonce が付く構造に戻す」一択。route 表 + curl で検証してから deploy する。

## 4. gcloud 調査コマンド

Cloud Build ログは `options.logging: CLOUD_LOGGING_ONLY` のため Cloud Logging 保存
（Actions ログにも全文ストリーム済み）。region は `asia-northeast1` 固定。

```bash
# ビルド一覧・特定ビルドのログ
gcloud builds list --region=asia-northeast1 --limit=5
gcloud builds log <BUILD_ID> --region=asia-northeast1

# migrate Job の実行履歴と execution ログ
gcloud run jobs describe prisma-migrate --region=asia-northeast1
gcloud run jobs executions list --job=prisma-migrate --region=asia-northeast1
gcloud logging read 'resource.type="cloud_run_job" AND resource.labels.job_name="prisma-migrate"' --limit=100

# サービス状態・revision ログ
gcloud run services describe myrrh-rental-space --region=asia-northeast1
gcloud run services describe myrrh-rental-space-admin --region=asia-northeast1
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="myrrh-rental-space"' --limit=100

# migrate Job の手動再実行（原因修正後）
gcloud run jobs execute prisma-migrate --region=asia-northeast1 --wait
```

- admin サービスの IAP/IAM/ingress 設定の監査は `bun run gcp:audit-production-iap`
  （`scripts/audit-gcp-production-iap.ts`。migrate Job の command/実行設定が canonical かも検査）。
- ローカル shell の gcloud が未認証・権限不足の場合は Cloud Shell / Console から実行する。
- 初回セットアップ起因（Job 未作成・worker pool・WIF）は `docs/gcp-production-setup.md` が runbook。

## 5. 運用判断材料（慌てないためのチェック）

- **通常モードの migrate 失敗は即ダウンではない**: deploy-public/deploy-admin は
  `waitFor: [migrate-execute]` のため migrate 失敗時は実行されず、**旧 revision が
  そのまま serving を継続**する。落ち着いて原因修正 → 再 push でよい。
- **breaking mode 中の失敗はダウン継続**（§2）。こちらだけは復旧最優先。
- deploy workflow は `concurrency: deploy-production`（cancel-in-progress: false）で
  直列化される。連続 merge 時は前のデプロイ完了待ちで遅れて見えるだけのことがある。
- Step 4 (migrate-update) は migrate 実行前に走るため、「Job のイメージが古い」状態は
  構造的に起きない。起きていたら Step 3 以前で fail している。
- probe/起動失敗で新 revision が上がらない場合も、トラフィックは健康な旧 revision に
  留まる（Cloud Run の revision 置換は healthy になってから）。

## 6. ローカル再現

```bash
# 本番相当 next build（プレースホルダ env + SKIP_ENV_VALIDATION。build-image の bun run build 相当）
bun run build:skip-env

# Docker ビルドまで再現（builder は BuildKit secret 必須）
echo -n "<64hex>" > /tmp/nsaek.txt
docker build --target=runner \
  --secret id=next_server_actions_encryption_key,src=/tmp/nsaek.txt \
  --build-arg NEXT_PUBLIC_BASE_URL=https://rental-space.myrrh-jp.com \
  --build-arg NEXT_PUBLIC_APP_URL=https://rental-space.myrrh-jp.com \
  -t local-runner .
docker build --target=migrator -t local-migrator .   # migrator は ARG 不要（FROM deps）

# migrate deploy の再現（使い捨て test DB へ適用。TEST_DATABASE_URL 未設定なら test-db を自動起動。
# volume は永続のため、空 DB からの再現は docker compose down -v で初期化してから）
bun run test:db:migrate

# ローカル開発 DB
docker compose up -d db
```

- `SKIP_ENV_VALIDATION` はビルド/CI 専用。本番 runtime に足すと `validateProductionEnv` ごと
  無効化される（rules の `deploy-infra`）。
- 報告前の総合検証は `bun run validate`。
