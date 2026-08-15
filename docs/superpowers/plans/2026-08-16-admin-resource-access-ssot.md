# Admin resource-access decision SSoT 化 — 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** resource-level access（EDITOR の page assignment）の decision を `userHasResourceAccess` に一本化し、3 composition site の冗長な `isEditorRole` 前段分岐を削除して、実 predicate を通すテストに置き換える。

**Architecture:** `src/shared/domain/admin-auth/resource-access.ts` の `userHasResourceAccess` は既に全関数（RBAC 未通過 / 非 EDITOR / `resourceId` 欠落を内部処理）。3 site（`_helpers.ts` / `action-auth.ts` / `admin-action.ts`）の前段分岐を削除するだけで decision が統合される。deny 機構（result union / `notFound()` / MutationResult）は層の意図的な差なので触らない。production の振る舞い変化はゼロ。

**Tech Stack:** Next.js 16 / React 19 / TypeScript / Bun / bun:test

**Spec:** `docs/superpowers/specs/2026-08-16-admin-resource-access-decision-ssot-design.md`

## Global Constraints

- **1 PR = 1 論理変更。** 本計画は 1 PR（5〜6 ファイル、src は −15 行程度）。
- **緑を偽装しない。** `skip` / assertion 弱め / `--no-verify` / 素の `bun test` は禁止。
- **成功を主張せず、証拠を出す。** 走らせたコマンドと出力を示す。
- 単一ファイルのテストは `bun run test -- <path>`（`test:unit --` では絞れない）。
- 型のエスケープハッチ（`as any` / `@ts-ignore`）を足さない。
- commit message は conventional commits + 末尾 `[ai-gen]`。PowerShell では
  `git commit -m @"..."@` 形式（HEREDOC は使わない）。
- 変異の投入・復元は PowerShell `Copy-Item` で行い、復元後は
  `git status --porcelain -- <file>` が空であることを確認する。
- 作業は隔離 worktree `.worktrees/refactor-resource-access-ssot/` で行う。
  main checkout・他 worktree（`.worktrees/fix-round6-*`）は触らない。

## 検証済みの前提（2026-08-16 に現物で確認）

- `userHasResourceAccess`（`resource-access.ts:28-48`）: `!hasPermission` → false /
  非 EDITOR → true / `!resourceId` → true / それ以外 → assignment lookup。
- 3 site はすべて resource check の前に RBAC 通過済み（`_helpers.ts:81` の
  `requireAdminPermission` / `action-auth.ts:115` の `checkPermission` /
  `admin-action.ts:95` の `hasPermission` 直呼び）。
- `user-page-assignments/queries.ts` の export は `getAssignedPageIdsForUser`
  1 本のみ（完全置換 mock が安全）。
- `action-auth.test.ts`（HEAD 版・Task 9 済）は session spread で `checkPermission`
  のみ実 predicate 検証済み。`checkResourceAccess` の describe は**まだ無い**
  （main checkout の未コミット作業が追加中のものと混同しない。worktree は
  HEAD ベースなので Task 2 で自分の変更として追加する）。
  session spread のイディオムが unit tree で動くことは実証済み。
- **並行作業メモ（2026-08-16 時点）:** main checkout に
  `admin-query-helpers.test.ts` / `action-auth.test.ts` の未コミット変更が存在し、
  本計画の Task 1 / Task 2 と同方向の部分集合（mock 撤去 + DB 境界 mock 化）。
  本 worktree は HEAD ベースで物理的に衝突せず、本 PR の変更はあちらを包含する。
  main checkout の dirty ファイルには一切触らない。
- `admin-auth` 配下は `customer-auth` を import しない（grep 済み）→ 現行テストの
  customer-auth mock は dead weight で、今回の rewrite で削除して安全。
- EDITOR は `page:read` / `page:update` を持つ（`admin-permissions.ts:250-257`）。
- `requireAdminDetailPage(resource, resourceId?)` は `resourceId` 省略可能
  （`page-auth.ts:44-49`）→ 「EDITOR + resourceId 無し」は実在の呼出形。
