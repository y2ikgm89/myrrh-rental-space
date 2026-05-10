---
description: Bun Test での Unit / Integration テスト基本構造、server-only mock、環境変数モック、Server Actions テスト、mock.module 追従更新、toHaveBeenCalledWith 差分の読み方
paths:
  - __tests__/unit/**
  - __tests__/integration/**
  - __tests__/setup.ts
  - __tests__/mocks/**
  - __tests__/helpers/**
---

# Bun テスト（Unit / Integration）

> 基本構造 + server-only mock + env-nextjs snapshot + 環境変数モック + Server Actions テスト + mock.module 追従更新 + toHaveBeenCalledWith 差分読解 + ドメインコマンドテスト構造。

## 基本構造

```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";

describe("機能名", () => {
  beforeAll(() => {
    // セットアップ
  });

  afterAll(() => {
    // クリーンアップ
  });

  test("期待する動作を説明", () => {
    const result = someFunction();
    expect(result).toBe(expected);
  });
});
```

## server-only のモック（テスト環境必須）

`import 'server-only'` を含むモジュール（`crypto.ts`, `logger.ts`, `prisma.ts` 等）をテストで直接 import する場合、
`__tests__/setup.ts` の `mock.module('server-only', () => ({}))` が必須（プリロード設定済み）。

```typescript
// __tests__/setup.ts（設定済み — 編集不要）
import { mock } from "bun:test";
mock.module("server-only", () => ({})); // server-only を no-op にする
```

**禁止**: `bun test --conditions=react-server` — React を `react.react-server.js`（`createContext`・`useRef` 未定義）に解決してしまう

## @t3-oss/env-nextjs のスナップショット問題

`serverEnv`（`@/shared/lib/env/server` の `createEnv()` 結果）はモジュールロード時点の `process.env` のスナップショット。
テストで `process.env["KEY"]` を変更しても `serverEnv.KEY` には反映されない。

```typescript
// NG: serverEnv を使ったコードはテストで env 変更が効かない
function getMasterKey() {
  const key = serverEnv.ENCRYPTION_KEY; // スナップショット — delete process.env["KEY"] が効かない
}

// OK: process.env を直接参照(遅延評価 — テストで変更が反映される）
function getMasterKey() {
  const key = process.env["ENCRYPTION_KEY"]; // 毎回評価
}
```

テストで変更を必要とする env 変数は `process.env` 直接参照で実装し、デフォルト値は `__tests__/setup.ts` のプリロードで設定する（`ENCRYPTION_KEY` 参照）。

## 環境変数のモック

```typescript
describe("crypto", () => {
  const originalKey = process.env.ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = "test-key";
  });

  afterAll(() => {
    if (originalKey) {
      process.env.ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.ENCRYPTION_KEY;
    }
  });
});
```

## Server Actions テスト

```typescript
import { describe, test, expect, beforeEach, mock } from "bun:test";

const mockGetSession = mock(() => null);
mock.module("@/shared/lib/admin-auth", () => ({
  getAdminSession: mockGetSession,
}));

const { createNews } = await import("@/admin/actions/news");

describe("createNews", () => {
  beforeEach(() => {
    // Bun は mock.mockReset() を使用（vi.restoreAllMocks() は Vitest API で Bun では不可）
    mockGetSession.mockReset();
    mockGetSession.mockResolvedValue({ user: ADMIN_USER });
  });

  test("管理者は作成できる", async () => {
    const result = await createNews(validData);
    expect(result.success).toBe(true);
  });

  test("未認証はエラー", async () => {
    mockGetSession.mockResolvedValue(null);
    const result = await createNews(validData);
    expect(result.success).toBe(false);
  });
});
```

## mock.module の追従更新（最重要）

Server Action が新しい domain query / external helper を呼び出すようになったら、対応する integration test の `mock.module()` にも stub を追加する必要がある。

**未更新の兆候**:

- テスト実行時に `prisma.xxx.findMany() Authentication failed against the database server`
- テスト実行時に実 DB に接続しようとする（ネットワークエラー / 認証エラー）
- `cacheLife() is only available with the cacheComponents config` エラー → Route Handler が呼ぶ `'use cache'` 関数（`getIcalOrganizer` 等の設定クエリ）のモック漏れ。テスト環境には PPR dynamic scope がないため `cacheLife()` が throw する。`mock.module("@/shared/domain/settings/queries/<x>", () => ({ <fn>: mock(...) }))` を追加

**検出手順**:

1. `bun test <failing-file>` で実行 → エラーメッセージで「未モックの domain query」を特定
2. 該当 Server Action の import 文を確認し、モック漏れを洗い出す
3. `mock.module("@/shared/domain/<x>/queries", () => ({ <fn>: mock(...) }))` を追加

**参照実装**: `deleteAccountAction` が `getEventIdsByCustomerId` を呼び出すようになった時、`mypage-account.test.ts` に以下を追加して解決:

```typescript
mock.module("@/shared/domain/events/registration-queries", () => ({
  getEventIdsByCustomerId: mock(() => Promise.resolve([])),
}));
```

## toHaveBeenCalledWith 差分の読み方

`- Expected - 0 / + Received + N` = **「期待値より N 個多いプロパティがある」**

主な原因:

- Zod スキーマの `.default()` 値が実装で展開されてテスト期待値に未反映
  （例: `customerType: CustomerType.PERSONAL` が default で埋まる）
- Server Action に新規フィールドが追加されたがテスト期待値が未更新

対処: 実装の呼び出し引数をそのまま `toHaveBeenCalledWith` に反映する。
`expect.objectContaining({...})` でパーシャルマッチに緩和してもよいが、破壊的変更検出の観点では厳密マッチ推奨。

## ドメインコマンドテスト（`__tests__/unit/domain/<domain>/commands.test.ts`）

全 27 ドメインのコマンドテストが `__tests__/unit/domain/` に存在。新規ドメイン追加時は同パターンでテスト作成必須。

```typescript
// 標準構造
mock.module("server-only", () => ({}));
mock.module("@/shared/db/prisma", () => ({
  prisma: { model: { method: mockFn } },
}));
// @/shared/lib/constants はモック不要
import { command } from "@/shared/domain/<domain>/commands";

describe("commandName", () => {
  describe("正常系", () => {
    /* ... */
  });
  describe("異常系", () => {
    /* DomainError テスト */
  });
});
```

**新規テスト追加後は `package.json` の `test` スクリプトにバッチ追加を確認**

## 統合テストのインライン Zod スキーマは手動保守

`__tests__/integration/actions/admin/*.test.ts` は Server Actions 内の Zod スキーマを**再現**したインライン定義を持つ（import ではない）。実ソースのスキーマ分割・リネーム時は、このインラインコピーも並行更新する。更新漏れはテスト通過のまま非整合を残すサイレントバグになる。
