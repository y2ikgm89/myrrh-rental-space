# Customer Linking System Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shopify 型ベストプラクティスに準拠し、ゲスト予約による顧客データ上書き・userId 破壊・乗っ取りを防止する

**Architecture:** `resolveOrCreateCustomer` を upsert から明示的な find+条件付き update/create に書き直す。`ensureCustomerLinked` に userId 競合チェックを追加。TDD で全パターンをカバー。

**Tech Stack:** Prisma 7, Bun Test, TypeScript 6

---

## Task 1: resolveOrCreateCustomer テスト作成

**Files:**

- Create: `__tests__/unit/shared/domain/reservations/resolve-customer.test.ts`

- [ ] **Step 1: テストファイルを作成（全7パターン）**

```typescript
import { describe, test, expect, mock, beforeEach } from "bun:test";

// --- モック関数定義 ---
const mockFindUnique = mock<
  () => Promise<{ id: string; userId: string | null } | null>
>(() => Promise.resolve(null));
const mockCreate = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "new-customer-id" }),
);
const mockUpdate = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "existing-id" }),
);

// --- モジュールモック ---
mock.module("server-only", () => ({}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    customer: {
      findUnique: mockFindUnique,
      create: mockCreate,
      update: mockUpdate,
    },
  },
}));

// --- テスト対象 import ---
import { resolveOrCreateCustomer } from "@/shared/domain/reservations/resolve-customer";

const BASE_DATA = {
  email: "guest@example.com",
  lastName: "田中",
  firstName: "花子",
  phoneNumber: "090-1234-5678",
  companyName: "テスト株式会社",
};

describe("resolveOrCreateCustomer", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockCreate.mockReset();
    mockUpdate.mockReset();
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: "new-customer-id" });
    mockUpdate.mockResolvedValue({ id: "existing-id" });
  });

  describe("新規メール", () => {
    test("ゲスト: Customer 新規作成、userId = null", async () => {
      const result = await resolveOrCreateCustomer(BASE_DATA);

      expect(result).toBe("new-customer-id");
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: "guest@example.com",
            lastName: "田中",
            firstName: "花子",
            userId: null,
          }),
        }),
      );
    });

    test("ログイン済み: Customer 新規作成、userId = user.id", async () => {
      const result = await resolveOrCreateCustomer({
        ...BASE_DATA,
        userId: "user-123",
      });

      expect(result).toBe("new-customer-id");
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: "guest@example.com",
            userId: "user-123",
          }),
        }),
      );
    });
  });

  describe("既存メール + 未リンク (userId = null)", () => {
    beforeEach(() => {
      // userId で検索: 見つからない
      // email で検索: 未リンク顧客が見つかる
      mockFindUnique
        .mockResolvedValueOnce(null) // userId 検索
        .mockResolvedValueOnce({ id: "existing-id", userId: null }); // email 検索
    });

    test("ゲスト: 名前・電話を更新、userId は null のまま", async () => {
      const result = await resolveOrCreateCustomer({
        ...BASE_DATA,
        lastName: "新しい名前",
      });

      expect(result).toBe("existing-id");
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "existing-id" },
          data: expect.objectContaining({
            lastName: "新しい名前",
          }),
        }),
      );
      // userId が update に含まれていないことを確認
      const updateCall = mockUpdate.mock.calls[0];
      const updateData = (updateCall as unknown[])?.[0] as
        | Record<string, unknown>
        | undefined;
      const data = updateData?.["data"] as Record<string, unknown> | undefined;
      expect(data).not.toHaveProperty("userId");
    });

    test("ログイン済み: 名前・電話を更新、userId を設定", async () => {
      const result = await resolveOrCreateCustomer({
        ...BASE_DATA,
        userId: "user-456",
      });

      expect(result).toBe("existing-id");
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "existing-id" },
          data: expect.objectContaining({
            userId: "user-456",
          }),
        }),
      );
    });
  });

  describe("既存メール + リンク済み (userId != null)", () => {
    test("ゲスト: データ変更なし、customerId のみ返す", async () => {
      mockFindUnique
        .mockResolvedValueOnce(null) // userId 検索 (ゲストなので skip)
        .mockResolvedValueOnce({ id: "linked-id", userId: "other-user" }); // email 検索

      const result = await resolveOrCreateCustomer(BASE_DATA);

      expect(result).toBe("linked-id");
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockCreate).not.toHaveBeenCalled();
    });

    test("同ユーザーのログイン: Step 1 で解決、データ変更なし", async () => {
      mockFindUnique.mockResolvedValueOnce({
        id: "linked-id",
        userId: "user-789",
      }); // userId 検索で見つかる

      const result = await resolveOrCreateCustomer({
        ...BASE_DATA,
        userId: "user-789",
      });

      expect(result).toBe("linked-id");
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockCreate).not.toHaveBeenCalled();
    });

    test("別ユーザーのログイン: データ変更なし、customerId のみ返す", async () => {
      mockFindUnique
        .mockResolvedValueOnce(null) // userId 検索 (別ユーザーなので見つからない)
        .mockResolvedValueOnce({ id: "linked-id", userId: "other-user" }); // email 検索

      const result = await resolveOrCreateCustomer({
        ...BASE_DATA,
        userId: "different-user",
      });

      expect(result).toBe("linked-id");
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `bun test __tests__/unit/shared/domain/reservations/resolve-customer.test.ts`
Expected: FAIL — `resolveOrCreateCustomer` モジュールが存在しない

- [ ] **Step 3: コミット**

```bash
git add __tests__/unit/shared/domain/reservations/resolve-customer.test.ts
git commit -m "test(domain): add resolveOrCreateCustomer test matrix (7 patterns)"
```

---

## Task 2: resolveOrCreateCustomer を独立関数として抽出・実装

**Files:**

- Create: `src/shared/domain/reservations/resolve-customer.ts`
- Modify: `src/shared/domain/reservations/commands.ts:35-44,162-206`

- [ ] **Step 1: 新ファイルに安全な実装を書く**

`src/shared/domain/reservations/resolve-customer.ts`:

```typescript
import "server-only";

