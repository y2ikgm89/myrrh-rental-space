---
description: Bun Test の mock / spyOn / mock.module パターン + Vitest API 禁止表 + Server Actions 統合テスト + 純粋モジュール非モック / mock.module 連続呼び出し / mock.calls 直接アクセス禁止
paths:
  - __tests__/**
  - __tests__/mocks/**
---

# Bun Test モッキングパターン

> `mock()` 関数モック / `spyOn()` / `mock.module()` モジュール差し替え + Vitest API 対応表 + Server Actions 統合テストパターン + 純粋モジュール非モック規律。

## 関数モック（mock()）

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

## モジュールモック（mock.module()）

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

## スパイ（spyOn）

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

## fetch / setTimeout の spyOn パターン

- **`typeof fetch` mock は `as unknown as typeof globalThis.fetch` キャスト helper 必須** — `spyOn(globalThis, "fetch").mockImplementation(async () => Response)` だと TS2345（`preconnect` プロパティ欠落）。test ファイル内に `function asFetchImpl(impl: () => Promise<Response>): typeof globalThis.fetch { return impl as unknown as typeof globalThis.fetch; }` を定義して `mockImplementation(asFetchImpl(async () => ...))` で呼ぶ。参照実装: `__tests__/unit/lib/cloudflare.test.ts`
- **retry/backoff test は `spyOn(globalThis, "setTimeout").mockImplementation(((fn) => { fn(); return 0; }) as unknown as typeof setTimeout)` で sleep スキップ** — `INITIAL_BACKOFF_MS * 2^attempt` の 1s+2s+4s が test 実行時間に直撃するため。`afterEach` で `mockRestore()` 必須。参照実装: `__tests__/unit/lib/cloudflare.test.ts`

## モックリセット

```typescript
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

## Server Actions テスト

Server Actions の統合テスト（依存差し替え + アクション直呼び）は `bun-patterns/server-actions-tests.md` を参照。

## 副作用なし純粋モジュールはモック不要

`@/shared/lib/constants`（CACHE_TAGS, getCacheTag, CACHE_LIFE）と `@/shared/lib/route-responses` は DB 依存も `server-only` 依存もない。`mock.module` すると不完全なモックがグローバル干渉して他テストファイルを壊す。実モジュールをそのまま import して使用する。

## 同一モジュールへの mock.module 連続呼び出し禁止

```typescript
// NG: コピペ由来の重複呼び出し（冪等だがコードレビュー時に誤読を招く）
mock.module("@generated/prisma/enums", () => ALL_ENUMS);
mock.module("@generated/prisma/enums", () => ALL_ENUMS);

// OK: 1ファイル1呼び出しに統一
mock.module("@generated/prisma/enums", () => ALL_ENUMS);
```

`mock.module` は冪等だが、同一モジュールへの連続呼び出しはコピペバグの兆候。ファイル内で grep して重複がないか確認する。

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
