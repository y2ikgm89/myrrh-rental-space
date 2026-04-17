# Customer Type DB 永続化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 顧客の法人/個人区分を Prisma enum `CustomerType` として DB に永続化し、ローカル定数 `CUSTOMER_TYPES` を完全廃止する

**Architecture:** Prisma enum `CustomerType (PERSONAL | CORPORATE)` を新設し Customer / Reservation / Inquiry の 3 モデルに追加。既存のローカル `customer-type.ts` の `CUSTOMER_TYPES` 定数を Prisma enum に置換し、enums ゲートウェイ（prisma-types / guards / helpers）を経由する SSoT パターンに統一する。既存データは全て `PERSONAL` にマイグレーション。

**Tech Stack:** Prisma 7, Zod 4, Next.js 16, React 19, TypeScript 6

---

## File Structure

### 新規作成

- `prisma/migrations/<timestamp>_add_customer_type/migration.sql` — DDL

### 変更対象

| ファイル                                                                          | 変更内容                                                                         |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                                                            | `CustomerType` enum 追加、Customer/Reservation/Inquiry にフィールド追加          |
| `src/shared/lib/validations/enums/prisma-types.ts`                                | `CustomerType` re-export 追加                                                    |
| `src/shared/lib/validations/enums/guards.ts`                                      | `isValidCustomerType` / `VALID_CUSTOMER_TYPES` 追加                              |
| `src/shared/lib/validations/enums/helpers.ts`                                     | `CUSTOMER_TYPE_LABELS` / `getValidCustomerType` / `parseCustomerTypeFilter` 追加 |
| `src/shared/lib/validations/customer-type.ts`                                     | `CUSTOMER_TYPES` 削除 → Prisma enum ベースに書き換え                             |
| `src/shared/lib/validations/inquiry.ts`                                           | import パス変更                                                                  |
| `src/shared/lib/validations/public-reservation.ts`                                | import パス変更                                                                  |
| `src/shared/lib/validations/customer.ts`                                          | `customerType` フィールド追加                                                    |
| `src/shared/domain/customers/types.ts`                                            | `CustomerType` フィールド追加                                                    |
| `src/shared/domain/customers/queries.ts`                                          | select に `customerType` 追加、フィルタ対応                                      |
| `src/shared/domain/customers/commands.ts`                                         | `toCustomerData` に `customerType` 追加                                          |
| `src/shared/domain/customers/export-queries.ts`                                   | select に `customerType` 追加                                                    |
| `src/shared/domain/reservations/resolve-customer.ts`                              | `CustomerData` 型に `customerType` 追加、create 時に永続化                       |
| `src/shared/domain/reservations/public-commands.ts`                               | `PublicReservationInput` に `customerType` 追加、`guestCustomerType` 保存        |
| `src/shared/domain/reservations/admin-commands.ts`                                | `guestCustomerType` 保存                                                         |
| `src/shared/domain/inquiries/commands.ts`                                         | `customerType` 保存                                                              |
| `src/app/(public)/_shared/components/ui/customer-type-toggle.tsx`                 | import を Prisma enum に変更                                                     |
| `src/app/(public)/contact/_components/contact-form.tsx`                           | import パス変更                                                                  |
| `src/app/(public)/reservation/_components/customer-step.tsx`                      | import パス変更                                                                  |
| `src/app/(admin)/admin/(dashboard)/customers/[id]/_components/CustomerDetail.tsx` | customerType 表示                                                                |
| `prisma/seed.ts`                                                                  | 既存顧客の customerType 設定                                                     |

### テスト変更

| ファイル                                                | 変更内容                     |
| ------------------------------------------------------- | ---------------------------- |
| `__tests__/unit/lib/validations/faq.test.ts`            | 影響なし（別ドメイン）       |
| `__tests__/unit/shared/lib/validations/inquiry.test.ts` | CustomerType import パス変更 |

---

## Task 1: Prisma スキーマ + マイグレーション

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_customer_type/migration.sql`

- [ ] **Step 1: Prisma スキーマに `CustomerType` enum とフィールドを追加**

`prisma/schema.prisma` の enum セクション（`CustomerStatus` の直前、line 44 付近）に追加:

```prisma
enum CustomerType {
  PERSONAL
  CORPORATE
}
```

`Customer` モデル（line 571）に `customerType` フィールドを追加（`companyName` の直後）:

```prisma
  customerType       CustomerType   @default(PERSONAL)
