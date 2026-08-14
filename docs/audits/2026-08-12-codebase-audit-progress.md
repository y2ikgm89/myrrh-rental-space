# コードベース監査 2026-08-12 — 対処の記録

> **このファイルが状態の SSoT。** 指摘の状態は**ここにしか書かない**。
> 残りの作業とフェーズ計画は [2026-08-13-codebase-audit-remediation.md](../superpowers/plans/2026-08-13-codebase-audit-remediation.md)、
> 指摘の全文は [2026-08-12-codebase-audit-findings.md](2026-08-12-codebase-audit-findings.md)、
> 棄却の記録は [2026-08-12-codebase-audit-refuted.md](2026-08-12-codebase-audit-refuted.md)。

**読み方は 1 つだけ: ID がこの表に載っていれば済、載っていなければ未着手。**

以前は状態を計画書の台帳と findings.md の状態欄の 2 箇所に書いており、実際に食い違った
（2026-08-14 時点で findings.md は 13 件、計画書の台帳は 17 件を「済」と数えていた。
F-11 は #2235 でマージ済なのに findings.md では「未着手」、F-48 は #2237 でマージ済なのに
「進行中」のままだった）。**同じ値を 2 箇所に置かない。**

---

## 1. 進捗

| 深刻度 |  済 |  未 |  計 |
| ------ | --: | --: | --: |
| 重大   |   — |   — |   0 |
| 高     |  11 |   0 |  11 |
| 中     |  16 |  48 |  64 |
| 低     |   0 |  58 |  58 |
| 合計   |  27 | 106 | 133 |

