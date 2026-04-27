> **Snapshot: 2026-04-27** — Implementation completed, archived as historical reference.

# P19 Phase 2 — Admin Bulk Actions 実装計画

> **Spec**: `docs/superpowers/specs/2026-04-27-admin-bulk-actions-phase2-design.md`
> **対象**: customers / inquiries / coupons の bulk delete (+ customers/coupons は isActive toggle)
> **Bundle 構成**: 3 Bundle (D/E/F) = 3 commit、各 Bundle 並列 dispatch 可能
> **参照ベース**: Phase 1 `docs/superpowers/plans/2026-04-27-admin-bulk-actions-phase1.md` を完全踏襲

## Context

Phase 1 (spaces / events / news) で確立した `PostBulkActions` パターンを Phase 2 で 3 領域に対称適用する。Phase 2 は **status 遷移系を含めず**、`bulkDelete*Command` + `bulkToggleActive*Command` (該当時) のみに限定。**cloudflare mock は最初から全 11 export stub 化** (Phase 1 commit `aebc3052` の learning)。

各 Bundle は独立リソースの実装でファイル衝突なしのため 3 並列 dispatch 可能。

---

## Bundle D — Customers Bulk

**Commit message**: `feat(admin): bulk delete and active-toggle actions for customers`

### Files to create

1. `src/shared/domain/customers/bulk-commands.ts`
2. `src/app/(admin)/admin/(dashboard)/_shared/actions/customer/bulk.ts`
3. `src/app/(admin)/admin/(dashboard)/customers/_components/CustomerBulkActions.tsx`
4. `__tests__/unit/domain/customers/bulk-commands.test.ts`
5. `__tests__/integration/actions/admin/customer-bulk.test.ts`

### Files to modify

1. `src/app/(admin)/admin/(dashboard)/customers/_components/CustomerTable.tsx` — 行 checkbox + selectedIds + `<CustomerBulkActions />`
2. `src/app/(admin)/admin/(dashboard)/_shared/actions/customer.ts` (existing 単一ファイル) は触らない (`@/admin/actions/customer/bulk` を直接 import)
3. `package.json` 追記不要 (既存ディレクトリ batch で吸収、Phase 1 同パターン)

### Tasks

#### D1. domain command (`bulk-commands.ts`)

参照: `src/shared/domain/spaces/bulk-commands.ts` (Phase 1 Bundle A)

```typescript
import "server-only";

import { prisma } from "@/shared/db/prisma";

export type BulkToggleActiveCustomersResult = {
  count: number;
  isActive: boolean;
  affectedIds: string[];
};

export type BulkDeleteCustomersResult = {
  count: number;
  affectedIds: string[];
};

export async function bulkToggleActiveCustomersCommand(
  ids: string[],
  isActive: boolean,
): Promise<BulkToggleActiveCustomersResult> {
  if (ids.length === 0) return { count: 0, isActive, affectedIds: [] };
  const targets = await prisma.customer.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const result = await prisma.customer.updateMany({
    where: { id: { in: targets.map((t) => t.id) } },
    data: { isActive },
  });
  return {
    count: result.count,
    isActive,
    affectedIds: targets.map((t) => t.id),
  };
}

export async function bulkDeleteCustomersCommand(
  ids: string[],
): Promise<BulkDeleteCustomersResult> {
  if (ids.length === 0) return { count: 0, affectedIds: [] };
  const targets = await prisma.customer.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  // Reservation.customerId は onDelete: SetNull のため FK 衝突なし
  const result = await prisma.customer.deleteMany({
    where: { id: { in: targets.map((t) => t.id) } },
  });
  return { count: result.count, affectedIds: targets.map((t) => t.id) };
}
```

#### D2. Server Action (`actions/customer/bulk.ts`)

参照: `src/app/(admin)/admin/(dashboard)/_shared/actions/space/bulk.ts`

```typescript
"use server";

import { z } from "zod";
import {
  bulkToggleActiveCustomersCommand,
  bulkDeleteCustomersCommand,
  type BulkToggleActiveCustomersResult,
  type BulkDeleteCustomersResult,
} from "@/shared/domain/customers/bulk-commands";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { updateTag } from "next/cache";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";

const bulkInputSchema = z.object({
  ids: z
    .array(z.string().uuid({ error: "ID が不正です" }))
    .min(1, { error: "1 件以上選択してください" })
    .max(100, { error: "一度に処理できるのは 100 件までです" }),
});

export const bulkToggleActiveCustomers = async (
  ids: string[],
  isActive: boolean,
): Promise<MutationResult<BulkToggleActiveCustomersResult>> => {
  const parsed = bulkInputSchema.safeParse({ ids });
  if (!parsed.success) return createValidationMutationError(parsed.error);
  return executeAdminMutationResult({
    resource: "customer",
    action: "update",
    execute: async () =>
      bulkToggleActiveCustomersCommand(parsed.data.ids, isActive),
    afterSuccess: async (data) => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      for (const id of data.affectedIds) {
        updateTag(getCacheTag.customers.detail(id));
      }
    },
  });
};

export const bulkDeleteCustomers = async (
  ids: string[],
): Promise<MutationResult<BulkDeleteCustomersResult>> => {
  const parsed = bulkInputSchema.safeParse({ ids });
  if (!parsed.success) return createValidationMutationError(parsed.error);
  return executeAdminMutationResult({
    resource: "customer",
    action: "delete",
    execute: async () => bulkDeleteCustomersCommand(parsed.data.ids),
    afterSuccess: async (data) => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      for (const id of data.affectedIds) {
        updateTag(getCacheTag.customers.detail(id));
      }
    },
  });
};
```

