---
paths:
  - __tests__/**
  - e2e/**
  - src/**/*.test.ts
  - src/**/*.spec.ts
---

# Bun パターンルール

> Bun 1.3.x / Bun Test ランタイム対応

## テストフレームワーク（Bun Test）

### 基本インポート

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

### 基本テスト構造

```typescript
import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "bun:test";

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

## モック

### 関数モック（mock()）

```typescript
import { mock } from "bun:test";

// NG: Vitest
const fn = vi.fn();
const fn = vi.fn(() => "value");

// OK: Bun — 型パラメータで引数・戻り値を明示
const fn = mock<() => string>();
const fn = mock<(id: string) => Promise<User | null>>();
const fn = mock(() => "value");
const fn = mock(() => Promise.resolve({ id: "1" }));

// モック呼び出し後のアサーション
expect(fn).toHaveBeenCalled();
expect(fn).toHaveBeenCalledTimes(2);
expect(fn).toHaveBeenCalledWith("arg1", "arg2");
expect(fn.mock.calls).toEqual([["arg1"], ["arg2"]]);
expect(fn.mock.results[0]).toEqual({ type: "return", value: "result" });
```

### モジュールモック（mock.module()）

**重要**: `mock.module()` はモジュールの import 文より**前**に呼ぶ必要がある（TDZ 回避のためモック関数を先に定義）。

```typescript
import { mock } from 'bun:test'

// NG: Vitest
vi.mock('@/shared/lib/prisma', () => ({ ... }))

// OK: Bun — 呼び出し順序が重要
// 1. モック関数を先に定義（TDZ 回避）
const mockFindUnique = mock<() => Promise<User | null>>(() => Promise.resolve(null))

// 2. mock.module() でモジュールを差し替え（import より前）
mock.module('@/shared/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: mockFindUnique,
    },
  },
}))

// 3. テスト対象を import（モック適用後）
import { getUser } from '@/admin/actions/user'
```

### スパイ（spyOn）

```typescript
import { spyOn } from "bun:test";

// NG: Vitest
vi.spyOn(obj, "method");

// OK: Bun
const spy = spyOn(console, "error");
const spy = spyOn(obj, "method");

// spy はオリジナルの動作を保持しつつ呼び出しを記録
expect(spy).toHaveBeenCalled();
expect(spy).toHaveBeenCalledWith("error message");
```

### モックリセット

```typescript
import { mock, beforeEach, afterEach } from "bun:test";

// NG: Vitest
vi.restoreAllMocks();
vi.clearAllMocks();
vi.resetModules();

// OK: Bun

// 呼び出し記録をクリア（実装は保持）
fn.mockClear();

// 呼び出し記録 + 実装を完全リセット
fn.mockReset();

// mock.module() のモジュールキャッシュを復元
mock.restore();

// --- パターン例 ---

// mock.module() 使用時: afterEach で mock.restore()
afterEach(() => {
  mock.restore();
});

// モック関数の呼び出し記録だけ消したい場合: mockClear()
beforeEach(() => {
  mockFindUnique.mockClear();
});

// 前のテストの戻り値設定も含めてリセット: mockReset() + デフォルト値再設定
beforeEach(() => {
  mockGetSession.mockReset();
  mockGetSession.mockResolvedValue(null); // デフォルト値を再設定
});
```

## Vitest API 禁止一覧

| 禁止（Vitest）               | 代替（Bun）                      | 備考                                 |
| ---------------------------- | -------------------------------- | ------------------------------------ |
| `vi.fn()`                    | `mock()`                         | `bun:test` からインポート            |
| `vi.fn(() => value)`         | `mock(() => value)`              |                                      |
| `vi.mock('module', factory)` | `mock.module('module', factory)` | import より前に呼ぶ                  |
| `vi.spyOn(obj, 'method')`    | `spyOn(obj, 'method')`           | `bun:test` からインポート            |
| `vi.restoreAllMocks()`       | `mock.restore()`                 | モジュールモック復元                 |
| `vi.clearAllMocks()`         | `mock.clearAllMocks()`           | 全モック状態をリセット（実装は保持） |
| `vi.resetAllMocks()`         | `mockFn.mockReset()`             | 個別に呼ぶ                           |
| `vi.resetModules()`          | 不要（`mock.restore()` で対応）  |                                      |
| `vi.mocked(fn)`              | 型は `mock<T>()` で付与          |                                      |
| `vi.importMock('module')`    | 未サポート                       | `mock.module()` を使う               |

### Symbol.dispose（`using` キーワードによる自動クリーンアップ）

Bun の `mock()` と `spyOn()` は `Symbol.dispose` を実装しており、`using` キーワードで自動的に `mockRestore()` が呼ばれる。`afterEach` でのクリーンアップが不要になる:

```typescript
import { test, expect, spyOn } from "bun:test";

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

## DOM 環境（`jsdom` + Lexical）

