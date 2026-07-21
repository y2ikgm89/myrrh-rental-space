# 監査ログ規約統一（Phase 1）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** イベント参加登録の監査ログ resource 文字列の表記ゆれを解消し、顧客管理の4関数
（createCustomer/updateCustomerNotes/toggleCustomerActive/clearCustomerRiskFlag）に
既存の `customer.profile`/`customer.status`/`customer.anonymization` と同じ dot-notation
詳細監査ログ（oldValue/newValue付き）を追加し、`searchCustomersAction`（顧客PII検索）に
現状ゼロだった監査証跡を新設する。

**Architecture:** `executeAdminMutationResult` 自体は変更しない。既に `updateCustomer` /
`updateCustomerStatus` / `anonymizeCustomer` が使っている確立済みパターン（`afterSuccess`
内で `fireAndForget(createAuditLogRecord({...}))` を直接呼ぶ）を、対象の4関数と
`searchCustomersAction` に横展開する。ドメインコマンド3件（updateCustomerNotes/
toggleCustomerActive/clearRiskFlagCommand）は戻り値を `void` から前値を含むオブジェクトに
変更する。

**Tech Stack:** Next.js 16 Server Actions、Prisma 7、bun test（`scripts/run-tests.ts` 経由）、
Zod 4。

## Global Constraints

- テストは必ず `bun scripts/run-tests.ts <path>` 経由で実行する（素の `bun test` 禁止）。
- 完了前に `bun run validate`（type-check + lint）を実行し exit 0 を確認する。
- `any` / `as` 危険cast / non-null assertion（`!`）は 0 件（grep gate で強制）。
- Prisma の直 import は `src/shared/domain` / `src/shared/db` 配下のみ。action 層
  （`_shared/actions/*.ts`）は Prisma を直 import しない。
- 監査ログの oldValue/newValue に `Date` を渡す場合は必ず `.toISOString()` で文字列化する
  （`Prisma.InputJsonValue` は Date 型を受け付けない、既存の `anonymizeCustomer` 実装が
  この変換を行っている）。
- コミットメッセージは Conventional Commits + `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`。

---

### Task 1: resource文字列統一（"eventRegistration" → "event-registration"）

**Files:**

- Modify: `src/app/(public)/claim/event-registration/_actions/claim.ts:90`
- Modify: `src/shared/domain/events/payment-commands.ts:870`
- Test: `__tests__/unit/architecture-boundaries.test.ts`（末尾に新規 test 追加）

**Interfaces:**

- Consumes: `collectSourceFiles`（`__tests__/helpers/architecture-fs.ts`、既存 import）
- Produces: なし（回帰防止用の grep gate のみ）

- [ ] **Step 1: 失敗するテストを書く**

`__tests__/unit/architecture-boundaries.test.ts` の末尾（3283行目 `});` の直後、3285行目の
コメントブロックの直前）に以下を追加する:

```ts
describe("AuditLog resource文字列の統一 (event-registration)", () => {
  test('"eventRegistration" (camelCase) を resource 文字列として使わない。"event-registration" (kebab-case) に統一する', () => {
    const violations: string[] = [];
    for (const path of collectSourceFiles(SRC_ROOT)) {
      const source = readFileSync(path, "utf8");
      if (source.includes('"eventRegistration"')) {
        violations.push(relative(ROOT, path));
      }
    }
    expect(violations).toEqual([]);
  });
});
```

- [ ] **Step 2: テストを実行し、失敗することを確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/architecture-boundaries.test.ts`
Expected: FAIL — `violations` に
`src/app/(public)/claim/event-registration/_actions/claim.ts` と
`src/shared/domain/events/payment-commands.ts` の2件が含まれる。

- [ ] **Step 3: 2箇所を kebab-case に修正する**

`src/app/(public)/claim/event-registration/_actions/claim.ts` の該当箇所:

```ts
      resource: "eventRegistration",
      resourceId: verified.eventRegistrationId,
```

を以下に変更:

```ts
      resource: "event-registration",
      resourceId: verified.eventRegistrationId,