**実装者注意**:

- `getCacheTag.customers.detail` の正確な署名は `@/shared/lib/constants` を Read で確認
- `executeAdminMutationResult` の `Action` 型に `update` / `delete` の実在確認
- 既存 `actions/customer.ts` の cache 無効化パターンと整合させる

#### D3. UI (`CustomerBulkActions.tsx`)

参照: `SpaceBulkActions.tsx` (Bundle A)

差分:

- import: `bulkToggleActiveCustomers` / `bulkDeleteCustomers`
- toast: 「顧客」表記
- 「公開」「非公開」ラベル → 「有効化」「無効化」に変更
- アイコン: `IconUserCheck` / `IconUserOff` / `IconTrash`
- 削除前 `DeleteConfirmDialog` 統合

#### D4. Table 改修 (`CustomerTable.tsx`)

Phase 1 同パターン:

1. `"use client"` 確認
2. `useState<string[]>([])` で `selectedIds`
3. ヘッダー all-select `CheckboxCell`
4. 行頭 `<TableCell onClick={stopRowClick}><CheckboxCell aria-label={`${customer.lastName} ${customer.firstName} を選択`} ... /></TableCell>`
5. テーブル外に `<CustomerBulkActions selectedIds={selectedIds} onClear={() => setSelectedIds([])} />`

`ClickableTableRow` 採用済みの場合は checkbox セルに `stopRowClick`。

#### D5. Tests

**Unit** (`__tests__/unit/domain/customers/bulk-commands.test.ts`):

- 空配列で count: 0 / DB 呼ばない
- 複数件 isActive toggle 成功
- 削除成功 / `affectedIds` 取得

**Integration** (`__tests__/integration/actions/admin/customer-bulk.test.ts`):

- 認証 / 権限 / Zod validation / mock executeAdminMutationResult / mock fireAndForget
- **cloudflare mock は最初から全 11 export stub 化** (Phase 1 commit `aebc3052` テンプレ参照)

```typescript
const noopPurge = (): Promise<{ success: boolean }> =>
  Promise.resolve({ success: true });
mock.module("@/shared/lib/cloudflare", () => ({
  purgeCloudflareCache: mock(noopPurge),
  purgeCloudflareCacheByPrefix: mock(noopPurge),
  purgeAllCloudflareCache: mock(noopPurge),
  purgeCloudflareByPaths: mock(noopPurge),
  purgeSpaceCache: mock(noopPurge),
  purgePostCache: mock(noopPurge),
  purgeNewsCache: mock(noopPurge),
  purgePageCache: mock(noopPurge),
  purgeHomeCache: mock(noopPurge),
  purgeFaqCache: mock(noopPurge),
  purgeTermsCache: mock(noopPurge),
}));
```

### Verification (Bundle D)

- `bun run type-check` exit 0
- `bun test __tests__/unit/domain/customers/bulk-commands.test.ts` exit 0
- `bun test __tests__/integration/actions/admin/customer-bulk.test.ts` exit 0
- `git status --short` で modified/new files が想定通り
- 行数目安 ≈ 500 行

---

## Bundle E — Inquiries Bulk

**Commit message**: `feat(admin): bulk delete actions for inquiries`

### Files to create

1. `src/shared/domain/inquiries/bulk-commands.ts`
2. `src/app/(admin)/admin/(dashboard)/_shared/actions/inquiry/bulk.ts`
3. `src/app/(admin)/admin/(dashboard)/inquiries/_components/InquiryBulkActions.tsx`
4. `__tests__/unit/domain/inquiries/bulk-commands.test.ts`
5. `__tests__/integration/actions/admin/inquiry-bulk.test.ts`

### Files to modify

1. `src/app/(admin)/admin/(dashboard)/inquiries/_components/InquiryTable.tsx`
2. `package.json` 追記不要

### Tasks

#### E1. domain command

`Inquiry` には `isActive` がないため **delete のみ**:

