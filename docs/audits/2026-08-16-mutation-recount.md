# 第 6 次監査 — 残り変異の数え直し（2026-08-16）

> これは台帳ではなく再評価の記録。台帳は
> [`2026-08-15-round6-mutation-ledger.md`](2026-08-15-round6-mutation-ledger.md)（素通り 61 件の全明細）。
>
> **2026-08-16 追記**: 外部レポートを取得して台帳を repo に取り込んだ。その突き合わせで、
> 下表の M-ID に誤りがあることが分かったため訂正した（内容の記述は正しく、ID だけがずれていた）。
> なお **RED だった 76 件の個別明細は元レポートにも無い**（領域別の集計値のみ）。
> 「全 137 変異の明細」はどこにも存在しない。

## 元の数（2026-08-15 時点）

137 変異中 61 件が素通り。うち 4 件を round6 plan B（関門の実効性）で修正し、
残り約 45 件は「実害が出た時点で個別に拾う」としてレポートに記録された。

出典: `docs/superpowers/plans/2026-08-15-round6-defect-fixes.md` /
`docs/superpowers/plans/2026-08-15-round6-guard-effectiveness.md`。

## 再評価（2026-08-16 時点の main = `35b8c235d`）

| M-ID / クラス                                                                                       | 内容                                                                                                                                      | 現況                                       | 根拠                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M-14（旧記載 M-11）                                                                                 | `checkPermission` の判定ブロック削除が緑                                                                                                  | 修正済み                                   | Task 9（#2344）。実 `hasPermission` を通す unit テスト                                                                                                                    |
| M-13（旧記載 M-12）                                                                                 | `requireAdminPermission` の action 固定化が緑                                                                                             | 修正済み                                   | Task 9（#2344）                                                                                                                                                           |
| M-12（旧記載 M-13）                                                                                 | ページ guard の `await`→`void` が緑                                                                                                       | 修正済み                                   | Task 12（AST gate 化）                                                                                                                                                    |
| M-11                                                                                                | 公開 mutation の 4 段 guard pipeline gate が SSoT 配列 3 handler しか見ず、Turnstile を持つ公開 mutation の 3/18（17%）しか検査していない | **対応済み（this wave; `PR-NUMBER-TBD`）** | 台帳 M-11。SSoT を実 handler 集合に広げ、新設 export が pipeline を外れる変異を検出する                                                                                   |
| M-15 / M-16                                                                                         | surface 越境・prisma import gate が相対パスを素通り                                                                                       | 修正済み                                   | Task 10（解決後パス判定）                                                                                                                                                 |
| M-17                                                                                                | terms/event RBAC gate が総数照合                                                                                                          | 修正済み                                   | Task 11（AST 関数単位）                                                                                                                                                   |
| M-18                                                                                                | ページの resource 降格（`("auditLog")`→`("page")`）が型・gate を通る                                                                      | **表現不能**                               | #2369 + #2370。ページから権限リテラルを撤去し、要求権限の記述は `page-auth.ts` 1 箇所に集約。`__tests__/unit/admin/helpers/page-auth.test.ts` が実 `hasPermission` で固定 |
| composition site の `isEditorRole → true`（3 site）                                                 | 振る舞い中立で原理的に検出不能                                                                                                            | **コード削除で消滅**                       | #2364。`userHasResourceAccess`（全関数）に decision を一本化し前段分岐を除去                                                                                              |
| `resource-access.ts` の predicate 変異群（`isEditorRole` 両方向 / `!resourceId` / `includes` 否定） | 検出不能                                                                                                                                  | 検出可能                                   | #2364。実 predicate テスト（変異 5 件を実測で赤）                                                                                                                         |
| `executeAdminMutationResult` step 4（`checkResourceAccess: true`）未実行                            | どのテストも実行していない                                                                                                                | 実実行済み                                 | #2364。integration テストで EDITOR deny/allow を実測                                                                                                                      |
| session mock の drift（実在しない export）                                                          | 手書き列挙が実物と乖離                                                                                                                    | 除去                                       | #2364。spread-actual 化                                                                                                                                                   |
| RBAC 判定サイトの 3 箇所重複                                                                        | 1 箇所の変異が他 2 箇所に残る                                                                                                             | 一本化                                     | #2371。`authorizeAdmin`。1 変異で 3 層すべて赤を実測                                                                                                                      |
| M-05 / M-07 / M-10 / M-32 / M-33 / M-34 / M-37                                                      | integration には guard がある（unit は無い）                                                                                              | **分割**                                   | M-05 は this wave で unit 側にピン。M-07 / M-10 は下記「据え置き」。M-32 / M-33 / M-34 / M-37 は integration guard 継続                                                   |
| M-04 / M-05 / M-09                                                                                  | claimRefundSettlement 冪等 / Refund insert の非 P2002 throw / 返金集計の entity スコープ                                                  | **対応済み（this wave; `PR-NUMBER-TBD`）** | 台帳 M-04 / M-05 / M-09。unit が WHERE / catch の両方向を固定                                                                                                             |
| M-07 / M-10                                                                                         | `TERMINAL_REFUND_STATUSES` の 3 値 / 返金集計から failed・canceled 除外                                                                   | **据え置き**                               | integration guards が既に存在し、CI の `Unit Tests` = `test:all` がそれらを強制する。unit への二重ピンはしない                                                            |
| M-21                                                                                                | `requireAdminDetailPage` の EDITOR assignment スコープ                                                                                    | **据え置き**                               | #2369 以降、スタッフ詳細は `requireStaffDetailPage(userId)` が必須。EDITOR は `user:read` を持たないため assignment スコープ経路には到達しない                            |
| M-22 / M-26                                                                                         | Cloud Scheduler PAUSED / branch-protection contexts の完全性                                                                              | **据え置き継続**                           | 運用監査でありプロダクト欠陥ではない（round6 plan B）。M-22 は cron PAUSED、M-26 は required check 列挙                                                                   |
| M-22 / M-27 / M-28（旧記載 M-24 / M-25 / M-26）                                                     | GCP 系（PAUSED / maxScale / traffic）の守り手不在                                                                                         | 据え置き継続                               | 実際に起きた欠陥ではない（round6 plan B の除外判断どおり）。M-22 は上表どおり運用監査として据え置き                                                                       |
| M-25 / M-26（旧記載 M-27 / M-28）                                                                   | `branch-protection.json` の paths filter / contexts 検査                                                                                  | 据え置き継続                               | live の branch protection は自動適用されず直接は弱まらない（同）。M-26 は上表どおり運用監査として据え置き                                                                 |
| M-42 / M-44 / M-45 / M-46 / M-47                                                                    | cacheTag 3 点セット / TAGGED_PUBLIC_FIRST_SEGMENTS / NEXTJS→CDN emit 逆引き / purgeMarketingHomeTag / `/access` Cache-Tag                 | **対応済み（this wave; `PR-NUMBER-TBD`）** | 既存 unit に assertion を追加。新 architecture gate は作らない                                                                                                            |
| M-60                                                                                                | 顧客 PII 匿名化の監査ログ                                                                                                                 | **対応済み（this wave; `PR-NUMBER-TBD`）** | 台帳 M-60。cron / command 経路の AuditLog を固定                                                                                                                          |
| 無名の残り（約 45 件とされたもの）                                                                  | 素通り 61 件から上記で名指しされた分を除いた残り                                                                                          | **一覧化済み・方針据え置き**               | [`2026-08-15-round6-mutation-ledger.md`](2026-08-15-round6-mutation-ledger.md) に M-01〜M-61 の全明細。方針は変わらず「実害が出た時点で個別に拾う」                       |

