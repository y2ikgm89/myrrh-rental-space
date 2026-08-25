# 残り 6 領域の実装計画 — 総合評価を 10 点へ

作成 2026-08-25 / 基準 HEAD `b7a6a5914`（`fix/coupon-usage-release` 時点）

---

## 0. この計画の読み方

### 0.1 何が根拠か

この計画の各記述は、**HEAD の実物に当てて確認した結果**である。
2 段階で作った。

1. **仕様確定** — 6 領域それぞれについて、前段調査の指摘を実物で再検証し、
   公式ドキュメント（URL）または `node_modules` / `.terraform` 同梱資料を
   一次資料として引いたうえで実装手順を書いた。
2. **実装可能性の検証** — 別の担当が仕様の `file:line`・関数名・キー名・設定項目を
   1 つずつ開いて確認し、変異検査が本当に新旧を判別できるかを検討した。
   この段で **NEEDS_CHANGES が 6 領域すべてに付いた**ため、本計画はその指摘を
   反映済みの形になっている。

行番号は HEAD 基準。**先行 PR をマージすると失効する**ので、着手時に必ず開き直すこと。
失効しやすい箇所は各 PR の「前提」に明記した。

### 0.2 確定していないことの扱い

「§2 着手前に解く前提」に集約した。**本番 GCP と Neon への到達が要るものは
すべてここに入っている。** 未解決のまま着手すると壊れる PR には、その旨を
「前提」欄に書いた。推測で埋めていない。

### 0.3 この計画が守る規約

- 1 PR = 1 論理変更（目安 300 行 / 10 ファイル）
- 新しい gate を足すのは**実際に起きた欠陥**に対してだけ。fixture 対
  （落ちるべき形 / 落ちてはいけない形）が必須
- 免除の入口（allowlist / 除外リスト）を増やさない
- 緩和（threshold を緩める / skip / timeout 延長）は修正ではない
- 既適用 migration は 1 バイトも触らない（`scripts/check-protected-files.sh` が deny）
- `bun run format` は触ったファイルだけを引数で渡す（引数なしは全体を書き換える）

---

## 1. 全体像

### 1.1 領域と PR 数

| #   | 領域                        | 効く軸 | 現在 | PR 数 | 到達見込み |
| --- | --------------------------- | ------ | ---- | ----- | ---------- |
| A   | CI/CD・デプロイ（rollback） | 4      | 8    | 5     | 9          |
| B   | 可観測性 + 性能予算         | 12・11 | 7・7 | 5     | 9・8       |
| C   | PII の宣言と消去経路        | 1・6   | 9・8 | 5     | 10・9      |
| D   | a11y の分母と PR 実行       | 9      | 8    | 6     | 9          |
| E   | 空振りしている走査型 gate   | 7      | 8    | 7     | 9          |
| F   | `__tests__` の型契約        | 3      | 9    | 2     | 10         |

合計 **30 PR**。うち 4 PR は本番アクセスが前提（§2）。

**10 に届かない軸が残る。** 理由は §6 に集約した。到達見込みは
「この計画を全部やった場合」であって、楽観値ではない。

### 1.2 領域間の依存

領域どうしは独立で、並行して進められる。**唯一の例外**は
C-PR4（監査 payload の型）が C-PR1（PII manifest）に依存すること。

領域内の依存は各領域の「実装順序」に書いた。

### 1.3 推奨する着手順

1. **F**（2 PR、本番アクセス不要、既存 gate をほぼ壊さない）
2. **E**（7 PR、うち PR1/PR2/PR5 は互いに独立。小さく速い）
3. **D**（6 PR、直列。E2E の実行が要る）
4. **C**（5 PR、2 系統に分岐。実 DB が要る）
5. **B**（5 PR、うち 3 PR は本番アクセスが前提）
6. **A**（5 PR、直列。全 PR が本番デプロイの挙動を変える）

A を最後に置くのは、**A の全 PR が「次のデプロイで初めて実証される」**ため。
先に B-PR3 / B-PR4 で観測手段を作っておくほうが、A の効果を確認しやすい。

---

## 2. 着手前に解く前提

すべて **1 回ずつコマンドを打てば解ける**。推測で埋めてはならない。

### 2.1 本番 GCP（`gcloud` の認証が要る）

| #   | 何を確かめるか                                                                             | コマンド                                                                                                                                                                                                                                                                                          | 解けないと何が壊れるか                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | `gcloud run revisions describe` の image field path                                        | `gcloud run revisions describe "$(gcloud run services describe myrrh-rental-space --project=myrrh-rental-space --region=asia-northeast1 --format='value(status.traffic[0].revisionName)')" --project=myrrh-rental-space --region=asia-northeast1 --format=json \| jq '.spec.containers[0].image'` | **A-PR2**。base 解決が失敗すると毎デプロイが `--scaling=0` + 310 秒 drain の計画ダウンタイムに落ちる                                                                               |
| P2  | `status.traffic[0].revisionName` が pin 時に serving revision を返すか（index の順序保証） | 上記の内側コマンドを pin 状態で 1 回                                                                                                                                                                                                                                                              | **A-PR2**                                                                                                                                                                          |
| P3  | public service の `status.url` と tag URL の到達性                                         | `gcloud run services describe myrrh-rental-space --project=myrrh-rental-space --region=asia-northeast1 --format='value(status.url)'` → `curl -sS -o /dev/null -w '%{http_code}' "https://canary---<host>"`                                                                                        | **A-PR5**。tag URL に届かないと canary が成立しない                                                                                                                                |
| P4  | 残存 revision 数（どこまで戻せるか）                                                       | `gcloud run revisions list --service=myrrh-rental-space --project=myrrh-rental-space --region=asia-northeast1 --format='value(metadata.name,status.conditions[0].lastTransitionTime)'`                                                                                                            | **A-PR3** の runbook に書く選択肢の実数                                                                                                                                            |
| P5  | cron 失敗時の `httpRequest.status`（499 / 504 / 500 のどれか）                             | `gcloud logging read 'resource.type="cloud_run_revision" AND httpRequest.requestUrl=~"/api/cron/"' --project=myrrh-rental-space --limit=200 --format='value(httpRequest.status)' \| sort \| uniq -c`                                                                                              | **B**。499 なら既存 `cron_job_failure` の filter `httpRequest.status>=500` は**永久に鳴らない**。B-PR2 の heartbeat はこれを迂回するので着手は可能だが、既存 policy の評価が変わる |
| P6  | cron の 2xx request log が実在するか                                                       | 同上を `AND httpRequest.status<300` で                                                                                                                                                                                                                                                            | **B-PR2**。0 件なら heartbeat metric が初日から沈黙する                                                                                                                            |
| P7  | `logging.googleapis.com/user/web_vitals` の直近 7 日のサンプル数                           | `gcloud logging read 'logName=~"web_vitals"' --project=myrrh-rental-space --freshness=7d --limit=10`                                                                                                                                                                                              | web_vitals の alert を張るか捨てるかの判断（§4 参照）                                                                                                                              |
| P8  | Cloud Monitoring の alerting 課金の実単価                                                  | https://cloud.google.com/stackdriver/pricing の Alerting 節                                                                                                                                                                                                                                       | **B-PR2**。policy が 4 → 28 本になるので `docs/observability/alerting.md:60-64` の記述を書き直す必要がある                                                                         |

### 2.2 Neon（コンソール）

| #   | 何を確かめるか                                  | どこで                             | 解けないと何が壊れるか                                                                                                  |
| --- | ----------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| P9  | プランと `history_retention_seconds`（PITR 窓） | Neon コンソール → Project settings | **A-PR3** の runbook ケース B「いつまで戻せるか」が書けない。RPO の上限が不明のまま日次の物理削除を回している状態が続く |

### 2.3 CI（本番アクセス不要だが dispatch が要る）

| #   | 何を確かめるか                                                                               | コマンド                                                                                                                            | ブロックするもの                    |
| --- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| P10 | LHR の実測値（`resource-summary` の `script` / `total` transferSize）                        | B-PR3・B-PR4 マージ後に `gh workflow run ci.yml --ref main -f run_full_ci=true` → `gh run download <id> -n lighthouse-report-<sha>` | **B-PR5**。閾値を実測から決めるため |
| P11 | `?deploy-probe=<sha>` を付けた `/` と `/spaces` が 200 か（nuqs の未知 search param の扱い） | ローカル build + start で `curl` 1 回                                                                                               | **A-PR4**                           |

---

## 3. 領域別の実装計画

---

## A. 軸4 — CI/CD・デプロイ（rollback が定義されていない）

### A.0 現状（実物で確認済み）

- `post-deploy-smoke` が落ちても新 revision は 100% traffic のまま。
  `.github/workflows/deploy-production.yml:483` が「自動 rollback はしない」と明記。
- 唯一の切り戻しコマンドは `docs/runbooks/database-restore.md:126-136` にしかなく、
  `post-deploy-verification.md` から辿れない。
- `terraform/cloud_run_public.tf:123-126` / `cloud_run_admin.tf:121-124` が
  traffic を LATEST/100 で宣言しているため、pin は**次の apply で消える**。
- `terraform-apply` job（`deploy-production.yml:151`）は deploy job（`:315`）より
  **前**に走る。pin して止血 → 修正 commit → Deploy Production を打つと、
  build が終わる前に traffic が壊れた LATEST へ戻る。
- migration は cloudbuild の prisma-migrate Job として deploy 内で適用されるため、
  revision を戻しても schema は戻らない。
- `scripts/gcp-production-audit-model.ts:1403-1411` の
  `readCloudRunTrafficLatestErrors` は `traffic.length !== 1` を違反として報告する。
  **つまり唯一の切り戻し手段を実行すると本番監査が赤になる。**
- `terraform/artifact_registry.tf:91-97` のコメント自身が
  「migration があるので image だけ戻しても DB は戻らない」と書いており、
  rollback が定義できないことは**リポジトリ内で既に認識されたうえで放置**されている。

### A.1 公式推奨（一次資料）

| 出典                                                                        | 読み取った要点                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| https://docs.cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration | 「If you split traffic between multiple revisions or assigned traffic to a previous revision, all subsequent deployments use that traffic split pattern going forward.」— **pin は以後の deploy に引き継がれる**。したがって「deploy の最後に必ず `--to-latest` を打つ」が必須 |
| 同上 / `gcloud run services update` reference                               | `--no-traffic` + `--tag=<TAG>` で **traffic を持たない revision** を出せる。`update-traffic` の `--to-latest`（traffic 群）と `--clear-tags` / `--remove-tags`（tag 群）は**別グループ**なので 1 コマンドで併用できる                                                          |
| https://docs.cloud.google.com/run/docs/triggering/https-request             | tag URL は `https://[TAG---]SERVICE_NAME-PROJECT_NUMBER.REGION.run.app`。**書式を推測せず `status.url` から組み立てる**                                                                                                                                                        |
| Terraform `google_cloud_run_v2_service`                                     | 「If traffic is empty or not provided, defaults to 100% traffic to the latest Ready Revision」— traffic block を**消さず** `lifecycle.ignore_changes` に入れる（消すと空 state からの bootstrap 宣言を失う）                                                                   |

### A.2 PR

#### A-PR1 `docs(adr): Cloud Run の traffic 所有権を deploy 面へ移し、tag canary を採る`

**目的** — この計画は既存の 3 つの明文化された前提を覆す。覆した理由を残さないと、
後任が `ignore_changes` や promote step を「冗長」と読んで外す。

**触るファイル**（2）
`docs/adr/0006-cloud-run-traffic-ownership-and-canary.md`（新規） / `docs/adr/README.md`

**手順**

1. `docs/adr/README.md:31-37` の Index 表に 1 行足す。
2. ADR 本体。Status: Accepted。**Context** に現状の 3 事実を `file:line` 付きで書く
   （自動 rollback しない `deploy-production.yml:483` / 切り戻しが
   `database-restore.md:126-136` にしかない / `terraform-apply` が deploy より前）。
3. **Decision** を 3 つに分ける。
   (1) traffic は cloudbuild ではなく **GitHub Actions の deploy job** が所有する。
   Terraform は traffic block を宣言したまま `lifecycle.ignore_changes` に入れる。
   (2) 毎 deploy の最後に `update-traffic --to-latest` を打つ。
   (3) public 面は `--no-traffic --tag` で出し、tag URL を検証してから promote する。
   admin 面は `ingress=INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER` なので canary しない。
4. **Consequences** に対価を書く。`terraform-drift.yml` が traffic の pin を
   拾わなくなる（同 workflow `:19-21` が「`ignore_changes` で吸収済 → plan diff に
   出ない」と自認）。埋め合わせは deploy 時の serving 検証と手動
   `bun run gcp:audit-production-iap` の 2 つで、**常時監視は無い**。この穴は
   別テーマとして起票する、と明記する。
5. cloudbuild の deploy-admin より後ろに step を足すと
   `deploy-production-workflow.test.ts` の slice-to-EOF **3 箇所**
   （`:265` / `:297` / `:516`）の走査範囲に入る、という制約も ADR に残す。