```

`Reservation` モデル（line 493）の guest フィールドセクション（`guestCompanyName` の直後）に追加:

```prisma
  guestCustomerType  CustomerType?
```

`Inquiry` モデル（line 654）の `companyName` の直後に追加:

```prisma
  customerType CustomerType?
```

- [ ] **Step 2: マイグレーション SQL を手書き作成**

```bash
mkdir -p 'prisma/migrations/20260416000000_add_customer_type'
```

`prisma/migrations/20260416000000_add_customer_type/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('PERSONAL', 'CORPORATE');

-- AlterTable: Customer
ALTER TABLE "customers" ADD COLUMN "customerType" "CustomerType" NOT NULL DEFAULT 'PERSONAL';

-- AlterTable: Reservation
ALTER TABLE "Reservation" ADD COLUMN "guestCustomerType" "CustomerType";

-- AlterTable: Inquiry
ALTER TABLE "inquiries" ADD COLUMN "customerType" "CustomerType";

-- Backfill: companyName が NULL でないレコードを CORPORATE に更新
UPDATE "customers" SET "customerType" = 'CORPORATE' WHERE "companyName" IS NOT NULL AND "companyName" != '';

-- CreateIndex
CREATE INDEX "customers_customerType_idx" ON "customers"("customerType");
```

- [ ] **Step 3: マイグレーション適用**

```bash
bunx --bun prisma db execute --file prisma/migrations/20260416000000_add_customer_type/migration.sql
bunx --bun prisma migrate resolve --applied 20260416000000_add_customer_type
```

- [ ] **Step 4: Prisma Client 再生成 + 型チェック**

```bash
bun run db:generate
bun run type-check
```

- [ ] **Step 5: コミット**

```bash
git add prisma/schema.prisma prisma/migrations/20260416000000_add_customer_type/
git commit -m "feat(schema): add CustomerType enum to Customer, Reservation, Inquiry"
```

---

## Task 2: Enums ゲートウェイ更新（prisma-types / guards / helpers）

**Files:**

- Modify: `src/shared/lib/validations/enums/prisma-types.ts`
- Modify: `src/shared/lib/validations/enums/guards.ts`
- Modify: `src/shared/lib/validations/enums/helpers.ts`

- [ ] **Step 1: prisma-types.ts に `CustomerType` re-export 追加**

`prisma-types.ts` の enum re-export ブロック（line 29-64）に `CustomerType` を追加:

```typescript
export {
  Role,
  ReservationStatus,
  InquiryStatus,
  CustomerStatus,
  CustomerType, // ← 追加
  PaymentStatus,
  // ... 以降既存のまま
} from "@generated/prisma/enums";
```

- [ ] **Step 2: guards.ts に型ガード追加**

import に `CustomerType` を追加（line 8 付近の import ブロック）。

Set 定義を追加（`VALID_CUSTOMER_STATUSES` の直後）:

```typescript
const VALID_CUSTOMER_TYPES = new Set<string>(Object.values(CustomerType));
```

型ガード関数を追加（`isValidCustomerStatus` の直後）:

```typescript
export function isValidCustomerType(value: unknown): value is CustomerType {
  return typeof value === "string" && VALID_CUSTOMER_TYPES.has(value);
}
```

- [ ] **Step 3: helpers.ts にラベル・getValid・parseFilter 追加**

import に `CustomerType` を追加。

ラベル定数（`CUSTOMER_STATUS_LABELS` の直前に配置）:

```typescript
// =============================================================================
// CustomerType Labels
// =============================================================================