import { prisma } from "@/shared/db/prisma";

type CustomerData = {
  lastName: string;
  firstName: string;
  email: string;
  phoneNumber?: string | null | undefined;
  companyName?: string | null | undefined;
  userId?: string | null | undefined;
};

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * 予約作成時の顧客解決ロジック（Shopify 型）
 *
 * 不変条件:
 * 1. リンク済み顧客 (userId != null) のデータはゲスト予約で変更しない
 * 2. userId はゲスト予約で触らない（null 上書き防止）
 * 3. userId の設定は未リンク顧客に対してのみ行う
 */
export async function resolveOrCreateCustomer(
  data: CustomerData,
  tx?: Tx,
): Promise<string> {
  const db = tx ?? prisma;

  // Step 1: userId が提供されている場合、userId で検索
  if (data.userId) {
    const byUserId = await db.customer.findUnique({
      where: { userId: data.userId },
      select: { id: true },
    });
    if (byUserId) {
      // リンク済みユーザーの自分の顧客 → ID だけ返す（データ変更なし）
      return byUserId.id;
    }
  }

  // Step 2: email で検索
  const byEmail = await db.customer.findUnique({
    where: { email: data.email },
    select: { id: true, userId: true },
  });

  if (byEmail) {
    if (byEmail.userId) {
      // リンク済み顧客 → データ変更なし、customerId のみ返す
      return byEmail.id;
    }

    // 未リンク顧客 → 名前・電話を更新
    const updateData: {
      lastName: string;
      firstName: string;
      phoneNumber: string | null;
      companyName: string | null;
      userId?: string;
    } = {
      lastName: data.lastName,
      firstName: data.firstName,
      phoneNumber: data.phoneNumber ?? null,
      companyName: data.companyName ?? null,
    };

    // ログイン済みの場合のみ userId を設定
    if (data.userId) {
      updateData.userId = data.userId;
    }

    await db.customer.update({
      where: { id: byEmail.id },
      data: updateData,
    });
    return byEmail.id;
  }

  // Step 3: 新規作成
  const created = await db.customer.create({
    data: {
      email: data.email,
      lastName: data.lastName,
      firstName: data.firstName,
      phoneNumber: data.phoneNumber ?? null,
      companyName: data.companyName ?? null,
      userId: data.userId ?? null,
    },
    select: { id: true },
  });
  return created.id;
}
```

- [ ] **Step 2: テストを実行して全パスを確認**

Run: `bun test __tests__/unit/shared/domain/reservations/resolve-customer.test.ts`
Expected: ALL PASS

- [ ] **Step 3: commands.ts から旧 resolveOrCreateCustomer を置き換え**

`src/shared/domain/reservations/commands.ts` の変更:

1. 旧 `CustomerData` 型と `resolveOrCreateCustomer` 関数（行 37-206）を削除
2. 新モジュールから import:

```typescript
import { resolveOrCreateCustomer } from "@/shared/domain/reservations/resolve-customer";
```

3. `createPublicReservationCommand`（行 847）の呼び出しを更新:

```typescript
// 旧: resolveOrCreateCustomer(tx, { ... })
// 新: resolveOrCreateCustomer({ ... }, tx)
const customerId = await resolveOrCreateCustomer(
  {
    lastName: input.lastName,
    firstName: input.firstName,
    email: input.email,
    phoneNumber: input.phoneNumber,
    companyName: input.companyName,
    userId: input.userId,
  },
  tx,
);
```

4. `createAdminReservationCommand`（行 399）の呼び出しを更新:

```typescript
// 旧: resolveOrCreateCustomer(tx, input.customerData)
// 新: resolveOrCreateCustomer(input.customerData, tx)
resolvedCustomerId = await resolveOrCreateCustomer(input.customerData, tx);
```

- [ ] **Step 4: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/shared/domain/reservations/resolve-customer.ts src/shared/domain/reservations/commands.ts
git commit -m "fix(domain): rewrite resolveOrCreateCustomer — protect linked customers, prevent userId destruction"
```