## 母数の変化

2026-08-16 のマージで、今後の変異検査の母数は以下のとおり変わる:

- **RBAC 判定サイト 3 → 1**（#2371）。重複サイトごとの変異は 1 サイトに畳まれる
- **ページ側の resource / action 降格変異は表現不能**（#2369 / #2370）。
  `page-auth.ts` の実装を書き換える変異だけが残り、それは behavioral test が掴む
- **composition site の `isEditorRole` 前段分岐は消滅**（#2364）。
  検出不能なまま残る変異クラスが 1 つ減った

## CI integration 実走の確認

round6 plan B の前提確認（「CI の `test:all` job が実際に integration テストを実行したか」）を
2026-08-16 に check-runs API で実施した。CI の `Unit Tests` job は
`bun run test:all`（unit + integration、`.github/workflows/ci.yml:352`）を実行する。

| PR    | SHA                              | Unit Tests | 結果    |
| ----- | -------------------------------- | ---------- | ------- |
| #2364 | `187f832aa`（main merge commit） | 5m46s      | success |
| #2368 | `b2f6c2c0d`（main merge commit） | 5m39s      | success |
| #2369 | `aec2e70eb`（main merge commit） | 6m50s      | success |
| #2370 | `073976d29`（main merge commit） | 5m04s      | success |
| #2371 | `7e3d74a12`（main merge commit） | 6m06s      | success |
| #2372 | `7567042d4`（PR head）           | 6m03s      | success |
| #2373 | `66658a733`（PR head）           | 6m12s      | success |

