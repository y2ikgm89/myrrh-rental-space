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

admin 面（`myrrh-rental-space-admin`）は IAP 配下で利用者数が桁違いに少ない。
公開面 SLO には入れない。admin の DB 到達性は `/api/health` の any-1 5xx
alert で見る。

## エラーバジェットの使い方

30 日で 43.2 分の 5xx が「使い切ってよい停止」。それを超えたら機能追加より
信頼性を優先する。alert はバジェットを**数時間分まとめて焼くバースト**を
人が気づく速さで取る。30 日平均 0.1% を直接 page すると、遅い劣化に気付けず
速い劣化には遅れる。

## alert 閾値の導出

数値の正本は `terraform/monitoring.tf`。ここは「なぜその数か」。

| Alert                          | 閾値          | SLO からの導出                                                                                                                                     |
| ------------------------------ | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reported_error_burst`         | 20 超 / 5 min | HIGH/CRITICAL が 5 分で 20 件は、定常 3–5 件/5 分の数倍。公開面が 5 分間 5xx を出し続けるとバジェット 43.2 分の約 12% を一度に焼く。バースト検知。 |
| `health_probe_5xx`             | any 1         | admin `/api/health` の 1 回の 5xx は DB 到達不能。公開面の 5xx バーストの先行指標。SLO 本体のプローブではない。                                    |
| `configuration_critical`       | any 1         | 設定読取失敗などが全ページを落とす。1 件でバジェット消費が始まるので即 page。                                                                      |
| `prisma_pool_timeout`          | 5 超 / 5 min  | プール枯渇は公開面をまとめて 5xx にする。5 分継続でバジェットを急速に焼く。                                                                        |
| `cron_oidc_failure`            | 3 超 / 15 min | 可用性 SLO 外（バックグラウンド）。黙ってジョブが止まる事故用。                                                                                    |
| `google_calendar_sync_failure` | 3 超 / 15 min | 可用性 SLO 外。webhook は 200 固定なので HTTP 5xx に出ない。                                                                                       |

Burn-rate alert on the SLO object is intentionally not added in the first wave;
the six signal alerts above remain the page path.