**検証** — `bun run test -- __tests__/unit/architecture/adr-index-links.test.ts`（存在すれば）、
`bun run validate`。

**見積り** 130 行 / 2 file。**前提** なし。

---

#### A-PR2 `fix(deploy): Cloud Run の traffic 所有権を deploy 面へ移し、pin を deploy をまたいで生かす`

**目的** — pin が次の apply / 次の deploy で消える状態をなくす。

**触るファイル**（5）
`terraform/cloud_run_public.tf` / `terraform/cloud_run_admin.tf` /
`.github/workflows/deploy-production.yml` /
`__tests__/unit/architecture/deploy-production-workflow.test.ts` /
`__tests__/unit/architecture/deploy-breaking-base-resolution.test.ts`

**手順**

1. `cloud_run_public.tf:130-134` の `ignore_changes` 配列に `traffic,` を足す。
   traffic block（`:123-126`）は**残す**。コメントは効能を**1 点だけ**書く —
   「`terraform-apply` job は deploy job より前に走る。pin 中に修正デプロイを打つと
   build 完了前に traffic が壊れた LATEST へ戻る。`ignore_changes` はこの障害窓だけを
   消す。pin の解除は deploy 末尾の `--to-latest` が行う」。
2. `cloud_run_admin.tf:128-134` の `ignore_changes` にも `traffic,` を足す
   （コメントは public を参照する 1 行に留める）。
3. `deploy-production.yml:355-372` の `DEPLOYED_IMAGE=` を **2 段**にする。
   段 1: `--format='value(status.traffic[0].revisionName)'` で serving revision 名。
   段 2: `gcloud run revisions describe "$SERVING_REVISION" --format='value(spec.containers[0].image)'`。
   **理由**: pin 中は `spec.template` が最新 revision を指すので、直読みすると
   破壊的判定の base が誤る。
4. `printf 'Breaking-migration base: %s (deployed tag: %s)\n'` の行は
   **文字列を 1 文字も変えない** — `deploy-breaking-base-resolution.test.ts:52` が
   この前置きを切り出しの終端 marker に使っている。
5. deploy job の `gcloud beta builds submit`（`:474-479`）の**直後**に step を 1 本足す
   （`Promote to latest revision and verify serving image`）。
   `shell: bash` / `set -euo pipefail`。public / admin の両方に
   `update-traffic --to-latest` を打ち、`status.traffic[0].revisionName` と
   `spec.containers[0].image` が期待の SHA であることを確かめる。
   **cloudbuild.yaml の deploy-admin より後ろに step を足さない**（前述の slice 3 箇所）。
6. `deploy-production.yml:481-484` のコメントへの runbook 参照は **A-PR3 で足す**
   （文書が無い状態で参照を作らない）。
7. `deploy-production-workflow.test.ts` に test を 2 本足す（既存 `:534` の直前）。
   1 本目「Cloud Run traffic は deploy 面が所有する」— 両 tf が
   `TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST` を含み、かつ `ignore_changes` **ブロック内**に
   `traffic,` を含むこと。
   2 本目「deploy は promote と serving 検証を持つ」— workflow が
   `update-traffic` と `--to-latest` を含むこと。
8. `deploy-breaking-base-resolution.test.ts` の `run()` が書く gcloud stub を
   **引数対応**にする（`case "$*" in *"services describe"*) ... ;; *"revisions describe"*) ... ;; esac`）。
   既存 5 test の stub をこの形へ書き換える。
9. 同 test に fixture 対を 1 組足す。**落ちるべき形**: traffic が旧 revision に
   pin されているとき、base は pin 先 revision の image から取る。
   旧実装（`spec.template` 直読み）なら最新 SHA を返して落ちる。

**変異検査（判別できる形に直したもの）**

- `ignore_changes` の regex は `traffic,` の**文字列包含では判別できない**
  （配列内コメントに `traffic,` が残っていると true になる）。
  実測で確認済み。**コメントを除去してから配列要素として一致を見る**こと。
- 「サービス未作成」「tag が SHA 形でない」の既存 2 test は**どちらも
  `base=firstSha` を期待**しており、安全側フォールバックと同値。
  新 fixture の期待値は `firstSha` **以外**にすること（そうしないと判別できない）。

**壊れうる gate**
`deploy-production-workflow.test.ts:265 / :297 / :516`（slice-to-EOF 3 箇所） /
`deploy-breaking-base-resolution.test.ts:52`（marker） /
`__tests__/support/breaking-migration-pattern.ts:41`（workflow 全文の最初の
`grep -Ei '...' > /dev/null` を ERE 抽出に使う）

**見積り** 240 行 / 5 file。**前提** **P1・P2**（未解決のまま merge すると
毎デプロイが計画ダウンタイムに落ちる）。A-PR1 が先。

---

#### A-PR3 `docs(runbooks): 本番 rollback の runbook を新設し、deploy の出力から辿れるようにする`

**目的** — 切り戻し手順を 1 箇所に集め、deploy の出力から辿れるようにする。
**migration ファイルは 1 バイトも触らない**（`check-protected-files.sh` が deny し、
本番の `_prisma_migrations.checksum` 照合が次のデプロイを落とす）。

**触るファイル**（6）
`docs/runbooks/production-rollback.md`（新規） / `post-deploy-verification.md` /
`database-restore.md` / `docs/README.md` / `.github/workflows/deploy-production.yml` /
`__tests__/unit/architecture/deploy-production-workflow.test.ts`

**手順**

1. `deploy-production.yml` の破壊的判定 for ループ（`:425-437`）の直後・
   `SHORT_SHA=`（`:439`）の直前に `$GITHUB_STEP_SUMMARY` への出力ブロックを足す。
   見出し `## rollback 判定`、`BREAKING_MIGRATION_DEPLOY` の値、base commit、
   この deploy で適用される migration ファイル一覧（0 件なら「なし」）、
   runbook への参照。
   **既存の判定ロジックは増やさない** — `:432-434` が既に
   `printf 'Breaking migration deploy mode enabled by: %s\n'` で同じ情報を出しており、
   これはその**転記**にすぎない。
2. `production-rollback.md` を新規作成。7 節構成:
   (1) いつ読むか（smoke が赤 / 本番で回帰 / DB を戻した）
   (2) **先に決める: この deploy は image だけで戻せるか** — 判定入力は当該 run の
   Step Summary。run が古い場合の再計算手順（`gh run list` → `git diff --name-only <SHA>..HEAD -- prisma/migrations/`）
   (3) ケース A: image だけで戻す（`update-traffic --to-revisions`）
   (4) ケース B: migration を含む（DB を戻す。`database-restore.md` へ）
   (5) pin 中の注意（次の deploy の promote が pin を解除する）
   (6) 監査の扱い（`traffic.length !== 1` で `gcp:audit-production-iap` が赤になる）
   (7) **admin 面の検出限界** — `ingress=INTERNAL_LOAD_BALANCER` + `default_uri_disabled`
   のため外から中身を検証できず、smoke は 302/401 しか見ない。
   **admin の論理回帰はこの層では検出できない**と明記する。検出できるふりをしない。
   **migration を 1 件も名指ししない**（`gates-do-not-pin-migrations.test.ts` は
   `docs`（`superpowers` / `audits` を除く）と `.github` を走査する）。
3. `database-restore.md:122-144` の gcloud ブロックを削り、production-rollback.md への
   参照 1 行に置き換える。`:138-144` の引用（「次に Deploy Production を dispatch すると
   先頭の terraform-apply が LATEST へ戻す」）は A-PR2 で事実でなくなるので**削除**。
4. `post-deploy-verification.md:20-24` と `:110-114` に参照を足す。
5. `docs/README.md:18-26` の runbook 表に 1 行足す。
6. `deploy-production.yml:636-644` の deploy-result Issue 本文、
   `"- post-deploy-smoke の失敗: デプロイは済んでいる。..."` の行は
   **先頭の部分文字列を変えずに**次行へ 1 行足す（既存 gate `:549` が部分文字列で見ている）。
7. `deploy-production.yml:481-484` のコメントに runbook 参照を足す（A-PR2 で保留した分）。
8. gate を 1 本足す（`:534` の直後）: runbook が実在し、workflow がそのパスと
   `## rollback 判定` を含むこと。**散文の中身は検査しない**。

**変異検査の弱点（対処済み）** — 上記 gate は「参照だけ有る / ファイルだけ有る」の
両方向を潰すが、**Step Summary に実際に何が書き出されるかは固定しない**。
`BREAKING_MIGRATION_DEPLOY` の値が出ることまで assert に含めること。

**見積り** 250 行 / 6 file。**前提** A-PR2。**P4・P9** が無いと (3)(4) の
「どこまで / いつまで戻せるか」が書けない。

---

#### A-PR4 `feat(deploy): post-deploy-smoke を「200 を返す論理回帰」まで見る`

**目的** — 現行の probe は `/api/live`・`/`・`/spaces` の 200 と cf-cache-status、
admin の 302/401 だけ。**200 を返す論理回帰が素通りする**。

**設計上の要点（ここが本 PR の肝）**

`src/app/sitemap.ts` は fail-soft で、catch 節（`:127-143`）が
`fallbackStaticSitemap()`（`:101-104`）を返す。**DB 全断でも 200 かつ `<loc>` 非ゼロ**。
したがって **`<loc>` の件数下限は原理的に無意味**。

判別器は **`<lastmod>` の件数**にする。`fallbackStaticSitemap` は `{ url }` だけを返し
`lastModified` を持たないのに対し、健全経路は全 entry が `lastModified` を持つ。
Next の serializer は `if (item.lastModified)` のときだけ `<lastmod>` を出す
（`node_modules/next/dist/build/webpack/loaders/metadata/resolve-route-data.js:151-155`、
next 16.3.2）。**実測**: fallback = loc 7 / lastmod 0、healthy = loc 8 / lastmod 8。

DB 全断で catch に入る経路も確認済み — `getSitemapContentData` は
`Promise.allSettled` なので throw しないが、
`getFeatureFilterContext → getEnabledFeatures → getFeatureModulesSettings` が
`criticalFetch`（`src/shared/lib/errors/safe-fetch.ts:81-98`）で **rethrow** する。

**触るファイル**（3）
`.github/workflows/deploy-production.yml` / `docs/runbooks/post-deploy-verification.md` /
`__tests__/unit/architecture/deploy-production-workflow.test.ts`

**手順**

1. post-deploy-smoke step 冒頭（`:499` 付近）に `probe_sha="${GITHUB_SHA::7}"`。
2. `for path in "/" "/spaces"; do`（`:529`）の**リテラルは変えない**
   （既存 gate `:540` が `for path in "/" "/spaces"` を部分文字列で見ている）。
   ループ内の curl を `"${PUBLIC_ORIGIN}${path}?deploy-probe=${probe_sha}"` に変える。
   既定 cache key は query string を含むので edge を必ず外す。
3. sitemap の検査を足す。`/sitemap.xml?deploy-probe=...` が 200 で、
   (a) `grep -c '<lastmod>'` が 1 以上、
   (b) `<loc>` のうち `${PUBLIC_ORIGIN}` で始まらないものが 0 件。
4. **`/spaces` のリンク件数検査は入れない。**
   検証で「本番で今日 0 件」と判明した。入れると毎デプロイが赤になり、
   A-PR5 では promote に到達せず**デプロイ不能**になる。
   スペースが 1 件以上ある状態を前提にした検査は、その前提を検査に書けない限り置かない。
5. **grep の書き方の制約**:
   - `grep -Ei '...' > /dev/null` の形を使わない
     （`__tests__/support/breaking-migration-pattern.ts:41` が workflow 全文の最初の
     その形を拾って破壊的判定の ERE を抽出しており、綴りが被ると別物を掴む）
   - `grep -q` を使わない（pipefail × SIGPIPE で条件が反転する。
     `deploy-production.yml:413-424` に実測付きで書かれている）
   - `grep -c` を `|| true` 付きで使う
6. `/api/live`（`:519-526`）と admin の 302/401（`:544-551`）は現行のまま。
   **`/feed.xml` と `<title>` は足さない** — 前者は
   `src/app/(public)/feed.xml/route.ts:19-21` が `isFeatureEnabled("posts")` false で
   `notFound()` するので運用判断で赤くなる。後者は error boundary でも入るので何も証明しない。
   **この判断を workflow のコメントに 2 行残す**（gate にはしない）。
7. `post-deploy-verification.md:14-18` の表に行を足す。
8. 既存 test（`:534-551`）に assertion を足す。**既存行は 1 つも消さない。**
   `toContain("deploy-probe=${probe_sha}")` / `toContain("/sitemap.xml?deploy-probe=")` /
   `toContain("<lastmod>")`。

**変異検査** — 「`<lastmod>` の下限を 1 → 0 に緩める」で赤になるよう、
gate 側で**比較式と下限値まで**固定する（`toContain("$lastmod_count")` だけでは
比較式を緩められても検出できない）。