export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  [CustomerType.PERSONAL]: "個人",
  [CustomerType.CORPORATE]: "法人・団体",
};
```

getValid ヘルパー（`getValidCustomerStatus` の直前に配置）:

```typescript
export function getValidCustomerType(
  value: string | null | undefined,
  fallback: CustomerType = CustomerType.PERSONAL,
): CustomerType {
  return value && isValidCustomerType(value) ? value : fallback;
}
```

parseFilter ヘルパー（`parseCustomerStatusFilter` の直前に配置）:

```typescript
export function parseCustomerTypeFilter(
  value: string | null | undefined,
): CustomerType | undefined {
  return parseStatusFilter(value, isValidCustomerType);
}
```

- [ ] **Step 4: 型チェック**

```bash
bun run type-check
```

- [ ] **Step 5: コミット**

```bash
git add src/shared/lib/validations/enums/
git commit -m "feat(enums): add CustomerType labels, guards, and helpers"
```

---

## Task 3: customer-type.ts をPrisma enumベースに書き換え

**Files:**

- Modify: `src/shared/lib/validations/customer-type.ts`
- Modify: `src/shared/lib/validations/inquiry.ts`
- Modify: `src/shared/lib/validations/public-reservation.ts`
- Modify: `src/shared/lib/validations/customer.ts`
- Modify: `src/app/(public)/_shared/components/ui/customer-type-toggle.tsx`

- [ ] **Step 1: customer-type.ts を完全書き換え**

```typescript
import { z } from "zod";
import { CustomerType } from "@/shared/lib/validations/enums/prisma-types";

export { CustomerType } from "@/shared/lib/validations/enums/prisma-types";

export const customerTypeSchema = z
  .enum(CustomerType)
  .default(CustomerType.PERSONAL);

export const companyNameSchema = z
  .string()
  .max(100, { error: "会社名は100文字以内で入力してください" })
  .optional()
  .or(z.literal(""));

/**
 * 法人選択時に companyName が必須であることを検証する refine
 */
export function requireCompanyNameForCorporate(data: {
  customerType: CustomerType;
  companyName?: string | undefined;
}) {
  return (
    data.customerType !== CustomerType.CORPORATE || !!data.companyName?.trim()
  );
}

export const COMPANY_NAME_REFINE_ERROR = {
  error: "法人の場合、会社名は必須です",
  path: ["companyName"],
};
```

- [ ] **Step 2: inquiry.ts の re-export を更新**

```typescript
export { CustomerType } from "./customer-type";
```

既存の `export { CUSTOMER_TYPES, type CustomerType }` を上記に置換。

- [ ] **Step 3: customer-type-toggle.tsx の import を更新**

import を変更:

```typescript
import { CustomerType } from "@/shared/lib/validations/enums/prisma-types";
```

`CustomerTypeToggleProps` の `value` / `onChange` 型:

```typescript
interface CustomerTypeToggleProps {
  readonly value: CustomerType;
  readonly onChange: (value: CustomerType) => void;
  readonly id?: string;
}
```

ボタンの比較値を `"personal"` → `CustomerType.PERSONAL`、`"corporate"` → `CustomerType.CORPORATE` に変更。

- [ ] **Step 4: customer.ts に `customerType` フィールド追加**

`customerFormSchema` に `customerType` フィールドを追加:

```typescript
import { CustomerType } from "@/shared/lib/validations/enums/prisma-types";

export const customerFormSchema = z.object({
  customerType: z.enum(CustomerType).default(CustomerType.PERSONAL),
  lastName: z
    .string()
    .min(1, { error: "姓は必須です" })
    .max(50, { error: "姓は50文字以内で入力してください" }),
  // ... 既存フィールドそのまま
});
```

- [ ] **Step 5: 型チェック + lint**

```bash
bun run validate
```

- [ ] **Step 6: コミット**

```bash
git add src/shared/lib/validations/
git add 'src/app/(public)/_shared/components/ui/customer-type-toggle.tsx'
git commit -m "refactor(validations): replace local CUSTOMER_TYPES with Prisma CustomerType enum"
```

---

## Task 4: ドメイン層の更新（types / queries / commands）

**Files:**

- Modify: `src/shared/domain/customers/types.ts`
- Modify: `src/shared/domain/customers/queries.ts`
- Modify: `src/shared/domain/customers/commands.ts`
- Modify: `src/shared/domain/customers/export-queries.ts`
- Modify: `src/shared/domain/reservations/resolve-customer.ts`
- Modify: `src/shared/domain/reservations/public-commands.ts`
- Modify: `src/shared/domain/reservations/admin-commands.ts`
- Modify: `src/shared/domain/inquiries/commands.ts`

- [ ] **Step 1: customers/types.ts に `customerType` 追加**

`CustomerRecord` 型に追加（`companyName` の直後）:

```typescript
import type { CustomerStatus, CustomerType } from "@generated/prisma/enums";

