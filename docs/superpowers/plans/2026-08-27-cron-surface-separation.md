# cron を public service から分離する

**目的**: Cloud Run の月額を ¥8,162 → ¥3,038 に下げる（目標 ¥3,000 以下）。

## なぜ必要か

`min_instance_count = 0` にもかかわらず public service は 7 日間 1 秒も止まって
いない（Cloud Monitoring `container/instance_count`: active が 168/168 時間、
0 になった時間は 0）。`cpu_idle = false`（instance-based billing）なので、
インスタンスが生きている間ずっと 1 vCPU + 1 GiB が課金される。

止まらない理由は **cron が自分でサービスを起こし続けている**こと。実ログ
（5,000 件 / 43.2 時間）の内訳:

| 種別       | 件数     | 備考                                      |
| ---------- | -------- | ----------------------------------------- |
| cron       | 2,104    | 毎時 47 件で一定。昼夜の差なし            |
| bot        | 約 2,600 | 8/25-26 の再帰 URL エンコード攻撃。一過性 |
| 実ユーザー | 197      | 約 4.5 件/時                              |

`cloud_scheduler.tf` の 24 本から出る理論値は毎時 47 件（`*/10`×4 + `*/15`×4 +
`*/30`×1 + 毎時×5）で、実測の下限と一致する。

## なぜ頻度削減では届かないか

実ログから keepalive 15 分でシミュレートした結果:

| 案                     | public h/月  | +admin       | 月額               |
| ---------------------- | ------------ | ------------ | ------------------ |
| 現状（最大 15 分間隔） | 734          | 828          | ¥8,162             |
| cron 30 分ごと         | 496          | 590          | ¥5,587             |
| cron 60 分ごと         | 372          | 466          | ¥4,252             |
| cron 120 分ごと        | 327          | 421          | ¥3,766             |
| **cron を分離**        | **239〜327** | **333〜421** | **¥2,813〜¥3,761** |

**分離後の幅について（2026-08-28 に訂正）。** 当初 ¥3,038（260 h）としていたが、これは `/api/live` を除外した値だった。この endpoint は `.github/workflows/uptime.yml` が **10 分間隔で外部から叩いている**（実測では GitHub Actions のスケジュール遅延により 1.3 回/時）。cron を外しても public はこれで起こされるため、除外は誤りだった。

幅が出るのは Cloud Run の idle instance 保持時間が公開されていないため。keepalive 15 分なら ¥3,761、10 分なら ¥2,813。**切替後に `container/instance_count` の実測で確定させる**（シミュレーションで詰めても前提が観測できない）。目標 ¥3,000 に届かない場合の次の手は uptime probe の間隔を落とすことだが、障害検知の速さとのトレードオフになる。

実ユーザーが 1 件でも来ればインスタンスが約 15 分起きるため、260 h/月が
構造的な床。頻度削減は 2 時間間隔まで落としても目標に届かず、その代償に
予約公開・仮押さえ解放が最大 2 時間遅れる。

## 設計

cron 専用の 3 つ目の Cloud Run service を、**同じ image**で立てる。

```
myrrh-rental-space-cron
  APP_SURFACE      = public   ← 新しい surface 値を作らない
  cpu_idle         = true     ← リクエスト課金。ここが費用の要
  min/max instance = 0 / 1
  ingress          = ALL
  IAM invoker      = scheduler SA のみ（allUsers は付けない）
  CRON_OIDC_AUDIENCE = 自分の URL
```

**`APP_SURFACE` に新しい値を足さない。** cron routes は既に public surface で
到達可能なので、`APP_SURFACE=public` のまま「Scheduler だけが到達できる
public のもう 1 台」にする。`src/proxy.ts` の blocklist も env schema も
触らずに済む。

cron の実処理は月 3.4 万リクエスト程度で、request-based の無料枠に収まる。

### 障害: in-process cache revalidation

`src/shared/lib/cache/site-wide.ts` の無効化は 2 段構え:

1. Cloudflare CDN の tag purge — **プロセスを跨いで効く**
2. `revalidateTag(tag, { expire: 0 })` — **同一プロセス内のみ**

