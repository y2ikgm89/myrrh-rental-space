# Service Level Objectives

公開面の可用性 SLO と、そこから導くエラーバジェット・alert 閾値の根拠。
実装の SSoT は `terraform/monitoring.tf`。閾値を変えるときはこの文書と
[`alerting.md`](alerting.md) を同じ PR で更新する。

## Web Vitals

同意後のみ、公開面が Server Action 経由で構造化ログ `message=web_vital` を出す
（`web-vitals-reporter.tsx` → `reportWebVitalAction`）。Cloud Logging →
log-based metric `web_vitals`（label: `metric` のみ。URL / UA は載せない）。
**公開 `/api/metrics` は置かない**（濫用・課金面）。

**条件は同意だけ。GA4 の設定は前提にしない**（監査 A-31）。以前は
reporter が GA4 の種別未設定で早期 return しており、GA4 を使わない方針にした瞬間から
この metric が永久に空になった— しかもこの文書には同意しか書いていなかったので、
空のグラフを「同意率が低い」と誤読する。GA4 送信は `sendMetric` 内で `gtag` の
有無を見て分岐する独立な送信先。

## 公開面 availability

| 項目             | 値                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 対象             | Cloud Run `myrrh-rental-space`（公開ストアフロント）                                                                           |
| TF リソース      | `google_monitoring_service.public_cloud_run` / `google_monitoring_slo.public_availability`（slo_id `public-availability-999`） |
| 目標             | 30 日ローリングで **99.9%**                                                                                                    |
| エラーバジェット | 0.1% × 30 日 = **43.2 分** / 30 日                                                                                             |
| 成功             | HTTP ステータスが 499 以下（`response_code_class != "5xx"`）                                                                   |
| 失敗             | HTTP ステータスが 500 以上                                                                                                     |
| 測定             | `run.googleapis.com/request_count` の request-based `good_total_ratio`（`resource.label.service_name="myrrh-rental-space"`）   |
| `/api/live`      | request metric に path ラベルが無いため **分母に含まれうる**。偽の除外は約束しない                                             |
| `/api/cron/*`    | 同じ理由で **分母・分子に入る**（cron は公開サービスへ投げられる）。「SLO 外」ではない                                         |

admin 面（`myrrh-rental-space-admin`）は IAP 配下で利用者数が桁違いに少ない。
公開面 SLO には入れない。

**DB 到達性の検知は `/api/cron/db-health` の合成プローブで見る**。
10 分ごとに公開面から `SELECT 1` を打ち、Cloud Scheduler のリトライを使い切った
ときに `db_health_probe_failure` が page する（3 超 / 15 min）。

`/api/health` の `health_probe_5xx` は**定期プローブではない**（監査 A-29）。
admin は internal LB + IAP で、Cloud Run probe（`/api/live`）も外形監視
（`.github/workflows/uptime.yml`）も uptime check も `/api/health` を叩かないので、
IAP 認証済みの人が手で開いた瞬間にしか評価対象のログが生まれない。
「人が見ているときに即座に鳴る」日和見の signal として残してある。

## エラーバジェットの使い方

30 日で 43.2 分の 5xx が「使い切ってよい停止」。それを超えたら機能追加より
信頼性を優先する。alert はバジェットを**数時間分まとめて焼くバースト**を
人が気づく速さで取る。30 日平均 0.1% を直接 page すると、遅い劣化に気付けず
速い劣化には遅れる。

## alert 閾値の導出

数値の正本は `terraform/monitoring.tf`。ここは「なぜその数か」。

| Alert                           | 閾値                    | SLO からの導出                                                                                                                                                                                                                                                                               |
| ------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reported_error_burst`          | 20 超 / 5 min           | HIGH/CRITICAL が 5 分で 20 件は、定常 3–5 件/5 分の数倍。公開面が 5 分間 5xx を出し続けるとバジェット 43.2 分の約 12% を一度に焼く。バースト検知。                                                                                                                                           |
| `health_probe_5xx`              | any 1                   | admin `/api/health` の 5xx は DB 到達不能。ただし**定期プローブは無い**（上記）。人が開いたときだけ鳴る日和見の signal。                                                                                                                                                                     |
| `severity_critical`             | any 1                   | CRITICAL ログ全件（設定読取・決済・監査ログ改竄・cron 設定欠落）。1 件でバジェット消費が始まるので即 page。                                                                                                                                                                                  |
| `prisma_pool_timeout`           | 5 超 / 5 min            | プール枯渇は公開面をまとめて 5xx にする。5 分継続でバジェットを急速に焼く。                                                                                                                                                                                                                  |
| `cron_oidc_failure`             | 3 超 / 15 min           | 黙ってジョブが止まる事故用。401 / config 欠落専用で、cron ハンドラの 500 は拾わない。                                                                                                                                                                                                        |
| `cron_job_failure`              | 3 超 / 15 min           | cron ハンドラ 500 の受け皿（監査 A-07）。`retry_count = 3` を使い切った 1 tick が 4 件。endpoint 単位で group するので 1 本の停止が他 23 本に薄まらない。                                                                                                                                    |
| `google_calendar_sync_failure`  | 3 超 / 15 min           | webhook は 200 固定なので HTTP 5xx に出ない。文言 filter が唯一の signal。                                                                                                                                                                                                                   |
| `mail_send_failure`             | 3 超 / 15 min           | `sendEmail` の最終失敗は MEDIUM で記録されるため Error Reporting に乗らない。文言 filter が唯一の signal。                                                                                                                                                                                   |
| `db_health_probe_failure`       | 3 超 / 15 min           | Cloud Scheduler の `retry_count = 3` を使い切った本物の停止だけが 4 件に届く。リトライで復帰するブリップは 1〜2 件で止まる。                                                                                                                                                                 |
| `public_availability_fast_burn` | burn rate > 10 / 60 min | 30 日 SLO の fast burn。`select_slo_burn_rate` の lookback は最大 24h のため 60m で近似。1 時間でバジェットを約 3 日分のペースで焼いている → 即 page。                                                                                                                                       |
| `public_availability_slow_burn` | burn rate > 2 / 24 h    | 同 SLO の slow burn。1440m（24h）が lookback の上限。1 日で 30 日目標を外すペース → 翌営業日に調査。`auto_close = 86400s`。                                                                                                                                                                  |
| `cron_heartbeat`                | absent over max silence | ジョブ未起動。2xx request log の metric-absence。**一度でも成功した job しか対象にならない**ので、metric を作り直した直後に誤検知しない。失敗 status（499/504/500）に依存しない。日次 8 本・週次 2 本は trigger absence time の上限 23.5h（< 日次の正常な 24h 無音）に収まらないため対象外。 |

上の signal alert に加え、`google_monitoring_slo.public_availability` に対する
fast / slow burn-rate の 2 本が budget 消費の持続劣化を補う。burst 系は人が気づく
速さ、burn-rate は SLO 残量のトレンド。表の行名は
`terraform/monitoring.tf` の `google_monitoring_alert_policy` 名と一致していること
（`__tests__/unit/architecture/observability-docs-alert-names.test.ts` が強制）。