**見積り** 160 行 / 3 file。**前提** A-PR3・**P11**。

---

#### A-PR5 `feat(deploy): public 面を tag canary 化し、未検証 revision に traffic を送らない`

**目的** — image 起因の回帰について **rollback 自体を不要にする**。
公式の段階リリース（`--no-traffic --tag` → 検証 → `--to-latest --clear-tags`）。

**実現可能性（実物で確認済み）**

- `gcloud run services update` は `--no-traffic` と `--tag` を持つ
  （`gcloud run deploy` に切り替える必要が無いので、`--image` のみ契約を固定している
  既存 gate と衝突しない）
- `--to-latest`（traffic 群）と `--clear-tags`（tag 置換群）は別グループ = 併用可
- public は `cloud_run_public.tf:42` `ingress=INGRESS_TRAFFIC_ALL`、
  `:139-145` で `allUsers` に `run.invoker`、`default_uri_disabled` の宣言なし → 到達可能
- build SA は `terraform/iam_cloud_run.tf:23-39` で public/admin 両方に
  `roles/run.admin` を持つ
- タグ付き revision は tag 経由で最大 1 instance まで立つので
  `max_instance_count=1` と衝突しない
- **admin は `ingress=INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER` なので canary しない**
  （現状 302/401 しか見ていないので損失ゼロ）

**触るファイル**（5）
`cloudbuild.yaml` / `.github/workflows/deploy-production.yml` /
`__tests__/unit/architecture/deploy-production-workflow.test.ts` /
`docs/runbooks/production-rollback.md` / `docs/runbooks/post-deploy-verification.md`

**手順**

1. `cloudbuild.yaml` の deploy-public step（`:529-539`）の args に
   `- --no-traffic` と `- --tag=canary` を足す。tag 名は固定 1 個
   （毎回同じ名前に張り替わるので tag が溜まらない）。
   **deploy-admin step（`:542-552`）は触らない。**
2. **cloudbuild.yaml の deploy-admin より後ろに step を足さない**
   （slice-to-EOF 3 箇所）。
3. deploy job の `gcloud beta builds submit` と A-PR2 の promote step の**間**に
   `Verify canary revision before promoting` を足す。
   `status.url` から tag URL を組み立て（**書式を推測しない**）、A-PR4 で決めた
   内容検査を tag URL に対して流す。
4. A-PR2 の promote step の public 側を
   `update-traffic --to-latest --clear-tags` に変える。tag を残すと
   `status.traffic` が 2 target になり `gcp-production-audit-model.ts:1403-1411` が赤になる。
5. `production-rollback.md` に節を足す（「canary 検証で止まったとき」）。
   traffic は動いていないので**戻す操作は要らない**。残った tag を
   `--clear-tags` で消す。
6. `production-rollback.md` のケース A / B の前提を更新 — ここに来るのは
   (i) canary をすり抜けた回帰、(ii) migration 起因、(iii) admin 面の回帰の 3 つだけ。
7. `post-deploy-verification.md` に canary 段を足し、役割を書き分ける。
8. **破壊的 migration モードでの挙動を workflow のコメントに明記する**。
   破壊的モードでは cloudbuild が両サービスを `--scaling=0` にしてから migrate する。
   deploy-public は `--scaling=auto` を同時に渡すので canary 検証中は自動スケーリングに
   戻っており、旧 revision が新 schema に対して 500 を返す。追加の停止時間は
   canary 検証分（数十秒）で 310 秒の drain に対して十分小さい。
   **canary を条件分岐で無効化しない**（最も危険な deploy だけ検証されなくなる）。
9. gate を 1 本足す: deployPublicStep が `--no-traffic` と `--tag=canary` を含み、
   deployAdminStep が `--no-traffic` を**含まない**こと。

**見積り** 230 行 / 5 file。**前提** A-PR4・**P3**。

### A.3 実装順序

`A-PR1 → A-PR2 → A-PR3 → A-PR4 → A-PR5`（直列）。

---

## B. 軸12 — 可観測性 + 性能予算

### B.0 現状（実物で確認済み）

- `google_monitoring_slo.public_availability`（goal 0.999 / 30 日）は
  terraform 全体で宣言 1 箇所しか参照が無く、**burn rate alert が存在しない**。
- `web_vitals` metric（DISTRIBUTION）に alert policy が無い。
- `cron_job_failure` の filter は `httpRequest.status>=500`。
  **`attempt_deadline` 打ち切りが 499 なら永久に鳴らない**（→ P5）。
- Lighthouse の LHR artifact が**一度も保存されていない**。
  `gh api` で直近 100 件に `lighthouse-report-*` が 0 件。原因は
  `actions/upload-artifact` の `excludeHiddenFiles` が **search root にも適用**され、
  `.lighthouseci/` がドット始まりのため。
- `numberOfRuns: 1` + optimistic 既定（`@lhci/utils/src/assertions.js:64-67` が
  `max*` で `Math.min` を取る）= **単一サンプル判定**。
- `bundle-size-diff` は sticky comment のみで落ちる閾値を持たない。

### B.1 公式推奨（一次資料）

| 出典                                                | 要点                                                                                                                                                                                                           |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloud Monitoring quotas                             | **Conditions per metric-based alerting policy = 6** / policies = 2,000。24 job を 1 policy に入れると apply が必ず失敗する → **policy 自体を `for_each` する**                                                 |
| `google_monitoring_alert_policy` の provider binary | `condition_prometheus_query_language` が**実在**する。`condition_absent` は trigger absence time の上限が 23.5 時間で、日次・週次を表現できない                                                                |
| SLO burn rate                                       | `condition_threshold.filter` に `select_slo_burn_rate("<slo.name>", "<lookback>")`。**lookback は 24h 以下**でしか作れないので、30 日の compliance period を 60m / 24h で近似する                              |
| `@lhci/utils/src/assertions.js:426`                 | `aggregationMethod` は `assertions` と同階層に置くと全 assertion の既定になる。`median` は **assertion ごとに中央値**、`median-run` は FCP/TTI で選んだ 1 本の LHR を全 assertion に使う → **`median` を選ぶ** |
| Lighthouse budget schema                            | `budget.json` の単位は **KB**、`.lighthouserc.json` の `maxNumericValue` は **bytes**。両者は ×1024 の関係                                                                                                     |

### B.2 PR

#### B-PR3 `fix(ci): Lighthouse の LHR artifact を実際に保存する` ← **最初に出す**

**触るファイル**（2）
`.github/workflows/ci.yml` / `__tests__/unit/architecture/ci-artifact-hidden-path.test.ts`（新規）

**手順**

1. `ci.yml:850-856` の Upload Lighthouse report step の `with:` に
   `include-hidden-files: true` を足す。`.lighthouseci/` の中身は
   lhr-*.json / assertion-results.json / links.json / lighthouse.log で秘匿情報は入らない
   （README が警告する「hidden files に機微情報が入っていないか」への回答を
   step のコメントに 1 行書く）。
2. 新規 gate。JSDoc に機序を出典 URL つきで書く — actions/toolkit の
   `packages/glob/src/internal-globber.ts` の globGenerator が search path を stack に
   積んだあと while ループ内で `if (options.excludeHiddenFiles && path.basename(item.path).match(/^\./)) { continue }` を
   **root にも**適用する。
3. parser は `deploy-plan-artifact-no-binary.test.ts` の
   `unquote` / `splitPathEntries` / `collectArtifactUploads` / `collectStepContexts` と
   `Bun.YAML.parse` による全 workflow 走査を**コピーする**
   （「抽象化は 3 回目の重複から」。JSDoc にコピー元を明記）。
4. 判定関数 `searchRootBasename(entry)`: entry を `/` で split し、
   `*` `?` `[` `+(` のいずれかを含む最初のセグメントより前だけを取り、その最後の要素を返す。
   例: `.lighthouseci/` → `.lighthouseci`、`.next/diagnostics/analyze/` → `analyze`、
   `e2e/visual/**/*-snapshots/` → `visual`。
5. 本体 test: include entry のいずれかの `searchRootBasename` が `.` で始まるなら
   `with["include-hidden-files"]` が true であること。
6. 空振り防止 2 本: `workflowFiles.length > 4`（実測 3 workflow に 9 step）、
   `uploads.length > 5`。
7. fixture 対。**落ちるべき形** = `path: ".lighthouseci/"` に
   `include-hidden-files` が無いもの（＝実際に起きた欠陥そのもの）。
   **落ちてはいけない形** 4 本 — `include-hidden-files: true` を足したもの /
   `.next/diagnostics/analyze/`（実測 18,510,604B で成功）/ `.typedoc/api/`（1,654,695B）/
   **`ci.yml:971-974` の実物どおりの block scalar**（複数行 + glob magic。
   合成 1 行では区別できない）。

**検証** — `bun run test -- <新 gate>` / `deploy-plan-artifact-no-binary.test.ts` /
`ci-workflow-contract.test.ts` / `actionlint` / `bun run validate`。
**実測での確定**: マージ後に `run_full_ci=true` を dispatch し、
`gh api repos/:owner/:repo/actions/runs/<id>/artifacts` に
`lighthouse-report-*` が `size_in_bytes > 0` で出ること。**現状 0 件なので明確に判定できる。**

**見積り** 170 行 / 2 file。**前提** なし。

---

#### B-PR4 `fix(perf): Lighthouse を 3 run + median 集計にする`

**触るファイル**（2）
`.lighthouserc.json` / `__tests__/unit/architecture/lighthouse-ci-env.test.ts`

**手順**

1. `ci.collect.numberOfRuns` を 1 → 3（公式既定に戻す）。
2. `ci.assert` に `"aggregationMethod": "median"` を `assertions` と同階層で足す。
3. 既存 gate に test を 1 本足す — `numberOfRuns === 3` と
   `aggregationMethod === "median"` を 1 つの `toEqual` で固定。
   根拠コメント: 「optimistic 既定は `max*` で `Math.min` を取るので run を増やすだけだと
   回帰を隠す（`@lhci/utils/src/assertions.js:64-67`）」。
4. 所要時間を PR 本文に書く。実測: 現行 5 URL × 1 run = collect 139.5s
   （`/` 25.3s、`/spaces` 15.1s、`/blog` 22.8s、`/contact` 14.0s、`/faq` 62.4s）、
   job 全体 3m45s。3 run で collect ≈ 419s、job 全体 ≈ 8m20s。
   `timeout-minutes: 30` の内側。この job は nightly と `run_full_ci=true` でしか
   起動しないので PR の所要時間には影響しない。

**閾値を緩めない。** TBT 300 / LCP 4000 / CLS 0.1 はこの PR で 1 mm も動かさない。
median 3 run にしても `/` の TBT が 300 を超え続けるなら、それは実在の性能問題であって
閾値の問題ではない（別テーマ）。

**見積り** 45 行 / 2 file。**前提** なし（結果を読むには B-PR3 が要る）。

---

#### B-PR1 `feat(monitoring): 公開面 SLO に fast/slow burn-rate alert を足す`

**触るファイル**（4）
`terraform/monitoring.tf` / `docs/observability/slo.md` / `docs/observability/alerting.md` /
`__tests__/unit/observability/alert-policy-duration.test.ts`

**手順**

1. `monitoring.tf` の**ファイル末尾**に alert policy を 2 本追記する。
   **`db_health_probe_failure` の resource ブロック（`:771-834`）の内側には
   絶対に挿入しない** — `db-health-probe-signal.test.ts:108` の non-greedy 正規表現が
   db_health のヘッダから末尾方向に最初に現れる `threshold_value` を拾う
   （現在は `:812` の 3 に当たっている）。
2. 1 本目 `public_availability_fast_burn`:
   `condition_threshold { filter = "select_slo_burn_rate(\"${google_monitoring_slo.public_availability.name}\", \"60m\")"; comparison = "COMPARISON_GT"; threshold_value = 10; duration = "0s" }`
3. 2 本目 `public_availability_slow_burn`: lookback `"1440m"`、`threshold_value = 2`、
   `auto_close = "86400s"`。
4. `google_monitoring_slo.public_availability.name` を使い `projects/...` を手書きしない。
5. `documentation`（`mime_type = "text/markdown"`）に既存 9 本と同じ密度で
   「なぜこの数か」を書く。lookback がそのまま compliance period になるので
   30 日ではなく 60m / 24h で近似すること（公式が 24 時間超では作れないと明記）、
   fast は即 page・slow は翌日対応、診断手順。
6. `alert-policy-duration.test.ts` の parser を直す。`ThresholdCondition` に
   `hasAggregations: boolean` を足し、空振り検査を
   `duration === "" || (hasAggregations && alignmentPeriod === "")` に変える。
   **免除を開かないため**、同じ test に
   `expect(conditions.filter((c) => !c.hasAggregations).map((c) => c.displayName)).toEqual([<SLO 条件 2 本>])` を置く。