- `admin-permission-denial-mechanism.test.ts:67-68` が `_helpers.ts` の
  `denyAdminAccess()` 出現 ≥ 3 を要求 → 拒否分岐 2 つとも維持する本計画では変わらず 3。
- `checkResourceAccess: true` の caller は 8 箇所（`page-section.ts` ×6、
  `pages.ts` ×2）で、いずれも action-shape テストが wrapper を全 mock。
  step 4 を実実行するテストは現存しない。

---

### Task 1: admin-query-helpers.test.ts を実 predicate 化する

**Files:**

- Modify: `__tests__/unit/queries/admin-query-helpers.test.ts`（全面に近い編集）
- 変更対象の実装（**触らない**。変異検査でのみ一時的に壊す）:
  `src/shared/domain/admin-auth/resource-access.ts`

**Interfaces:**

- Consumes:
  - `requireAdminPermission(resource, action): Promise<AdminAuthUser>` /
    `requireAdminResourcePermission(resource, action, resourceId?): Promise<AdminAuthUser>`
    — `@/admin/queries/_helpers`
  - `ADMIN_USER` / `EDITOR_USER` / `VIEWER_USER` — `__tests__/fixtures/users.ts`
  - `getAssignedPageIdsForUser(userId: string): Promise<string[]>` —
    `@/shared/domain/user-page-assignments/queries`（mock 対象の DB 境界）
- Produces: なし（テストのみ）

---

- [ ] **Step 1: mock 構成を実 predicate 構成に置き換える**

ファイル冒頭（現 1-66 行）を次で置き換える。変更点:
`mockIsEditorRole` / `mockUserHasResourceAccess` / `admin-role-guards` mock /
`resource-access` mock / `customer-auth` mock を**削除**。session mock は
spread-actual + `verifyAdminSession` のみ差し替えに。DB 境界の
`user-page-assignments/queries` mock を追加。

```ts
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ADMIN_USER, EDITOR_USER, VIEWER_USER } from "../../fixtures/users";

/** 権限拒否は `notFound()`（その場に 404 境界を描画）で表現される。
 *  旧実装の `redirect("/admin")` は streaming 下で meta タグに劣化するため廃止。 */
let notFoundCalls = 0;
const mockVerifyAdminSession = mock(async () => ADMIN_USER);
const mockRecordPermissionDenied = mock(async () => {});
const mockHeaders = mock(async () => new Headers());

mock.module("next/navigation", () => ({
  notFound: () => {
    notFoundCalls += 1;
    throw new Error("NOT_FOUND");
  },
}));

mock.module("next/headers", () => ({
  headers: () => mockHeaders(),
}));

// `mock.module` は完全置換。session module は実モジュールを spread し、
// 認証境界の `verifyAdminSession` だけ差し替える (.claude/rules/testing.md)。
const actualSession = await import("@/shared/domain/admin-auth/session");

mock.module("@/shared/domain/admin-auth/session", () => ({
  ...actualSession,
  verifyAdminSession: () => mockVerifyAdminSession(),
}));

// `@/shared/lib/admin-permissions` / `@/shared/lib/admin-role-guards` /
// `@/shared/domain/admin-auth/resource-access` は mock しない。predicate を
// mock すると requireAdmin(Resource)Permission の分岐が観測できない
// （第6次監査の残件: 旧 :44-53 の mock で deny テストが配線テスト化していた）。
// 代わりに真の DB 境界である user-page-assignments/queries だけを差し替える
// （export は getAssignedPageIdsForUser 1 本のみ。prisma が graph から落ちる）。
const mockGetAssignedPageIdsForUser = mock(
  async (_userId: string): Promise<string[]> => [],
);

mock.module("@/shared/domain/user-page-assignments/queries", () => ({
  getAssignedPageIdsForUser: (
    ...args: Parameters<typeof mockGetAssignedPageIdsForUser>
  ) => mockGetAssignedPageIdsForUser(...args),
}));

mock.module("@/admin/lib/audit", () => ({
  recordPermissionDenied: (
    ...args: Parameters<typeof mockRecordPermissionDenied>
  ) => mockRecordPermissionDenied(...args),
}));

const { requireAdminPermission, requireAdminResourcePermission } =
  await import("@/admin/queries/_helpers");
```

