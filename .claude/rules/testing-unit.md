---
paths:
  [
    "__tests__/**",
    "scripts/run-tests.ts",
    "scripts/test-db-runner-env.ts",
    "scripts/test-db-url.ts",
    "scripts/migrate-test-db.ts",
    "bunfig.toml",
  ]
---

# unit / integration テスト（bun test）

## 実行は必ず runner 経由

`bun scripts/run-tests.ts <path...>`（`test:unit` / `test:integration` の実体）。
各 `*.test.ts` を独立した `bun test --conditions production` サブプロセスで起動する。

- 素の `bun test <dir>` 禁止: `mock.module()` の process-global live binding が
  ファイル間干渉する
- `--conditions production` がないと Lexical（全 14 @lexical パッケージ）の
  循環 ESM import が TDZ violation で落ちる
- coverage を bunfig.toml に常設しない（per-file runner と干渉し不正確）。
  必要時は単発 `bun test --coverage <file>` を参考値として使う

## mock パターン

- `mock.module()` を先に宣言し、テスト対象は宣言後に `await import(...)` で
  動的 import する（静的 import は mock 適用前に評価される）
- preload（`__tests__/setup.ts`）が server-only の no-op 化・DATABASE_URL のダミー固定・
  暗号化キー mock を行う。`__tests__/mocks/` の共有 mock は現在未使用で、
  ファイルローカル mock が現行スタイル
- JSDOM が必要なテストは `installJSDOMForTests()` を beforeEach で再適用できる

## 実 DB 統合テスト（要 Postgres）

- 新規の実 DB テストは `scripts/test-db-runner-env.ts` の SERIAL_DB_TESTS に
  **フルパス登録必須**（未登録だと parallel bucket に入り共有 DB で競合する）
- preload が DATABASE_URL をダミーに固定するため、prisma gateway を
  **動的 import する前に** `process.env.DATABASE_URL` を TEST_DATABASE_URL で上書きする
  （gateway は module load 時 snapshot を読む）
- afterAll で `basePrisma.$disconnect()`（しないとサブプロセスがハング）
- TEST_DATABASE_URL 未設定での直接実行は describe.skip で **silent skip** される
  （runner 経由なら docker compose の既定値 localhost:5433/myrrh_test が自動注入）
- 並行競合の再現テストは beforeAll で warmup 並行バーストが必要
  （cold connection では競合が偶発的に直列化して隠れる）
- 遅いテストは `test(name, fn, 30_000)` のように第 3 引数で per-test timeout を
  明示上書きする（既定 5000ms）

## 静的ゲートの分担

`__tests__/**` は ESLint 対象外。テストコードの静的ゲートは tsconfig.test.json の
型チェック（`bun run type-check` の tsc:test）のみ。命名は `*.test.ts`
（`*.spec.ts` は Playwright 用で runner に拾われない）。
