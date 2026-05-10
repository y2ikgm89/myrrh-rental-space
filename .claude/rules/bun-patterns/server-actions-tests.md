---
description: Server Actions の統合テスト（mock.module で依存差し替え + アクション直呼び）
paths:
  - __tests__/integration/actions/**
  - __tests__/integration/api/**
---

# Server Actions 統合テスト

> Server Actions（認証・Prisma・Next.js API 依存）を `mock.module()` で依存差し替えして直接呼び出す統合テストパターン。

## 標準パターン

```typescript
import { describe, test, expect, mock, beforeEach } from "bun:test";

// 1. モック関数を先に定義
const mockGetSession = mock<() => Promise<MockSession | null>>();
const mockFindUnique = mock<() => Promise<Record<string, unknown> | null>>(() =>
  Promise.resolve(null),
);
const mockCreate = mock<() => Promise<Record<string, unknown>>>();

// 2. 依存モジュールを差し替え（import より前）
mock.module("@/shared/lib/admin-auth", () => ({
  getAdminSession: () => mockGetSession(),
}));
mock.module("@/shared/lib/prisma", () => ({
  prisma: {
    post: { findUnique: mockFindUnique, create: mockCreate },
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
    mockGetSession.mockResolvedValueOnce(
      createMockSession({ role: Role.ADMIN }),
    );
    mockCreate.mockResolvedValueOnce({ id: "new-post-id", title: "テスト" });

    const result = await createPost(VALID_INPUT);

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

## モック追従更新（最重要）

Server Action が新しい domain query / external helper を呼び出すようになったら、対応する integration test の `mock.module()` にも stub を追加する必要がある（→ `test-quality/unit-bun.md` §mock.module の追従更新）。

**未更新の兆候**:

- `prisma.xxx.findMany() Authentication failed against the database server`
- 実 DB に接続しようとする（ネットワークエラー / 認証エラー）
- `cacheLife() is only available with the cacheComponents config` エラー → Route Handler が呼ぶ `'use cache'` 関数のモック漏れ

**検出手順**:

1. `bun test <failing-file>` で実行 → エラーメッセージで「未モックの domain query」を特定
2. 該当 Server Action の import 文を確認し、モック漏れを洗い出す
3. `mock.module("@/shared/domain/<x>/queries", () => ({ <fn>: mock(...) }))` を追加