`beforeEach`（現 69-82 行）を次に置き換える:

```ts
beforeEach(() => {
  notFoundCalls = 0;
  mockVerifyAdminSession.mockReset();
  mockRecordPermissionDenied.mockReset();
  mockHeaders.mockReset();
  mockGetAssignedPageIdsForUser.mockReset();

  mockVerifyAdminSession.mockResolvedValue(ADMIN_USER);
  mockRecordPermissionDenied.mockResolvedValue(undefined);
  mockHeaders.mockResolvedValue(new Headers());
  mockGetAssignedPageIdsForUser.mockResolvedValue([]);
});
```

既存 3 テスト（`権限がある場合は user を返す` / `action 引数が判定に効く…` /
`権限がない場合は notFound() で拒否して deny を記録する`）は**触らない**。

- [ ] **Step 2: resource 系のテストを実 predicate の 3 本に置き換える**

現 124-145 行の `EDITOR の resource scope が外れている場合は notFound() で拒否する`
を削除し、代わりに次の 3 本を置く（各々が別の変異クラスを殺す）:

```ts
test("EDITOR は割当済み page を通り、割当外は notFound() で拒否して deny を記録する", async () => {
  mockVerifyAdminSession.mockResolvedValue(EDITOR_USER);
  mockGetAssignedPageIdsForUser.mockResolvedValue(["page-1"]);

  const user = await requireAdminResourcePermission("page", "read", "page-1");
  expect(user.id).toBe(EDITOR_USER.id);
  expect(notFoundCalls).toBe(0);

  await expect(
    requireAdminResourcePermission("page", "read", "page-2"),
  ).rejects.toThrow("NOT_FOUND");

  expect(notFoundCalls).toBe(1);
  expect(mockRecordPermissionDenied).toHaveBeenCalledWith(
    EDITOR_USER.id,
    "page",
    "read",
    "page-2",
  );
});

test("EDITOR は resourceId 無しなら assignment 検査なしで許可される（list page 形）", async () => {
  mockVerifyAdminSession.mockResolvedValue(EDITOR_USER);

  const user = await requireAdminResourcePermission("page", "read");

  expect(user.id).toBe(EDITOR_USER.id);
  expect(notFoundCalls).toBe(0);
  expect(mockGetAssignedPageIdsForUser).not.toHaveBeenCalled();
});

test("ADMIN は resourceId 付きでも assignment 検査にかからない", async () => {
  mockVerifyAdminSession.mockResolvedValue(ADMIN_USER);

  const user = await requireAdminResourcePermission("page", "read", "page-9");

  expect(user.id).toBe(ADMIN_USER.id);
  expect(notFoundCalls).toBe(0);
  expect(mockGetAssignedPageIdsForUser).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: 通ることを確認する（現状 src は正しいので即緑 = behavior lock）**

```powershell
bun run test -- __tests__/unit/queries/admin-query-helpers.test.ts
```

期待: PASS（6 tests。既存 3 + 新規 3）。

- [ ] **Step 4: commit**

```powershell
git add __tests__/unit/queries/admin-query-helpers.test.ts
git commit -m @"
test(admin): run real resource-access predicates in query helper tests [ai-gen]
"@
```

---

### Task 2: action-auth.test.ts に checkResourceAccess の実 predicate カバレッジを追加する

**Files:**

- Modify: `__tests__/unit/admin/lib/action-auth.test.ts`

**Interfaces:**

- Consumes:
  - `checkResourceAccess(resource, action, resourceId?, requestHeaders?): Promise<PermissionResult>`
    — `@/admin/lib/action-auth`（`:109`）
  - `EDITOR_USER` — `__tests__/fixtures/users.ts`
  - `getAssignedPageIdsForUser(userId): Promise<string[]>` — DB 境界 mock
- Produces: なし（テストのみ）

**なぜ:** HEAD 版は `checkPermission` しか実実行していない。Task 3 で
`checkResourceAccess` から `isEditorRole` wrapper を削除する以上、その振る舞いを
固定する実 predicate テストを先に置く（behavior lock）。

---

- [ ] **Step 1: mock / import / describe を追加する**

`:5` の import を次に変更（`EDITOR_USER` 追加）:

```ts
import { ADMIN_USER, EDITOR_USER, VIEWER_USER } from "../../../fixtures/users";
```

`:29-33` の session mock ブロックの直後に次を挿入:

```ts
const mockGetAssignedPageIdsForUser = mock(
  async (_userId: string): Promise<string[]> => [],
);