7. 見本 fixture を 2 本足す。**落ちるべき形** = `condition_threshold { duration = "60s" aggregations { } }`
   （aggregations はあるが `alignment_period` が無い）。
   **落ちてはいけない形** = SLO 条件（aggregations 無し）。
   JSDoc に「SLO 条件は公式に filter しか使わない」と出典 URL を書く。
8. `slo.md` の閾値表（`:58-68`）に 2 行足す。**行頭は `` | ` `` で始めること**
   （`sloDocNames` の正規表現が `/^\|\s*`([a-z0-9_]+)`\s*\|/gmu` で行頭固定）。
9. `slo.md:70-71` の「Burn-rate alert ... is intentionally not added in the first wave」を
   削り、2 本立ての説明に置き換える。
10. `alerting.md` の Signals 表（`:21-31`）に 2 行足す。resource 列は
    `google_monitoring_alert_policy.public_availability_fast_burn` の形
    （`alertingDocNames` が `/google_monitoring_alert_policy\.([a-z0-9_]+)/gu` で拾う）。

**変異検査の弱点（対処）** — 提案されていた fixture は旧 parser でも新 parser でも
同じ結果になり**判別できない**。上の (7) の形（aggregations の有無で分岐する）に
することで初めて新旧が割れる。

**壊れうる gate**
`db-health-probe-signal.test.ts:107-111`（挿入位置）/
`observability-docs-alert-names.test.ts`（両文書への追記漏れ）

**注意** — `terraform validate` は `select_slo_burn_rate(...)` の中身を
**ただの文字列としか見ない**。綴りの誤りは apply でしか出ない。

**見積り** 135 行 / 4 file。**前提** なし。

---

#### B-PR2 `feat(monitoring): cron の成功 heartbeat を足し、ジョブが黙って止まったら鳴らす`

**目的** — 「ジョブ未起動型は原理的に検知不能」を解消する。
**失敗側の status code（499 / 504 / 500）に一切依存しない**ので、
P5 が未解決でも成立する。

**触るファイル**（4）
`terraform/cloud_scheduler.tf` / `terraform/monitoring.tf` /
`docs/observability/slo.md` / `docs/observability/alerting.md`

**手順**

1. `cloud_scheduler.tf` の `locals { cron_jobs = [...] }`（`:16-179`）の直後に
   locals を 1 ブロック足す。`cron_interval_seconds` は cron 式 → 最大発火間隔(秒) の map で、
   **実在する 11 キーちょうど**を書く:
   `"*/10 * * * *"=600`, `"*/15 * * * *"=900`, `"*/30 * * * *"=1800`,
   `"0 * * * *"=3600`, `"15 * * * *"=3600`, `"0 2 * * *"=86400`, `"0 3 * * *"=86400`,
   `"30 3 * * *"=86400`, `"0 4 * * *"=86400`, `"30 4 * * *"=86400`, `"0 9 * * 1"=604800`。
   **`lookup()` の既定値を置かない。** 直接 index にすることで、未知の cron 式を持つ
   job を足した瞬間に Terraform が `Invalid index` で落ちる（= `max_silence` を
   手書きさせない ＝ SSoT を割らない）。
2. 導出 map:
   `cron_heartbeat = { for j in local.cron_jobs : j.name => { path = j.path, max_silence_seconds = local.cron_interval_seconds[j.schedule] <= 3600 ? local.cron_interval_seconds[j.schedule] * 2 + 900 : local.cron_interval_seconds[j.schedule] + 10800 } }`
   導出根拠をコメントに書く — interval ≤ 1h は 1 tick 丸ごとの取りこぼしを 1 回許し、
   さらに retry chain の最終試行終了 1410s（`attempt_deadline` 300s × 4 + backoff
   30/60/120s、`cloud_scheduler.tf:265-271`）を覆うため `interval×2 + 900`。
3. `monitoring.tf` の**末尾**に `google_logging_metric "cron_success"` を足す。
   filter は `cron_job_failure`（`:78-83`）と同型で最後の 1 行だけ変える
   （`httpRequest.status<300`）。`metric_kind = "DELTA"` / `value_type = "INT64"`、
   labels は `request_url` の 1 本だけ。
4. `google_monitoring_alert_policy "cron_heartbeat" { for_each = local.cron_heartbeat ... }`。
   **policy 内に条件を並べず policy 自体を `for_each` する**（quota 6）。
5. conditions は 1 本だけ:
   `condition_prometheus_query_language { query = "absent_over_time(logging_googleapis_com:user_cron_success{monitored_resource=\"cloud_run_revision\", request_url=\"${each.value.path}\"}[${each.value.max_silence_seconds}s])"; duration = "0s"; evaluation_interval = "300s" }`
   **`condition_absent` を使わない理由**（上限 23.5 時間で日次・週次を表現できない）を
   コメントに書く。
6. `alert_strategy { auto_close = "3600s" }`。documentation に意味・
   `cron_job_failure` / `cron_oidc_failure` との役割分担・診断手順を書く。
7. `slo.md` / `alerting.md` に 1 行ずつ足す。
8. `alerting.md:60-64` の課金記述を書き直す。metric を参照する policy が
   4 本 → 28 本になる。**推測の金額を書かない**（→ P8）。

**変異検査（この PR の中心）** — scratchpad に `terraform/` を丸ごとコピーし、
コピー側で 1 entry の schedule を `"*/7 * * * *"`（map に無いキー）に書き換えて
`terraform init -backend=false && terraform validate` を実行する。
`Invalid index` で落ちれば、未知 cron 式が required check で止まることが確定する。
**落ちなかった場合は validate では止まらないので、別の強制手段を設計し直すこと。**

**検証の順序に注意** — 「cron の 2xx request log が実在するか」（P6）は
**apply の前に**確かめること。0 件なら heartbeat metric が初日から沈黙する。

**見積り** 150 行 / 4 file。**前提** **P6**（P5 は不要）。B-PR1 とは同じ
`monitoring.tf` 末尾に追記するので、先にどちらかをマージして rebase する。

---

#### B-PR5 `feat(perf): script / total のバイト予算を Lighthouse assertion に持たせる`

**触るファイル**（3）
`.lighthouseci/budget.json` / `.lighthouserc.json` /
`__tests__/unit/architecture/lighthouse-ci-env.test.ts`

**手順**

1. **先に実測する**（→ P10）。`gh run download <id> -n lighthouse-report-<sha>` で
   落とし、`.lighthouseci/lhr-*.json` の `audits["resource-summary"].details.items` から
   `script` と `total` の `transferSize` を全 LHR ぶん（5 URL × 3 run = 15 本）取り出す。
2. 閾値の決め方を手順で固定する（**比率で決めない**）: URL 横断の**最大値**を
   10 KiB 単位で切り上げる。同一 URL 3 run の max−min が 10 KiB を超える URL があれば、
   その最大ばらつき幅ぶんだけ切り上げ幅を広げる。**決定に使った 15 本の実測値を
   PR 本文に全部貼る。**
3. `budget.json` の `path: "/*"` エントリに `resourceSizes` を足す（**単位 KB**）。
4. `.lighthouserc.json` の `assertions` に
   `"resource-summary:script:size": ["error", {"maxNumericValue": <bytes>}]` と
   `"resource-summary:total:size"` を足す（**単位 bytes**、budget.json の KB × 1024）。
5. **`budgetsFile` を足さない** — 既存 gate が
   `expect(lighthouserc).not.toContain("budgetsFile")` を固定しており、
   「LHCI は budgetsFile と assertions を同時に受け付けない。閾値の正本は budget.json」
   という規約を宣言している。
6. 既存 gate の突合を `resourceSizes` まで広げる（**新しい gate ファイルは作らない**）。

**「0 件 assertion でない」ことの証明** — 静的に確定させる。
`resource-summary` audit が値を出すことは LHR の実データ（P10 で取得済み）で示せる。
**閾値を 0.5 倍にした branch を dispatch する必要はない**（1 回 8 分超 + build のコストに
見合わない）。誤った audit 名（`resource-summary:script:sizes`）を書くと
`assertions.js:308` が `Invalid resource-summary assertion` で throw して job が落ちるので、
無言 pass にはならない。

**見積り** 60 行 / 3 file。**前提** B-PR3・B-PR4 のマージと **P10**。

### B.3 実装順序

`B-PR3 → B-PR4 →（同一 dispatch で実測 P10）→ B-PR1 → B-PR2 → B-PR5`

番号順（1,2,3,4,5）では出さない。B-PR1 は P に依存しないので B-PR3/4 と並行可。

---

## C. 軸1・6 — PII の宣言と消去経路

### C.0 現状（実物で確認済み・数値は再測して一致）

- 網羅検査は `__tests__/integration/domain/customers/anonymize-covers-pii.test.ts`
  （評価が挙げた `__tests__/unit/architecture/` ではなく **integration 配下**）。
  `:90-108` の `tablesStillHolding` は `information_schema` の全 BASE TABLE を走査するが、
  判定材料は **fixture が書いた TOKEN 文字列だけ**。schema からは何も導いていない。
  fixture が行を作らない表（receipts / audit_logs / terms_agreements）は構造的に不可視。
- `runDataRetentionPurge`（`src/shared/domain/data-retention/commands.ts:483-517`）が
  配線するのは 7 関数 / 6 表。receipts と audit_logs は含まれない。
- `customer-lifecycle-commands.ts:68-70` の JSDoc は
  「schema から顧客 PII を持つ列を導いて突き合わせる」と書くが**偽**。
- 実測: models 78 / String 列 487 / 規則 A 該当 50 列 / `@pii-model` 対象 15 model /
  BASE TABLE 79 / BEFORE DELETE trigger 4 表 / **DMMF に `documentation` は無い**
  （`generated/prisma/internal/class.ts` の runtimeDataModel に該当キーが存在しない）。
- 監査ログの PII sink は **9 サイト**（前段の調査は 8 サイトで、
  `registration-update-side-effects.ts` を取りこぼしていた）。

### C.1 設計の要点

`///` は Prisma の doc comment で、`schema.prisma` をテキストで parse する
（**DMMF からは読めない**ことを実測で確認済み）。

宣言は 2 層:

- **model 層** `/// @pii-model <mode>` — `holds`（データ主体の PII 列を持つ） /
  `none:<理由>`（顧客を id で参照するだけ）。対象 15 model。
- **列層** `/// @pii <strategy>` — `erase-on-anonymize` / `keep:<理由>`。合計 50 列。

**規則 B（列名規約からの推定）は採らない。** `Location.email` /
`SettingsOrganization.phoneNumber` のような事業者データを PII と誤認するため。
model 層の宣言がその誤認を構造的に防ぐ。

### C.2 PR

#### C-PR1 `feat(gate): PII を持つ列とモデルを schema.prisma に宣言させる`

**触るファイル**（5）
`prisma/schema.prisma` / `__tests__/support/pii-manifest.ts`（新規） /
`__tests__/unit/architecture/pii-columns-are-declared.test.ts`（新規） /
`__tests__/fixtures/pii-manifest-violations.prisma`（新規） /
`__tests__/fixtures/pii-manifest-clean.prisma`（新規）

**手順**

1. `model X {` の直前に `/// @pii-model <mode>` を 1 行置く。既に `///` ブロックが
   ある model はそのブロックの**最終行**に足す（間に空行を挟むと帰属が切れる）。
   `holds` = Customer / Reservation / EventRegistration / Inquiry / InquiryReply /
   InquiryAttachment / PendingCustomerEmailChange / PendingCustomerMerge /
   User / Session / Receipt / SpaceReview / TermsAgreement / AuditLog ほか。
2. 列宣言の直前行に `/// @pii <strategy>`。`erase-on-anonymize` は 39 列
   （Customer 14 / Reservation 6 / …）、`keep:` は 11 列。
3. `keep:` の理由文（そのまま書く）:
   - `Receipt.recipientName` → `keep:適格請求書の記載事項。消費税法の保管義務が redaction に優先する`
     （**条番号と起算点は P12 で確定してから書く。§2.4 参照**）
   - `Receipt.subject` → `keep:取引内容の記載欄。定型文言で個人データを含まない`
   - `SpaceReview.title` / `comment` → `keep:レビューはスペースについての情報。退会で低評価を消せる経路を作らない。著者表示は anonymizedAt を見て匿名へ切り替わる`
   - `SpaceReview.replyBody` → `keep:運営側の公開返信。顧客の個人データではない`
   - `TermsAgreement.guestEmail` / `ipAddress` / `userAgent` → `keep:同意の証跡は append-only`
4. `__tests__/support/pii-manifest.ts` に `readPiiManifest()` を置く。
   `schema.prisma` をテキストで parse し、`{ models: [...], columns: [{ model, table, field, column, strategy }] }` を返す。
   doc 行の判定は `/^\s*\/\/\/(.*)$/u`。
5. gate 本体 `pii-columns-are-declared.test.ts`:
   - 規則 A: `@pii-model holds` の model の String 列は、すべて `/// @pii` を持つ
   - 規則 C: `strategy` は `erase-on-anonymize` か `keep:<1 文字以上>` のいずれか
   - 走査下限: `expect(manifest.models.length).toBeGreaterThan(60)`（実測 78）、
     `expect(stringColumns).toBeGreaterThan(400)`（実測 487）、
     `expect(manifest.columns.length).toBeGreaterThan(40)`（実測 50）