- **`bunfig.toml`**: `preload = ["./__tests__/setup-dom.ts", "./__tests__/setup.ts"]` で全テストの前に [jsdom](https://github.com/jsdom/jsdom) を起動する
- **`__tests__/setup-dom.ts`**: `window` / `document` / `Element` 等を `globalThis`（および Node の `global`）へ設定。[`@lexical/html` の `$generateHtmlFromNodes`](https://lexical.dev/docs/packages/lexical-html) は未定義 DOM で失敗するため **happy-dom では代替しない**
- **並列テストでグローバルが壊れた場合**: `setup-dom.ts` が export する `installJSDOMForTests()` を、当該ファイルの `beforeEach` で呼び出す（Lexical headless HTML の smoke テストで使用）

## 環境変数のモック

テストごとに環境変数を変更する場合は `beforeAll` / `afterAll` でオリジナルを保存・復元する。

```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";

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

## Server Actions テスト

Server Actions の直接テスト（認証・Prisma・Next.js API 依存）は統合テストとして行う。
`mock.module()` で依存モジュールを差し替え、アクション関数を直接呼び出す。

```typescript
import { describe, test, expect, mock, beforeEach } from "bun:test";

// 1. モック関数を先に定義
const mockGetSession = mock<() => Promise<MockSession | null>>();
const mockFindUnique = mock<() => Promise<Record<string, unknown> | null>>(() =>
  Promise.resolve(null),
);
const mockCreate = mock<() => Promise<Record<string, unknown>>>();

// 2. 依存モジュールを差し替え（import より前）
mock.module("@/shared/lib/auth", () => ({
  getSession: () => mockGetSession(),
}));
mock.module("@/shared/lib/prisma", () => ({
  prisma: {
    post: {
      findUnique: mockFindUnique,
      create: mockCreate,
    },
  },
}));
mock.module("next/cache", () => ({
  revalidateTag: mock(() => {}),
  updateTag: mock(() => {}),
}));
mock.module("next/headers", () => ({
  headers: mock(() => new Headers()),
}));

// 3. テスト対象をインポート
import { createPost } from "@/admin/actions/post";
import { createMockSession } from "../../mocks/auth";

describe("createPost", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockCreate.mockReset();
  });

  test("ADMIN は作成できる", async () => {
    // Arrange
    mockGetSession.mockResolvedValueOnce(
      createMockSession({ role: Role.ADMIN }),
    );
    mockCreate.mockResolvedValueOnce({ id: "new-post-id", title: "テスト" });

    // Act
    const result = await createPost(VALID_INPUT);

    // Assert
    expect(result.success).toBe(true);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  test("未認証はエラーを返す", async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const result = await createPost(VALID_INPUT);

    expect(result.success).toBe(false);
  });
});
```

> **詳細リファレンス（モック詳細実装・Bun ランタイム API）**: `docs/reference/claude-rules/bun-test-reference.md`

---

## ファイル配置と命名規則

| パス                                   | 内容                                       | ファイル形式 |
| -------------------------------------- | ------------------------------------------ | ------------ |
| `__tests__/unit/`                      | 単体テスト（純粋関数・ユーティリティ）     | `*.test.ts`  |
| `__tests__/unit/lib/`                  | ライブラリ関数のテスト                     | `*.test.ts`  |
| `__tests__/unit/components/`           | コンポーネントのテスト                     | `*.test.ts`  |
| `__tests__/unit/lib/validations/`      | Zodスキーマバリデーションのテスト          | `*.test.ts`  |
| `__tests__/integration/`               | 統合テスト（Server Actions・API）          | `*.test.ts`  |
| `__tests__/integration/actions/admin/` | 管理画面アクションの統合テスト             | `*.test.ts`  |
| `__tests__/integration/api/`           | API Route Handler の統合テスト             | `*.test.ts`  |
| `__tests__/mocks/`                     | モック定義（共有）                         | `*.ts`       |
| `__tests__/mocks/index.ts`             | バレルエクスポート                         |              |
| `__tests__/mocks/prisma.ts`            | Prisma Client モック                       |              |
| `__tests__/mocks/auth.ts`              | Better Auth モック                         |              |
| `__tests__/mocks/next.ts`              | Next.js API モック                         |              |
| `__tests__/mocks/resend.ts`            | Resend メールモック                        |              |
| `__tests__/setup-dom.ts`               | JSDOM プリロード（`installJSDOMForTests`） |              |
| `__tests__/setup.ts`                   | グローバルセットアップ（環境変数）         |              |

### テストファイル命名

- 対象ファイルパスに対応した名前をつける
- `src/shared/lib/crypto.ts` → `__tests__/unit/lib/crypto.test.ts`
- `src/app/(admin)/.../actions/space.ts` → `__tests__/integration/actions/admin/space.test.ts`

## コマンド

```bash
# 全テスト実行
bun run test

# ウォッチモード（開発中）
bun run test:watch

