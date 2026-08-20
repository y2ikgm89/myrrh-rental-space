# Service Level Objectives

公開面の可用性 SLO と、そこから導くエラーバジェット・alert 閾値の根拠。
実装の SSoT は `terraform/monitoring.tf`。閾値を変えるときはこの文書と
[`alerting.md`](alerting.md) を同じ PR で更新する。

Web Vitals（LCP / INP / CLS）はいま GA4 だけに送っている
（`web-vitals-reporter.tsx`）。Cloud Monitoring へのカスタムメトリクス送信は
新規 endpoint（`/api/metrics` 等）が要りセキュリティレビュー対象なので、
**この文書では定義しない。実装は別 PR。**

## 公開面 availability

| 項目             | 値                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| 対象             | Cloud Run `myrrh-rental-space`（公開ストアフロント）                                                      |
| 目標             | 30 日ローリングで **99.9%**                                                                               |
| エラーバジェット | 0.1% × 30 日 = **43.2 分** / 30 日                                                                        |
| 成功             | HTTP ステータスが 499 以下                                                                                |
| 失敗             | HTTP ステータスが 500 以上                                                                                |
| 測定             | Cloud Run request ログの request count と 5xx rate（`resource.labels.service_name="myrrh-rental-space"`） |
| 除外             | `/api/live`（startup / liveness。コンテナ自殺のフィードバックを避ける。alert からも除外済み）             |

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
| `severity_critical`            | any 1         | 設定読取失敗などが全ページを落とす。1 件でバジェット消費が始まるので即 page。                                                                      |
| `prisma_pool_timeout`          | 5 超 / 5 min  | プール枯渇は公開面をまとめて 5xx にする。5 分継続でバジェットを急速に焼く。                                                                        |
| `cron_oidc_failure`            | 3 超 / 15 min | 可用性 SLO 外（バックグラウンド）。黙ってジョブが止まる事故用。                                                                                    |
| `google_calendar_sync_failure` | 3 超 / 15 min | 可用性 SLO 外。webhook は 200 固定なので HTTP 5xx に出ない。                                                                                       |

## まだ測っていないもの

- 公開面 5xx を Cloud Monitoring SLO オブジェクトとして登録すること
  （いまは request ログから手で見る）
- Web Vitals を Monitoring へ送ること（上記、別 PR）