// user-page-assignments/queries の export はこの 1 本だけなので完全置換で安全。
// これで `@/shared/db/prisma` が module graph から落ちる。
mock.module("@/shared/domain/user-page-assignments/queries", () => ({
  getAssignedPageIdsForUser: (
    ...args: Parameters<typeof mockGetAssignedPageIdsForUser>
  ) => mockGetAssignedPageIdsForUser(...args),
}));
```

`:35` の target import を次に変更（`checkResourceAccess` 追加）:

```ts
const { checkPermission, checkResourceAccess, logAction } =
  await import("@/admin/lib/action-auth");
```

ファイル末尾に describe を 1 つ追加:

```ts
describe("checkResourceAccess", () => {
  beforeEach(() => {
    mockGetAdminSession.mockReset();
    mockRecordPermissionDenied.mockReset();
    mockGetAssignedPageIdsForUser.mockReset();
    mockGetAssignedPageIdsForUser.mockResolvedValue([]);
  });

  test("EDITOR は割当外の page を拒否され、割当済みの page は通る", async () => {
    mockGetAdminSession.mockResolvedValue({ user: EDITOR_USER });
    mockGetAssignedPageIdsForUser.mockResolvedValue(["page-1"]);

    const denied = await checkResourceAccess("page", "update", "page-2");

    expect(denied).toEqual({
      success: false,
      error: { error: "このリソースへのアクセス権がありません" },
    });
    expect(mockRecordPermissionDenied).toHaveBeenCalledWith(
      EDITOR_USER.id,
      "page",
      "update",
      "page-2",
    );

    const allowed = await checkResourceAccess("page", "update", "page-1");

    expect(allowed.success).toBe(true);
    if (allowed.success) {
      expect(allowed.user.id).toBe(EDITOR_USER.id);
    }
  });
});
```

- [ ] **Step 2: 通ることを確認する（現状 src で緑 = behavior lock）**

```powershell
bun run test -- __tests__/unit/admin/lib/action-auth.test.ts
```

期待: PASS（8 tests。既存 7 + 新規 1）。

- [ ] **Step 3: commit**

```powershell
git add __tests__/unit/admin/lib/action-auth.test.ts
git commit -m @"
test(admin): execute checkResourceAccess with real resource-access predicates [ai-gen]
"@
```

---

### Task 3: src 3 site の冗長な isEditorRole 分岐を削除する

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/queries/_helpers.ts:7,83-93`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/lib/action-auth.ts:20,109-131`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/lib/admin-action.ts:5,107-124`
- Modify: `src/shared/domain/admin-auth/resource-access.ts`（docstring に 3 行追加のみ）

**Interfaces:**

- Consumes: `userHasResourceAccess(user, resource, action, resourceId?): Promise<boolean>`
  — `@/shared/domain/admin-auth/resource-access`（全関数。事前分岐は不要）
- Produces: なし（シグネチャ変更なし。export 名・引数・戻り値は全て不変）

---

- [ ] **Step 1: `_helpers.ts`**

`import { isEditorRole } from "@/shared/lib/admin-role-guards";`（:7）を削除。

`requireAdminResourcePermission`（:75-93）を次に置き換える:

```ts
export async function requireAdminResourcePermission(
  resource: Resource,
  action: Action,
  resourceId?: string,
): Promise<AdminAuthUser> {
  await headers();
  const user = await requireAdminPermission(resource, action);

  if (!(await userHasResourceAccess(user, resource, action, resourceId))) {
    recordPermissionDenied(user.id, resource, action, resourceId);
    denyAdminAccess();
  }

  return user;
}
```

