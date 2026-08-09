---
paths:
  - "__tests__/**"
  - "e2e/**"
---

# テストの規約

## 走らせ方

`scripts/run-tests.ts` が唯一の入口。ファイル単位でサブプロセスに隔離し、
`--conditions production` と 30 秒 timeout を付けて起動する。

```bash
bun run test -- __tests__/unit/<path>.test.ts   # 単一ファイル
bun scripts/run-tests.ts __tests__/unit/architecture  # ディレクトリ（再帰展開）
```

- 素の `bun test` は hook が deny する（`mock.module` のプロセスグローバル汚染と
  Lexical の循環 import による TDZ を runner が回避しているため）。
- ディレクトリ指定は**禁止ではない**。pre-push 自身が `__tests__/unit/architecture`
  をディレクトリで渡している。
- `bun run test:unit -- <file>` では絞れない（引数が追記されるだけ）。

## 型情報を使う lint は `__tests__/**` に効かない

`no-floating-promises` / `no-unsafe-*` / `require-await` などは適用外。
型で守られていない前提で書く。

## mock.module

完全置換なので、共有モジュールを差し替えるときは **実モジュールを spread するか、
named export を全列挙するか**のどちらか。部分だけ返すと、そのモジュールの他の
export を使う実装が壊れる。1 つの export だけ差し替えたいなら `spyOn` を使う。

`__tests__/mocks/` と `__tests__/helpers/` に既存のヘルパーがある。新しく書く前に探す。

## 実 DB を使うテスト

- 置き場は `__tests__/integration/**`。
- ローカルは 5433 の `test-db`、CI は 5432 の単一 Postgres を dev/test 兼用にする。
  **CI 固有の失敗をローカルで再現するときはこの差が効く。**
- runner は serial DB テストを検出して直列バケットに隔離する。検出は
  `TEST_DATABASE_URL` / `DATABASE_URL` を上書きするパターンを見ており、
  **この marker が無いと並列バケットに入って書き込みが競合する**。これは
  機械強制されていないので、実 DB を触るテストを書いたら marker を必ず置く。
- 「緑だった」を根拠にするのは runner 経由で走らせたときだけ。

## E2E

- ページ URL は `e2e/fixtures/test-data.ts` の `urls` が SSoT。spec にパスを
  直書きしない（これは**強制されていない**ので手で守る）。
- `extraHTTPHeaders` と `x-forwarded-for` の直書きは gate が落とす。client IP は
  共有 fixture が割り当てる。
  強制: `__tests__/unit/architecture/e2e-client-ip-allocation.test.ts`
- `bun run e2e` は既存サーバーを再利用せず、毎回 migrate → seed → build → start を
  流し直す。手動起動中の dev サーバーが 3000 を占有していると必ず落ちる。
- project は多数あり、大半が setup と mutator project に依存する。
  `--project=<one>` を指定しても依存 project が先に走る。