---

## Task 3: ensureCustomerLinked テスト更新

**Files:**

- Create: `__tests__/unit/shared/domain/customers/link.test.ts`

- [ ] **Step 1: テストファイルを作成（全5パターン）**

```typescript
import { describe, test, expect, mock, beforeEach } from "bun:test";
import { Prisma } from "@generated/prisma/client";

// --- モック関数 ---
const mockFindUnique = mock<() => Promise<Record<string, unknown> | null>>(() =>
  Promise.resolve(null),
);
const mockUpdate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({
    id: "updated-id",
    email: "test@example.com",
    lastName: "テスト",
    firstName: "",
    userId: "user-1",
    isActive: true,
  }),
);
const mockCreate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({
    id: "new-id",
    email: "test@example.com",
    lastName: "テスト",
    firstName: "",
    userId: "user-1",
    isActive: true,
  }),
);
const mockSendWelcomeEmail = mock<() => Promise<void>>(() => Promise.resolve());

// --- モジュールモック ---
mock.module("server-only", () => ({}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    customer: {
      findUnique: mockFindUnique,
      update: mockUpdate,
      create: mockCreate,
    },
  },
}));
mock.module("@/shared/lib/email/welcome-emails", () => ({
  sendWelcomeEmail: mockSendWelcomeEmail,
}));
mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: mock(() => {}),
}));
mock.module("@/shared/lib/errors/server", () => ({
  ErrorCategory: { EXTERNAL_API: "EXTERNAL_API" },
}));
mock.module("@/shared/lib/constants", () => ({
  getAppUrl: () => "http://localhost:3000",
}));

import { ensureCustomerLinked } from "@/shared/domain/customers/link";

const TEST_USER = {
  id: "user-1",
  email: "test@example.com",
  name: "テスト太郎",
};

describe("ensureCustomerLinked", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUpdate.mockReset();
    mockCreate.mockReset();
    mockFindUnique.mockResolvedValue(null);
  });

  test("userId で既存リンクあり → そのまま返す", async () => {
    const linked = {
      id: "cust-1",
      email: "test@example.com",
      lastName: "既存",
      firstName: "太郎",
      userId: "user-1",
      isActive: true,
    };
    mockFindUnique.mockResolvedValueOnce(linked);

    const result = await ensureCustomerLinked(TEST_USER);

    expect(result).toMatchObject({ id: "cust-1" });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("email 一致 + userId = null → リンク設定", async () => {
    mockFindUnique
      .mockResolvedValueOnce(null) // userId 検索
      .mockResolvedValueOnce({
        id: "cust-2",
        email: "test@example.com",
        lastName: "未リンク",
        firstName: "",
        userId: null,
        isActive: true,
      }); // email 検索
    mockUpdate.mockResolvedValueOnce({
      id: "cust-2",
      email: "test@example.com",
      lastName: "未リンク",
      firstName: "",
      userId: "user-1",
      isActive: true,
    });

    const result = await ensureCustomerLinked(TEST_USER);

    expect(result).toMatchObject({ id: "cust-2" });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-1" }),
      }),
    );
  });

  test("email 一致 + userId = 別ユーザー → 新規作成（乗っ取り防止）", async () => {
    mockFindUnique
      .mockResolvedValueOnce(null) // userId 検索
      .mockResolvedValueOnce({
        id: "cust-3",
        email: "test@example.com",
        lastName: "他人",
        firstName: "",
        userId: "other-user",
        isActive: true,
      }); // email 検索

    const result = await ensureCustomerLinked(TEST_USER);

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalled();
  });

  test("email 一致なし → 新規作成", async () => {
    mockFindUnique
      .mockResolvedValueOnce(null) // userId 検索
      .mockResolvedValueOnce(null); // email 検索

    const result = await ensureCustomerLinked(TEST_USER);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "test@example.com",
          userId: "user-1",
        }),
      }),
    );
  });

  test("P2002 競合 → フォールバッククエリ", async () => {
    mockFindUnique
      .mockResolvedValueOnce(null) // userId 検索
      .mockResolvedValueOnce(null); // email 検索

    const p2002Error = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      {
        code: "P2002",
        clientVersion: "7.0.0",
      },
    );
    mockCreate.mockRejectedValueOnce(p2002Error);

    // フォールバッククエリで見つかる
    mockFindUnique.mockResolvedValueOnce({
      id: "fallback-id",
      email: "test@example.com",
      lastName: "テスト",
      firstName: "",
      userId: "user-1",
      isActive: true,
    });

    const result = await ensureCustomerLinked(TEST_USER);

    expect(result).toMatchObject({ id: "fallback-id" });
  });
});
```