```

`src/shared/domain/events/payment-commands.ts` の該当箇所:

```ts
    resource: "eventRegistration",
    resourceId: registrationId,
```

を以下に変更:

```ts
    resource: "event-registration",
    resourceId: registrationId,
```

- [ ] **Step 4: テストを再実行し、成功することを確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/architecture-boundaries.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add __tests__/unit/architecture-boundaries.test.ts \
  "src/app/(public)/claim/event-registration/_actions/claim.ts" \
  src/shared/domain/events/payment-commands.ts
git commit -m "$(cat <<'EOF'
fix(admin): unify eventRegistration audit resource string to kebab-case

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: searchCustomersAction に PII 検索の監査ログを追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/customer.ts:510-518`
- Test: `__tests__/unit/actions/customer-audit-diff.test.ts`

**Interfaces:**

- Consumes: `checkPermission("customer", "read")` → `{success: true, user: {id: string}} | {success: false}`
  （`@/admin/lib/action-auth`、既存）。`createAuditLogRecord`（`@/shared/domain/audit-log/commands`、
  既存 import）。`fireAndForget`（`@/shared/lib/async-utils`、既存 import）。
- Produces: `searchCustomersAction(query: string): Promise<CustomerSearchResult[]>`
  （既存のシグネチャは変更しない）。

- [ ] **Step 1: 失敗するテストを書く**

`__tests__/unit/actions/customer-audit-diff.test.ts` のトップレベル destructure（159-160行目）を
以下に変更する（この Task で使う名前を先に追加、他 Task 分もまとめて追加）:

```ts
const {
  updateCustomerStatus,
  updateCustomer,
  anonymizeCustomer,
  createCustomer,
  updateCustomerNotes,
  toggleCustomerActive,
  clearCustomerRiskFlag,
  searchCustomersAction,
} = await import("@/app/(admin)/admin/(dashboard)/_shared/actions/customer");
```

ファイル冒頭の import に `AuditAction` を追加する（既存の `CustomerStatus` import と合わせる）:

```ts
import {
  AuditAction,
  CustomerStatus,
} from "@/shared/lib/validations/enums/prisma-types";
```

ファイル冒頭のヘッダーコメント（1-9行目）を、対象範囲の拡大に合わせて更新する:

```ts
/**
 * customer.ts の updateCustomerStatus / updateCustomer / anonymizeCustomer /
 * createCustomer / updateCustomerNotes / toggleCustomerActive /
 * clearCustomerRiskFlag / searchCustomersAction が customer.status /
 * customer.profile / customer.anonymization / customer.notes /
 * customer.active / customer.riskFlag として before/after を、
 * searchCustomersAction が PII 検索の READ 監査を AuditLog に残すことを検証する。
 *
 * executeAdminMutationResult / executeConformMutation は薄いモックに差し替え、
 * RBAC・FormData→conform解析・cache invalidationの再テストはしない
 * （customer.action-shape.test.ts / *-empty-optional.test.ts の担務）。
 */
```

`mock.module("@/admin/lib/action-auth", ...)`（127-129行目）を、`user` を含むよう拡張する:

```ts
mock.module("@/admin/lib/action-auth", () => ({
  checkPermission: mock(() =>
    Promise.resolve({ success: true, user: { id: "admin-1" } }),
  ),
}));
```

ファイル末尾（`anonymizeCustomer` の describe ブロックの直後）に以下を追加する:

```ts
describe("searchCustomersAction の PII 検索監査ログ (READ)", () => {
  beforeEach(() => {
    mockCreateAuditLogRecord.mockReset();
    mockCreateAuditLogRecord.mockResolvedValue(undefined);
  });

  test("検索実行時に READ アクションでクエリと件数を記録する", async () => {
    await searchCustomersAction("田中");
    await flushMicrotasks();

    expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
    const call = mockCreateAuditLogRecord.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("call is undefined");
    expect(call["action"]).toBe(AuditAction.READ);
    expect(call["resource"]).toBe("customer");
    expect(call["metadata"]).toEqual({ query: "田中", resultCount: 0 });
  });
});
```