6. fixture 対は**別ファイル**（`__tests__/fixtures/*.prisma`）に置く。
   `__tests__/**/*.ts` に合成 schema 文字列を埋め込むと
   `tests-no-explicit-any.test.ts` や `date-format-not-mocked.test.ts` の
   走査に巻き込まれる可能性があるため。

**変異検査の弱点（対処）** — 「doc 行判定を `///` → `//` に変異させる」は
**落ちない**（素の `//` も doc バッファに積むだけで、規則 C が見るのは `@pii` で
始まる行の strategy 部分）。判別できる変異は次のいずれかにすること:

- `@pii-model holds` を 1 model から外す → 規則 A の対象が減り、
  走査下限 `columns.length > 40` が落ちる
- `keep:` の理由を空にする → 規則 C が落ちる

**壊れないことを確認済み** — `string-column-declarations.test.ts:55` が
`line.replace(/\/\/.*$/u, "")` で行内の `//` 以降を落とすため、`/// @pii` 行は
空行として無視される。`jsonb-column-shapes.test.ts` / `prisma-declaration-hygiene.test.ts` も
`///` の追加とは無関係。

**見積り** 330 行 / 5 file。**前提** なし（`keep:` の理由文だけ P12 待ち）。

---

#### C-PR2 `feat(gate): 匿名化の網羅検査を fixture ではなく manifest で駆動する`

**触るファイル**（2）
`__tests__/integration/domain/customers/anonymize-covers-pii.test.ts` /
`src/shared/domain/customers/customer-lifecycle-commands.ts`

**手順**

1. `readPiiManifest()` を import し、`ERASE_TABLES` = strategy が
   `erase-on-anonymize` の列の**表**の集合（実測 10 表: customers, event_registrations,
   inquiries, inquiry_attachments, inquiry_replies, pending_customer_email_changes,
   pending_customer_merges, reservations, sessions, users）、`KEEP_TABLES` = 4 表を導く。
2. append-only（= afterAll で消せない = fixture を作れない）表を **DB から導出**する。
   **allowlist にしない。**
   ```sql
   SELECT c.relname::text AS table_name
   FROM pg_trigger t
   JOIN pg_class c ON c.oid = t.tgrelid
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND NOT t.tgisinternal
     AND (t.tgtype & 2) <> 0 AND (t.tgtype & 8) <> 0
   GROUP BY c.relname
   ```
   （tgtype のビット: BEFORE=2 / DELETE=8。実 test-db で 4 表を返すことを確認済み）
3. beforeAll の fixture に User / Session / InquiryReply / InquiryAttachment の
   4 種を追加する。`Customer.userId` は `@unique` なので User を作ってから紐付ける。
4. KEEP 側の fixture に Receipt を足す。CHECK は 5 本
   （`receipts_money_non_negative` / `tax_within_amount` / `tax_rate_range` /
   `target_exclusive` / `issuer_snapshot_object`、`prisma/baseline/invariants.sql`）。
5. afterAll の削除順序: inquiryAttachment → inquiryReply → inquiry → receipt →
   spaceReview → reservation → session → user → space → location → customer。
6. 「匿名化の前」を **manifest 駆動の完全一致**にする:
   `expect(await tablesStillHolding(TOKEN)).toEqual(ERASE_TABLES);`
   → **manifest に載っているのに fixture が行を作らない表があれば必ず落ちる**
   （分母の穴が可視化される）。
7. 「匿名化の後」から `filter((table) => table !== "terms_agreements")` を**削除**し、
   `toEqual([])` にする。
8. 「fixture を作れない表がどれか」を DB からの導出で固定する 1 本を足す:
   `expect(KEEP_TABLES.filter(t => appendOnly.has(t))).toEqual(["audit_logs", "terms_agreements"])`。
9. 走査の自己検査: `expect(scannedTableCount).toBeGreaterThan(60)`（実測 79）。
   **現状この gate には走査規模の下限が 1 本も無い。**
10. 冒頭 JSDoc を書き直す（分母が schema の `/// @pii` になったこと、
    append-only 2 表の除外が**リストではなく pg_trigger からの導出**であること、
    audit_logs の PII は C-PR4 の型で止めること、残る限界）。
11. `customer-lifecycle-commands.ts:68-70` の偽 JSDoc を 3 層構造の説明に書き直す。

**変異検査（判別できる形に直したもの）**

- ✅ `eventRegistration.updateMany` の data から `phone: null` を消す →
  匿名化後の `toEqual([])` が `["event_registrations"]` で落ちる
- ❌ 「`Session.ipAddress` の宣言を消す → sessions が抜ける」は**成立しない**
  （`ERASE_TABLES` は列ではなく**表**の集合で、Session には `userAgent` も宣言がある）。
  判別するには **Session の宣言を全列外す**こと。
- ❌ 「append-only 導出 SQL の `(t.tgtype & 8) <> 0` を落とす」は実 DB で**判別できない**
  （落としても同じ 4 表が返る）。判別できる変異は `(t.tgtype & 2)` 側を落とすこと。

**見積り** 220 行 / 2 file。**前提** C-PR1。実 test-db（5433）。

---

#### C-PR3 `fix(privacy): 監査ログの payload に顧客 PII の値を渡すのをやめる`

**PR を 2 本に割る**（実測 9 サイト。1 本だと 10〜11 file / 330 行で目安を割る）。

**C-PR3a（管理画面経路）** — `customer.ts` / `event-registration.ts` / `receipts/issue.ts`
**C-PR3b（公開・side-effects 経路）** — `mypage/profile.ts` /
`registration-update-side-effects.ts` / `registration-customer-update-commands.ts`

**共通の手順**

1. `src/shared/domain/customers/audit-diff.ts` を新設
   （`import "server-only"` は付けない — unit テストから直接叩けるようにする）。
   `export function changedFieldNames<T extends Record<string, unknown>>(previous: T, next: Partial<T>): string[]`
   1 本だけ。実装は `Object.keys(next).filter(k => next[k] !== previous[k]).sort()`。
   **値は返さない** — 返した瞬間にこの PR の意味が消える。
2. 各 sink で PII の**値**を落とし、`changedFields` / `providedFields` /
   `queryLength` などの**メタ情報**に置き換える。
   - `customer.ts:92-107`（createCustomer） → `providedFields`
   - `customer.ts:177-193`（updateCustomer） → `oldValue` を**行ごと削除**し `changedFields`
   - `customer.ts:331-338`（updateCustomerNotes） →
     `{ changedFields: ["notes"], hadPreviousNotes, notesLength }`
   - **`customer.ts:714`（searchCustomersAction）** → `metadata: { queryLength, resultCount }`。
     `query` は管理者が打つ顧客検索文字列で、**氏名・メール・電話が素で入る最大の sink**
   - `event-registration.ts:276-284` / `mypage/profile.ts:126-134` → 同型
   - `receipts/issue.ts:51-70` → `recipientName` の 1 行を削除
     （受領者は `resourceId` と `serialNo` から receipts 行を引けるので情報量は落ちない）
3. **`isSensitiveAuditKey` / `redactSensitiveAuditJson` は 1 文字も触らない。**
   ここにキーを足すと `notes` / `title` を持つ**全 resource の監査証跡が壊れる**。
4. 既存テストを更新する（**files に必ず含める**）:
   `__tests__/unit/actions/customer-audit-diff.test.ts`（`:293-297` / `:411` / `:442-443`）/
   `__tests__/integration/actions/public/mypage-profile-audit.test.ts`（`:292-308`）/
   `__tests__/unit/actions/event-registration-audit.test.ts`。
   `toEqual` で**キー名の集合**を固定し、
   `expect(JSON.stringify(call.newValue)).not.toContain("山田")` を 1 本足す。

**変異検査の弱点（対処）** — 「`.sort()` を外すとキー順が不定になる」は**誤り**
（`Object.keys` の順は挿入順で決まる）。判別できる変異は
「`changedFieldNames` が値も返すようにする」→ `not.toContain("山田")` が落ちる、にすること。

**`metadata.ipAddress` を改名しない。**
`src/shared/domain/audit-log/queries.ts:127-135` / `:170` / `:208-211` が
`path: ["ipAddress"], string_contains` の JSON filter を前提にしており、
改名すると**構文的に通ったまま何にもマッチしない**（型エラーにもならない）。

**見積り** 3a 180 行 / 5 file、3b 150 行 / 5 file。**前提** なし（C-PR1/2 と並行可）。

---

#### C-PR4 `fix(privacy): 監査 payload の型で顧客 PII のキーを禁止する`

**触るファイル**（4）
`src/shared/lib/privacy/pii-audit-keys.ts`（新規） /
`src/shared/domain/audit-log/commands.ts` /
`src/app/(admin)/admin/(dashboard)/_shared/lib/audit.ts` /
`__tests__/unit/domain/audit-log/audit-payload-pii-ban.test.ts`（新規）

**手順**

1. `pii-audit-keys.ts` を新設。**import を 1 本も持たせない**。export は 3 つ:
   `PII_AUDIT_KEYS`（`as const`）/ `PiiAuditKey` /
   `AuditJsonPayload = Record<string, unknown> & Partial<Record<PiiAuditKey, never>>`。
2. `PII_AUDIT_KEYS` の中身（実測 26 語）: lastName, firstName, lastNameKana,
   firstNameKana, companyName, email, emailCanonical, newEmail, newEmailCanonical,
   guestEmail, guestLastName, guestFirstName, guestCompanyName, guestPhone, phone,
   phoneNumber, postalCode, prefecture, city, streetAddress, building, recipientName,
   filename, notes, note, query。
   **入れないもの**と理由を JSDoc に列挙する — `name`（15 model が持つ。
   Space / Location など事業者データが大半）、`title`、`ipAddress`（管理画面の
   監査ログ検索が使う）。
3. JSDoc に「これは schema からの導出物ではない」と明記し、導出できない理由
   （`///` は DMMF に載らないので TS の union を build 時に作れない）を書く。
   **manifest との完全一致 gate は作らない。**
4. `commands.ts:30-38` の `CreateAuditLogRecordInput` の
   `oldValue?: unknown` → `oldValue?: AuditJsonPayload | typeof Prisma.JsonNull`。
   `newValue` / `metadata` も同型。`Prisma.JsonNull` を union に残すのは
   `:97` と `:137` の sentinel 分岐を生かすため。
5. `audit.ts:42-50` の `AuditLogInput` の `object` 型 3 つと `:127-143` の
   `logUserAction` も同型にする。ここを直さないと `createAuditLog`（`:89`）が抜け道になる。
   **`emitBulkAuditRecords` の `BulkAuditRecord.oldValue?: object` も同時に直す**
   （検証で「`object` は `AuditJsonPayload` に代入不能で type-check が落ちる」と判明）。
6. 型 gate は repo の作法に合わせる（`__tests__/unit/admin/resource-scope-api-shape.test.ts:41-45` が見本）。
   `type Assignable<A, B> = [A] extends [B] ? true : false;` をタプルで包んで分配を止める。
   `@ts-expect-error` は使わない。
7. **落ちてはいけない形**（`= true`）: `{ changedFields: string[]; customerType: string }` /
   `{ queryLength: number; resultCount: number }` / `{ ipAddress: string; userAgent: string }` /
   `Record<string, unknown>`。
   **落ちるべき形**（`= false`）: `{ lastName: string }` / `{ query: string }` /
   `{ recipientName: string }`。
8. runtime の健全性検査 2 本: `expect(PII_AUDIT_KEYS.length).toBeGreaterThan(20)`（実測 26）と
   **片側健全性** — `PII_AUDIT_KEYS` の各要素のうち schema の field 名でもあるものについて、
   その綴りを持つ model が**すべて** `@pii-model` であること。
   **逆方向は assert しない**（`name` / `title` / `ipAddress` は意図的に入れない）。
   **注意**: 前段の設計のままだと**変異なしで 8 キー落ちる**。
   `filename` / `note` / `query` など schema に無い綴りを除外してから比較すること。
9. 冒頭 JSDoc に粗さを書く — ネストした値は型で止まらない、`as` を経由すると通る、
   schema 由来でない別名キー（`targetEmail`）は止まらない、この型は
   「監査 payload に載せる値」だけを見ている。

**見積り** 180 行 / 4 file。**前提** C-PR3a・C-PR3b の**両方**と C-PR1。
逆順にはできない（先に型を締めると `tsc:app` が 6 ファイルで落ちる）。

### C.3 実装順序

2 系統。`C-PR1 → C-PR2` と `C-PR3a → C-PR3b`。両系統がそろってから `C-PR4`。

### C.4 追加の前提（P12）

