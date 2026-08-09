---
paths:
  - "__tests__/**"
  - "scripts/run-tests.ts"
  - "scripts/serial-db-test-detection.ts"
  - "scripts/migrate-test-db.ts"
  - "bunfig.toml"
---

# 単体・統合テスト

`bun test` を **`scripts/run-tests.ts`（per-file 隔離ランナー）経由でのみ**動かす。

```sh
bun scripts/run-tests.ts __tests__/unit/lib/crypto.test.ts   # 1 ファイル
bun run test:unit                                            # __tests__/unit 全部
bun run test:integration                                     # test-db に migrate してから
bun run test:all
```

- **素の `bun test <path>` は禁止。** `mock.module()` はプロセスグローバルに
  live binding を残す公式仕様で、ランナーはファイルごとに別プロセスを起動して
  それを物理的に断ち切っている。Lexical の循環 import による TDZ も
  ランナーの `--conditions production` が回避している。
- **親ディレクトリ指定も禁止**（`__tests__/unit` / `__tests__/integration` の
  トップレベルを除く）。同じ理由。
- per-test timeout は `run-tests.ts` の `DEFAULT_TEST_TIMEOUT_MS`（30s）が
  唯一の決定。呼び出し側で別の値を渡さない（pre-push と CI で値がずれる）。

## 実 DB を使う統合テスト

別インスタンス（`test-db`、既定 5433）に対して走る。`test:integration` /
`test:all` は先に migrate を当てる。

`scripts/serial-db-test-detection.ts` が `__tests__/integration/**` を走査し、
`TEST_DATABASE_URL` / `DATABASE_URL` の上書きマーカーを持つファイルを
**直列バケット**に振り分ける（`prisma` を `mock.module` するファイルは除外）。
マーカーが無いと並列実行されて書き込みが競合する。`describeMaybe` パターンを
使う新しい実 DB テストは、マーカーを付けるか `FORCE_INCLUDE` に登録する。

実 DB テストで踏みやすいもの:

- `expect(promise).rejects` が Bun 1.3.14 でハングする。`try` / `catch` で書く。
- `fireAndForget` を連続で呼ぶテストは Prisma の pool を占有し、2 回目が
  `maxWait` timeout になる。間に短い sleep を挟んで drain する。
- `orderBy` を付けない `findMany` は物理行順。UPDATE で変わるので、共有 DB で
  全件の順序を assert しない。
- 0 件ヒットの DELETE / UPDATE は行レベル trigger を発火させない。
  「実 DB で通った」の証拠にならない。
- `DEFERRABLE` な制約と Prisma の個別 autocommit の組み合わせで、期待した順序に
  ならないことがある。

## ゲート（`__tests__/unit/architecture/`）を書くとき

このリポジトリの規約はほぼ全部ここで機械強制している。書き足すときの決まり:

1. **走査して「違反 0 件」を assert するゲートには fixture を添える。**
   走査対象が 0 件でも緑になるので、「調べて違反が無かった」と「調べる対象が
   無かった」を区別できない。ESLint の
   `local/gate-scan-must-not-be-silently-empty` が構造的に強制する。
2. **fixture は実装を変異させて落ちることを確認するまで無検証。**
   「通ってはいけない書き方」を実際に食わせる。
3. **正規表現でチェーンの順序は見られない。** 末尾への `.trim()` 追記のような
   順序の問題は AST（`typescript` の parser）で見る。正規表現を 2 回広げたら
   それが AST へ移る合図。
4. **静的ゲートの走査範囲を規約の記述場所に合わせない。** `src` 全体を見る。
   手書きのディレクトリ一覧は必ず漏れる。
5. **migration 名・ファイル名を allowlist に書かない。** 履歴は baseline へ
   畳まれるので名指しは嘘になる。件数の ratchet にする。
6. 自己検査を実データ件数で書かない。正しい状態変化で落ちる。見本入力で見る。
7. 「これは `X.test.ts` が検証する」と書くなら `X.test.ts` は実在すること
   （`__tests__/unit/architecture/referenced-gates-exist.test.ts`）。

## モック

- 時計を読まない純粋モジュールを `mock.module` しない。`mock.module` は
  完全置換なので、無関係なテストを壊し JST/UTC のバグを隠す。
- 共通モジュールに export を足したら、それを `mock.module` している箇所を
  全部洗い出して同時に更新する（欠けると transitive に読む全テストが落ちる）。
  グローバルなモックは `__tests__/setup.ts`。
- ロックやトランザクションの外にある外部 API 呼び出しについて、並行テストで
  呼び出し回数を固定 assert しない（必ず flaky になる）。idempotency key の
  一致と遅延プローブで表現する。