- [ ] **Step 2: テストを実行し、失敗することを確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/actions/customer-audit-diff.test.ts`
Expected: FAIL — `mockCreateAuditLogRecord` が呼ばれず `toHaveBeenCalledTimes(1)` が失敗。

- [ ] **Step 3: searchCustomersAction に監査ログを追加する**

`src/app/(admin)/admin/(dashboard)/_shared/actions/customer.ts:510-518` を以下に変更:

```ts
export async function searchCustomersAction(
  query: string,
): Promise<Awaited<ReturnType<typeof searchCustomers>>> {
  // 顧客 PII 検索は customer:read 権限必須。checkAdminAuth は認証のみで全ダッシュボード
  // ロール（customer:read を持たない EDITOR 含む）を通すため RBAC バイパスになる。
  const auth = await checkPermission("customer", "read");
  if (!auth.success) return [];

  const results = await searchCustomers(query);

  fireAndForget(
    createAuditLogRecord({
      userId: auth.user.id,
      action: AuditAction.READ,
      resource: "customer",
      metadata: { query, resultCount: results.length },
    }),
    {
      operation: "auditLogSearchCustomers",
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
    },
  );

  return results;
}
```

- [ ] **Step 4: テストを再実行し、成功することを確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/actions/customer-audit-diff.test.ts`
Expected: PASS（既存テストも含め全件）

- [ ] **Step 5: コミット**

```bash
git add __tests__/unit/actions/customer-audit-diff.test.ts \
  src/app/\(admin\)/admin/\(dashboard\)/_shared/actions/customer.ts
git commit -m "$(cat <<'EOF'
feat(admin): audit-log customer PII search (searchCustomersAction)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: createCustomer に詳細監査ログ (customer.profile) を追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/customer.ts:64-83`
- Test: `__tests__/unit/actions/customer-audit-diff.test.ts`

**Interfaces:**

- Consumes: `createCustomerCommand(data: CustomerFormData): Promise<{id: string}>`
  （`@/shared/domain/customers/commands`、既存・変更なし）。`buildAuditRequestContext()`
  （既存 import）。
- Produces: `createCustomer` の外部シグネチャは変更しない。

- [ ] **Step 1: 失敗するテストを書く**

`mock.module("@/shared/domain/customers/commands", ...)`（94-117行目）の
`createCustomer: mock(() => Promise.resolve({ id: "x" }))` を、他の関数と同様に
named mock 経由へ変更する。ブロック冒頭（70行目付近、`mockAnonymizeCustomerCommand` の
定義の直後）に追加:

```ts
const mockCreateCustomerCommand = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "x" }),
);
```

`mock.module` 内の該当行を変更:

```ts
  createCustomer: (...args: Parameters<typeof mockCreateCustomerCommand>) =>
    mockCreateCustomerCommand(...args),
```

ファイル末尾に以下の describe を追加する:

```ts
describe("createCustomer の AuditLog 記録 (customer.profile)", () => {
  beforeEach(() => {
    currentUser = { id: "admin-1" };
    mockCreateCustomerCommand.mockReset();
    mockCreateCustomerCommand.mockResolvedValue({ id: CUSTOMER_UUID });
    mockCreateAuditLogRecord.mockReset();
    mockCreateAuditLogRecord.mockResolvedValue(undefined);
  });

  test("新規作成した顧客のプロフィールを newValue に記録する (oldValueは無し)", async () => {
    await createCustomer(undefined, new FormData());
    await flushMicrotasks();

    expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
    const call = mockCreateAuditLogRecord.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("call is undefined");
    expect(call["resource"]).toBe("customer.profile");
    expect(call["resourceId"]).toBe(CUSTOMER_UUID);
    expect(call["action"]).toBe(AuditAction.CREATE);
    expect(call["oldValue"]).toBeUndefined();
    expect(call["newValue"]).toEqual(
      expect.objectContaining({
        lastName: "田中",
        firstName: "太郎",
        email: "tanaka@example.com",
      }),
    );
  });
});
```