type CustomerRecord = {
  // ... 既存フィールド
  companyName: string | null;
  customerType: CustomerType; // ← 追加
  email: string;
  // ... 以降既存のまま
};
```

`CustomerFilters` 型に追加:

```typescript
export type CustomerFilters = {
  status?: CustomerStatus | "ALL";
  customerType?: CustomerType | "ALL"; // ← 追加
  search?: string;
  isActive?: boolean;
};
```

`CustomerSearchResult` に追加:

```typescript
export type CustomerSearchResult = {
  id: string;
  lastName: string;
  firstName: string;
  companyName: string | null;
  customerType: CustomerType; // ← 追加
  email: string;
  phoneNumber: string | null;
  status: CustomerStatus;
};
```

- [ ] **Step 2: customers/queries.ts の select と where に `customerType` 追加**

`buildCustomerWhere` に customerType フィルタを追加:

```typescript
if (filters.customerType && filters.customerType !== "ALL") {
  where.customerType = filters.customerType;
}
```

全ての `select` ブロックに `customerType: true` を追加（`companyName: true` の直後）。対象箇所:

- `getCustomers` の select（line 62 付近）
- `getCustomerDetail` の select
- `searchCustomers` の select（line 245 付近）
- `getCustomerDetailPublic` の select

`getCustomerDetail` の return で `customerType` をマッピング:

```typescript
customerType: customer.customerType,
```

- [ ] **Step 3: customers/commands.ts の `toCustomerData` に `customerType` 追加**

```typescript
function toCustomerData(data: CustomerFormData) {
  return {
    customerType: data.customerType ?? CustomerType.PERSONAL,
    lastName: data.lastName,
    // ... 既存フィールドそのまま
  };
}
```

import に `CustomerType` を追加:

```typescript
import { CustomerStatus, CustomerType } from "@generated/prisma/enums";
```

- [ ] **Step 4: customers/export-queries.ts に `customerType` 追加**

select に `customerType: true` を追加（`companyName: true` の直後）。

- [ ] **Step 5: resolve-customer.ts の `CustomerData` 型と create に `customerType` 追加**

```typescript
import { CustomerType } from "@generated/prisma/enums";

export type CustomerData = {
  lastName: string;
  firstName: string;
  email: string;
  phoneNumber?: string | null | undefined;
  companyName?: string | null | undefined;
  customerType?: CustomerType | undefined; // ← 追加
  userId?: string | null | undefined;
};
```

create 時のデータに `customerType` を追加（line 76-86 付近）:

```typescript
const customer = await db.customer.create({
  data: {
    lastName: data.lastName,
    firstName: data.firstName,
    email: data.email,
    phoneNumber: data.phoneNumber || null,
    companyName: data.companyName || null,
    customerType: data.customerType ?? CustomerType.PERSONAL, // ← 追加
    userId: data.userId || null,
  },
  select: { id: true },
});
```

- [ ] **Step 6: public-commands.ts に `customerType` 追加**

`PublicReservationInput` 型に追加:

```typescript
customerType?: CustomerType | undefined;
```

`createPublicReservationCommand` 内の `resolveOrCreateCustomer` 呼び出しに `customerType` を渡す。

`guestCustomerType` を reservation create に追加（`guestCompanyName` の直後）:

```typescript
guestCustomerType: input.customerType ?? null,
```

- [ ] **Step 7: admin-commands.ts に `guestCustomerType` 追加**

管理者予約作成時の `guestCustomerType` 保存を追加。

- [ ] **Step 8: inquiries/commands.ts に `customerType` 追加**

`createInquiryCommand` の `CreateInquiryInput` 型と Inquiry create data に `customerType` を追加。

- [ ] **Step 9: 型チェック**

```bash
bun run validate
```

- [ ] **Step 10: コミット**

```bash
git add src/shared/domain/
git commit -m "feat(domain): persist customerType in Customer, Reservation, Inquiry"
```

---

## Task 5: Server Actions + 公開フォーム連携

**Files:**

- Modify: `src/app/(public)/_shared/actions/inquiry.ts` — `customerType` を渡す
- Modify: `src/app/(public)/_shared/actions/reservation.ts` — `customerType` を渡す
- Modify: `src/app/(public)/contact/_components/contact-form.tsx` — import 更新
- Modify: `src/app/(public)/reservation/_components/customer-step.tsx` — import 更新

- [ ] **Step 1: inquiry Server Action に `customerType` を渡す**

`submitInquiry` 内の `createInquiryCommand` 呼び出しに `customerType: data.customerType` を追加。

- [ ] **Step 2: reservation Server Action に `customerType` を渡す**

`submitReservation` 内の `createPublicReservationCommand` 呼び出しに `customerType: data.customerType` を追加。

- [ ] **Step 3: contact-form.tsx の import 更新**

`CustomerType` を Prisma enum から import:

```typescript
import { CustomerType } from "@/shared/lib/validations/enums/prisma-types";
```

フォーム内の `"personal"` → `CustomerType.PERSONAL`、`"corporate"` → `CustomerType.CORPORATE` に置換。

- [ ] **Step 4: customer-step.tsx の import 更新**

同様に `CustomerType` を Prisma enum から import し、文字列リテラルを enum 定数に置換。

- [ ] **Step 5: 型チェック + ビルド**

```bash
bun run validate
```

- [ ] **Step 6: コミット**

```bash
git add 'src/app/(public)/'
git commit -m "feat(forms): wire customerType through public forms to domain layer"
```

---

## Task 6: 管理画面 UI 更新

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/customers/[id]/_components/CustomerDetail.tsx` — customerType 表示
- Modify: 顧客一覧のフィルタコンポーネント — customerType フィルタ追加