`news-scheduled-publish` と `blog-scheduled-publish` は 2 に依存している。
cron を別プロセスに出すと public の in-process cache に届かず、予約公開の
反映が `cacheLife(PUBLIC_CONTENT)` の最大 1 時間ずれる（現在の保証は 10 分）。

**回避策**: 両 route は `slugs.length > 0` のときだけ invalidate する作りなので、
「cron service 側で検出 → 該当があるときだけ public へ再検証を依頼」にすれば、
public を起こすのは実際に公開が発生したときだけで済む。予約公開は稀なので
稼働時間への影響はほぼない。

### 障害 2: cron route 内の `fireAndForget`

`cpu_idle = true` はレスポンス送信後に CPU をスロットルする。
`src/shared/lib/async-utils.ts` の `fireAndForget` は Next.js の `after()` に
完了追跡を委ねており、その JSDoc は `--no-cpu-throttling` 環境を明示的な前提に
している。cron service を request 課金にすると、この前提が崩れる。

該当は cron route 内の 2 箇所:

- `src/app/api/cron/calendar-sync/route.ts` — webhook 更新の成否通知メール
- `src/app/api/cron/waitlist-expire/route.ts`

**cron にはレスポンス遅延の要件が無い**ので、この 2 箇所は `await` に変える。
`fireAndForget` はレスポンスをブロックしないための道具であり、cron では
そもそも不要。public / admin surface 側の 260 箇所以上は**触らない**
（あちらは `cpu_idle = false` のままで、前提が保たれる）。

## PR 分割

| #   | 内容                                                                               | 効果                   |
| --- | ---------------------------------------------------------------------------------- | ---------------------- |
| 1   | Terraform: cron service + IAM + cloudbuild の deploy step                          | 追加のみ。挙動不変     |
| 2   | App: 予約公開 2 本の再検証ハンドオフ + cron route の `fireAndForget` を `await` へ | 挙動不変（経路の追加） |
| 3   | Terraform: Scheduler 24 本を cron service へ切替 + monitoring 追従                 | **ここで費用が下がる** |
| 4   | follow-up: `imported_cron_jobs` / drift 台帳の更新                                 | state-rebuild 防御     |

PR 3 まで完了しないと費用は下がらない。PR 1 / 2 を先に入れるのは、切替の
瞬間に壊れる要素を事前に潰しておくため。

### PR 3 で追従が要る monitoring

`terraform/monitoring.tf` は service_name を直書きしている箇所が多い。
cron 系 metric は cron service を指すよう変更が要る:

- `cron_oidc_failure` / `cron_job_failure` / `cron_heartbeat` / `db_health_probe_failure`
- 正規表現 `^myrrh-rental-space(-admin)?$` を使う metric は cron を含めるか判断する
- public の SLO（`google_monitoring_slo.public_availability`）には **cron を含めない**

`db-health` は「public surface 経由で DB 到達性を見る」と description に
書かれている。cron service へ移すと probe の意味が変わるので、PR 3 で
description と監視の意図を揃える。

## 検証

- PR 1: `terraform plan` が cron service の create のみを出すこと
- PR 3: 切替後に `container/instance_count` の active が 0 になる時間帯が
  現れること（1 週間見て 260 h/月 前後に収束するか）
- 費用は Cloud Billing のレポートで実額を確認する（BigQuery export は未設定）

### 訂正: cron job の本数は 24 本（25 本ではない）

本文と PR #2754 のタイトル・コミットメッセージで **cron job を「25 本」と書いたが、
実数は 24 本**。`cloud_scheduler.tf` の `local.cron_jobs` を数え直して確認した
（`imported_cron_jobs` も 24 本で一致、未登録も余分もゼロ）。

**毎時 47 件という理論値は影響を受けない。** あれは本数からではなくスケジュール式
から導いた値で、内訳も 24 本と整合する:

    */10 × 4 本 → 24 件 / 時
    */15 × 4 本 → 16 件 / 時
    */30 × 1 本 →  2 件 / 時
    毎時  × 5 本 →  5 件 / 時   （0 * * * * が 4 本 + 15 * * * * が 1 本）
    日次 8 本 / 週次 2 本は毎時には効かない
    ────────────────────────────
    合計 24 本 / 毎時 47 件

