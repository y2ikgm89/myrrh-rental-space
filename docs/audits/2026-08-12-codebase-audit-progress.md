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
| 中     |  64 |   0 |  64 |
| 低     |  52 |   5 |  57 |
| 合計   | 127 |   5 | 132 |

**高 11 件・中 64 件は全件クローズ。**残りは低 5 件で、[計画書 §6](../superpowers/plans/2026-08-13-codebase-audit-remediation.md#6-未着手の指摘台帳) の台帳に載っている。F-94 は R-03 の再掲として棄却へ移した（§2 には入れない）。

> **手で数え直さない。** 済の件数は下の §2 の行数、未の件数は計画書 §6 の行数から導く。
> 以前この表は台帳より 2 件多く「済」を数えており、進捗を過大に申告していた。

---

## 2. 済んだ指摘

| ID                                                   | 深刻度 | PR                                         | 何をしたか                                                                                                       | 残件                                                                                    |
| ---------------------------------------------------- | ------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [F-01](2026-08-12-codebase-audit-findings.md#f-01)   | 高     | #2214 / #2218                              | binary plan を artifact から除去。gate をパス包含判定に                                                          | 鍵ローテーションは段 3 まで完了（§3）。旧 version 1・2 の無効化のみ運用判断で保留       |
| [F-02](2026-08-12-codebase-audit-findings.md#f-02)   | 高     | #2224                                      | 価格式に `unitSize` を反映（`price × ceil(人数 / unitSize)`）                                                    | 定員側は `quantity = 人数` 解釈の確定により対処不要                                     |
| [F-03](2026-08-12-codebase-audit-findings.md#f-03)   | 高     | #2227 → #2240 / #2242 / `fix/audit-wave-1` | `bodySizeLimit` を `MEDIA_MAX_SIZE_BYTES` 全体の最大値から導く。transport 失敗は `toast.error`                   | —                                                                                       |
| [F-04](2026-08-12-codebase-audit-findings.md#f-04)   | 高     | #2223                                      | 繰返し予約の金額を instance ごとに解決                                                                           | —                                                                                       |
| [F-05](2026-08-12-codebase-audit-findings.md#f-05)   | 高     | #2245 / `fix/audit-wave-1`                 | conform の `formatPaths` を使い、配列アイテムのエラーキーを揃える。`form.errors` を描画する                      | —                                                                                       |
| [F-06](2026-08-12-codebase-audit-findings.md#f-06)   | 高     | #2228                                      | 当日受付・管理者代行を未決済期限切れの対象から除外                                                               | —                                                                                       |
| [F-07](2026-08-12-codebase-audit-findings.md#f-07)   | 高     | #2215 / #2217 / #2230                      | 非同期決済の除外を有限化し、場外集金の申込を期限対象に戻す                                                       | —                                                                                       |
| [F-08](2026-08-12-codebase-audit-findings.md#f-08)   | 高     | #2244                                      | メディア使用中判定の JSON 列走査を生 SQL へ移す                                                                  | 削除順の入替は採らず、理由を PR に記載                                                  |
| [F-09](2026-08-12-codebase-audit-findings.md#f-09)   | 高     | #2243                                      | 自動再計算する 2 経路で `manual_adjustment_amount` を消す                                                        | —                                                                                       |
| [F-10](2026-08-12-codebase-audit-findings.md#f-10)   | 高     | #2237                                      | checkout の idempotency key を payload と一緒に動かす                                                            | —                                                                                       |
| [F-11](2026-08-12-codebase-audit-findings.md#f-11)   | 高     | #2235                                      | GCal 増分同期が削除イベントを取りこぼしていたのを直す                                                            | —                                                                                       |
| [F-16](2026-08-12-codebase-audit-findings.md#f-16)   | 中     | #2255                                      | 公開 surface の E2E step を足し、/ を踏まない 2 本の file スコープ skip を削除。29 test が復活                   | —                                                                                       |
| [F-117](2026-08-12-codebase-audit-findings.md#f-117) | 低     | #2266                                      | ゲスト問い合わせの backfill を削除（実効が管理者の解除を打ち消すことだけになっていた）                           | —                                                                                       |
| [F-18](2026-08-12-codebase-audit-findings.md#f-18)   | 中     | #2267                                      | /access とカスタムページに Cache-Tag を emit（site-wide の purge が届くように）                                  | —                                                                                       |
| [F-24](2026-08-12-codebase-audit-findings.md#f-24)   | 中     | #2263                                      | 編集ダイアログからの無効化でもパスコードを失効する                                                               | —                                                                                       |
| [F-25](2026-08-12-codebase-audit-findings.md#f-25)   | 中     | #2263                                      | Pad の直接付け替えで旧 Pad を失効し新 Pad へ発行する                                                             | —                                                                                       |
| [F-30](2026-08-12-codebase-audit-findings.md#f-30)   | 中     | #2226                                      | イベント一括削除に確認ダイアログ                                                                                 | —                                                                                       |
| [F-31](2026-08-12-codebase-audit-findings.md#f-31)   | 中     | #2226                                      | 一括操作の対象を可視選択のみに限定                                                                               | —                                                                                       |
| [F-33](2026-08-12-codebase-audit-findings.md#f-33)   | 中     | #2227                                      | 問い合わせ添付に `bodySizeLimit` を効かせる                                                                      | —                                                                                       |
| [F-40](2026-08-12-codebase-audit-findings.md#f-40)   | 中     | #2260                                      | 配信停止を GET から POST の 2-step へ。GET は副作用ゼロの確認ページのみ                                          | —                                                                                       |
| [F-41](2026-08-12-codebase-audit-findings.md#f-41)   | 中     | #2234                                      | `purpose: prefetch` で proxy のガードが素通りするのを封鎖                                                        | —                                                                                       |
| [F-48](2026-08-12-codebase-audit-findings.md#f-48)   | 中     | #2237                                      | イベント checkout も同じ idempotency key 方式へ                                                                  | —                                                                                       |
| [F-44](2026-08-12-codebase-audit-findings.md#f-44)   | 中     | #2265                                      | 同一アドレスの統合で会員の現用アドレスを恒久抑制しない。hash 抑制にリセット経路と可視化を与えた                  | —                                                                                       |
| [F-50](2026-08-12-codebase-audit-findings.md#f-50)   | 中     | #2257                                      | 管理画面が読む返金累計から failed / canceled を除外（ドメイン・DB と同じ SSoT を使う）                           | —                                                                                       |
| [F-52](2026-08-12-codebase-audit-findings.md#f-52)   | 中     | #2264                                      | 問い合わせの件名も匿名化する（氏名で検索してヒットしなくなる）                                                   | —                                                                                       |
| [F-54](2026-08-12-codebase-audit-findings.md#f-54)   | 中     | #2256                                      | charge.refunded が Stripe の実 status を Refund 行へ渡すようにし、既定値へ落ちる経路を型で塞いだ                 | —                                                                                       |
| [F-55](2026-08-12-codebase-audit-findings.md#f-55)   | 中     | #2256                                      | 未確定 (pending) の返金で paymentStatus を終端へ焼かない。確定は `refund.updated` に一本化                       | —                                                                                       |
| [F-57](2026-08-12-codebase-audit-findings.md#f-57)   | 中     | #2259                                      | 終端状態 (succeeded / failed / canceled) の Refund.status を非終端へ巻き戻さない                                 | —                                                                                       |
| [F-58](2026-08-12-codebase-audit-findings.md#f-58)   | 中     | #2262                                      | 適用済みクーポンの再送では利用可否を再検証しない（配り切り・期限切れで編集不能にならない）                       | —                                                                                       |
| [F-59](2026-08-12-codebase-audit-findings.md#f-59)   | 中     | #2262                                      | 終端ステータスの予約を編集できないようにし、クーポン usageCount の二重解放を止めた                               | —                                                                                       |
| [F-60](2026-08-12-codebase-audit-findings.md#f-60)   | 中     | #2262                                      | 書込の WHERE に status 述語を足し、直前にキャンセルされた行を掴まない                                            | —                                                                                       |
| [F-65](2026-08-12-codebase-audit-findings.md#f-65)   | 中     | #2269                                      | kill switch 用の短命キャッシュプロファイルを作り、反映上限を約 1 分に明示                                        | 共有 cacheHandler / revalidate endpoint の恒久策は未着手                                |
| [F-66](2026-08-12-codebase-audit-findings.md#f-66)   | 中     | #2261                                      | サイドバーを publicPostsWhere() に寄せ、予約公開の記事を出さない                                                 | —                                                                                       |
| [F-67](2026-08-12-codebase-audit-findings.md#f-67)   | 中     | #2263                                      | 再発行の絞り込みを「生きたパスコードが無い」に直す（REVOKED 行で除外されない）                                   | —                                                                                       |
| [F-68](2026-08-12-codebase-audit-findings.md#f-68)   | 中     | #2263                                      | 拠点変更で Pad を外したときもパスコードを失効する                                                                | —                                                                                       |
| [F-73](2026-08-12-codebase-audit-findings.md#f-73)   | 中     | #2267                                      | イベント詳細 source の lookahead をセグメント境界に固定                                                          | —                                                                                       |
| [F-103](2026-08-12-codebase-audit-findings.md#f-103) | 低     | #2269                                      | ヘッダーの Reserve CTA に feature 判定を通す                                                                     | mypage の /contact・/spaces・/faq ハードコードは範囲外                                  |
| [F-112](2026-08-12-codebase-audit-findings.md#f-112) | 低     | #2265                                      | 匿名化した placeholder を送信対象外にし、リマインダ cron の母集合からも外す                                      | —                                                                                       |
| [F-88](2026-08-12-codebase-audit-findings.md#f-88)   | 低     | #2267                                      | イベントページの Cache-Tag に space-v1 / location-v1 を追加                                                      | —                                                                                       |
| [F-116](2026-08-12-codebase-audit-findings.md#f-116) | 低     | #2264                                      | 予約の自由記述「備考」を匿名化とデータ保持 purge の両方で消す                                                    | —                                                                                       |
| [F-70](2026-08-12-codebase-audit-findings.md#f-70)   | 中     | #2222                                      | welcome メールの CTA が `/mypage/mypage`（404）を指していた                                                      | —                                                                                       |
| [F-133](2026-08-12-codebase-audit-findings.md#f-133) | 低     | #2268                                      | 振込先の表示判定を `isOnlinePaymentAvailable()` に寄せ、支払手段ゼロを防ぐ                                       | —                                                                                       |
| [F-92](2026-08-12-codebase-audit-findings.md#f-92)   | 低     | #2270                                      | コマンドパレットのページ検索に割当・`isActive`・専用画面 slug の絞り込みを通す                                   | F-115 と同一欠陥。同 PR で解消                                                          |
| [F-115](2026-08-12-codebase-audit-findings.md#f-115) | 低     | #2270                                      | 同上（`AdminSearchScope` を `searchByResource` に通す）                                                          | —                                                                                       |
| [F-102](2026-08-12-codebase-audit-findings.md#f-102) | 低     | #2270                                      | `void logPermissionDenied` を廃し、`fireAndForget` で包んだ void 関数だけを export                               | 監査行の書込は元から try/catch 済み。捨てられていたのはスパイク通知の reject だけだった |
| [F-46](2026-08-12-codebase-audit-findings.md#f-46)   | 中     | #2271                                      | GCal の削除反映に upsert 側と対称のガードを入れ、掛かったら通知を上げる                                          | `Event.source` 列は入れていない（PR 本文に理由）                                        |
| [F-61](2026-08-12-codebase-audit-findings.md#f-61)   | 中     | #2271                                      | eventId を持つ series-child を retry pool に戻し、create 除外を呼び出し側 1 箇所へ                               | —                                                                                       |
| [F-123](2026-08-12-codebase-audit-findings.md#f-123) | 低     | #2271                                      | GCal 同期の write-back 4 本を `updateMany` に揃え、soft-delete 後の偽エラーを止める                              | —                                                                                       |
| [F-23](2026-08-12-codebase-audit-findings.md#f-23)   | 中     | #2272                                      | setup の接続先照合を DB を触る前へ移し、migrate / seed の DIRECT_URL も固定                                      | —                                                                                       |
| [F-13](2026-08-12-codebase-audit-findings.md#f-13)   | 中     | #2272                                      | ESLint に `scanSync` を認識させ、露出した gate 3 本に下限を追加。走査範囲も拡張                                  | —                                                                                       |
| [F-83](2026-08-12-codebase-audit-findings.md#f-83)   | 低     | #2272                                      | singleton gate を `e2e/helpers/` まで広げ receiver 非依存に。免除は機械検査つき                                  | refund fixture は免除（seed へ移すと全テストの返金挙動が変わる）                        |
| [F-43](2026-08-12-codebase-audit-findings.md#f-43)   | 中     | #2273                                      | 返金ポリシーの取り分から既存の部分返金を引く。取り分到達なら skip                                                | 読みが lock 外（PR 本文に報告）                                                         |
| [F-49](2026-08-12-codebase-audit-findings.md#f-49)   | 中     | #2273                                      | 確定の REFUNDED / PARTIALLY_REFUNDED を actorType でなく累積額で決める                                           | 予約・イベント両側。既存テスト 2 本の主張を反転                                         |
| [F-29](2026-08-12-codebase-audit-findings.md#f-29)   | 中     | #2274                                      | 設備の preprocess でスカラーを 1 要素に正規化し、子要素エラーを画面に出す                                        | —                                                                                       |
| [F-34](2026-08-12-codebase-audit-findings.md#f-34)   | 中     | #2274                                      | 配列アイテムの select を schema default（無ければ先頭 option）で初期化                                           | —                                                                                       |
| [F-35](2026-08-12-codebase-audit-findings.md#f-35)   | 中     | #2274                                      | group の折りたたみを表示だけの操作にする（常時 mount + `hidden`）                                                | —                                                                                       |
| [F-26](2026-08-12-codebase-audit-findings.md#f-26)   | 中     | #2275                                      | block DOM を出す DecoratorNode 14 個に `isInline(): false` を足し、明示を gate 化                                | —                                                                                       |
| [F-27](2026-08-12-codebase-audit-findings.md#f-27)   | 中     | #2275                                      | flat state キーを `timelineDirection` へ改名。予約キー衝突を gate 化                                             | 旧 JSON の horizontal は vertical に戻る（意図的な非互換）                              |
| [F-28](2026-08-12-codebase-audit-findings.md#f-28)   | 中     | #2275                                      | 子孫まで埋める `$serializeNodeDeep` を作り、複製とテンプレート保存の両方から使う                                 | —                                                                                       |
| [F-37](2026-08-12-codebase-audit-findings.md#f-37)   | 中     | #2276                                      | Instagram の VIDEO は `thumbnailUrl` を使う（mp4 を `<Image>` に渡さない）                                       | —                                                                                       |
| [F-45](2026-08-12-codebase-audit-findings.md#f-45)   | 中     | #2276                                      | イベント一斉配信で `marketingOptIn` を守り、解決できないゲストにも送らない                                       | —                                                                                       |
| [F-75](2026-08-12-codebase-audit-findings.md#f-75)   | 中     | #2276                                      | 本文幅を `style` で渡す。補間 arbitrary value を止める gate も追加                                               | —                                                                                       |
| [F-53](2026-08-12-codebase-audit-findings.md#f-53)   | 中     | #2278                                      | 既定セクションを流すのは Page 行の新規作成時だけにする                                                           | —                                                                                       |
| [F-63](2026-08-12-codebase-audit-findings.md#f-63)   | 中     | #2278                                      | 必須セクションの複製を削除・表示切替と同じ述語で止める（UI も揃える）                                            | 既に重複がある DB の是正は別途                                                          |
| [F-64](2026-08-12-codebase-audit-findings.md#f-64)   | 中     | #2278                                      | 既定セクションへの fallback を「Page 行が無い」ときだけに限定                                                    | —                                                                                       |
| [F-20](2026-08-12-codebase-audit-findings.md#f-20)   | 中     | #2281                                      | secret 監査の母集合に DIRECT_URL を入れ、terraform との照合テストを足す                                          | 実 GCP 未実行（PR 本文に明記）                                                          |
| [F-21](2026-08-12-codebase-audit-findings.md#f-21)   | 中     | #2281                                      | secret-level を「許容」に変え、runbook §8 を bootstrap の実態に揃える                                            | 同上                                                                                    |
| [F-22](2026-08-12-codebase-audit-findings.md#f-22)   | 中     | #2281                                      | build SA の project-level role を allowlist 判定にする                                                           | 同上                                                                                    |
| [F-38](2026-08-12-codebase-audit-findings.md#f-38)   | 中     | #2279                                      | mypage の書込 5 経路にメンテナンス判定を入れ、漏れを gate で止める                                               | —                                                                                       |
| [F-39](2026-08-12-codebase-audit-findings.md#f-39)   | 中     | #2279                                      | クーポン入力を 400ms 落とし、料金取得失敗を画面に出す                                                            | —                                                                                       |
| [F-62](2026-08-12-codebase-audit-findings.md#f-62)   | 中     | #2279                                      | 編集可能な paymentStatus を SSoT 化し、updateMany の WHERE と揃える                                              | —                                                                                       |
| [F-12](2026-08-12-codebase-audit-findings.md#f-12)   | 中     | #2280                                      | 越境 import の検出を動的 import と `@/app/(admin)` 綴りまで広げる                                                | —                                                                                       |
| [F-14](2026-08-12-codebase-audit-findings.md#f-14)   | 中     | #2280                                      | `use server` の判定を先頭コメントを飛ばした directive 一致にする                                                 | —                                                                                       |
| [F-17](2026-08-12-codebase-audit-findings.md#f-17)   | 中     | #2280                                      | seed の存在判定 lint を findUnique 等まで広げ、露出した seed の実違反 4 件を直す                                 | seed は実行して確かめていない                                                           |
| [F-36](2026-08-12-codebase-audit-findings.md#f-36)   | 中     | #2283                                      | 繰返し予約の UNTIL を JST のその日の終わりにする                                                                 | —                                                                                       |
| [F-74](2026-08-12-codebase-audit-findings.md#f-74)   | 中     | #2283                                      | 予約メールの料金を税込に統一し、型で税抜を渡せなくする                                                           | —                                                                                       |
| [F-32](2026-08-12-codebase-audit-findings.md#f-32)   | 中     | #2283                                      | FAQ の並び替えを「占めている order の入れ替え」にする                                                            | —                                                                                       |
| [F-15](2026-08-12-codebase-audit-findings.md#f-15)   | 中     | #2282                                      | 透過ヘッダーの負マージンを `margin-top` にし、camelCase の許可を外す                                             | —                                                                                       |
| [F-51](2026-08-12-codebase-audit-findings.md#f-51)   | 中     | #2282                                      | FAQ の閲覧・投票が `updated_at` を触らないようにする                                                             | 列は足していない（PR 本文に理由）                                                       |
| [F-71](2026-08-12-codebase-audit-findings.md#f-71)   | 中     | #2282                                      | bot 判定をサーバー発行の purpose 付きトークンに置き換える                                                        | 公開フォーム 4 本。E2E gate の理由 1 つが解消                                           |
| [F-19](2026-08-12-codebase-audit-findings.md#f-19)   | 中     | `fix/audit-wave-1`                         | 本番 seed は SEO / 組織 / 予約 singleton の update を空にする                                                    | —                                                                                       |
| [F-42](2026-08-12-codebase-audit-findings.md#f-42)   | 中     | `fix/audit-wave-1`                         | 監査 CSV は期間必須・90 日・`take+1`。超過は 409。並びは `sequence asc`                                          | 管理画面の CSV リンクは期間未指定のまま 400 になる（UI 必須化は別件）                   |
| [F-47](2026-08-12-codebase-audit-findings.md#f-47)   | 中     | `fix/audit-wave-1`                         | チケット定員 floor をスロットごとの CONFIRMED 最大合計と比較する                                                 | —                                                                                       |
| [F-56](2026-08-12-codebase-audit-findings.md#f-56)   | 中     | `fix/audit-wave-1`                         | 非整数アプリ金額は typed error。webhook は 2xx + CRITICAL + 管理者通知                                           | 端数 USD は Stripe 上だけ返り DB は PAID のまま（minor-unit 移行は範囲外）              |
| [F-69](2026-08-12-codebase-audit-findings.md#f-69)   | 中     | `fix/audit-wave-1`                         | `getRequiredTermsByScope` を `criticalFetch` にし、失敗を未設定扱いしない                                        | —                                                                                       |
| [F-72](2026-08-12-codebase-audit-findings.md#f-72)   | 中     | `fix/audit-wave-1`                         | `register()` は資格情報の同期検証だけ待つ。canary は `void` + `retry: false`                                     | 通常 purge の Retry-After は維持                                                        |
| [F-78](2026-08-12-codebase-audit-findings.md#f-78)   | 低     | `fix/audit-wave-1`                         | webhook mock の `latestRefund` に `metadata` を戻し、ADMIN attribution を 1 本固定                               | —                                                                                       |
| [F-80](2026-08-12-codebase-audit-findings.md#f-80)   | 低     | `fix/audit-wave-1`                         | import 必須母集合に Cloudflare を入れ、inquiries bucket に `import {}` を足す                                    | 全 resource 反転 + EXEMPT は未着手                                                      |
| [F-118](2026-08-12-codebase-audit-findings.md#f-118) | 低     | `fix/audit-wave-1`                         | webhook 照合から `deletedAt` を外す（公開可否ではない）                                                          | 管理画面の返金 UI 述語は未変更                                                          |
| [F-120](2026-08-12-codebase-audit-findings.md#f-120) | 低     | `fix/audit-wave-1`                         | waitlist promote を session lock から `waitlist_promote_leased_until` 行リースへ                                 | 728354 は採番済みのまま残し、再利用しない                                               |
| [F-82](2026-08-12-codebase-audit-findings.md#f-82)   | 低     | #2289                                      | 母集合 regex を先頭の `next build` も数える形にし、その形を fixture で固定                                       | —                                                                                       |
| [F-87](2026-08-12-codebase-audit-findings.md#f-87)   | 低     | #2288                                      | cron_oidc_failure を 401 と config fail-closed (CRITICAL+AUTHORIZATION) に限定。汎用 cron 500 は数えない         | —                                                                                       |
| [F-79](2026-08-12-codebase-audit-findings.md#f-79)   | 低     | #2290                                      | required-check path filter gate を Bun.YAML.parse にし、flow 形式 `paths: [terraform/**]` も検出する             | —                                                                                       |
| [F-81](2026-08-12-codebase-audit-findings.md#f-81)   | 低     | #2291                                      | header 母集合をクラス集合の lookahead に。操作列は `cn()` の文字列引数も見る                                     | —                                                                                       |
| [F-76](2026-08-12-codebase-audit-findings.md#f-76)   | 低     | #2292                                      | extractImportSpecifiers が走査前にコメントを除去。JSDoc @example の import は辺にならない                        | —                                                                                       |
| [F-84](2026-08-12-codebase-audit-findings.md#f-84)   | 低     | #2293                                      | mobile project gate が file-scope APP_SURFACE skip を CI の project×surface と突合する。F-84 形の fixture を追加 | CI の public step は F-16 が既に入れていた                                              |
| [F-95](2026-08-12-codebase-audit-findings.md#f-95)   | 低     | #2294                                      | GCal 設定保存で NOTIFICATION_SETTINGS も無効化。coverage gate に 2 列を追加                                      | —                                                                                       |
| [F-91](2026-08-12-codebase-audit-findings.md#f-91)   | 低     | #2297                                      | spawnSync の `exitCode=null` を `?? 1` で失敗へ倒す。`process.exit(null)` の偽成功を止める                       | —                                                                                       |
| [F-85](2026-08-12-codebase-audit-findings.md#f-85)   | 低     | #2295                                      | 型リテラル引数は where/data/select 等をプロパティ単位で Prisma 型必須に。全 params を見る                        | —                                                                                       |
| [F-93](2026-08-12-codebase-audit-findings.md#f-93)   | 低     | #2296                                      | 一括配信の rate limit を認証 + RBAC 通過後へ移し、低権限による共有バケット消費を止めた                           | —                                                                                       |
| [F-99](2026-08-12-codebase-audit-findings.md#f-99)   | 低     | #2298                                      | 検索・全置換の再開を `index + searchText.length` にし、自己重複語の過剰置換を止めた                              | —                                                                                       |
| [F-77](2026-08-12-codebase-audit-findings.md#f-77)   | 低     | #2302                                      | 数値列母集合に BigInt を含め、AuditLog.sequence に positive CHECK を付けた                                       | —                                                                                       |
| [F-86](2026-08-12-codebase-audit-findings.md#f-86)   | 低     | #2299                                      | navigation reconcile gate がコメントを落としてから `key:` 位置だけを見る                                         | —                                                                                       |
| [F-89](2026-08-12-codebase-audit-findings.md#f-89)   | 低     | #2299                                      | 本番 seed はスペースカテゴリーの description / icon / color を書き戻さない                                       | —                                                                                       |
| [F-90](2026-08-12-codebase-audit-findings.md#f-90)   | 低     | #2299                                      | 本番 navigation seed は空テーブルの初回だけ create。欠けた order を埋めない                                      | —                                                                                       |
| [F-96](2026-08-12-codebase-audit-findings.md#f-96)   | 低     | #2300                                      | FigmaNode の exportDOM がラベルを可視 `<p>` と iframe title に出す                                               | —                                                                                       |
| [F-97](2026-08-12-codebase-audit-findings.md#f-97)   | 低     | #2300                                      | MapEmbed も同様。`[data-map]` CSS を足して公開地図の UA 既定 300x150 を止める                                    | —                                                                                       |
| [F-100](2026-08-12-codebase-audit-findings.md#f-100) | 低     | #2301                                      | 見出し / リスト / インスペクター / ヘルプの数字・記号ショートカットを event.code で判定する                      | —                                                                                       |
| [F-98](2026-08-12-codebase-audit-findings.md#f-98)   | 低     | #2303                                      | TabTitleNode の exportDOM と Lexical sanitize が button type を `"button"` に固定する                            | sanitizeRawEmbedHtml の type/disabled は未変更                                          |
| [F-130](2026-08-12-codebase-audit-findings.md#f-130) | 低     | #2303                                      | LEXICAL_ALLOWED_TAGS に sub / sup を追加。公開ページで下付き・上付きが残る                                       | ツールバーボタンは残置                                                                  |
| [F-101](2026-08-12-codebase-audit-findings.md#f-101) | 低     | #2304                                      | root 直下の空段落を URL ペースト対象にする。ネストした空段落では発火しない                                       | —                                                                                       |
| [F-106](2026-08-12-codebase-audit-findings.md#f-106) | 低     | #2305                                      | 繰上げ当選の残り 30 分未満を `reason=too-late` に振り、CRITICAL と期限切れ画面を出さない                         | —                                                                                       |
| [F-104](2026-08-12-codebase-audit-findings.md#f-104) | 低     | #2306                                      | 予約確認の合計を `pricePreview.totalPriceWithTax` + `formatPrice` で描く。STANDARD 再課税をやめた                | SpaceCard / JSON-LD / `resolvePublicDisplayPrice` は範囲外                              |
| [F-105](2026-08-12-codebase-audit-findings.md#f-105) | 低     | #2307                                      | custom / home / about / preview から archive の searchParams を通し、Pagination を page slug 相対にする          | `/blog`・`/news` 本体は当初から forward 済み                                            |
| [F-113](2026-08-12-codebase-audit-findings.md#f-113) | 低     | #2308                                      | GET の DL rate limit を ownership 通過後に移し、他人の serialNo で共有バケットを焼けなくした                     | POST は token 検証後のまま                                                              |
| [F-107](2026-08-12-codebase-audit-findings.md#f-107) | 低     | #2312                                      | 統合成功を `?merged=ok` にし、`/mypage` が定数文言の FlashMessage を出す                                         | —                                                                                       |
| [F-109](2026-08-12-codebase-audit-findings.md#f-109) | 低     | #2312                                      | confirm の `error` をセンチネル対応表だけから引き、未知値は既定文言。生クエリは出さない                          | —                                                                                       |
| [F-111](2026-08-12-codebase-audit-findings.md#f-111) | 低     | #2309                                      | cookie の target mismatch / expiry で 401/410 せず、cookie を捨てて session + 所有権へ                           | —                                                                                       |
| [F-114](2026-08-12-codebase-audit-findings.md#f-114) | 低     | #2310                                      | `to.length !== 1` の bounce / complaint / failed / suppressed では抑止しない。breadcrumb のみ残して 200 ack      | —                                                                                       |
| [F-108](2026-08-12-codebase-audit-findings.md#f-108) | 低     | #2311                                      | profile-form が action の `successMessage` を表示する（初回メール登録の確認案内）                                | —                                                                                       |
| [F-110](2026-08-12-codebase-audit-findings.md#f-110) | 低     | #2311                                      | 同上（固定文言「プロフィールを更新しました」で successMessage を捨てない）                                       | —                                                                                       |
| [F-121](2026-08-12-codebase-audit-findings.md#f-121) | 低     | #2313                                      | bulkMoveFaqItems のカテゴリ再確認を lock 取得直後へ移し、削除済みカテゴリ配下への移動を止めた                    | trash-cleanup の WHERE は足していない                                                   |
| [F-119](2026-08-12-codebase-audit-findings.md#f-119) | 低     | #2316                                      | 非公開 / 非アクティブな Space は会場名だけ出し、`/spaces/<slug>` リンクと JSON-LD `venue.url` を出さない         | createEvent/updateEvent の spaceId 製品判断は未変更                                     |
| [F-122](2026-08-12-codebase-audit-findings.md#f-122) | 低     | #2315                                      | bulk ステータス変更は `updateManyAndReturn` の戻り id だけを confirmed にする。並行同ステータスを誤認しない      | —                                                                                       |
| [F-125](2026-08-12-codebase-audit-findings.md#f-125) | 低     | #2314                                      | `apple-icon` / `opengraph-image` / `twitter-image` を予約。静的単一セグメントルートの drift gate を追加          | —                                                                                       |
| [F-124](2026-08-12-codebase-audit-findings.md#f-124) | 低     | #2317                                      | startTime が変わった 3 経路（顧客セルフ / admin / GCal inbound）で reminderSentAt を null に戻す                 | 列追加は採らず。startTime が同じ保存ではクリアしない                                    |
| [F-126](2026-08-12-codebase-audit-findings.md#f-126) | 低     | #2320                                      | Better Auth deleteUser に deleteTokenExpiresIn: 60 * 60 を明示。文面「1時間」は触らない                          | —                                                                                       |

### 台帳外の修正（監査を起点に入ったが、指摘 ID を持たないもの）

| PR                    | 位置づけ                                                                                                                | 内容                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| #2231 / #2232 / #2233 | [F-01](2026-08-12-codebase-audit-findings.md#f-01) の後続                                                               | 受理側を値の集合にして無停止ローテーションを可能に。手順の欠落 2 点を修正                      |
| #2220 / #2221         | [F-07](2026-08-12-codebase-audit-findings.md#f-07) の周辺                                                               | FAILED 予約の期限に専用列 `paymentFailedAt` を使う                                             |
| #2226                 | 台帳外                                                                                                                  | 一括操作の取り返しのつかない誤爆を止める（F-30 / F-31 以外の経路）                             |
| #2229                 | [構造の穴 A](../superpowers/plans/2026-08-13-codebase-audit-remediation.md#4-構造の穴個別修正では再発するもの) の第一歩 | 自動返金コマンドを実 DB で走らせる層（予約側）。イベント webhook wrapper は `fix/audit-wave-1` |
| `fix/audit-wave-1`    | [構造の穴 B](../superpowers/plans/2026-08-13-codebase-audit-remediation.md#4-構造の穴個別修正では再発するもの)          | `cacheTag` producer と Cache-Tag ヘッダの突合 gate                                             |
| `fix/audit-wave-1`    | [構造の穴 D](../superpowers/plans/2026-08-13-codebase-audit-remediation.md#4-構造の穴個別修正では再発するもの)          | events OFF 中の決済を、復帰後 expire が CANCELLED にしない                                     |
| `fix/audit-wave-1`    | [構造の穴 F](../superpowers/plans/2026-08-13-codebase-audit-remediation.md#4-構造の穴個別修正では再発するもの)          | クーポン release を `releaseCouponUsage` に集約                                                |
| #2238 / #2239 / #2242 | 記録                                                                                                                    | 監査結果と修正計画を repo に入れ、記述を台帳と一致させる                                       |

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
   §2 の見出しにも件数を書かない — 書くと更新のたびに anchor が変わり、
   計画書からのリンクが黙って切れる（実際に `#2-済んだ指摘17-件` のまま切れていた）。
3. 部分的にしか直っていないなら「残件」列に何が残るかを書く。空欄にして済にしない —
   F-03 と F-05 はこの列があるから、次に触る人が残りを見つけられる。
4. 計画書は消化しきったら削除される（[docs/README.md](../README.md) の lifecycle 規約）。
   **このファイルは残す** — 「どの指摘をどの PR で塞いだか」は git log から機械的には引けない。