- [ ] **Step 2: テストを実行し、失敗することを確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/actions/customer-audit-diff.test.ts`
Expected: FAIL — 新テストが `mockCreateAuditLogRecord` 呼び出し0回で失敗。

- [ ] **Step 3: createCustomer に監査ログを追加する**

`src/app/(admin)/admin/(dashboard)/_shared/actions/customer.ts:64-83` を以下に変更:

```ts
export async function createCustomer(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, customerFormSchema, async (data) => {
    const result = await executeAdminMutationResult({
      resource: "customer",
      action: "create",
      execute: async (user) => {
        const created = await createCustomerCommand(data);
        const { ip, userAgent } = await buildAuditRequestContext();
        return { created, actorUserId: user.id, ip, userAgent };
      },
      afterSuccess: (outcome) => {
        updateTag(CACHE_TAGS.CUSTOMERS);

        fireAndForget(
          createAuditLogRecord({
            userId: outcome.actorUserId,
            action: AuditAction.CREATE,
            resource: "customer.profile",
            resourceId: outcome.created.id,
            newValue: {
              lastName: data.lastName,
              firstName: data.firstName,
              lastNameKana: data.lastNameKana || null,
              firstNameKana: data.firstNameKana || null,
              companyName: data.companyName || null,
              customerType: data.customerType,
              email: data.email,
              phoneNumber: data.phoneNumber || null,
              postalCode: data.postalCode || null,
              prefecture: data.prefecture || null,
              city: data.city || null,
              streetAddress: data.streetAddress || null,
              building: data.building || null,
              notes: data.notes || null,
              marketingOptIn: data.marketingOptIn,
              phoneContactOptIn: data.phoneContactOptIn,
            },
            metadata: {
              ...(outcome.ip !== null && { ip: outcome.ip }),
              ...(outcome.userAgent !== null && {
                userAgent: outcome.userAgent,
              }),
            },
          }),
          {
            operation: "auditLogCreateCustomerProfile",
            category: ErrorCategory.DATABASE,
            severity: ErrorSeverity.MEDIUM,
          },
        );
      },
      resolveAuditResourceId: (outcome) => outcome.created.id,
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}
```

- [ ] **Step 4: テストを再実行し、成功することを確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/actions/customer-audit-diff.test.ts`
Expected: PASS（既存テストも含め全件）

- [ ] **Step 5: コミット**

```bash
git add __tests__/unit/actions/customer-audit-diff.test.ts \
  src/app/\(admin\)/admin/\(dashboard\)/_shared/actions/customer.ts
git commit -m "$(cat <<'EOF'
feat(admin): audit-log new customer profile on createCustomer

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: updateCustomerNotes に詳細監査ログ (customer.notes) を追加

**Files:**

- Modify: `src/shared/domain/customers/commands.ts:137-147`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/customer.ts:231-253`
- Test: `__tests__/unit/actions/customer-audit-diff.test.ts`

**Interfaces:**

- Consumes: なし
- Produces: `updateCustomerNotesCommand(id: string, notes: string | null): Promise<{ previousNotes: string | null }>`
  （戻り値を `void` から変更、Task 5/6 で同型パターンを踏襲する際の参照）

- [ ] **Step 1: 失敗するテストを書く**

`mock.module("@/shared/domain/customers/commands", ...)` の
`updateCustomerNotes: mock(() => Promise.resolve(undefined))` を named mock に変更する。
`mockCreateCustomerCommand` の定義の直後に追加:

```ts
const mockUpdateCustomerNotesCommand = mock<
  () => Promise<{ previousNotes: string | null }>
>(() => Promise.resolve({ previousNotes: null }));
```

`mock.module` 内の該当行を変更:

```ts
  updateCustomerNotes: (
    ...args: Parameters<typeof mockUpdateCustomerNotesCommand>
  ) => mockUpdateCustomerNotesCommand(...args),
```

ファイル末尾に追加:

```ts
describe("updateCustomerNotes の AuditLog diff (customer.notes)", () => {
  beforeEach(() => {
    currentUser = { id: "admin-1" };
    mockUpdateCustomerNotesCommand.mockReset();
    mockUpdateCustomerNotesCommand.mockResolvedValue({
      previousNotes: "旧メモ",
    });
    mockCreateAuditLogRecord.mockReset();
    mockCreateAuditLogRecord.mockResolvedValue(undefined);
  });

  test("メモが実際に変わった場合は oldValue/newValue 付きで記録する", async () => {
    await updateCustomerNotes(CUSTOMER_UUID, "新メモ");
    await flushMicrotasks();

    expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
    const call = mockCreateAuditLogRecord.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("call is undefined");
    expect(call["resource"]).toBe("customer.notes");
    expect(call["resourceId"]).toBe(CUSTOMER_UUID);
    expect(call["oldValue"]).toEqual({ notes: "旧メモ" });
    expect(call["newValue"]).toEqual({ notes: "新メモ" });
  });

  test("メモが変わらない (no-op) 場合は記録しない", async () => {
    mockUpdateCustomerNotesCommand.mockResolvedValue({
      previousNotes: "同じメモ",
    });

    await updateCustomerNotes(CUSTOMER_UUID, "同じメモ");
    await flushMicrotasks();

    expect(mockCreateAuditLogRecord).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テストを実行し、失敗することを確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/actions/customer-audit-diff.test.ts`
Expected: FAIL — 新2テストが `mockCreateAuditLogRecord` の呼び出し内容不一致で失敗。

- [ ] **Step 3: ドメインコマンドの戻り値を変更する**

`src/shared/domain/customers/commands.ts:137-147` を以下に変更:

```ts
export async function updateCustomerNotes(
  id: string,
  notes: string | null,
): Promise<{ previousNotes: string | null }> {
  const existing = await prisma.customer.findUnique({
    where: { id },
    select: { notes: true },
  });
  if (!existing) {
    throw new DomainError("顧客が見つかりません", "NOT_FOUND");
  }

  await prisma.customer.update({
    where: { id },
    data: { notes },
  });

  return { previousNotes: existing.notes };
}
```

- [ ] **Step 4: action 層に監査ログを追加する**

`src/app/(admin)/admin/(dashboard)/_shared/actions/customer.ts:231-253` を以下に変更:

```ts
export async function updateCustomerNotes(
  id: string,
  notes: string | null,
): Promise<MutationResult> {
  const parsed = updateCustomerNotesSchema.safeParse({ id, notes });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "customer",
    action: "update",
    resourceId: parsed.data.id,
    execute: async (user) => {
      const { previousNotes } = await updateCustomerNotesCommand(
        parsed.data.id,
        parsed.data.notes,
      );
      const { ip, userAgent } = await buildAuditRequestContext();
      return { previousNotes, actorUserId: user.id, ip, userAgent };
    },
    afterSuccess: (outcome) => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      updateTag(getCacheTag.customers.detail(parsed.data.id));

      if (outcome.previousNotes === parsed.data.notes) {
        // 冪等 no-op: メモが実際には変化していない (audit noise を減らす)
        return;
      }

      fireAndForget(
        createAuditLogRecord({
          userId: outcome.actorUserId,
          action: AuditAction.UPDATE,
          resource: "customer.notes",
          resourceId: parsed.data.id,
          oldValue: { notes: outcome.previousNotes },
          newValue: { notes: parsed.data.notes },
          metadata: {
            ...(outcome.ip !== null && { ip: outcome.ip }),
            ...(outcome.userAgent !== null && {
              userAgent: outcome.userAgent,
            }),
          },
        }),
        {
          operation: "auditLogUpdateCustomerNotes",
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.MEDIUM,
        },
      );
    },
  });
}
```

- [ ] **Step 5: テストを再実行し、成功することを確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/actions/customer-audit-diff.test.ts`
Expected: PASS（既存テストも含め全件）

- [ ] **Step 6: 該当テストファイルとdomain層のintegrationテストがあれば実行**

Run: `bun scripts/run-tests.ts __tests__/integration/domain/customers`
Expected: PASS（`updateCustomerNotes` の戻り値変更が既存の実DBテストと矛盾しないことを確認。
該当ディレクトリにテストが無ければ skip）

- [ ] **Step 7: コミット**

```bash
git add __tests__/unit/actions/customer-audit-diff.test.ts \
  src/shared/domain/customers/commands.ts \
  src/app/\(admin\)/admin/\(dashboard\)/_shared/actions/customer.ts
git commit -m "$(cat <<'EOF'
feat(admin): audit-log customer notes diff (customer.notes)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: toggleCustomerActive に詳細監査ログ (customer.active) を追加

**Files:**

- Modify: `src/shared/domain/customers/commands.ts:149-163`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/customer.ts:255-276`
- Test: `__tests__/unit/actions/customer-audit-diff.test.ts`

**Interfaces:**

- Consumes: なし
- Produces: `toggleCustomerActiveCommand(id: string): Promise<{ previousActive: boolean }>`
  （戻り値を `void` から変更）

- [ ] **Step 1: 失敗するテストを書く**

`mock.module("@/shared/domain/customers/commands", ...)` の
`toggleCustomerActive: mock(() => Promise.resolve(undefined))` を named mock に変更する。
`mockUpdateCustomerNotesCommand` の定義の直後に追加:

```ts
const mockToggleCustomerActiveCommand = mock<
  () => Promise<{ previousActive: boolean }>
>(() => Promise.resolve({ previousActive: true }));
```

`mock.module` 内の該当行を変更:

```ts
  toggleCustomerActive: (
    ...args: Parameters<typeof mockToggleCustomerActiveCommand>
  ) => mockToggleCustomerActiveCommand(...args),
```

ファイル末尾に追加:

```ts
describe("toggleCustomerActive の AuditLog diff (customer.active)", () => {
  beforeEach(() => {
    currentUser = { id: "admin-1" };
    mockToggleCustomerActiveCommand.mockReset();
    mockToggleCustomerActiveCommand.mockResolvedValue({
      previousActive: true,
    });
    mockCreateAuditLogRecord.mockReset();
    mockCreateAuditLogRecord.mockResolvedValue(undefined);
  });

  test("有効→無効の切替を oldValue/newValue に記録する", async () => {
    await toggleCustomerActive(CUSTOMER_UUID);
    await flushMicrotasks();

    expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
    const call = mockCreateAuditLogRecord.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("call is undefined");
    expect(call["resource"]).toBe("customer.active");
    expect(call["resourceId"]).toBe(CUSTOMER_UUID);
    expect(call["oldValue"]).toEqual({ isActive: true });
    expect(call["newValue"]).toEqual({ isActive: false });
  });
});
```

- [ ] **Step 2: テストを実行し、失敗することを確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/actions/customer-audit-diff.test.ts`
Expected: FAIL — 新テストが `mockCreateAuditLogRecord` 呼び出し0回で失敗。

- [ ] **Step 3: ドメインコマンドの戻り値を変更する**

`src/shared/domain/customers/commands.ts:149-163` を以下に変更:

```ts
export async function toggleCustomerActive(
  id: string,
): Promise<{ previousActive: boolean }> {
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { id: true, isActive: true },
  });

  if (!customer) {
    throw new DomainError("顧客が見つかりません", "NOT_FOUND");
  }

  await prisma.customer.update({
    where: { id },
    data: { isActive: !customer.isActive },
  });

  return { previousActive: customer.isActive };
}
```

- [ ] **Step 4: action 層に監査ログを追加する**

`src/app/(admin)/admin/(dashboard)/_shared/actions/customer.ts:255-276` を以下に変更:

```ts
export async function toggleCustomerActive(
  id: string,
): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "customer",
    action: "update",
    resourceId: validated.data,
    execute: async (user) => {
      const { previousActive } = await toggleCustomerActiveCommand(
        validated.data,
      );
      const { ip, userAgent } = await buildAuditRequestContext();
      return { previousActive, actorUserId: user.id, ip, userAgent };
    },
    afterSuccess: (outcome) => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      updateTag(getCacheTag.customers.detail(validated.data));

      fireAndForget(
        createAuditLogRecord({
          userId: outcome.actorUserId,
          action: AuditAction.UPDATE,
          resource: "customer.active",
          resourceId: validated.data,
          oldValue: { isActive: outcome.previousActive },
          newValue: { isActive: !outcome.previousActive },
          metadata: {
            ...(outcome.ip !== null && { ip: outcome.ip }),
            ...(outcome.userAgent !== null && {
              userAgent: outcome.userAgent,
            }),
          },
        }),
        {
          operation: "auditLogToggleCustomerActive",
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.MEDIUM,
        },
      );
    },
  });
}
```

- [ ] **Step 5: テストを再実行し、成功することを確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/actions/customer-audit-diff.test.ts`
Expected: PASS（既存テストも含め全件）

- [ ] **Step 6: コミット**

```bash
git add __tests__/unit/actions/customer-audit-diff.test.ts \
  src/shared/domain/customers/commands.ts \
  src/app/\(admin\)/admin/\(dashboard\)/_shared/actions/customer.ts
git commit -m "$(cat <<'EOF'
feat(admin): audit-log customer active toggle (customer.active)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: clearCustomerRiskFlag に詳細監査ログ (customer.riskFlag) を追加

**Files:**

- Modify: `src/shared/domain/customers/risk-detection.ts:1-11`（import追加）, `:249-254`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/customer.ts:283-304`
- Test: `__tests__/unit/actions/customer-audit-diff.test.ts`

**Interfaces:**

- Consumes: なし
- Produces: `clearRiskFlagCommand(customerId: string): Promise<{ previousFlaggedForReviewAt: Date | null; previousFlagReasons: string[] }>`
  （戻り値を `void` から変更）

- [ ] **Step 1: 失敗するテストを書く**

`mock.module("@/shared/domain/customers/risk-detection", ...)`（123-125行目）の
`clearRiskFlagCommand: mock(() => Promise.resolve(undefined))` を named mock に変更する。
`mockToggleCustomerActiveCommand` の定義の直後に追加:

```ts
const mockClearRiskFlagCommand = mock<
  () => Promise<{
    previousFlaggedForReviewAt: Date | null;
    previousFlagReasons: string[];
  }>
>(() =>
  Promise.resolve({
    previousFlaggedForReviewAt: null,
    previousFlagReasons: [],
  }),
);
```

`mock.module` 内の該当ブロックを変更:

```ts
mock.module("@/shared/domain/customers/risk-detection", () => ({
  clearRiskFlagCommand: (
    ...args: Parameters<typeof mockClearRiskFlagCommand>
  ) => mockClearRiskFlagCommand(...args),
}));
```

ファイル末尾に追加:

```ts
describe("clearCustomerRiskFlag の AuditLog diff (customer.riskFlag)", () => {
  beforeEach(() => {
    currentUser = { id: "admin-1" };
    mockClearRiskFlagCommand.mockReset();
    mockClearRiskFlagCommand.mockResolvedValue({
      previousFlaggedForReviewAt: new Date("2026-07-15T00:00:00.000Z"),
      previousFlagReasons: ["RAPID_BOOKING"],
    });
    mockCreateAuditLogRecord.mockReset();
    mockCreateAuditLogRecord.mockResolvedValue(undefined);
  });

  test("フラグ解除前後を oldValue/newValue に記録する (Dateは ISO 文字列化)", async () => {
    await clearCustomerRiskFlag(CUSTOMER_UUID);
    await flushMicrotasks();

    expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
    const call = mockCreateAuditLogRecord.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("call is undefined");
    expect(call["resource"]).toBe("customer.riskFlag");
    expect(call["resourceId"]).toBe(CUSTOMER_UUID);
    expect(call["oldValue"]).toEqual({
      flaggedForReviewAt: "2026-07-15T00:00:00.000Z",
      flagReasons: ["RAPID_BOOKING"],
    });
    expect(call["newValue"]).toEqual({
      flaggedForReviewAt: null,
      flagReasons: [],
    });
  });
});
```

- [ ] **Step 2: テストを実行し、失敗することを確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/actions/customer-audit-diff.test.ts`
Expected: FAIL — 新テストが `mockCreateAuditLogRecord` 呼び出し0回で失敗。

- [ ] **Step 3: risk-detection.ts に DomainError の import を追加する**

`src/shared/domain/customers/risk-detection.ts` の import ブロック（1-8行目）を以下に変更:

```ts
import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { ReservationStatus, RegistrationStatus } from "@generated/prisma/enums";
import {
  RISK_FLAG_REASON,
  type RiskFlagReason,
} from "@/shared/lib/validations/enums/helpers";
```

- [ ] **Step 4: clearRiskFlagCommand の戻り値を変更する**

`src/shared/domain/customers/risk-detection.ts:249-254` を以下に変更:

```ts
/** 管理者による手動クリア(誤検知時に使う)。 */
export async function clearRiskFlagCommand(customerId: string): Promise<{
  previousFlaggedForReviewAt: Date | null;
  previousFlagReasons: string[];
}> {
  const existing = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { flaggedForReviewAt: true, flagReasons: true },
  });
  if (!existing) {
    throw new DomainError("顧客が見つかりません", "NOT_FOUND");
  }

  await prisma.customer.update({
    where: { id: customerId },
    data: { flaggedForReviewAt: null, flagReasons: [] },
  });

  return {
    previousFlaggedForReviewAt: existing.flaggedForReviewAt,
    previousFlagReasons: existing.flagReasons,
  };
}
```

- [ ] **Step 5: action 層に監査ログを追加する**

`src/app/(admin)/admin/(dashboard)/_shared/actions/customer.ts:283-304` を以下に変更:

```ts
export async function clearCustomerRiskFlag(
  id: string,
): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "customer",
    action: "update",
    resourceId: validated.data,
    execute: async (user) => {
      const { previousFlaggedForReviewAt, previousFlagReasons } =
        await clearRiskFlagCommand(validated.data);
      const { ip, userAgent } = await buildAuditRequestContext();
      return {
        previousFlaggedForReviewAt,
        previousFlagReasons,
        actorUserId: user.id,
        ip,
        userAgent,
      };
    },
    afterSuccess: (outcome) => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      updateTag(getCacheTag.customers.detail(validated.data));

      fireAndForget(
        createAuditLogRecord({
          userId: outcome.actorUserId,
          action: AuditAction.UPDATE,
          resource: "customer.riskFlag",
          resourceId: validated.data,
          oldValue: {
            flaggedForReviewAt:
              outcome.previousFlaggedForReviewAt?.toISOString() ?? null,
            flagReasons: outcome.previousFlagReasons,
          },
          newValue: { flaggedForReviewAt: null, flagReasons: [] },
          metadata: {
            ...(outcome.ip !== null && { ip: outcome.ip }),
            ...(outcome.userAgent !== null && {
              userAgent: outcome.userAgent,
            }),
          },
        }),
        {
          operation: "auditLogClearCustomerRiskFlag",
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.MEDIUM,
        },
      );
    },
  });
}
```

- [ ] **Step 6: テストを再実行し、成功することを確認する**

Run: `bun scripts/run-tests.ts __tests__/unit/actions/customer-audit-diff.test.ts`
Expected: PASS（既存テストも含め全件）

- [ ] **Step 7: コミット**

```bash
git add __tests__/unit/actions/customer-audit-diff.test.ts \
  src/shared/domain/customers/risk-detection.ts \
  src/app/\(admin\)/admin/\(dashboard\)/_shared/actions/customer.ts
git commit -m "$(cat <<'EOF'
feat(admin): audit-log customer risk-flag clear (customer.riskFlag)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 最終検証

**Files:** なし（検証のみ）

- [ ] **Step 1: 型チェック**

Run: `bun run type-check`
Expected: exit 0

- [ ] **Step 2: lint**

Run: `bun run validate`
Expected: exit 0

- [ ] **Step 3: 関連 unit テストを一括実行**

Run: `bun scripts/run-tests.ts __tests__/unit/actions/customer-audit-diff.test.ts __tests__/unit/architecture-boundaries.test.ts`
Expected: PASS 全件

- [ ] **Step 4: 顧客ドメインの integration テストを実行**

Run: `bun run test:integration -- --grep customer`（該当スクリプトが grep 引数非対応の場合は
`bun scripts/run-tests.ts __tests__/integration/domain/customers` を実行）
Expected: PASS 全件（3ドメインコマンドの戻り値変更が実DBテストと矛盾しないことを確認）