したがって費用の見積もりと切替の判断はいずれも変わらない。誤っていたのは本数の
表記だけ。PR #2754 は既にマージ済みなので、履歴上のタイトルは訂正できない。

## 結果（2026-08-27 完了）

PR #2748 / #2750 / #2751 / #2752 / #2753 / #2754 / #2757 / #2758 / #2759 の 9 本で完了。
Cloud Scheduler 24 本が cron service を叩き、public への cron 由来リクエストはゼロに
なった（切替後 40 分で public へのリクエストは 9 件、うち 2 件は uptime probe）。

### 切替は 3 回のデプロイを要した

**1 回目と 2 回目が別々の理由で落ちた。** 記録しておく価値があるのは、どれも
「新しい Cloud Run service を足すのに何が要るか」を洗い出していれば防げたこと。

| 原因                                       | 詳細                                                                                                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `:placeholder` イメージが実在しない        | public / admin は Terraform 採用前から存在したため、この嘘が露見していなかった。**新規 service では Terraform が本当にそのイメージで revision を作る**（`cloud_run_cron.tf` の image の項） |
| `ignore_changes` の revision 固定で 409    | 下記                                                                                                                                                                                        |
| build SA に cron service の binding が無い | `deploy-cron` が PERMISSION_DENIED。**この間 Scheduler は切替済みで cron が約 25 分完全停止した**                                                                                           |

**Cloud Run service を足すときに要るもの**（1 つ欠けると deploy かサービスが落ちる）:

1. `iam_cloud_run.tf` の build SA → `roles/run.admin` binding
2. invoker binding（誰が呼べるか）
3. `cloudbuild.yaml` の deploy step と `restore_scaling`
4. `monitoring.tf` の filter
5. `gcp-production-audit-model.ts` の env キー list
6. import block の段階 B 登録

3 回目の前に「public を参照している箇所」と「cron を参照している箇所」を機械的に
比較して欠落を特定した。**これは最初にやるべき確認だった。**

### 残した既知のトレードオフ: drift が恒常的に 1 件

`ignore_changes` は差分を無視するだけでなく **prior state の値を plan に固定して
送信させる**ため、`template[0].revision` を ignore していると env 変更が 409 になる
（上流 https://github.com/hashicorp/terraform-provider-google/issues/14569 は open）。

ignore を外して update は通るようにしたが、代わりに drift が恒常的に 1 件残る:

    Plan: 0 to add, 1 to change, 0 to destroy.
      - revision = "myrrh-rental-space-01028-wer" -> null

API が名前を返して state に入る一方、config は空のまま。**clean な drift と
update が通ることは、Cloud Build と Terraform が同じ resource を二重管理して
いる限り両立しない。**

根治は所有者を 1 つにすること — image tag を変数で Terraform に渡し、build →
push → `terraform apply` の順に並べ替えて `gcloud run services update` を廃止し、
`revision` を image tag から決定的に導出する。**deploy パイプラインの再構成に
なるため未実施。**

判断: 常時 1 件の差分は「本物の drift を見逃す訓練」になるので放置は良くない。
ただしパイプライン再構成のリスクと引き換えにするかは別途決める。

### 未検証のまま残っていること

- **再検証ハンドオフ（#2753）は本番で一度も発火していない。** 予約公開が起きる
  まで確認できない。失敗しても自前の無効化へフォールバックし `logError` に残る
  ので、被害は「origin が stale のまま CDN だけ purge」に留まる設計にはしてある。
- **費用は実測していない。** 見込み ¥8,162 → ¥2,813〜¥3,761。数日おいて
  `container/instance_count` で確定させること。

### 範囲外で見つけた問題

Cloudflare tag purge の startup canary が**全サーフェスで 7 日間に 39 回失敗、
成功 1 回**。認証情報は正しく（成功例がある）、コールドスタート時の 5 秒
タイムアウトが厳しすぎるだけ。実行時 purge の失敗ログは 0 件。

cron 分離とは無関係の既存問題だが、**HIGH severity が週 39 回空振りする状態は
本物の Cloudflare 障害を隠す。** `reported_error_events` に載っている。
