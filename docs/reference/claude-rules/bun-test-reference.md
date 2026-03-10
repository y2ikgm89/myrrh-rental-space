# Bun Test 詳細リファレンス

> このファイルは `.claude/rules/bun-patterns.md` の詳細セクション。
> コア原則とルールは `.claude/rules/bun-patterns.md` を参照。

---

## 戻り値の設定

```typescript
const fn = mock<() => Promise<User | null>>();

// 次の1回だけ特定値を返す
fn.mockResolvedValueOnce({ id: "1", name: "Alice" });
fn.mockResolvedValueOnce(null);

// 常に特定値を返す
fn.mockResolvedValue({ id: "1" });
fn.mockReturnValue("always this");

// 実装を差し替える（1回のみ）
fn.mockImplementationOnce(async (id) => {
  if (id === "not-found") return null;
  return { id, name: "Alice" };
});

// 常に例外をスローする
fn.mockImplementation(() => {
  throw new Error("DB error");
});
fn.mockRejectedValue(new Error("Network error"));
```

---

## Prisma モック（`createMockPrismaClient` 詳細実装）

プロジェクト固有の Prisma モックは `__tests__/mocks/prisma.ts` に集約済み。

```typescript
// __tests__/mocks/prisma.ts の使用方法

import { mock } from "bun:test";

// 型定義パターン — 引数なし・戻り値 Promise<unknown> のモック関数
type MockFunction = ReturnType<typeof mock<() => Promise<unknown>>>;

// createMockPrismaClient() でデフォルトモックを生成
// デフォルト: findUnique/findFirst → null, findMany → [], create/update/delete → { id: 'test-id' }
export function createMockPrismaClient(): MockPrismaClient {
  return {
    space: {
      findUnique: mock(() => Promise.resolve(null)),
      findMany: mock(() => Promise.resolve([])),
      create: mock(() => Promise.resolve({ id: "test-space-id" })),
      // ...
    },
    $transaction: mock(() => Promise.resolve([])),
  };
}

// グローバルインスタンスをリセット（テスト間の副作用を防ぐ）
export let mockPrisma: MockPrismaClient = createMockPrismaClient();

export function resetPrismaMock(): void {
  mockPrisma = createMockPrismaClient(); // 新しいインスタンスで完全リセット
}
```

```typescript
// テストファイルでの使用例
import { mock, beforeEach } from "bun:test";
import {
  createMockPrismaClient,
  resetPrismaMock,
  mockPrisma,
} from "../../mocks/prisma";

mock.module("@/shared/lib/prisma", () => ({
  prisma: mockPrisma,
}));

beforeEach(() => {
  resetPrismaMock();
});

test("スペースを取得できる", async () => {
  // 特定テストのみ戻り値を上書き
  mockPrisma.space.findUnique.mockResolvedValueOnce({
    id: "space-1",
    name: "テストスペース",
  });

  const result = await getSpace("space-1");
  expect(result).toEqual({ id: "space-1", name: "テストスペース" });
});
```

---

## 認証モック（`createMockUser`, `setMockSession` 詳細実装）

プロジェクト固有の認証モックは `__tests__/mocks/auth.ts` に集約済み。

```typescript
// __tests__/mocks/auth.ts のパターン

import { mock } from "bun:test";
import { Role } from "@/shared/generated/prisma/enums";

export const mockGetSession = mock<() => Promise<MockSession | null>>(
  () => Promise.resolve(null), // デフォルト: 未認証
);

// ファクトリ関数でモックユーザーを生成（overrides で部分変更）
export function createMockUser(overrides?: Partial<MockUser>): MockUser {
  return {
    id: "test-user-id",
    email: "test@example.com",
    name: "Test User",
    role: Role.ADMIN,
    emailVerified: true,
    image: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

// セッションを設定するヘルパー
export function setMockSession(session: MockSession | null): void {
  mockGetSession.mockResolvedValue(session);
}

// 認証モックのリセット（デフォルト: null = 未認証）
export function resetAuthMock(): void {
  mockGetSession.mockReset();
  mockGetSession.mockResolvedValue(null);
}
```

