# docs

このディレクトリには **2 種類**のものが入っている。混ぜて読むと事故るので、
まずどちらかを見分けること。

- **現行の手順・決定** — 今の本番と一致していることが求められる。ずれていたら
  バグとして直す。
- **日付入りの記録** — 書かれた時点の事実。当時の PR や調査の記録であって、
  今の仕様書ではない。**現行との一致を求めない**（`__tests__/unit/architecture/`
  の gate 群が `docs/**` を検査対象から外しているのはこの性質のため）。

## 現行の手順・決定

| ファイル                                                                         | 中身                                                                                     |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [`gcp-production-setup.md`](gcp-production-setup.md)                             | 本番 GCP のセットアップと監査。プロジェクト作成 / WIF / IAP / Cloud Run / Secret Manager |
| [`admin-access.md`](admin-access.md)                                             | 管理画面のアクセス経路（IAP + Google Group）とスタッフの追加・削除                       |
| [`dependency-overrides.md`](dependency-overrides.md)                             | `package.json` の `overrides` 一覧と、`bun audit` が赤くなったときの手順                 |
| [`adr/`](adr/README.md)                                                          | Architecture Decision Record。再 litigate を防ぐための決定記録                           |
| [`observability/alerting.md`](observability/alerting.md)                         | Cloud Monitoring の alert policy / log metric と、それを支えるコード側の不変条件         |
| [`runbooks/encryption-key-rotation.md`](runbooks/encryption-key-rotation.md)     | `ENCRYPTION_KEY` のローテーション（dual-read window の開閉手順）                         |
| [`runbooks/gcp-dead-resource-cleanup.md`](runbooks/gcp-dead-resource-cleanup.md) | 使われなくなった GCP リソースの安全な削除手順                                            |
| [`runbooks/switchbot-webhook.md`](runbooks/switchbot-webhook.md)                 | SwitchBot webhook の登録・ローテーション・障害切り分け                                   |
| [`api-conventions.md`](api-conventions.md)                                       | Route Handler のレスポンス規約（401 / 403 / 400 の切り分けと helper）                    |

リポジトリ全体の入口は [`../README.md`](../README.md)、コントリビュータ向けの
手順は [`../.github/CONTRIBUTING.md`](../.github/CONTRIBUTING.md)。

## 日付入りの記録

| 置き場               | 中身                                                |
| -------------------- | --------------------------------------------------- |
| `superpowers/specs/` | 実装前の設計文書（`YYYY-MM-DD-<topic>-design.md`）  |
| `superpowers/plans/` | 実装計画とタスク分解（`YYYY-MM-DD-<topic>.md`）     |
| `audits/`            | 監査の記録                                          |
| `investigation/`     | 単発の調査ログ                                      |
| `AUDIT_REPORT.md`    | 2026-07-29 時点の全コードベース監査スナップショット |

読むときの注意:

- **書かれた日付の時点の事実**として読む。挙がっているファイル名・PR 番号・
  行番号は当時のもので、今も解決するとは限らない。
- 現行仕様を知りたいときは、記録ではなくコードと上の「現行」節を見る。
- 記録は**消さない**。消すと同じ議論が再び起きる。

## 新しく書くとき

| 書きたいもの                        | 置き場                                                  |
| ----------------------------------- | ------------------------------------------------------- |
| 後から re-evaluate されうる構造決定 | `adr/`（採番と書式は [`adr/README.md`](adr/README.md)） |
| 人が実行する運用手順                | `runbooks/<topic>.md`                                   |
| 実装前の設計                        | `superpowers/specs/YYYY-MM-DD-<topic>-design.md`        |
| 実装計画                            | `superpowers/plans/YYYY-MM-DD-<topic>.md`               |
| 調査ログ・監査結果                  | `investigation/` / `audits/`                            |

現行の手順を足したら、この README の表にも 1 行足すこと。ここに載っていない
運用文書は、実質的に誰にも見つけられない。

`docs/api/` は TypeDoc の生成物（git 管理外）。手で置いたものではない。
