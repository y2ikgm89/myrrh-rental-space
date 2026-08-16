# 第 6 次監査 — 残り変異の数え直し（2026-08-16）

> これは台帳ではなく再評価の記録。第 6 次監査（2026-08-15、変異検査ラウンド）の
> 137 変異の全リストは外部レポートにのみ存在し、repo には無い。
> ここで扱うのは repo から回復可能な M-ID（round6 の 2 計画書が名指ししたもの）だけ。
> 厳密な全数の再計算には元レポートが必要で、入手できたらこの文書を拡張する。

## 元の数（2026-08-15 時点）

137 変異中 61 件が素通り。うち 4 件を round6 plan B（関門の実効性）で修正し、
残り約 45 件は「実害が出た時点で個別に拾う」としてレポートに記録された。

出典: `docs/superpowers/plans/2026-08-15-round6-defect-fixes.md` /
`docs/superpowers/plans/2026-08-15-round6-guard-effectiveness.md`。

## 再評価（2026-08-16 時点の main = `35b8c235d`）

| M-ID / クラス                                                                                       | 内容                                                                 | 現況                         | 根拠                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M-11                                                                                                | `checkPermission` の判定ブロック削除が緑                             | 修正済み                     | Task 9（#2344）。実 `hasPermission` を通す unit テスト                                                                                                                    |
| M-12                                                                                                | `requireAdminPermission` の action 固定化が緑                        | 修正済み                     | Task 9（#2344）                                                                                                                                                           |
| M-13                                                                                                | ページ guard の `await`→`void` が緑                                  | 修正済み                     | Task 12（AST gate 化）                                                                                                                                                    |
| M-15 / M-16                                                                                         | surface 越境・prisma import gate が相対パスを素通り                  | 修正済み                     | Task 10（解決後パス判定）                                                                                                                                                 |
| M-17                                                                                                | terms/event RBAC gate が総数照合                                     | 修正済み                     | Task 11（AST 関数単位）                                                                                                                                                   |
| M-18                                                                                                | ページの resource 降格（`("auditLog")`→`("page")`）が型・gate を通る | **表現不能**                 | #2369 + #2370。ページから権限リテラルを撤去し、要求権限の記述は `page-auth.ts` 1 箇所に集約。`__tests__/unit/admin/helpers/page-auth.test.ts` が実 `hasPermission` で固定 |
| composition site の `isEditorRole → true`（3 site）                                                 | 振る舞い中立で原理的に検出不能                                       | **コード削除で消滅**         | #2364。`userHasResourceAccess`（全関数）に decision を一本化し前段分岐を除去                                                                                              |
| `resource-access.ts` の predicate 変異群（`isEditorRole` 両方向 / `!resourceId` / `includes` 否定） | 検出不能                                                             | 検出可能                     | #2364。実 predicate テスト（変異 5 件を実測で赤）                                                                                                                         |
| `executeAdminMutationResult` step 4（`checkResourceAccess: true`）未実行                            | どのテストも実行していない                                           | 実実行済み                   | #2364。integration テストで EDITOR deny/allow を実測                                                                                                                      |
| session mock の drift（実在しない export）                                                          | 手書き列挙が実物と乖離                                               | 除去                         | #2364。spread-actual 化                                                                                                                                                   |
| RBAC 判定サイトの 3 箇所重複                                                                        | 1 箇所の変異が他 2 箇所に残る                                        | 一本化                       | #2371。`authorizeAdmin`。1 変異で 3 層すべて赤を実測                                                                                                                      |
| M-05 / M-07 / M-10 / M-32 / M-33 / M-34 / M-37                                                      | integration には guard がある（unit は無い）                         | 据え置き（緩和策を確認済み） | 下記「CI integration 実走の確認」                                                                                                                                         |
| M-24 / M-25 / M-26                                                                                  | GCP 系（PAUSED / maxScale / traffic）の守り手不在                    | 据え置き継続                 | 実際に起きた欠陥ではない（round6 plan B の除外判断どおり）                                                                                                                |
| M-27 / M-28                                                                                         | `branch-protection.json` の contexts 検査                            | 据え置き継続                 | live の branch protection は自動適用されず直接は弱まらない（同）                                                                                                          |
| 無名の残り（約 45 件とされたもの）                                                                  | —                                                                    | **数え直し不能**             | 全リストは外部レポートのみ。方針は変わらず「実害が出た時点で個別に拾う」                                                                                                  |

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

## この文書を更新するとき

- 外部レポートを入手したら、無名の残りを個別行に展開して上表に統合する
- 新しい変異検査ラウンドを行ったら、母数の変化とともにここへ追記する