- [ ] **Step 2: `action-auth.ts`**

`import { isEditorRole } from "@/shared/lib/admin-role-guards";`（:20）を削除。

`checkResourceAccess`（:109-131）を次に置き換える:

```ts
export async function checkResourceAccess(
  resource: Resource,
  action: Action,
  resourceId?: string,
  requestHeaders?: Headers,
): Promise<PermissionResult> {
  const permResult = await checkPermission(resource, action, requestHeaders);
  if (!permResult.success) return permResult;

  const { user } = permResult;

  if (!(await userHasResourceAccess(user, resource, action, resourceId))) {
    recordPermissionDenied(user.id, resource, action, resourceId);
    return {
      success: false,
      error: { error: "このリソースへのアクセス権がありません" },
    };
  }

  return { success: true, user };
}
```

- [ ] **Step 3: `admin-action.ts`**

`import { isEditorRole } from "@/shared/lib/admin-role-guards";`（:5）を削除。

step 4 ブロック（:107-124）を次に置き換える:

```ts
// 4. resource-level access チェック — EDITOR の page assignment 判定・
//    非 EDITOR の素通し・resourceId 欠落はすべて userHasResourceAccess が内包する
if (
  options.checkResourceAccess &&
  !(await userHasResourceAccess(
    user,
    options.resource,
    options.action,
    resourceId,
  ))
) {
  recordPermissionDenied(user.id, options.resource, options.action, resourceId);
  return { error: "このリソースへのアクセス権がありません" };
}
```

- [ ] **Step 4: `resource-access.ts` の docstring に再導入防止を 1 節追加**

既存 JSDoc（:9-27）の末尾（`（`(public)` tree は …）` の段落の後）に次を追加:

```
 *
 * 呼び出し側で `isEditorRole` や `resourceId` の有無による事前分岐を置かないこと。
 * それらはすべて本関数が内包しており、前段分岐は変異検査で検出不能な
 * 振る舞い中立の死に分岐を生むだけである。
```

- [ ] **Step 5: 通ることを確認する**

```powershell
bun run test -- __tests__/unit/queries/admin-query-helpers.test.ts
bun run test -- __tests__/unit/admin/lib/action-auth.test.ts
```

期待: 両方 PASS（helpers 6 tests / action-auth 8 tests）。実 predicate テストが
リファクタ後も緑であることを確認する（= 振る舞い保存の証拠）。

- [ ] **Step 6: commit**

```powershell
git add "src/app/(admin)/admin/(dashboard)/_shared/queries/_helpers.ts" "src/app/(admin)/admin/(dashboard)/_shared/lib/action-auth.ts" "src/app/(admin)/admin/(dashboard)/_shared/lib/admin-action.ts" "src/shared/domain/admin-auth/resource-access.ts"
git commit -m @"
refactor(admin): delegate resource-access decisions to userHasResourceAccess [ai-gen]
"@
```

---

### Task 4: executeAdminMutationResult step 4 の実実行テストを integration に追加

**Files:**

- Modify: `__tests__/integration/actions/admin/_executeAdminMutationResult-rbac.test.ts`

**Interfaces:**

- Consumes:
  - `executeAdminMutationResult(options): Promise<MutationResult<TData>>` —
    `@/admin/lib/admin-action`
  - `isMutationError` — `@/shared/lib/mutation-result`（同ファイルで import 済み）
- Produces: なし（テストのみ）

---

- [ ] **Step 1: boundary mock を追加する**

`:59-61` の `@/admin/lib/audit` mock ブロックの直後に次を挿入:

```ts
// step 4 の resource-level access は実物の userHasResourceAccess を通し、
// 真の DB 境界だけを差し替える（export は getAssignedPageIdsForUser 1 本のみ）。
const mockGetAssignedPageIdsForUser = mock(
  async (_userId: string): Promise<string[]> => [],
);

mock.module("@/shared/domain/user-page-assignments/queries", () => ({
  getAssignedPageIdsForUser: (
    ...args: Parameters<typeof mockGetAssignedPageIdsForUser>
  ) => mockGetAssignedPageIdsForUser(...args),
}));
```