| #   | 何を確かめるか                                                                                          | どこで                                                                                                    | ブロックするもの                                                    |
| --- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| P12 | 適格請求書の保存義務の**条番号と起算点**                                                                | e-Gov の消費税法施行令。リポジトリ内に「消費税法 57条の4 で 7 年」という記述が 2 箇所あるが一次資料未確認 | C-PR1 の `Receipt.recipientName` の `keep:` 理由文                  |
| P13 | `TermsAgreement.guestEmail / ipAddress / userAgent` の法的保存期間                                      | 製品判断                                                                                                  | 同上の `keep:` 理由文。決まらなければ「append-only だから」で止まる |
| P14 | `Customer.emailDeliveryReason`（VarChar(500)、Resend の bounce reason）に実メールアドレスが原文で入るか | 本番 or ステージングの実データ                                                                            | 入るなら `erase-on-anonymize` に足す列が 1 本増える                 |

---

## D. 軸9 — a11y の分母と PR 実行

### D.0 現状（実物で確認済み）

- `/`（`urls.home`）の axe は nightly の実ログで `-`（skipped）と記録され、
  public surface step の `--list` では 0 件。**掛け算で 1 度も実行されない。**
- 公開 `page.tsx` は 56 本、axe が触るのは 21 本。
- required check に axe を持つ spec は **1 本も無い**。Lighthouse a11y も
  `ci.yml:784-787` で schedule / dispatch 限定。
- `e2e/helpers/admin-axe.ts:24` の `[class*="fc-" i]`（FullCalendar）は
  **依存が 2026-04-09 に消えたあと 4 か月空振り**。
  `e2e/helpers/public-axe.ts:32` の `[class*="google-maps" i]` も同様の疑い。
- **同一 job で `playwright test` を 2 回叩くため、html reporter が
  後の step で前の step のレポートを消している**（実測: run 32815852317 の
  smoke artifact は public 26 test を失い admin 2 test だけだった）。

### D.1 PR

| #     | タイトル                                                                       | 行 / file | 前提  |
| ----- | ------------------------------------------------------------------------------ | --------- | ----- |
| D-PR1 | `ci(e2e): 同一 job 内の Playwright レポートを step ごとの出力先に分ける`       | 15 / 1    | なし  |
| D-PR2 | `fix(e2e): 公開面 axe を public surface で必ず走らせ、required check に載せる` | 60 / 3    | D-PR1 |
| D-PR3 | `test(a11y): タグアーカイブを公開面 axe の走査対象に足す`                      | 12 / 2    | D-PR2 |
| D-PR4 | `refactor(e2e): 対象が存在しない axe の exclude を落とす`                      | 8 / 2     | D-PR2 |
| D-PR5 | `fix(gate): surface skip の runner 検査を file スコープ限定から外す`           | 45 / 1    | D-PR2 |
| D-PR6 | `fix(e2e): / の reflow 検証を実際に走らせる`                                   | 25 / 2    | D-PR5 |

#### D-PR1 手順

1. `ci.yml:351-357`（public smoke）の `env:` に
   `PLAYWRIGHT_HTML_OUTPUT_DIR: playwright-report/public`。
2. `:374-383`（admin smoke）に `playwright-report/admin`。
3. `:508-515`（広域 admin）に `playwright-report/admin`。
4. `:548-554`（広域 public）に `playwright-report/public`。
5. upload step は変えない（`:404-410` / `:574-577` の `path: playwright-report/` が
   サブディレクトリごと拾う）。
6. `:404` の直前に 3 行コメント（実測の run 番号と、
   `PLAYWRIGHT_HTML_OUTPUT_DIR` が `playwright.config.ts:130` の
   `outputFolder` より優先される根拠 —
   `node_modules/playwright/lib/runner/index.js:3406` の
   `reportFolderFromEnv() ?? resolveReporterOutputPath(...)`）を書く。
7. visual-regression job（`:937-943`）は `playwright test` が 1 回なので触らない。

**変異検査** — 4 step すべて同じ `playwright-report` にすると、
merge 後の smoke artifact が再び 2 test だけになる（PR 本文に再現手順を書く）。

#### D-PR2 手順

1. `e2e/a11y/axe-public-pages.spec.ts:83-88` の route 単位 skip を**削除**し、
   `:74` の `const appSurface = ...` の直後に **file スコープ skip** を置く:
   `test.skip(appSurface !== "public", "...")`。書式は `e2e/public/homepage.spec.ts:7-10` を写す。
2. docstring に「なぜ public surface 専用か」を 4 行足す
   （`/` は `src/proxy.ts:494-495` により admin surface で `/admin` へ redirect される）。
3. `playwright.config.ts:250-253` の `chromium` の `testIgnore` に
   `/e2e\/a11y\/axe-.*\.spec\.ts/,` を足す（`testMatch` の catch-all は残す）。
4. `:269-273` の直後に project を足す:
   `{ name: "chromium-a11y-public", use: { ...devices["Desktop Chrome"] }, testMatch: /e2e\/a11y\/axe-.*\.spec\.ts/ }`。
   **`dependencies` を付けない**（public surface では `/admin/*` が 404 で
   `setup-admin` が満たせない）。
   **`axe-reservation-wizard.spec.ts` の扱いを明示すること** — この spec には
   surface skip が無いので、新 project に入ると admin surface でも走る。
   file スコープ skip を足すか、`testMatch` から外すかを決めてから実装する。
5. `ci.yml:352` を
   `run: bunx playwright test --project=chromium-smoke --project=chromium-a11y-public` に変える。
6. `:296-299` の smoke-e2e job コメントを直す（現状「`chromium-smoke` project のみ実行」が偽になる）。
   実測の増分（+約 30 秒）を併記する。
7. **`.github/branch-protection.json` は変更しない**（既存 required job
   "Smoke E2E (critical path)" の中で走る）。

**検証** — `APP_SURFACE=public bunx playwright test --project=chromium-a11y-public` → 18 passed。
**`/` に違反が出たら製品コードを直す。skip も exclude も足さない。**

#### D-PR3 手順

1. `e2e/fixtures/test-data.ts:80-84` の `publicDetailFixtures` に
   `postTagSlug: "business"` を足す（根拠: `prisma/seed.ts:1618` と投稿 2 本）。
2. `PUBLIC_AXE_ROUTES` に `{ path: \`/tag/${publicDetailFixtures.postTagSlug}\`, label: "タグアーカイブページ" }` を足す。
**`urls` に key を足さないこと**（`e2e-public-url-fixtures.test.ts:28-30` が
   非 admin key の完全一致を要求する）。
3. docstring に「`tag/[slug]` は `TaxonomyArchiveView` を通る唯一の到達可能ルートで、
   `/blog` とはコンポーネント木が違う。`category/[slug]` は同じ木なので足さない（1 木 1 代表）」。

**変異検査の弱点（対処）** — 「seed に無い tag にすると `notFound()` で
`page.getByRole("main")` が出ず赤になる」は**赤にならない**
（`src/app/(public)/not-found.tsx` は自前の `<main>` を持たないが、
レイアウト側の `<main>` が残る）。判別できる変異は
「`PUBLIC_AXE_ROUTES` からこの route を外すと test 件数が 19 → 18 に減る」を
`--list` の件数で見ること。

#### D-PR4 手順

1. `admin-axe.ts:23-24` の 2 行を 1 行にまとめ、`[class*="fc-" i]` を削除。
2. docstring から FullCalendar への言及を外し、
   「exclude は**現に描画される対象がある**ものだけ置く。FullCalendar の除外は
   依存が 2026-04-09 に消えたあと 4 か月空振りしていた」を足す。
3. `public-axe.ts:32` の `[class*="google-maps" i]` を削除。
4. docstring に「地図は iframe の `src` で除外する」を足す。

**検証の弱点（対処）** — 「変更前後で violations の件数と内容が一致すること」は
**観測できない**（spec が assert するのは `blocking` が空であることだけ）。
判別できる形は、`buildAdminAxeScanner` の**呼び出し側 4 spec すべて**
（`axe-admin-pages` / `axe-admin-feature-disabled` / `lexical-toolbar-roving-tabindex` /
`admin-viewer/axe-admin-viewer-pages`）を変更前後で回して**すべて緑のまま**であることを見る。
差が出たら**削除をやめて根拠をコメントに書く**。

#### D-PR5 手順

1. `requiredSurface()`（`:91-97`）を `requiredSurfaces()` に改名し、`exec` を `matchAll` に、
   正規表現から `^` と `m` フラグを外す。戻り値を `Set<string>` にする。
   複数形にするのは `e2e/public/admin-auth-flow.spec.ts:15,42` のように
   1 ファイルに 2 箇所ある形で先頭だけ見て打ち切らないため。
2. `:234-251` の test 本体を、各 surface について
   `runnableSurfaces(...).has(surface)` を確かめるループに変える。
   空振り検査 `expect(guarded).toBeGreaterThan(0)` を残す。
3. docstring の「限界」に 2 項目足す。
   **実測は 9 箇所 / 7 ファイル**（前段の「8 ファイル」は誤り）。

#### D-PR6 手順

`/` の reflow 検証（3 viewport）が route 単位で飛ばされている件を、
D-PR5 で導入した file スコープ skip の形に置き換える。

### D.2 実装順序

`D-PR1 → D-PR2 → D-PR3 → D-PR4 → D-PR5 → D-PR6`（直列）。

### D.3 意図的に作らないもの

**56 key の手書きルートテーブル + `skip: "理由"` の ratchet は作らない。**
理由: (a) 未カバー 35 本から生じた実害が 1 件も示されていない
（今回見つかった唯一の実欠陥 `LocationListSection` の `text-accent/70` は
**カバー済みの `/access` 上**にあった）、
(b) `skip: "理由"` は**免除の入口そのもの**、
(c) CLAUDE.md「新しい gate は実際に起きた欠陥に対してだけ」に抵触する。

---

## E. 軸7 — 空振りしている走査型 gate

### E.0 現状（変異検査で実測）

`__tests__/unit/architecture/` の走査型 gate 109 本の**判定式の正規表現**を
never-match に潰して 1 本ずつ走らせた結果、**18 本が緑のまま**だった。

そのうち **6 本はハーネスの誤検出**（判定式でない regex を潰しただけ）:
`fire-and-forget-swallows-allsettled`（`/\s+/gu` = 出力整形の空白正規化）/
`cron-failure-severity`（`/[\\/]/u` = パス区切り split）/
`date-format-not-mocked`（判定本体は TypeScript AST。regex はコメント除去用）ほか。

**本物は 11 本。** 残り 7 本はリテラル照合 4 本（判定に効かない）と誤検出 3 本で、
「直す価値が無い」と判定して意図的に落とす。**これで 18/18 に決着が付く。**

### E.1 PR

| #     | タイトル                                                                    | 行 / file | 前提         |
| ----- | --------------------------------------------------------------------------- | --------- | ------------ |
| E-PR1 | `fix(e2e): 空振りしている axe の FullCalendar 除外を削除する`               | 5 / 1     | なし         |
| E-PR2 | `test(integration): terms_agreements の無条件除外を削除する`                | 12 / 1    | なし         |
| E-PR5 | `test(gate): admin export 上限の gate が値を写すのをやめる`                 | 35 / 1    | なし         |
| E-PR6 | `test(gate): 空の allowlist 3 つと、その staleness 検査を削除する`          | 75 / 2    | なし         |
| E-PR3 | `test(gate): 判定式に届いた候補数の下限を置く（走査 gate 5 本）`            | 170 / 5   | E-PR6        |
| E-PR4 | `test(gate): 判定式に positive control / 見本を置く（走査 gate 5 本）`      | 130 / 5   | E-PR6        |
| E-PR7 | `docs(rules): 走査 gate の「判定の見本」が機械強制でないことを SSoT に書く` | 25 / 1    | E-PR3・E-PR4 |

**E-PR1 は D-PR4 と重複する。** どちらか一方で実施し、もう一方は落とすこと。
（本計画では **D-PR4 に寄せる**。`public-axe.ts` の `google-maps` も同時に扱えるため。）

#### E-PR2 手順

`anonymize-covers-pii.test.ts:364-366` の
`expect(holders.filter((table) => table !== "terms_agreements")).toEqual([])` を
`expect(holders).toEqual([])` の 1 行にする（`.filter(...)` とその直上のコメント 2 行を削除）。

**根拠** — TOKEN は uuid 由来で一意、beforeAll は TermsAgreement 行を 1 件も作らないので
`holders` に `terms_agreements` が入る経路が**構造的に無い**。
同ファイル `:39-41` の JSDoc 自身が「terms_agreements だけは fixture で作れない…
ここは宣言のまま残す」と認めている。

**注意** — `TEST_DATABASE_URL` が無い環境では `describe.skip` になる
（`:52-57`）。**緑を見ても走ったことにならない。** 走ったことの合図
（`bun test` の出力に `3 pass` 相当が出ること）を PR 本文に貼ること。

**C-PR2 と衝突する。** C-PR2 が同じ行を書き換えるので、**どちらか先にマージして
rebase** すること（C-PR2 のほうが範囲が広いので、C を進めるなら E-PR2 は不要）。