```typescript
import "server-only";
import { prisma } from "@/shared/db/prisma";

export type BulkDeleteInquiriesResult = {
  count: number;
  affectedIds: string[];
};

export async function bulkDeleteInquiriesCommand(
  ids: string[],
): Promise<BulkDeleteInquiriesResult> {
  if (ids.length === 0) return { count: 0, affectedIds: [] };
  const targets = await prisma.inquiry.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const result = await prisma.inquiry.deleteMany({
    where: { id: { in: targets.map((t) => t.id) } },
  });
  return { count: result.count, affectedIds: targets.map((t) => t.id) };
}
```

#### E2. Server Action

Bundle D の `bulkDeleteCustomers` を `Inquiry` 用に複製。`CACHE_TAGS.INQUIRIES` + `getCacheTag.inquiries.detail(id)` を使用。

#### E3. UI (`InquiryBulkActions.tsx`)

`PostBulkActions` (最小版、141 行) を参照。toggle ボタンなし、削除のみ。toast: 「お問い合わせ」表記。

#### E4. Table 改修

Phase 1 同パターン。`aria-label` は `${inquiry.subject} を選択`。

#### E5. Tests

最小セット (delete のみ)。**cloudflare mock は最初から全 11 export stub 化**。

### Verification (Bundle E)

行数目安 ≈ 350 行 (delete のみで isActive toggle なし)。

---

## Bundle F — Coupons Bulk

**Commit message**: `feat(admin): bulk delete and active-toggle actions for coupons`

### Files to create

1. `src/shared/domain/coupons/bulk-commands.ts`
2. `src/app/(admin)/admin/(dashboard)/_shared/actions/coupon/bulk.ts`
3. `src/app/(admin)/admin/(dashboard)/coupons/_components/CouponBulkActions.tsx`
4. `__tests__/unit/domain/coupons/bulk-commands.test.ts`
5. `__tests__/integration/actions/admin/coupon-bulk.test.ts`

### Files to modify

1. `src/app/(admin)/admin/(dashboard)/coupons/_components/CouponTable.tsx`
2. `package.json` 追記不要

### Tasks

#### F1. domain command

Bundle D customers 同型 (isActive toggle + delete):

```typescript
export type BulkToggleActiveCouponsResult = {
  count: number;
  isActive: boolean;
  affectedIds: string[];
};

export type BulkDeleteCouponsResult = {
  count: number;
  affectedIds: string[];
};

// bulkToggleActiveCouponsCommand / bulkDeleteCouponsCommand 実装
// Reservation.couponId は onDelete: SetNull で FK 衝突なし、Coupon.usageCount > 0 でも削除可
```

#### F2. Server Action

Bundle D customers の Server Action を `coupon` 用に複製。`CACHE_TAGS.COUPONS` + `getCacheTag.coupons.detail(id)` を使用。

#### F3. UI (`CouponBulkActions.tsx`)

CustomerBulkActions と同型 (active toggle + delete)。「クーポン」表記、アイコン: `IconTicket` / `IconTicketOff` / `IconTrash`。

#### F4. Table 改修

Phase 1 同パターン。`aria-label` は `${coupon.name} を選択`。

#### F5. Tests

Bundle D 同等。**cloudflare mock は最初から全 11 export stub 化**。

### Verification (Bundle F)

行数目安 ≈ 500 行。

---

## 全体検証 (Phase 2 完了時)

1. `bun run validate` exit 0
2. `bun test __tests__/integration/actions/admin` (admin batch) で 全 pass 確認 (Phase 2 の cloudflare mock pollution が起きないこと)
3. `git log --oneline main..HEAD` で 3 commit 確認
4. 各 commit の `git show --stat HEAD~N` で対象ファイル + 行数妥当性

---

## Subagent Dispatch 規律

Phase 1 と同じ:

- 3 並列 general-purpose (sonnet) dispatch
- 🚫 git 全面禁止 (controller が完了後 commit)
- 🚫 JSDoc / コメントに「Phase」「P19」「Bundle X」等のタスク参照禁止
- ✅ import alias 二重 prefix 禁止
- ✅ 参照実装 (Bundle A spaces / Bundle C news) を Read してから実装
- ✅ plan API 名は実装ファイル Read で実在確認 (`getCacheTag.customers.detail` / `Action` enum / `createValidationMutationError`)
- ✅ **cloudflare mock は最初から全 11 export stub 化** (Phase 1 reactive fix `aebc3052` を Phase 2 で再発させない)

---

## Phase 3 への持ち越し

- Customer status 一括変更 (BLACKLIST 化 / VIP 昇格)
- Inquiry status 一括変更 (RESOLVED) + 自動返信メール
- Event 一括 CANCEL + 参加者通知メール (Phase 1 で除外済み)
- 状態遷移マップ整備 (`CUSTOMER_STATUS_TRANSITIONS` / `INQUIRY_STATUS_TRANSITIONS` 等)
- Phase 3 は **brainstorming + spec 作成からスタート** (本 plan の純粋対称化スコープでは扱えない)