**高 11 件は全件クローズ。**残りは中 48 件・低 58 件で、[計画書 §6](../superpowers/plans/2026-08-13-codebase-audit-remediation.md#6-未着手の指摘台帳) の台帳に載っている。

> **手で数え直さない。** 済の件数は下の §2 の行数、未の件数は計画書 §6 の行数から導く。
> 以前この表は台帳より 2 件多く「済」を数えており、進捗を過大に申告していた。

---

## 2. 済んだ指摘（27 件）

| ID                                                 | 深刻度 | PR                    | 何をしたか                                                                                       | 残件                                                                                        |
| -------------------------------------------------- | ------ | --------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| [F-01](2026-08-12-codebase-audit-findings.md#f-01) | 高     | #2214 / #2218         | binary plan を artifact から除去。gate をパス包含判定に                                          | 鍵ローテーションは段 3 まで完了（§3）。旧 version 1・2 の無効化のみ運用判断で保留           |
| [F-02](2026-08-12-codebase-audit-findings.md#f-02) | 高     | #2224                 | 価格式に `unitSize` を反映（`price × ceil(人数 / unitSize)`）                                    | 定員側は `quantity = 人数` 解釈の確定により対処不要                                         |
| [F-03](2026-08-12-codebase-audit-findings.md#f-03) | 高     | #2227 → #2240 / #2242 | `bodySizeLimit` を `MEDIA_MAX_SIZE_BYTES` 全体の最大値から導く                                   | `use-media-upload.ts` / `MediaUploadDialog.tsx` は catch を持たず、transport 失敗は今も無言 |
| [F-04](2026-08-12-codebase-audit-findings.md#f-04) | 高     | #2223                 | 繰返し予約の金額を instance ごとに解決                                                           | —                                                                                           |
| [F-05](2026-08-12-codebase-audit-findings.md#f-05) | 高     | #2245                 | conform の `formatPaths` を使い、配列アイテムのエラーキーを揃える                                | form レベルのエラー描画は未着手                                                             |
| [F-06](2026-08-12-codebase-audit-findings.md#f-06) | 高     | #2228                 | 当日受付・管理者代行を未決済期限切れの対象から除外                                               | —                                                                                           |
| [F-07](2026-08-12-codebase-audit-findings.md#f-07) | 高     | #2215 / #2217 / #2230 | 非同期決済の除外を有限化し、場外集金の申込を期限対象に戻す                                       | —                                                                                           |
| [F-08](2026-08-12-codebase-audit-findings.md#f-08) | 高     | #2244                 | メディア使用中判定の JSON 列走査を生 SQL へ移す                                                  | 削除順の入替は採らず、理由を PR に記載                                                      |
| [F-09](2026-08-12-codebase-audit-findings.md#f-09) | 高     | #2243                 | 自動再計算する 2 経路で `manual_adjustment_amount` を消す                                        | —                                                                                           |
| [F-10](2026-08-12-codebase-audit-findings.md#f-10) | 高     | #2237                 | checkout の idempotency key を payload と一緒に動かす                                            | —                                                                                           |
| [F-11](2026-08-12-codebase-audit-findings.md#f-11) | 高     | #2235                 | GCal 増分同期が削除イベントを取りこぼしていたのを直す                                            | —                                                                                           |
| [F-16](2026-08-12-codebase-audit-findings.md#f-16) | 中     | #2255                 | 公開 surface の E2E step を足し、/ を踏まない 2 本の file スコープ skip を削除。29 test が復活   | —                                                                                           |
| [F-30](2026-08-12-codebase-audit-findings.md#f-30) | 中     | #2226                 | イベント一括削除に確認ダイアログ                                                                 | —                                                                                           |
| [F-31](2026-08-12-codebase-audit-findings.md#f-31) | 中     | #2226                 | 一括操作の対象を可視選択のみに限定                                                               | —                                                                                           |
| [F-33](2026-08-12-codebase-audit-findings.md#f-33) | 中     | #2227                 | 問い合わせ添付に `bodySizeLimit` を効かせる                                                      | —                                                                                           |
| [F-40](2026-08-12-codebase-audit-findings.md#f-40) | 中     | #2260                 | 配信停止を GET から POST の 2-step へ。GET は副作用ゼロの確認ページのみ                          | —                                                                                           |
| [F-41](2026-08-12-codebase-audit-findings.md#f-41) | 中     | #2234                 | `purpose: prefetch` で proxy のガードが素通りするのを封鎖                                        | —                                                                                           |
| [F-48](2026-08-12-codebase-audit-findings.md#f-48) | 中     | #2237                 | イベント checkout も同じ idempotency key 方式へ                                                  | —                                                                                           |
| [F-50](2026-08-12-codebase-audit-findings.md#f-50) | 中     | #2257                 | 管理画面が読む返金累計から failed / canceled を除外（ドメイン・DB と同じ SSoT を使う）           | —                                                                                           |
| [F-54](2026-08-12-codebase-audit-findings.md#f-54) | 中     | #2256                 | charge.refunded が Stripe の実 status を Refund 行へ渡すようにし、既定値へ落ちる経路を型で塞いだ | —                                                                                           |
| [F-55](2026-08-12-codebase-audit-findings.md#f-55) | 中     | #2256                 | 未確定 (pending) の返金で paymentStatus を終端へ焼かない。確定は                                 |
| efund.updated に一本化                             | —      |
| [F-57](2026-08-12-codebase-audit-findings.md#f-57) | 中     | #2259                 | 終端状態 (succeeded / failed / canceled) の Refund.status を非終端へ巻き戻さない                 | —                                                                                           |
| [F-58](2026-08-12-codebase-audit-findings.md#f-58) | 中     | ★PR                   | 適用済みクーポンの再送では利用可否を再検証しない（配り切り・期限切れで編集不能にならない）       | —                                                                                           |
| [F-59](2026-08-12-codebase-audit-findings.md#f-59) | 中     | ★PR                   | 終端ステータスの予約を編集できないようにし、クーポン usageCount の二重解放を止めた               | —                                                                                           |
| [F-60](2026-08-12-codebase-audit-findings.md#f-60) | 中     | ★PR                   | 書込の WHERE に status 述語を足し、直前にキャンセルされた行を掴まない                            | —                                                                                           |
| [F-66](2026-08-12-codebase-audit-findings.md#f-66) | 中     | #2261                 | サイドバーを publicPostsWhere() に寄せ、予約公開の記事を出さない                                 | —                                                                                           |
| [F-70](2026-08-12-codebase-audit-findings.md#f-70) | 中     | #2222                 | welcome メールの CTA が `/mypage/mypage`（404）を指していた                                      | —                                                                                           |

### 台帳外の修正（監査を起点に入ったが、指摘 ID を持たないもの）

| PR                    | 位置づけ                                                                                                                | 内容                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| #2231 / #2232 / #2233 | [F-01](2026-08-12-codebase-audit-findings.md#f-01) の後続                                                               | 受理側を値の集合にして無停止ローテーションを可能に。手順の欠落 2 点を修正 |
| #2220 / #2221         | [F-07](2026-08-12-codebase-audit-findings.md#f-07) の周辺                                                               | FAILED 予約の期限に専用列 `paymentFailedAt` を使う                        |
| #2226                 | 台帳外                                                                                                                  | 一括操作の取り返しのつかない誤爆を止める（F-30 / F-31 以外の経路）        |
| #2229                 | [構造の穴 A](../superpowers/plans/2026-08-13-codebase-audit-remediation.md#4-構造の穴個別修正では再発するもの) の第一歩 | 自動返金コマンドを実 DB で走らせる層（予約側 2 本。イベント側は未着手）   |
| #2238 / #2239 / #2242 | 記録                                                                                                                    | 監査結果と修正計画を repo に入れ、記述を台帳と一致させる                  |

> **ID の訂正履歴**: 一時 #2223 を F-36、#2226 を F-131、#2235 を F-09 として記録していたが、
> いずれも別の指摘だった（F-36 = `rrule-utils`、F-131 = `r2/delete.ts`、F-09 = GCal 逆流の
> CHECK 違反）。上の表は台帳と突き合わせて訂正済み。

---

## 3. F-01 の鍵ローテーション（段階実行中）

漏洩経路そのものは #2214 / #2218 で塞いだ。残っているのは**既に露出した値の無効化**で、
これは秘密情報の投入と本番セキュリティ設定の変更にあたるため段階実行している。

ローテーションが即座にできなかったのは実装側の問題でもあった。origin 側が 1 個の値としか
照合できず、Cloudflare の Transform Rule と Cloud Run の revision を同時に切り替えられない以上、
必ずミスマッチ窓ができる。その窓では `extractClientIp` が全 request に `"unknown"` を返し、
**サイト全体が単一の rate-limit バケットに collapse する**。#2231 で受理側を値の集合にして
窓を消し、#2232 / #2233 で手順の欠落（version pin の bump、旧値を `latest` から読まない）を直した。

| 段   | 内容                                                                    | 状態                                                                                                         |
| ---- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 前提 | 漏洩経路の封鎖                                                          | 済 — #2214 / #2218                                                                                           |
| 前提 | 受理側を値の集合に（無停止化）＋ 手順整備                               | 済 — #2231 / #2232 / #2233                                                                                   |
| 前提 | 露出済み artifact の削除                                                | 済 — 2026-08-14 に 296 件を削除。実測で残る `terraform-*` artifact は 1 件のみ（修正後のテキスト版 1,083 B） |
| 段 1 | Secret Manager version 2（`新値,旧値`）を作り Cloud Run の pin を上げる | 済 — #2247 + Deploy Production。両受理を実測で確認                                                           |
| 段 2 | Cloudflare の Transform Rule を新値へ切替                               | 済 — GH Secret 更新 + Deploy Production。Transform Rule の hash 一致を確認                                   |
| 段 3 | version 3（新値のみ）を作り pin を上げ直す                              | 済 — #2249 + Deploy Production。実測: pin=3 / versions 1,2,3 とも enabled                                    |

**残っているのは旧 version 1・2 の無効化だけ**で、これは `terraform/variables.tf` の手順が
「旧 version の disable は運用判断（ロールバック余地を残すなら残す）」としている通り任意。
漏洩した値は既に受理対象から外れているので、無効化しなくても F-01 の実害は消えている。

---

## 4. 更新の仕方

1. PR がマージされたら **§2 の表に 1 行足す**。同時に対応する行を
   [計画書 §6](../superpowers/plans/2026-08-13-codebase-audit-remediation.md#6-未着手の指摘台帳) の台帳から**消す**。
   1 つの ID が両方に載っている状態を作らない。
2. §1 の件数は §2 の行数と計画書 §6 の行数から導く。**手で数えた値を書かない。**
3. 部分的にしか直っていないなら「残件」列に何が残るかを書く。空欄にして済にしない —
   F-03 と F-05 はこの列があるから、次に触る人が残りを見つけられる。
4. 計画書は消化しきったら削除される（[docs/README.md](../README.md) の lifecycle 規約）。
   **このファイルは残す** — 「どの指摘をどの PR で塞いだか」は git log から機械的には引けない。