#### E-PR5 手順

1. `:86` の `toContain("export const ADMIN_EXPORT_ROW_LIMIT")` を宣言行の parse に置き換える:
   `/export const ADMIN_EXPORT_ROW_LIMIT\s*=\s*(?<value>[0-9A-Fa-fXxOoBb_]+)\s*;/u`。
2. `:88-91` の `selfDefined` を、SSoT から組んだ正規表現で判定する形に置き換える。
   **`limitLiteral.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")` は書かない** —
   捕捉クラスが `[0-9A-Fa-fXxOoBb_]+` なので metacharacter は原理的に出ず、
   到達不能な防御コードになる（しかも per-regex 変異で緑のまま残る新しい正規表現を作ってしまう）。
3. **`limits.ts` を import しない**（`:1` に `import "server-only";` があるため）。
4. `:80-81` のコメントから数値 `10_000` を落とす（散文にも SSoT を写さない）。

**変異検査の弱点（対処）** — 組み立てた `selfDefinedPattern` に **positive control が無い**
（5 本の export route すべてが旧パターンでも新パターンでも false）。
**合成見本を 1 本置く** — `= 10_000;` を含む文字列に対して新パターンが true を返すこと。

#### E-PR6 手順

1. `auth-gate-ssot.test.ts:34-38` の空 Set 宣言 2 つ（JSDoc 込み）を削除。
2. `:65-93` の `expectFrozenAllowlist` を `expectNoLegacyImports(label, actual)` にし、
   本体の先頭を `expect([...actual].sort()).toEqual([]);` 1 行にする
   （`newViolations` / `staleAllowlist` の計算を両方落とす）。
   末尾の facade 2 本の `existsSync` assert（`:80-92`）はそのまま残す。
3. 呼び出し 2 箇所を直す。
4. `conform-form-pattern.test.ts:52-59` の `CONFORM_MIGRATION_ALLOWLIST` を削除。
5. `:234-237` を `violations.push(toRepoPath(filePath));` にする。
6. `:243-267` の staleness 2 テストを削除。
7. `:228` のテスト名から `（allowlist は解消待ち）` を落とす。JSDoc も直す。

**E-PR6 を E-PR3/E-PR4 より前に出す理由** — E-PR6 が
`conform-form-pattern.test.ts:234-237` を簡素化しておけば、E-PR3 はその
簡素化済みループにカウンタを足すだけになり、**行番号の失効が構造的に消える**。

#### E-PR3 手順（判定式に届いた候補数の下限）

対象 5 本: `conform-form-pattern` / `admin-field-error-association` /
`dialog-accessible-name-contract` / `admin-clean-break-dead-code` /
`admin-permissions-clean-break`。

各ファイルで、判定式が**母集団を絞る filter として働いている**箇所にカウンタを置き、
`expect(<候補数>).toBeGreaterThan(n)` を数値リテラルで足す。

**既存の走査規模下限 assert は 1 本も消さない**
（消すと `local/gate-scan-must-not-be-silently-empty` が発火する）。

**しきい値の余裕に注意（検証で判明）**

- `admin-field-error-association` の `genericHelperCandidates > 0` は**実測 1 件**
  だけに支えられており、正当なリファクタで消えると非欠陥で赤くなる。
  **0 より大きい**ではなく、実測値そのものを注記に書いて運用すること。
- `admin-permissions-clean-break` の `importedMembers > 1` は**何も判別しない**
  （残り 2 本の regex はどちらも判定に効くため、潰せば別の assert が落ちる）。
  この 1 本は**落とす**。

#### E-PR4 手順（positive control / 見本）

対象 5 本: `auth-gate-ssot` / `e2e-client-ip-allocation` / `zod-schema-error-key` /
`admin-read-boundaries` / `admin-submit-button-pattern`。

判定式が**違反だけを掴む型**なので候補数下限を置けない。
**走査から除外された側の実在ファイル**を positive control にする
（合成見本より強く、SSoT も増えない）。

- `auth-gate-ssot`: `src/shared/lib/customer-auth/gates.ts` に対して
  `CUSTOMER_LEGACY_SESSION_IMPORT.test(...)` が true
- `e2e-client-ip-allocation`: `:105` の inline literal を `:53` の定数に寄せてから、
  実在の spec で true を返すことを見る
- `zod-schema-error-key`: `ZOD_DEPRECATED_MESSAGE_ARG` を
  **正しい側と非推奨側を 1 本で拾う形**に置き換える（`\{\s*(?<key>message|error)\s*:`、
  flags を `gu`）。実測は**マッチ 645 / ファイル 107**（走査 2327 ファイル）。
  **しきい値がマッチ単位かファイル単位かを明記すること**（前段の仕様は不定だった）
- `admin-read-boundaries`: 実ツリーに実例 0 件なので合成見本を使う
- `admin-submit-button-pattern`: 見本 4 本を置く。
  **ただし `compactForScan`（`:45-47` の `/\s+/g`）は現状 4 パターンに対して
  恒等関数**なので、見本では判別できない。この 1 本は
  「`compactForScan` を消しても緑」であることを**限界として docstring に書く**
  にとどめる（無理に見本を作らない）。

#### E-PR7 手順

`.claude/rules/architecture-gates.md` に、走査 gate の「判定の見本」が
**機械強制ではない**ことと、望ましい witness の順序を書く。

**注意** — 同じ節の直前 `:29-30` に「**測るのは走査した集合そのもの**。
schema のパース結果や定数の個数を測っても『走査が 0 件』を検出できない」がある。
並べると読者が混乱するので、**2 つが別の層の話**（走査規模 vs 判定式の到達数）
であることを明記すること。

### E.2 実装順序

`E-PR2 → E-PR5 → E-PR6 → (E-PR3 ∥ E-PR4) → E-PR7`
（E-PR1 は D-PR4 に統合。E-PR3 と E-PR4 は**ファイルが完全に交わらない**ので並行可）。

---

## F. 軸3 — `__tests__` の型契約

### F.0 現状（実測し直した数値）

- `tsconfig.test.json:9-11` が `noUncheckedIndexedAccess: false` を
  「テスト内の `arr[0].xxx` アクセスが一般的なパターンのため」として
  src の strict 設定を 1 項目だけ巻き戻している。
- 一方 `__tests__/support/definite.ts:6` の docstring は
  「`noUncheckedIndexedAccess` が有効なので `rows[0]` は `T | undefined` になり」を
  前提に helper の存在理由を説明している。**この helper は自分の前提が
  無効化された環境でだけコンパイルされている。**
- `noUncheckedIndexedAccess: true` にしたときのエラーは **155 件 / 33 file**
  （TS2532 138 / TS2345 7 / TS18048 5 / TS2322 3 / TS2769 2）。
- typed lint を `__tests__` に効かせると **5,620 件**。うち **4,794 件（85%）は
  `@types/bun` の型欠陥の写像**（`test.d.ts:50` の `mock.module` が
  `void | Promise<void>`、`:936`/`:1421` の `.rejects`/`.resolves` が void 返し、
  `:1904` の `AsymmetricMatcher = any`）。
- **MEMORY の「`__tests__` が無検査」は不正確。** `eslint .` は 3,669 file を走査し
  `__tests__` にも 137 本のルールが効いている（src は 165 本）。違反は 0 件。

### F.1 PR

#### F-PR1 `fix(tsconfig): __tests__ の noUncheckedIndexedAccess 緩和を撤廃する`

**触るファイル** `tsconfig.test.json` + `__tests__` の 33 file = **34 file**

**手順**

1. `tsconfig.test.json` の 8〜11 行目のコメント 2 行と
   `"noUncheckedIndexedAccess": false` を削除する。
   `"types": ["bun", "node"]` は残す（root と集合同一だが意図の記録。削除は別依頼）。
   **`extends` / `include` / ファイル名は変えない** —
   `architecture-boundaries.test.ts:1083` が `"tsconfig.test.json"` を
   文字列で要求し、`:1081-1082` が `--incremental` / `"false"` の**回数 2**で
   tsc プロジェクト数を固定している。
2. **R1**（113 箇所 / 15 file）`error.issues[0].X` → `error.issues[0]?.X`。
   対象: `__tests__/unit/lib/validations/{space 15, post 14, faq 12, customer 10,
page 8, news 6, stripe 5, space-category 5, media 5, event-category 4,
api-keys 2, instagram 1}.test.ts` ほか。
3. **R2**（18 箇所 / 1 file）`rate-plan-resolver.test.ts` の
   `result.segments[N].X` → `result.segments[N]?.X`。
   **根拠は「直前に `toHaveLength` がある」ではない**（8 箇所で偽）。
   正しい根拠は「18 箇所すべて `.toBe(<非 undefined>)` で、
   `expect(undefined).toBe(x)` は throw する」。
4. **R3**（3 箇所 / 3 file）`mock.calls[N][M]` → 既存 helper `nthCall`。
5. **R4**（14 箇所 / 8 file）値として消費するので optional chaining では済まないものを
   `definite(...)` で受ける。
6. **R5**（6 箇所 / 5 file）regex capture を fallback で受ける。
   src 側の既存 idiom に合わせる（`const value = (match[1] ?? "").trim();` /
   `re.exec(tag)?.[1] ?? null`）。
7. **R6**（1 箇所）`calendar-sync-retry-pool.test.ts:351` の
   `[ids[2], ids[1], ids[0]]` → `[...ids].reverse()`。
8. **`!` を使わない**（`eslint.config.mjs:280` の `no-non-null-assertion: "error"` が
   `__tests__` にも効く）。**`as` での回避もしない**（`definite.ts:20-24` が
   「戻り値を cast で作るヘルパーは呼び出し側の `!` を 1 箇所に集めただけ」と明記）。
   **`any` も書けない**（`eslint.config.mjs:632` が `no-explicit-any: error`）。
9. `docs/superpowers/plans/2026-08-15-round6-guard-effectiveness.md` の
   `noUncheckedIndexedAccess: false` 記述は**触らない**
   （`referenced-gates-exist.test.ts:44,75` が `docs/superpowers/**` を
   「日付入りの記録。当時の事実を書いたもので、指示ではない」として走査対象外にしている）。

**検証**

- `bun run type-check`（`tsc:app` と `tsc:test` の両方）
- `bun run test:all`（**R4/R5/R6 は式そのものを書き換えるので runtime も通す**）
- `bun run validate`
- 変異検査 1: `issues[0].message` に戻す → TS2532
- 変異検査 2: `tsconfig.test.json` に `noUncheckedIndexedAccess: false` を書き戻す →
  同じ変異で落ちなくなる（＝ flip が効いていることの証明）
- **R4/R5 は architecture gate を 6 本書き換える**
  （`cron-scheduler-path-sync` / `gcp-production-audit` /
  `admin-field-error-association` / `admin-page-header-actions-wrap` /
  `env-example-clean-break` / `architecture-boundaries`）。
  **各 gate について「1 行の一時改変で赤くなる」ことを確認すること**
  （`definite()` で受けた値が本当に検査に使われているかの確認）。

**PR を分割しない。** 「先に 113 箇所を機械置換する PR」と「残りを flip する PR」に
割る案は却下する — 前半 PR は型でも runtime でも観測可能な差を生まない
（`nUIA` が false のままなので `?.` は no-op）ため、**レビュアーが検証できない
中間状態**を作る。34 file は目安を超えるが 1 論理変更で分割の切り口が無い。

**見積り** 181 行 / 34 file。**前提** なし。

---

#### F-PR2 `docs(lint): __tests__ を typed lint の対象にしない判断を eslint.config.mjs に実測つきで書く`

**目的** — `eslint.config.mjs:164` と `:180` の `ignores: ["__tests__/**"]` は
**理由が config のどこにも無い**。理由は `git show 2c6e05360`（#2041）の
commit message にしか存在せず、そこも当時の 1 文（4GB で FATAL ERROR）だけ。
結果としてこの除外は**見落としと区別できず**、MEMORY と本監査の軸3 の両方で
「無検査の穴」として再発見されている。

**手順**

1. `eslint.config.mjs` の P0/P1 見出しコメントから
   「残り（no-unsafe-* / no-misused-promises / …）は P2〜P4 で個別に段階導入する。」の
   2 行を削除する。**行番号は `:170-175` ではなく `:173-177`**（削除対象 2 行は `:176-177`）。
   検証で 3〜6 行のずれが判明したので、**着手時に必ず開き直すこと**。
2. あわせて `:151-157` の「Phase D 計画:」を過去形にする（Phase D は #1662 P4 まで完了済み）。
3. `ignores: ["__tests__/**"]` の直前（`:163` と `:179`）に、除外が**判断**であることと
   再測手順を書く。書く内容は次の実測値だけ
   （HEAD `b7a6a5914` / eslint 10.9.0 / @typescript-eslint 8.67.0 / typescript 6.0.3 / @types/bun 1.4.0）:
   - (a) 有効化すると `eslint . --concurrency 2` は `ci.yml:70` の 4096MB で
     `ERR_WORKER_OUT_OF_MEMORY`（3m07s）。**17 ルールに削っても同じ**
   - (b) 違反 5,620 件のうち 4,794 件（85%）は `@types/bun` の 3 つの型欠陥の写像で、
     repo 側の欠陥ではない
   - (c) 残り 826 件のうち、行単位で見て**製品の正しさに効く指摘は 0 件**
   - (d) 再測手順（一時 config で `project: ["./tsconfig.test.json"]` を渡す。
     **新しい tsconfig は要らない**ことを実測で確認済み）