`:111-113` の target import ブロックに 1 行追加:

```ts
const { executeAdminMutationResult } = await import("@/admin/lib/admin-action");
```

`beforeEach`（:118-124）の mockClear 列に `mockGetAssignedPageIdsForUser.mockClear();`
を追加。

- [ ] **Step 2: step 4 のテストを 1 本追加する**

describe 内の最後（`未認証 (checkAdminAuth fail)…` テストの後）に追加:

```ts
test("role=EDITOR + checkResourceAccess: step 4 が実 predicate で発火し、割当外は execute 非実行・割当済みは実行", async () => {
  // 同一 test 内で 2 回呼ぶため Once ではなく永続実装で差し替える
  // （Once だと 2 回目が default の ADMIN に落ちて allow 側を証明できない）。
  // default 実装への復帰は既存の afterEach が担う。
  mockCheckAdminAuth.mockImplementation(async () => ({
    success: true,
    user: {
      id: "editor-user-id",
      email: "editor@example.com",
      role: "EDITOR",
    },
  }));
  mockGetAssignedPageIdsForUser.mockResolvedValue([]);
  const execute = mock(async () => ({ ok: true }));

  const denied = await executeAdminMutationResult({
    resource: "page",
    action: "update",
    checkResourceAccess: true,
    resourceId: "page-2",
    execute,
  });

  expect(isMutationError(denied)).toBe(true);
  if (isMutationError(denied)) {
    expect(denied.error).toBe("このリソースへのアクセス権がありません");
  }
  expect(execute).not.toHaveBeenCalled();
  expect(mockRecordPermissionDenied).toHaveBeenCalledWith(
    "editor-user-id",
    "page",
    "update",
    "page-2",
  );

  mockGetAssignedPageIdsForUser.mockResolvedValue(["page-1"]);

  const allowed = await executeAdminMutationResult({
    resource: "page",
    action: "update",
    checkResourceAccess: true,
    resourceId: "page-1",
    execute,
  });

  expect(isMutationError(allowed)).toBe(false);
  expect(execute).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 3: 通ることを確認する**

```powershell
bun run test -- __tests__/integration/actions/admin/_executeAdminMutationResult-rbac.test.ts
```

期待: PASS（4 tests。既存 3 + 新規 1）。

- [ ] **Step 4: commit**

```powershell
git add __tests__/integration/actions/admin/_executeAdminMutationResult-rbac.test.ts
git commit -m @"
test(admin): cover executeAdminMutationResult step-4 resource access [ai-gen]
"@
```

---

### Task 5: 変異検査（受入条件）と全体検証

変異を 1 つずつ投入し、指定のテストが赤くなることを実測してから必ず復元する。
復元漏れは pre-push / CI を汚すので、各変異の最後に `git status --porcelain` の
空出力までを 1 セットで行う。

- [ ] **Step 1: 変異 M-a — `resource-access.ts` の `isEditorRole` → 常時 true 相当**

```powershell
Copy-Item "src/shared/domain/admin-auth/resource-access.ts" "$env:TEMP/resource-access.bak"
```

`:38` の `if (!isEditorRole(user.role)) {` を `if (false) {` に書き換える
（非 EDITOR の early-true が死に、ADMIN も assignment lookup に落ちる）。

```powershell
bun run test -- __tests__/unit/queries/admin-query-helpers.test.ts
```

期待: FAIL — `ADMIN は resourceId 付きでも assignment 検査にかからない` が落ちる。

復元して確認:

```powershell
Copy-Item "$env:TEMP/resource-access.bak" "src/shared/domain/admin-auth/resource-access.ts"
git status --porcelain -- "src/shared/domain/admin-auth/resource-access.ts"
```

期待: 出力なし。

- [ ] **Step 2: 変異 M-b — `isEditorRole` → 常時 false 相当**

同じく `:38` を `if (true) {` に書き換える（EDITOR でも assignment を見ない）。

```powershell
bun run test -- __tests__/unit/queries/admin-query-helpers.test.ts
```

期待: FAIL — `EDITOR は割当済み page を通り、割当外は notFound() で拒否して deny を記録する`
が落ちる（割当外が通ってしまう）。復元と `git status --porcelain` の空確認。

- [ ] **Step 3: 変異 M-c — `_helpers.ts` の resource check 呼出削除**

`_helpers.ts` の `if (!(await userHasResourceAccess(...))) { ... }` ブロックを
丸ごと削除する。

```powershell
bun run test -- __tests__/unit/queries/admin-query-helpers.test.ts
```

期待: FAIL — EDITOR 割当外ケースが落ちる。復元と空確認。

- [ ] **Step 4: 変異 M-d — `admin-action.ts` step 4 ブロック削除**

`admin-action.ts` の step 4（`if (options.checkResourceAccess && ...)` ブロック）を
丸ごと削除する。

```powershell
bun run test -- __tests__/integration/actions/admin/_executeAdminMutationResult-rbac.test.ts
```

期待: FAIL — 新規テストの deny 側（`isMutationError(denied)` → true 期待）が落ちる。
復元と空確認。

- [ ] **Step 5: 変異 M-e — `resource-access.ts` の `!resourceId` 分岐変異**

`:42` の `if (!resourceId) {` を `if (false) {` に書き換える（EDITOR no-id も
lookup に落ちる）。

```powershell
bun run test -- __tests__/unit/queries/admin-query-helpers.test.ts
```

期待: FAIL — `EDITOR は resourceId 無しなら assignment 検査なしで許可される` が
落ちる。復元と空確認。

- [ ] **Step 6: architecture gate と隣接テストの全件確認**

```powershell
bun scripts/run-tests.ts __tests__/unit/architecture
bun run test -- __tests__/unit/admin/lib/action-auth.test.ts
```

期待: 両方 PASS。`admin-permission-denial-mechanism.test.ts`（`denyAdminAccess()`
≥ 3）が緑であることを特に確認する。

- [ ] **Step 7: validate**

```powershell
bun run validate
```

期待: PASS（type-check + lint）。type-check は `tsconfig.test.json` 経由で
`__tests__/**` も見る。

---

### Task 6: ドキュメントと出荷

- [ ] **Step 1: progress.md に記録**

`.superpowers/sdd/progress.md` の末尾に次の節を追加（PR 番号は PR 作成後に確定）:

```markdown
# Resource-access decision SSoT (2026-08-16)

- 3 composition site（`_helpers.ts` / `action-auth.ts` / `admin-action.ts`）の冗長な
  `isEditorRole` 前段分岐を削除し、decision を `userHasResourceAccess` に一本化。
  `isEditorRole → true` の振る舞い中立変異はコード削除で消滅（台帳記録不要に）。
- `admin-query-helpers.test.ts` は実 predicate 化（mock は session /
  user-page-assignments / audit / next のみ）。
- `executeAdminMutationResult` step 4 に integration 実実行ケースを追加
  （それまでは全テストで 1 度も実行されていなかった）。
- M-18 / L-a〜L-c / 新 gate / 残り 45 変異は継続して対象外。
```

- [ ] **Step 2: docs commit**

```powershell
git add docs/superpowers/specs/2026-08-16-admin-resource-access-decision-ssot-design.md docs/superpowers/plans/2026-08-16-admin-resource-access-ssot.md .superpowers/sdd/progress.md
git commit -m @"
docs(admin): add resource-access decision SSoT spec and plan [ai-gen]
"@
```

- [ ] **Step 3: push / PR / CI / merge**

```powershell
git push -u origin refactor/admin-resource-access-ssot
```

（lefthook pre-push で type-check + architecture gate 全件。80〜110 秒かかるので
timeout は 300 秒以上。）

```powershell
gh pr create --title "refactor(admin): resource-level access の decision を userHasResourceAccess に一本化" --body @"
...
"@
```

CI 緑（`gh pr checks --watch`）を確認してから squash merge し、worktree と
branch を削除する。CI が赤なら原因を直してから merge — 緑偽装で進まない。