- [ ] **Step 2: テストを実行（一部失敗を確認）**

Run: `bun test __tests__/unit/shared/domain/customers/link.test.ts`
Expected: テスト3「email 一致 + userId = 別ユーザー → 新規作成」が FAIL（現行実装は別ユーザーでも update する）

- [ ] **Step 3: コミット**

```bash
git add __tests__/unit/shared/domain/customers/link.test.ts
git commit -m "test(domain): add ensureCustomerLinked test matrix (5 patterns including hijack prevention)"
```

---

## Task 4: ensureCustomerLinked 実装修正

**Files:**

- Modify: `src/shared/domain/customers/link.ts`

- [ ] **Step 1: ensureCustomerLinked に userId 競合チェックを追加**

`src/shared/domain/customers/link.ts` の email 検索部分を変更:

旧コード (行 34-44):

```typescript
// 2. email で既存 Customer 検索 → userId 紐づけ
const byEmail = await prisma.customer.findUnique({
  where: { email: user.email },
  select: CUSTOMER_LINK_SELECT,
});
if (byEmail) {
  return prisma.customer.update({
    where: { id: byEmail.id },
    data: { userId: user.id },
    select: CUSTOMER_LINK_SELECT,
  });
}
```

新コード:

```typescript
// 2. email で既存 Customer 検索
const byEmail = await prisma.customer.findUnique({
  where: { email: user.email },
  select: CUSTOMER_LINK_SELECT,
});
if (byEmail) {
  if (byEmail.userId === null) {
    // 未リンク → userId を設定してリンク
    return prisma.customer.update({
      where: { id: byEmail.id },
      data: { userId: user.id },
      select: CUSTOMER_LINK_SELECT,
    });
  }
  // 別ユーザーにリンク済み → リンクせず新規作成へ（乗っ取り防止）
}
```

- [ ] **Step 2: テストを実行**

Run: `bun test __tests__/unit/shared/domain/customers/link.test.ts`
Expected: ALL PASS

- [ ] **Step 3: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add src/shared/domain/customers/link.ts
git commit -m "fix(domain): prevent ensureCustomerLinked from hijacking linked customers"
```

---

## Task 5: 全体検証

**Files:** (変更なし — 検証のみ)

- [ ] **Step 1: 全テスト実行**

Run: `bun run test`
Expected: ALL PASS

- [ ] **Step 2: 型チェック + lint**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 3: ビルド確認**

Run: `bun run validate && bun run build`
Expected: PASS

- [ ] **Step 4: package.json の test スクリプトにバッチ追加**

新規テストディレクトリを `package.json` の `test` スクリプトに追加:

- `bun test __tests__/unit/shared/domain/reservations/resolve-customer.test.ts`
- `bun test __tests__/unit/shared/domain/customers/link.test.ts`

既存の `test` スクリプトを確認し、これらのパスが含まれるバッチに入っているか確認。入っていなければ追加。

- [ ] **Step 5: コミット（必要な場合のみ）**

```bash
git add package.json
git commit -m "chore: add new test files to test script batches"
```

---

## Task 6: CLAUDE.md / gotchas.md 更新

**Files:**

- Modify: `.claude/rules/gotchas.md`

- [ ] **Step 1: gotchas.md に新しいルールを追加**

`## ドメイン・予約` セクションに追加:

```markdown
- **`resolveOrCreateCustomer` でリンク済み顧客のデータを変更禁止** — `userId != null` の Customer は名前・電話・companyName を上書きしない。ゲスト予約では customerId のみ返す（Shopify 型保護パターン）。`userId` フィールドはゲスト予約の update に含めない（`undefined || null = null` で既存リンクが破壊される）
- **`ensureCustomerLinked` で別ユーザーにリンク済みの Customer を乗っ取らない** — `byEmail.userId` が既に別ユーザーに設定されている場合は新規 Customer を作成する。同一メールの Customer が2つ存在しうるが、管理画面でのマージで対応
```

- [ ] **Step 2: コミット**

```bash
git add .claude/rules/gotchas.md
git commit -m "docs: add customer linking safety rules to gotchas.md"
```