```typescript
// テストファイルでの使用例
import { mock, beforeEach } from "bun:test";
import {
  mockGetSession,
  createMockSession,
  resetAuthMock,
} from "../../mocks/auth";
import { Role } from "@/shared/generated/prisma/enums";

mock.module("@/shared/lib/auth", () => ({
  getSession: () => mockGetSession(),
}));

beforeEach(() => {
  resetAuthMock();
});

test("ADMIN は操作できる", async () => {
  // ADMIN ロールのセッションをセット
  mockGetSession.mockResolvedValueOnce(createMockSession({ role: Role.ADMIN }));

  const result = await someAction();
  expect(result.success).toBe(true);
});

test("VIEWER は拒否される", async () => {
  mockGetSession.mockResolvedValueOnce(
    createMockSession({ role: Role.VIEWER }),
  );

  const result = await someAction();
  expect(result.success).toBe(false);
});
```

---

## Next.js API モック（`mock.module` 全パターン）

`headers()`, `redirect()`, `revalidateTag()` などの Next.js API は `__tests__/mocks/next.ts` に集約済み。

```typescript
// mock.module() で Next.js モジュールを差し替え
mock.module("next/headers", () => ({
  headers: mock(() => new Headers()),
}));

mock.module("next/cache", () => ({
  revalidateTag: mock((_tag: string) => {}),
  updateTag: mock((_tag: string) => {}),
  revalidatePath: mock((_path: string) => {}),
}));

// redirect() は next/navigation から
// redirect はエラーをスローするため RedirectError クラスで検証
import { RedirectError } from "../../mocks/next";

mock.module("next/navigation", () => ({
  redirect: mock((url: string): never => {
    throw new RedirectError(url);
  }),
}));

// redirect が呼ばれたかチェック
test("ログイン後にリダイレクトされる", async () => {
  await expect(loginAction(validData)).rejects.toThrow(RedirectError);
});
```

---

## グローバル API のモック（`fetch`, `console` 詳細）

`fetch`, `console.*` などのグローバル API は `spyOn` または直接差し替えで対応。

```typescript
import { mock, spyOn, beforeEach, afterEach } from "bun:test";

// console のモック（spyOn パターン）
const originalConsoleError = console.error;

beforeEach(() => {
  console.error = mock(() => {});
});

afterEach(() => {
  console.error = originalConsoleError;
});

// fetch のモック（直接差し替えパターン）
const mockFetch = mock(() => Promise.resolve(new Response()));
const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  mockFetch.mockClear();
});

test("API を呼び出す", async () => {
  mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));

  const result = await callApi();
  expect(result).toEqual({ ok: true });
  expect(mockFetch).toHaveBeenCalledTimes(1);
});
```

---

## Bun ランタイム固有機能

### Bun.file / Bun.write

テスト内でのファイル操作（統合テスト等）:

```typescript
// ファイル読み取り
const file = Bun.file("./path/to/file.json");
const content = await file.json();
const text = await file.text();

// ファイル書き込み（テスト用一時ファイル）
await Bun.write("/tmp/test-output.json", JSON.stringify(data));

// ファイルの存在確認
const exists = await Bun.file("./test.txt").exists();
```

### Bun.env

環境変数アクセス（`process.env` の Bun 版）:

```typescript
// OK: process.env（Node.js 互換、テストでも使用）
const key = process.env["ENCRYPTION_KEY"];

// OK: Bun.env（同等、型は string | undefined）
const key = Bun.env.ENCRYPTION_KEY;

// テストセットアップで直接設定
process.env["NODE_ENV"] = "test";
process.env["SKIP_ENV_VALIDATION"] = "true";
```

**注意**: `__tests__/setup.ts` でテスト用環境変数が一括設定済み。個別テストで上書きが必要な場合のみ `beforeAll` / `afterAll` で設定・復元する。