- [ ] **Step 1: CustomerDetail に customerType 表示を追加**

`CUSTOMER_TYPE_LABELS` を import し、顧客詳細の基本情報セクションに「区分」行を追加（`companyName` の直前または直後）:

```typescript
import { CUSTOMER_TYPE_LABELS } from "@/shared/lib/validations/enums/helpers";
```

```tsx
<dt className="text-sm text-muted-foreground">区分</dt>
<dd className="text-sm">{CUSTOMER_TYPE_LABELS[customer.customerType]}</dd>
```

- [ ] **Step 2: 管理画面顧客フォームに customerType フィールド追加**

顧客作成・編集フォームに `CustomerTypeToggle` または Select を追加。

- [ ] **Step 3: 型チェック + ビルド**

```bash
bun run validate && bun run build
```

- [ ] **Step 4: コミット**

```bash
git add 'src/app/(admin)/'
git commit -m "feat(admin): display and filter customerType in customer management"
```

---

## Task 7: Seed + テスト更新

**Files:**

- Modify: `prisma/seed.ts` — 顧客データに `customerType` 追加
- Modify: `__tests__/unit/shared/lib/validations/inquiry.test.ts` — import 更新

- [ ] **Step 1: seed.ts に customerType 追加**

既存の顧客シードデータに `customerType` を追加。`companyName` が設定されている顧客は `CustomerType.CORPORATE`、それ以外は `CustomerType.PERSONAL` を設定。

- [ ] **Step 2: inquiry テストの import 更新**

`CustomerType` の import パスを Prisma enum に更新。テスト内の `"personal"` / `"corporate"` リテラルを `CustomerType.PERSONAL` / `CustomerType.CORPORATE` に変更。

- [ ] **Step 3: テスト実行**

```bash
bun run test:unit
```

- [ ] **Step 4: 最終検証**

```bash
bun run validate && bun run build
```

- [ ] **Step 5: コミット**

```bash
git add prisma/seed.ts __tests__/
git commit -m "test: update seed and tests for CustomerType enum"
```

---

## Task 8: 残存するローカル文字列リテラルの掃討

- [ ] **Step 1: grep で残存チェック**

```bash
grep -rn '"personal"\|"corporate"\|CUSTOMER_TYPES' src/ __tests__/ --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v '.next'
```

ヒット 0 件を確認。

- [ ] **Step 2: gotchas.md / CLAUDE.md に必要な更新があればアップデート**

`customer-type.ts` のローカル定数廃止に伴い、rules ファイルで `CUSTOMER_TYPES` に言及している箇所があれば更新。

- [ ] **Step 3: 最終コミット**

```bash
git add -A
git commit -m "chore: clean up remaining customer type string literals"
```