unit のみの実行は約 1 分（ローカル実測 44 秒）なので、5〜7 分の実行時間は
integration 込みで実走した証拠になる。「緑だが skip されていた」ではない。

## integration guard の内訳

「unit には守り手が無いが integration にはある」7 件が、それぞれどのテストに守られているか。
出典は台帳の各行（`守るはずだった` 欄と実行ログの注記）。

| M-ID | 不変条件                                       | integration 側の守り手                                                                              |
| ---- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| M-05 | Refund insert の catch は P2002 だけ握りつぶす | `__tests__/integration/domain/payment/refund-duplicate-detection.test.ts`（**片方向のみ**、下記注） |
| M-07 | `TERMINAL_REFUND_STATUSES` の 3 値が SSoT      | `__tests__/integration/domain/payment/refund-status-terminal-guard.test.ts`                         |
| M-10 | 返金集計から failed / canceled を除外          | `__tests__/integration/domain/payment/admin-refund-aggregate-excludes-failed.test.ts`               |
| M-32 | 期間列は開始 <= 終了を DB が強制               | `__tests__/integration/prisma/value-domain-constraints.test.ts:416`                                 |
| M-33 | 同一スペースの稼働予約は時間帯が重複できない   | `__tests__/integration/domain/reservations/restore-status-overlap.test.ts`                          |
| M-34 | `audit_logs` は append-only                    | `__tests__/integration/prisma/append-only-enforcement.test.ts:245`                                  |
| M-37 | `customers.total_spent >= 0`                   | `__tests__/integration/prisma/numeric-column-domains.test.ts`                                       |

**M-05 の注**: this wave で unit 側に「P2002 以外は throw」方向をピンした（`PR-NUMBER-TBD`）。
integration の `refund-duplicate-detection.test.ts` は引き続き P2002 握りつぶし方向。

## this wave クローズ（2026-08-16）

親が PR 番号を埋めるプレースホルダ: `PR-NUMBER-TBD`（sibling PR は並行中のため番号を捏造しない）。

| クラス                                                              | 現況                                                                     |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| M-11 / M-04 / M-05 / M-09 / M-60 / M-42 / M-44 / M-45 / M-46 / M-47 | 対応済み（this wave; `PR-NUMBER-TBD`）                                   |
| M-07 / M-10                                                         | 据え置き（integration guard + CI `test:all`）                            |
| M-21                                                                | 据え置き（`requireStaffDetailPage(userId)`、EDITOR は `user:read` 無し） |
| M-22 / M-26                                                         | 据え置き（運用監査。round6 plan B）                                      |

## この文書を更新するとき

- 台帳（`2026-08-15-round6-mutation-ledger.md`）の M-ID を正本として参照する。
  この文書に M-ID を書くときは台帳と突き合わせる（一度ずれた実績がある）
- 新しい変異検査ラウンドを行ったら、母数の変化とともにここへ追記する