4. **新しい test file を作らない / 散文で `__tests__/…/*.test.ts` を名指ししない**
   （`eslint.config.mjs` は `referenced-gates-exist.test.ts` の走査対象）。
5. **gate は足さない。** typed lint を誤って `__tests__` に広げて壊れた事故は
   起きていない（起きたら CI が 4096MB で OOM して**即座に赤くなる** = 既に自己検知する）。

**検証の弱点（対処）** — コメントに書く実測値のうち、いちばん重い主張（(a)）を
**PR 時点で再取得する手順**を verification に含めること。値の SSoT が
過去セッションの記憶になってはならない。

**見積り** 38 行 / 1 file。**前提** なし（F-PR1 と並行可）。

### F.2 実装順序

`F-PR1 → F-PR2`（技術的な依存は無いが、この順で読むと
「tsc 契約は src と揃った / typed lint は意図的に揃えない」という 1 本の筋になる）。

---

## 4. 意図的に採らなかった案

| 案                                                                | 落とす理由                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| migration に `-- rollback:` ヘッダを後付けし gate で強制          | `scripts/check-protected-files.sh:23/45/51` が既適用 migration の M を deny して**commit できない**。仮に commit できても `scripts/migration-preconditions.ts:461-482` の checksum 照合が**次の本番デプロイを確実に落とす**。さらに `deploy-production.yml:432-434` が同じ情報を既にログへ出しており、ヘッダは計算結果の手写しでしかない |
| post-deploy-smoke に sitemap の `<loc>` 件数下限                  | `src/app/sitemap.ts` が fail-soft で、DB 全断でも 200 かつ `<loc>` 非ゼロ。**原理的に検出できない**。代わりに `<lastmod>` の件数で fallback を判別する（実測: fallback = lastmod 0、healthy = lastmod 8）                                                                                                                                |
| post-deploy-smoke に `/spaces` のリンク件数下限                   | **本番で今日 0 件**。入れると毎デプロイが赤になり、canary 化後は promote に到達せずデプロイ不能になる                                                                                                                                                                                                                                    |
| post-deploy-smoke に `/feed.xml` の 200                           | `isFeatureEnabled("posts")` false で 404。運用判断で赤くなる                                                                                                                                                                                                                                                                             |
| post-deploy-smoke に `<title>` 非空                               | error boundary でも `<title>` は入るので何も証明しない                                                                                                                                                                                                                                                                                   |
| `terraform-apply` を main merge で自動実行                        | 本計画の範囲外。別テーマとして起票する                                                                                                                                                                                                                                                                                                   |
| 1 つの alert policy に cron 24 job の condition を並べる          | Cloud Monitoring の **Conditions per metric-based alerting policy = 6**。apply で必ず失敗する                                                                                                                                                                                                                                            |
| `condition_absent` で heartbeat を作る                            | trigger absence time の上限が 23.5 時間で、日次（24h 周期）・週次を**表現できない**                                                                                                                                                                                                                                                      |
| `max_silence` を job ごとに手書きさせる gate                      | cron 式から一意に導ける派生値。手書きさせると SSoT が割れる。`lookup()` の既定値を置かず直接 index にすることで、未知の cron 式を Terraform 側で落とす                                                                                                                                                                                   |
| Lighthouse に mobile preset を足す                                | 「誰も止まらない赤い job を 1 つ増やす」= このテーマ自身の病理の再生産。閾値も未確定。**別テーマ**                                                                                                                                                                                                                                       |
| Lighthouse を PR の required check にする                         | 前提（TBT の実削減）が未見積り。**別テーマ**                                                                                                                                                                                                                                                                                             |
| `Receipt.recipientName` に保持期限設定を足す                      | 消令 70 の 13① は**保存義務**であって消去義務ではない。「120 か月で宛名を消す」は法令から導かれない製品判断で、依頼されていない設定項目・migration・管理 UI・cron 配線を伴う。**`/// @pii keep:<理由>` で「残すと決めた」に変えるのが正しい**                                                                                            |
| `isSensitiveAuditKey` に `notes` / `title` 等を足す               | `redactSensitiveAuditJson` が**全 audit log** の oldValue/newValue/metadata を再帰的に通すので、顧客と無関係な監査証跡が壊れる。既存テスト 2 本も落ちる                                                                                                                                                                                  |
| `metadata.ipAddress` → `ipHash` に改名                            | `audit-log/queries.ts:170,208-211` の `path: ["ipAddress"], string_contains` が**構文的に通ったまま何にもマッチしなくなる**（型エラーにもならない）                                                                                                                                                                                      |
| `pii-field-names.ts` を手書きして manifest との一致を gate で強制 | SSoT を写した状態を自分で作ってから見張る形。「SSoT を写さない」「新しい gate は実際に起きた欠陥に対してだけ」の両方に反する                                                                                                                                                                                                             |
| 列名規約から PII を推定する規則 B                                 | `Location.email` / `SettingsOrganization.phoneNumber` のような**事業者データを PII と誤認**する。model 層の宣言で置き換える                                                                                                                                                                                                              |
| 公開 56 ルートの手書きテーブル + `skip: "理由"` ratchet           | 未カバー 35 本から生じた実害が 1 件も無い。`skip: "理由"` は免除の入口そのもの                                                                                                                                                                                                                                                           |
| contrast gate の large text 閾値を 3.0 に緩める                   | **緩和**。しかも検出力が 2 つの変更の組み合わせに乗り、片方を戻すと静かに素通りする                                                                                                                                                                                                                                                      |
| 走査 gate に witness を要求する新 ESLint rule                     | 判定が「同一ファイル内で宣言した関数を同一ファイル内のリテラルで呼び、非空 matcher で assert している式が 1 つ以上あるか」というファイル単位の存在チェックなので、**無関係なダミー関数 1 本で満たせる**。既存 rule の JSDoc が初版で同じ失敗を記録している。しかも rule の rename は 17 ファイルに波及する                               |
| `__tests__` に typed lint を全面適用                              | 5,620 件のうち **85% が `@types/bun` の型欠陥の写像**。~900 file / ~5,600 行の書き換えと新しい抽象化層 2 つを、**上流バグの迂回のために**作ることになる                                                                                                                                                                                  |
| `await expect(...)` から await を外す（819 箇所）                 | bun の未文書な実装挙動に依存し、**検知不能な形で 819 本の assertion が死ぬ経路**を自分で作る                                                                                                                                                                                                                                             |
| 実欠陥のある 7 ルール（59 件）だけ有効化                          | 59 件のうち 17 件が「満たすと検証対象が消える」形（意図的な非 Error throw の再現など）                                                                                                                                                                                                                                                   |
| `__tests__/tsconfig.json` を新設して `tsconfig.test.json` を廃止  | 前提が誤り。typed lint を効かせるのに新しい tsconfig は要らない（`project: ["./tsconfig.test.json"]` で 1,169 file が parse error 無しで解決することを実測）。しかも `architecture-boundaries.test.ts:1083` が落ちる                                                                                                                     |
| `ci.yml:70` の heap を job-level で引き上げ                       | typed lint を入れないので不要                                                                                                                                                                                                                                                                                                            |

---

## 5. 全体の実装順序

```
F-PR1 ─ F-PR2                                    （軸3、独立）

E-PR2 ─ E-PR5 ─ E-PR6 ─┬─ E-PR3 ─┐
                        └─ E-PR4 ─┴─ E-PR7      （軸7）

D-PR1 ─ D-PR2 ─ D-PR3 ─ D-PR4 ─ D-PR5 ─ D-PR6   （軸9。D-PR4 が E-PR1 を兼ねる）

C-PR1 ─ C-PR2 ─┐
C-PR3a ─ C-PR3b ┴─ C-PR4                         （軸1・6）

B-PR3 ─ B-PR4 ─[P10 実測]─ B-PR5
B-PR1 ─ B-PR2                                    （軸12・11）

A-PR1 ─ A-PR2 ─ A-PR3 ─ A-PR4 ─ A-PR5            （軸4）
```

**衝突に注意する組**

- `E-PR2` と `C-PR2` は同じ行を書き換える → C を進めるなら E-PR2 は不要
- `E-PR1` と `D-PR4` は同じ行を削除する → D-PR4 に寄せる
- `B-PR1` と `B-PR2` は同じ `monitoring.tf` 末尾に追記する → 先にどちらかをマージして rebase
- `E-PR3` と `E-PR4` はファイルが**完全に交わらない** → 並行可

---

## 6. 10 点に届かない残余

この計画を全部やっても、次の 6 つが残る。**楽観的に書かない。**

### 6.1 軸4（→ 9）

1. **deploy が手動 `workflow_dispatch` のまま。** `inputs` が 0 件で、
   全 job が `github.ref == 'refs/heads/main'` を要求するため、
   **過去 commit を指定して再デプロイする経路が構造的に存在しない**。
   ケース A の rollback は traffic の pin でしか実現できない。
2. **admin 面の論理回帰は検出できない。** `ingress=INTERNAL_LOAD_BALANCER` +
   `default_uri_disabled` のため外から中身を検証できず、canary もできない。
3. **`terraform-drift.yml` が traffic の pin を拾わなくなる**（A-PR2 の対価）。
   埋め合わせは deploy 時の serving 検証と手動監査だけで、**常時監視は無い**。
4. **migration を含むデプロイの rollback は依然として「DB を戻す」しかない。**
   expand-contract を強制する機構は作らない（corpus 0 件の投機になるため）。

### 6.2 軸12（→ 9）/ 軸11（→ 8）

1. **性能予算は「PR をブロックする予算」にならない。** B-PR5 の
   `resource-summary` 予算は nightly / dispatch でしか走らない。
   PR で落ちる予算にするには TBT の実削減が先で、その規模は未見積り。
2. **モバイル性能は一度も測っていない**（意図的に落とした。§4）。
3. **web_vitals の alert は張らない。** P7 でサンプルの実在を確かめるまで、
   張っても永久に沈黙する policy が 1 本増えるだけ。
4. **`cron_job_failure` の filter が機能しているかは P5 待ち。**
   heartbeat（B-PR2）はこれを迂回するので検知自体は成立するが、
   既存 policy の評価は宙に浮いたまま。

### 6.3 軸1（→ 10）/ 軸6（→ 9）

1. **`@pii-model` を付け忘れた新 model は、fixture が行を作らない限り見えない。**
   C-PR2 の完全一致は「manifest に載っている表」の穴しか塞がない。
2. **ネストした値・`as` 経由・別名キーは C-PR4 の型で止まらない**（docstring に明記する）。
3. `audit_logs` と `terms_agreements` は append-only なので、
   **実 DB 走査では観測できない**（除外は pg_trigger からの導出にするが、
   観測できないことに変わりはない）。

### 6.4 軸9（→ 9）

1. **公開ルート 56 本中 35 本は依然として未カバー。**
   ratchet を作らない判断（§4）の帰結。
2. **`e2e/**/*.spec.ts` がどれかの project に所有されていることを保証する gate が無い。**
   新 spec が無所有のまま静かに 0 実行になる形は残る。
3. `chromium-a11y-public` は広域 E2E の admin step でも起動し、
   file スコープ skip で 18 件 skip される。**skip 18 件を報告に出し続けるのが
   妥当かは未決**（admin step の `--project` を明示列挙に変えるかどうか）。

### 6.5 軸7（→ 9）

1. **per-regex 変異で 23 ファイル / 32 本の「構造的なのに単独変異で緑のまま」の
   正規表現が残っている**（whole-file 変異では RED なので旧測定では見えなかった層）。
   本物の空振りか、他の assert が別経路で覆っているだけかは未判定。
2. **正規表現を 1 つも持たない走査 gate 14 本**は、
   文字列リテラル変異ハーネスを作らないと測定できない。
3. `admin-submit-button-pattern` の `compactForScan` は現状 4 パターンに対して
   **恒等関数**で、見本では判別できない（限界として docstring に書く）。

### 6.6 軸3（→ 10）

1. **rule 集合の数値的な同一性は残らない**（`__tests__` 137 本 vs src 165 本）。
   これは意図した差で、F-PR2 が理由を実測つきで残す。
2. `@types/bun` の 3 つの型欠陥に upstream issue を出すかは未決。

---

## 7. 更新履歴

| 日付       | 内容                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| 2026-08-25 | 初版。HEAD `b7a6a5914` 基準。6 領域 / 30 PR。仕様確定 6 エージェント + 実装可能性検証 6 エージェントの結果を反映 |
