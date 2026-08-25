# docs

このディレクトリには **2 種類**のものが入っている。混ぜて読むと事故るので、
まずどちらかを見分けること。

- **現行の手順・決定** — 今の本番と一致していることが求められる。ずれていたら
  バグとして直す。
- **日付入りの記録** — 書かれた時点の事実。当時の PR や調査の記録であって、
  今の仕様書ではない。**現行との一致を求めない**。

## 現行の手順・決定

| ファイル                                                                         | 中身                                                                                     |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [`gcp-production-setup.md`](gcp-production-setup.md)                             | 本番 GCP のセットアップと監査。プロジェクト作成 / WIF / IAP / Cloud Run / Secret Manager |
| [`admin-access.md`](admin-access.md)                                             | 管理画面のアクセス経路（IAP + Google Group）とスタッフの追加・削除                       |
| [`dependency-overrides.md`](dependency-overrides.md)                             | `package.json` の `overrides` 一覧と、`bun audit` が赤くなったときの手順                 |
| [`adr/`](adr/README.md)                                                          | Architecture Decision Record。再 litigate を防ぐための決定記録                           |
| [`observability/alerting.md`](observability/alerting.md)                         | Cloud Monitoring の alert policy / log metric と、それを支えるコード側の不変条件         |
| [`observability/slo.md`](observability/slo.md)                                   | 公開面 availability SLO（99.9% / 30 日）と alert 閾値の導出                              |
| [`runbooks/database-restore.md`](runbooks/database-restore.md)                   | 本番 DB（Neon）の instant restore。RPO の上限・復旧後の検証・リビジョンの戻し方          |
| [`runbooks/production-rollback.md`](runbooks/production-rollback.md)             | 本番 rollback。image だけ戻すか DB を戻すかの判定と、Deploy Production の Step Summary   |
| [`runbooks/encryption-key-rotation.md`](runbooks/encryption-key-rotation.md)     | `ENCRYPTION_KEY` のローテーション（dual-read window の開閉手順）                         |
| [`runbooks/gcp-dead-resource-cleanup.md`](runbooks/gcp-dead-resource-cleanup.md) | 使われなくなった GCP リソースの安全な削除手順                                            |
| [`runbooks/switchbot-webhook.md`](runbooks/switchbot-webhook.md)                 | SwitchBot webhook の登録・ローテーション・障害切り分け                                   |
| [`runbooks/post-deploy-verification.md`](runbooks/post-deploy-verification.md)   | Deploy Production 後の自動 smoke と手動検証（CF / Stripe test / SwitchBot B-2）          |
| [`api-conventions.md`](api-conventions.md)                                       | Route Handler のレスポンス規約（401 / 403 / 400 の切り分けと helper）                    |

リポジトリ全体の入口は [`../README.md`](../README.md)、コントリビュータ向けの
手順は [`../.github/CONTRIBUTING.md`](../.github/CONTRIBUTING.md)。

## 日付入りの記録

| 置き場               | 中身                                                         |
| -------------------- | ------------------------------------------------------------ |
| `superpowers/specs/` | 実装前の設計文書（`YYYY-MM-DD-<topic>-design.md`）           |
| `superpowers/plans/` | 実装計画とタスク分解（`YYYY-MM-DD-<topic>.md`）              |
| `audits/`            | 監査・調査の記録（全コードベース監査のスナップショット含む） |

読むときの注意:

- **書かれた日付の時点の事実**として読む。挙がっているファイル名・PR 番号・
  行番号は当時のもので、今も解決するとは限らない。
- 現行仕様を知りたいときは、記録ではなくコードと上の「現行」節を見る。

### plan / spec の lifecycle

**実装が終わった plan は消す。対になる spec も、独自の判断を持たなければ一緒に消す。**

plan の中身は手順・タスク分解・コードスニペットで、出荷したコードと git log が
そのまま上位互換になる。残しておくと「これは現在の設計か」と読ませてしまい、
実装で覆った判断がそのまま誤った記録として残る。

**spec は中身で決める。** 消してよいのは、スキーマの写し・ファイル一覧・手順しか
無いもの。次のどれかを含むなら残す — コードにも git log にも書けない類の情報だから:

- 却下した代替案と、却下した理由
- 外部 API / 法令 / ライブラリの制約（一次情報の URL を含む）
- 調査で確定した数値・比較（他実装との対比、否定された仮説）

判断に迷ったら残す。消す前に `git grep <ファイル名>` で参照が無いことを確かめ、
参照があるなら**参照側を自己完結の文に直してから**消す。

消した内容は履歴に残る:

```bash
git log --all --diff-filter=D -- docs/superpowers/plans/<file>
git show <sha>^:docs/superpowers/plans/<file>
```

`audits/` はこの lifecycle の対象外（実装計画ではなく調査結果
なので、実装が終わっても内容が古びない）。**ADR は削除しない**
（[`adr/README.md`](adr/README.md) の明文規約）。

## 新しく書くとき

| 書きたいもの                        | 置き場                                                  |
| ----------------------------------- | ------------------------------------------------------- |
| 後から re-evaluate されうる構造決定 | `adr/`（採番と書式は [`adr/README.md`](adr/README.md)） |
| 人が実行する運用手順                | `runbooks/<topic>.md`                                   |
| 実装前の設計                        | `superpowers/specs/YYYY-MM-DD-<topic>-design.md`        |
| 実装計画                            | `superpowers/plans/YYYY-MM-DD-<topic>.md`               |
| 調査ログ・監査結果                  | `audits/`                                               |

現行の手順を足したら、この README の表にも 1 行足すこと。ここに載っていない
運用文書は、実質的に誰にも見つけられない。

この 2 つの置き場（`superpowers/` / `audits/`）は `referenced-gates-exist` と
`gates-do-not-pin-migrations` の**検査対象外**。
それ以外の docs 配下は検査される — 「これは X.test.ts が検証する」「migration
YYYYMMDDHHMMSS が作った」と書いたら、実在すること・畳んでも嘘にならないことが
求められる。**現行の手順を記録の置き場に置かない**こと。

`bun run docs` (TypeDoc) の出力先は `.typedoc/api/`（git 管理外）。docs/ の中には
生成物を置かない — TypeDoc の `cleanOutputDir` は既定 true なので、出力先を docs/ の
中に置いたまま設定を 1 つ間違えると、手書きの文書ごと消える。