# カバレッジ計測
bun run test:coverage

# 単体テストのみ
bun run test:unit

# 統合テストのみ
bun run test:integration

# 並列実行（CI推奨）
bun run test:all

# 特定ファイルのみ
bun test __tests__/unit/lib/crypto.test.ts

# パターンマッチ
bun test --test-name-pattern "暗号化"
```

## カバレッジ設定

### bunfig.toml での閾値設定

```toml
[test]
coverageThreshold = { line = 80, function = 80, statement = 80 }
coverageReporter = ["lcov", "text"]
```

- `coverage/` ディレクトリは `.gitignore` に追加推奨（自動生成ファイル）
- `text` レポーターはターミナルに直接出力（開発中の即時確認用）
- `lcov.info` を CI で Codecov / Coveralls に送信可能

### 実行例

```bash
bun run test:coverage                  # coverage/ に lcov.info + ターミナル出力
bun run test:coverage __tests__/unit   # 特定ディレクトリのみ計測
```

---

## 副作用なし純粋モジュールはモック不要

`@/shared/lib/constants`（CACHE_TAGS, getCacheTag, CACHE_LIFE）と `@/shared/lib/route-responses` は DB 依存も `server-only` 依存もない。`mock.module` すると不完全なモックがグローバル干渉して他テストファイルを壊す。実モジュールをそのまま import して使用する。

## mock.calls 直接アクセス禁止

```typescript
// NG: noUncheckedIndexedAccess + as 禁止に違反
const arg = mockFn.mock.calls[0]?.[0];
const data = (arg as Record<string, unknown>)["data"];

// OK: expect.objectContaining パターン
expect(mockFn).toHaveBeenCalledWith(
  expect.objectContaining({
    data: expect.objectContaining({ field: value }),
  }),
);
```

## exactOptionalPropertyTypes 対応

```typescript
// NG: optional プロパティに undefined を明示渡し
createCommand({ customerId: undefined, name: "test" });

// OK: キーを省略
createCommand({ name: "test" });
```

---

## 禁止事項

1. **`vi.*` API の使用禁止**
   - `vi.fn()`, `vi.mock()`, `vi.spyOn()`, `vi.restoreAllMocks()` は Vitest 専用
   - `bun:test` の `mock()`, `mock.module()`, `spyOn()` を使用

2. **`mock.module()` を import より後に呼ぶことを禁止**
   - TDZ（Temporal Dead Zone）の問題が発生する
   - モック関数定義 → `mock.module()` → `import` の順序を守る

3. **モックのリセット漏れ禁止**
   - テスト間でモック状態が漏れると偽陽性の原因になる
   - `beforeEach` で `mockReset()` または `mockClear()` を呼ぶ

4. **型なしモック関数の使用禁止**
   - `mock()` は型パラメータを明示する: `mock<() => Promise<User | null>>()`
   - 型なしは `never[]` 等の推論ミスを引き起こす

5. **テストの削除・無効化禁止**
   - `test.skip()` / `test.only()` をコミットしない
   - 失敗するテストは原因を調査して修正する

6. **`bunfig.toml [test]` の `conditions` キーは機能しない**
   - Bun はこのキーを無視する
   - `bun test --conditions=react-server` は CLI フラグとして機能するが、React を server build に解決して `createContext`・`useRef` が消えるため `server-only` 対策には**使わない**こと
   - `server-only` 対策は `__tests__/setup.ts` の `mock.module('server-only', () => ({}))` で対処（設定済み）

## Gotchas

- **`mock.module()` のグローバルスコープ干渉** — 複数テストファイルを同時実行すると、ファイル A の `mock.module("@/shared/lib/foo", ...)` がファイル B の実 import を上書きし、`Export named 'X' not found` エラーやハングを引き起こす。対策: (1) モック対象モジュールの**全 export をモックに含める**（使わない関数もスタブで返す）。(2) `package.json` の `test` スクリプトでディレクトリ別に分離実行（`bun test __tests__/unit/lib && bun test __tests__/unit/api && ...`）。特に `@/shared/db/enums`, `@/shared/lib/errors/server`, `@/shared/lib/crypto`, `@/shared/lib/route-responses`, `@/shared/lib/constants` は複数テストでモックされるため全 export 必須。単独実行（`bun test <file>`）では問題なし
- **`Promise.reject()` が `fireAndForget` テストで "Unhandled error between tests"** — `Promise.reject()` は即座に rejected になり、`fireAndForget` の `.catch()` 登録前に Bun が未処理として検出する場合がある。`queueMicrotask(() => reject(error))` で遅延拒否し、`.catch()` が先に登録されるようにする

## 参考

- [Bun Test ドキュメント](https://bun.sh/docs/cli/test)
- [Bun mock.module()](https://bun.sh/docs/test/mocks#mock-module)
- `__tests__/setup.ts` — グローバルセットアップ
- `__tests__/mocks/` — プロジェクト共有モック
