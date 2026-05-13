---
description: Bun Test 基本構造 + DOM 環境 (jsdom) + 環境変数モック + Symbol.dispose (using) + ファイル配置 + コマンド + カバレッジ
paths:
  - __tests__/**
  - bunfig.toml
---

# Bun Test ランタイム基礎

> 基本インポート + describe/test 構造 + jsdom DOM + 環境変数モック + `using` キーワード + ファイル配置 + コマンド。

## 基本インポート

Bun Test は `bun:test` からインポートする。

**Bun は Vitest 互換エイリアス（`vi.fn()` / `vi.spyOn()` / `vi.mock()` 等）を提供しているが、プロジェクトではネイティブ API を使用する**。理由: ネイティブ API を使うことで Bun 固有の機能（`mock.restore()` / `Symbol.dispose` 等）を明示的に利用でき、コードベースの一貫性が保たれるため。

```typescript
import {
  describe,
  test,
  expect,
  mock,
  spyOn,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "bun:test";
```

**注意**: `import { vi } from 'vitest'` や `import { vi } from 'bun:test'` は存在しない。`vi` は Vitest 専用 API。

## 基本テスト構造

```typescript
describe("モジュール名 or 機能名", () => {
  beforeAll(() => {
    // テストファイル全体で1回だけ実行（DB接続、環境変数設定）
  });

  afterAll(() => {
    // テストファイル全体で1回だけ実行（クリーンアップ）
  });

  beforeEach(() => {
    // 各テスト前に実行（モックリセット、状態初期化）
  });

  afterEach(() => {
    // 各テスト後に実行（副作用クリーンアップ）
  });

  describe("正常系", () => {
    test("期待する動作を日本語で記述", () => {
      const result = someFunction();
      expect(result).toBe(expected);
    });

    test("非同期処理", async () => {
      const result = await asyncFunction();
      expect(result).toEqual({ id: "1", name: "test" });
    });
  });

  describe("異常系", () => {
    test("エラーをスローする", () => {
      expect(() => invalidFunction()).toThrow("エラーメッセージ");
    });
  });
});
```

## DOM 環境（`jsdom` + Lexical）

- **`bunfig.toml`**: `preload = ["./__tests__/setup-dom.ts", "./__tests__/setup.ts"]` で全テストの前に [jsdom](https://github.com/jsdom/jsdom) を起動する
- **`__tests__/setup-dom.ts`**: `window` / `document` / `Element` 等を `globalThis`（および Node の `global`）へ設定。[`@lexical/html` の `$generateHtmlFromNodes`](https://lexical.dev/docs/packages/lexical-html) は未定義 DOM で失敗するため **happy-dom では代替しない**
- **並列テストでグローバルが壊れた場合**: `setup-dom.ts` が export する `installJSDOMForTests()` を、当該ファイルの `beforeEach` で呼び出す（Lexical headless HTML の smoke テストで使用）

## 環境変数のモック

テストごとに環境変数を変更する場合は `beforeAll` / `afterAll` でオリジナルを保存・復元する。

```typescript
describe("crypto", () => {
  const originalKey = process.env["ENCRYPTION_KEY"];
  const testKey = "a".repeat(64); // 64文字の16進数

  beforeAll(() => {
    process.env["ENCRYPTION_KEY"] = testKey;
  });

  afterAll(() => {
    if (originalKey) {
      process.env["ENCRYPTION_KEY"] = originalKey;
    } else {
      delete process.env["ENCRYPTION_KEY"];
    }
  });

  test("暗号化できる", () => {
    const encrypted = encrypt("secret");
    expect(encrypted).toContain(":");
  });
});
```

**注意**: `process.env['KEY']` でアクセス（ブラケット記法）。`__tests__/setup.ts` でグローバルに `NODE_ENV` 等を設定済み。

## Symbol.dispose（`using` キーワードによる自動クリーンアップ）

Bun の `mock()` と `spyOn()` は `Symbol.dispose` を実装しており、`using` キーワードで自動的に `mockRestore()` が呼ばれる。`afterEach` でのクリーンアップが不要になる:

```typescript
// OK: using キーワードでスコープ終了時に自動クリーンアップ
test("console.error をスパイ（自動復元）", () => {
  using spy = spyOn(console, "error"); // スコープ終了時に mockRestore() が自動呼び出し
  doSomething();
  expect(spy).toHaveBeenCalledWith("expected error");
  // ← ここで spy.mockRestore() が自動実行
});

// OK: mock() でも同様
test("関数を一時的にモック", () => {
  using fn = mock(() => "mocked");
  expect(fn()).toBe("mocked");
});

// 従来パターン（afterEach が必要 — 複数テストで共有するモックに使用）
const spy = spyOn(console, "error");
afterEach(() => {
  spy.mockRestore();
});
```

**使い分け**: テストスコープに閉じるモックは `using` キーワード推奨。複数テストで共有・設定が必要なモックは従来パターン。

## ファイル配置と命名規則

| パス                                   | 内容                                       | ファイル形式 |
| -------------------------------------- | ------------------------------------------ | ------------ |
| `__tests__/unit/`                      | 単体テスト（純粋関数・ユーティリティ）     | `*.test.ts`  |
| `__tests__/unit/lib/`                  | ライブラリ関数のテスト                     | `*.test.ts`  |
| `__tests__/unit/components/`           | コンポーネントのテスト                     | `*.test.ts`  |
| `__tests__/unit/lib/validations/`      | Zod スキーマバリデーションのテスト         | `*.test.ts`  |
| `__tests__/integration/`               | 統合テスト（Server Actions・API）          | `*.test.ts`  |
| `__tests__/integration/actions/admin/` | 管理画面アクションの統合テスト             | `*.test.ts`  |
| `__tests__/integration/api/`           | API Route Handler の統合テスト             | `*.test.ts`  |
| `__tests__/mocks/`                     | モック定義（共有）                         | `*.ts`       |
| `__tests__/setup-dom.ts`               | JSDOM プリロード（`installJSDOMForTests`） |              |
| `__tests__/setup.ts`                   | グローバルセットアップ（環境変数）         |              |

### テストファイル命名

- 対象ファイルパスに対応した名前をつける
- `src/shared/lib/crypto.ts` → `__tests__/unit/lib/crypto.test.ts`
- `src/app/(admin)/.../actions/space.ts` → `__tests__/integration/actions/admin/space.test.ts`

## コマンド

```bash
# 単一ファイル実行（日常の開発はこれで十分）
bun test __tests__/unit/lib/crypto.test.ts
bun test --watch __tests__/unit/lib/crypto.test.ts   # TDD watch（単一ファイル指定必須）
bun test --bail=1 <file>                             # 最初の失敗で停止
bun test --test-name-pattern "暗号化"                 # 名前フィルター

# per-file isolation（フル実行時 / CI 必須）
bun run test:unit          # 全 unit を scripts/run-tests.mjs 経由で per-file 実行
bun run test:integration   # 全 integration を per-file 実行
bun run test:all           # unit + integration（sequential）
```

- **禁止**: `bun run test` / `bun run test:watch` / `bun run test:coverage` は廃止
- **禁止**: `bun test __tests__/unit`（親ディレクトリ指定）/ `bun test --watch`（パス未指定）は再帰実行で `mock.module` 干渉を誘発
- **禁止**: `package.json` の `test:unit` / `test:integration` を per-directory `&&` チェーンに戻す（mock.module 干渉が再発する SSoT 違反）
- **テスト実行ポリシー**: 毎回全走させる必要なし。lefthook pre-push + CI が担保（`CLAUDE.md` §検証）

## per-file isolation runner（`scripts/run-tests.mjs`）

bun:test の `mock.module()` は process-global に **live binding** を残す公式仕様（[Bun docs §Module Mocking](https://bun.com/docs/test/mocks)）。同一 `bun test` 起動で複数 \*.test.ts を走らせると、先行 file の `mock.module("@/shared/lib/foo", ...)` が後続 file の実 import を上書きし、`Export named 'X' not found` / 偽陽性 fail / 同名モジュール mock の re-bind 不能を引き起こす。

per-directory `&&` チェーンでも 1 ディレクトリ内に複数 _.test.ts があれば干渉する（過去 30 run 連続 CI failure の主因、78 件規模の偽陽性 fail）。`scripts/run-tests.mjs` で各 _.test.ts を **独立した bun サブプロセス**で順次起動し、干渉を物理的に排除する:

```bash
bun scripts/run-tests.mjs __tests__/unit         # 全 *.test.ts を再帰探索 → 個別起動
bun scripts/run-tests.mjs __tests__/integration
bun scripts/run-tests.mjs __tests__/unit __tests__/integration  # 複数 dir 連結
```

実装は Node ESM (`node:fs` + `node:child_process.spawnSync`) で書かれ Bun が実行する。各 file の pass/fail を `[run-tests] (N/M) PASS path` で出力、最後に集計（`done: X passed, Y failed in Zs`）+ failed file 一覧を表示。1 file でも fail すれば exit 1。

**ローカル実行コスト**: 1 file あたり ~700-1000ms (bun startup + Prisma client init) × 200+ files → 全 unit 約 4 分。CI ubuntu-latest では並列化なしで完走可能。

**禁止**: 同じ目的を `vitest --isolate` 等で代替（プロジェクトは Vitest 不使用、Bun runner SSoT）。

詳細は `.claude/rules/bun-patterns/mocking.md` §mock.module の live binding 仕様 を参照。

## カバレッジ

Coverage は per-directory batch と非互換（複数プロセス間で lcov が上書き / `mock.module` で計測値が歪む）。CI ゲートは置かない。`bunfig.toml` の coverage 関連設定は撤去済み。

必要時のみ単発で参考値を取得:

```bash
bun test --coverage __tests__/unit/lib/crypto.test.ts    # 単一ファイルのみ
```

- 複数ファイル計測 / 閾値ゲート運用は**しない**
- Codecov / Coveralls 連携も行わない（CI 側で artifact 化しない方針）
