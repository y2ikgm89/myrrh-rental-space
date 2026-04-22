# Terms System Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the terms management system so that reservation forms dynamically show required terms from DB, save TermsAgreement audit records, and display terms in footer/space detail pages — replacing all hardcoded Settings flags.

**Architecture:** Add `RENTAL_TERMS` to TermsType enum, add `requiredAtReservation`/`showInFooter` flags to Terms model, remove 6 Settings fields. Public reservation flow queries required terms per space, renders dynamic checkboxes, and saves TermsAgreement records in the reservation transaction. Footer and space detail pages query Terms with appropriate flags.

**Tech Stack:** Prisma 7 (PostgreSQL), Next.js 16 (`'use cache'`, `updateTag`), React 19, Zod 4, React Hook Form, Tailwind CSS 4

---

## File Structure

### New Files

| File                                                                | Responsibility                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------ |
| `prisma/migrations/<timestamp>_terms_system_overhaul/migration.sql` | Schema migration                                       |
| `src/shared/domain/terms/public-queries.ts`                         | Public cached queries for terms (reservation + footer) |

### Modified Files

| File                                                                                                   | Changes                                                                                |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                                                                                 | Add RENTAL_TERMS enum, Terms fields, remove Settings fields                            |
| `src/shared/lib/validations/terms.ts`                                                                  | Add `requiredAtReservation`/`showInFooter` to schemas, add RENTAL_TERMS to TERMS_TYPES |
| `src/shared/lib/validations/enums/guards.ts`                                                           | Already has `isValidTermsType` — no change needed                                      |
| `src/shared/lib/validations/public-reservation.ts`                                                     | Replace `agreeToTerms: z.literal(true)` with `agreedTermsIds: z.array(...)`            |
| `src/shared/domain/terms/commands.ts`                                                                  | Add `requiredAtReservation`/`showInFooter` to create/update                            |
| `src/shared/domain/terms/admin-queries.ts`                                                             | Include new fields in select                                                           |
| `src/shared/domain/terms/queries.ts`                                                                   | Existing public query — no change                                                      |
| `src/shared/domain/reservations/commands.ts`                                                           | Add TermsAgreement creation in transaction                                             |
| `src/shared/domain/settings/types.ts`                                                                  | Remove 6 terms-related fields                                                          |
| `src/shared/domain/settings/commands.ts`                                                               | Remove updateTermsAgreementSettings command                                            |
| `src/shared/domain/settings/admin-queries.ts`                                                          | Remove terms fields from select                                                        |
| `src/shared/lib/constants/default-page-sections.ts`                                                    | Remove `terms` entry                                                                   |
| `src/shared/lib/terms-templates.ts`                                                                    | Add RENTAL_TERMS template                                                              |
| `src/app/(public)/_shared/actions/reservation.ts`                                                      | Pass agreedTermsIds to command                                                         |
| `src/app/(public)/reservation/_components/customer-step.tsx`                                           | Dynamic terms checkboxes                                                               |
| `src/app/(public)/reservation/_components/reservation-form.tsx`                                        | Fetch & pass required terms                                                            |
| `src/app/(public)/terms/page.tsx`                                                                      | Replace with redirect                                                                  |
| `src/app/(public)/terms/[slug]/page.tsx`                                                               | Fix breadcrumb                                                                         |
| `src/app/(public)/_shared/components/layouts/site-footer.tsx`                                          | Add terms links                                                                        |
| `src/app/(admin)/admin/(dashboard)/terms/_components/TermsTable.tsx`                                   | Add badge columns                                                                      |
| `src/app/(admin)/admin/(dashboard)/terms/_components/TermsInlineEditor.tsx`                            | Add checkbox fields                                                                    |
| `src/app/(admin)/admin/(dashboard)/settings/_components/sections/TermsAgreementSection.tsx`            | DELETE                                                                                 |
| `src/app/(admin)/admin/(dashboard)/settings/_components/sections/ReservationSection.tsx`               | Remove cancellationTermsId                                                             |
| `src/app/(admin)/admin/(dashboard)/settings/_components/sections/index.ts`                             | Remove TermsAgreementSection export                                                    |
| `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/other.ts`                                  | Remove updateTermsAgreementSettings                                                    |
| `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/schemas/form-schemas-booking-tax-terms.ts` | Remove termsAgreement schema                                                           |
| `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/schemas/basic.ts`                          | Remove cancellationTermsId                                                             |
| `src/app/(admin)/admin/(dashboard)/spaces/_components/space-edit-form/tabs/details-tab-panel.tsx`      | Filter to RENTAL_TERMS                                                                 |
| `prisma/seed.ts`                                                                                       | Seed all 5 term types with published versions                                          |

---

## Task 1: Prisma Schema Migration

**Files:**

- Modify: `prisma/schema.prisma:94-100` (TermsType enum)
- Modify: `prisma/schema.prisma:1503-1520` (Terms model)
- Modify: `prisma/schema.prisma:1149-1172` (Settings model — remove fields)

- [ ] **Step 1: Add RENTAL_TERMS to TermsType enum**

In `prisma/schema.prisma`, find the `TermsType` enum (line 94) and add `RENTAL_TERMS`:

```prisma
enum TermsType {
  TERMS_OF_USE     // サイト利用規約
  PRIVACY_POLICY   // プライバシーポリシー
  CANCELLATION     // キャンセルポリシー
  PAYMENT          // 支払い規約
  RENTAL_TERMS     // 施設利用規約（スペース別）
  CUSTOM           // カスタム規約
}
```

- [ ] **Step 2: Add requiredAtReservation and showInFooter to Terms model**

In the `Terms` model (line 1503), add two fields before `createdAt`:

```prisma
model Terms {
  id         String    @id @default(uuid()) @db.Uuid
  type       TermsType
  title      String // 表示タイトル（例: "利用規約"）
  slug       String    @unique // URL用スラッグ（例: "terms-of-use"）
  isActive   Boolean   @default(true) // 現在有効な規約か
  requiredAtReservation Boolean @default(false) // 予約フォームで同意必須
  showInFooter          Boolean @default(false) // フッターにリンク表示
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
  // Relations
  versions   TermsVersion[]
  spaces     Space[] // この規約を使用するスペース
  agreements TermsAgreement[] // 同意記録
  // Remove: settingsAsCancellation relation

  @@map("terms")
}
```

- [ ] **Step 3: Remove terms-related fields from Settings model**

Remove these 6 fields and 1 relation from the Settings model:

```diff
- cancellationTermsId String? @db.Uuid
- cancellationTerms   Terms?  @relation("CancellationPolicy", fields: [cancellationTermsId], references: [id], onDelete: SetNull)
- // Terms Agreement Settings
- termsAgreementEnabled   Boolean @default(true)
- termsAgreementText      String?
- requireTermsAgreement   Boolean @default(true)
- requirePrivacyAgreement Boolean @default(true)
```

Also remove the `@@index([cancellationTermsId])` if it exists, and remove the `settingsAsCancellation` relation from the Terms model.

- [ ] **Step 4: Run migration**

```bash
bunx --bun prisma migrate dev --name terms-system-overhaul
```

Expected: Migration creates successfully. New columns added, old columns dropped.

- [ ] **Step 5: Regenerate Prisma client and type-check**

```bash
bun run db:generate && bun run type-check
```

Expected: Type errors in files that reference the removed Settings fields. These will be fixed in subsequent tasks.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: terms system overhaul — schema migration

Add RENTAL_TERMS enum, requiredAtReservation/showInFooter to Terms.
Remove 6 terms-related Settings fields (cancellationTermsId,
termsAgreementEnabled, termsAgreementText, requireTermsAgreement,
requirePrivacyAgreement) and CancellationPolicy relation."
```

---

## Task 2: Settings Cleanup (Remove Terms Fields)

**Files:**

- Modify: `src/shared/domain/settings/types.ts:75-93`
- Modify: `src/shared/domain/settings/commands.ts`
- Modify: `src/shared/domain/settings/admin-queries.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/other.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/schemas/form-schemas-booking-tax-terms.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/schemas/basic.ts`
- Delete: `src/app/(admin)/admin/(dashboard)/settings/_components/sections/TermsAgreementSection.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/settings/_components/sections/index.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/settings/_components/sections/ReservationSection.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/settings/business/page.tsx` (if it renders TermsAgreementSection)

- [ ] **Step 1: Remove fields from SettingsData type**

In `src/shared/domain/settings/types.ts`, remove:

```diff
- cancellationTermsId: string | null;
- termsAgreementEnabled: boolean;
- termsAgreementText: string | null;
- requireTermsAgreement: boolean;
- requirePrivacyAgreement: boolean;
```

- [ ] **Step 2: Remove updateTermsAgreementSettings command**

In `src/shared/domain/settings/commands.ts`, remove the `updateTermsAgreementSettings` function and its type. Also remove `cancellationTermsId` from any reservation settings update command.

- [ ] **Step 3: Remove fields from admin-queries select**

In `src/shared/domain/settings/admin-queries.ts`, remove the 6 fields from all `select` clauses that include them.

- [ ] **Step 4: Remove settings action and schemas**

In `src/app/(admin)/.../_shared/actions/settings/other.ts`, remove the `updateTermsAgreementSettings` exported action.

In `schemas/form-schemas-booking-tax-terms.ts`, remove `termsAgreementFormSchema` and related exports.

In `schemas/basic.ts`, remove `cancellationTermsId` from reservation settings schema.

- [ ] **Step 5: Delete TermsAgreementSection.tsx**

```bash
git rm 'src/app/(admin)/admin/(dashboard)/settings/_components/sections/TermsAgreementSection.tsx'
```

- [ ] **Step 6: Remove TermsAgreementSection from index.ts**

In `settings/_components/sections/index.ts`, remove the `TermsAgreementSection` export.

- [ ] **Step 7: Remove cancellationTermsId from ReservationSection.tsx**

In `ReservationSection.tsx`, remove the `cancellationTermsId` Select field and its form registration. Add a hint in CardDescription: `規約の必須設定は利用規約管理で行えます`.

- [ ] **Step 8: Update settings business page**

If `settings/business/page.tsx` renders `TermsAgreementSection`, remove it.

- [ ] **Step 9: Type-check**

```bash
bun run type-check
```

Expected: PASS — all references to removed fields resolved.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor: remove terms-related Settings fields

Delete TermsAgreementSection, cancellationTermsId from ReservationSection,
and all associated types/schemas/commands. Terms configuration now lives
on the Terms model itself (requiredAtReservation, showInFooter)."
```

---

## Task 3: Terms Model & Validation Updates

**Files:**

- Modify: `src/shared/lib/validations/terms.ts:20-51` (TERMS_TYPES constant)
- Modify: `src/shared/lib/validations/terms.ts:71-85` (createTermsSchema)
- Modify: `src/shared/domain/terms/commands.ts`
- Modify: `src/shared/domain/terms/admin-queries.ts`

- [ ] **Step 1: Add RENTAL_TERMS to TERMS_TYPES constant**

In `src/shared/lib/validations/terms.ts`, add to the `TERMS_TYPES` array:

```typescript
{
  value: "RENTAL_TERMS",
  label: "施設利用規約",
  defaultTitle: "施設利用規約",
  defaultSlug: "rental-terms",
},
```

Insert before the CUSTOM entry.

- [ ] **Step 2: Add new fields to createTermsSchema**

```typescript
export const createTermsSchema = z.object({
  type: z.enum(TermsType),
  title: z
    .string()
    .min(1, { error: "タイトルを入力してください" })
    .max(100, { error: "タイトルは100文字以内で入力してください" }),
  slug: z
    .string()
    .min(1, { error: "スラッグを入力してください" })
    .max(50, { error: "スラッグは50文字以内で入力してください" })
    .regex(/^[a-z0-9-]+$/, {
      error: "スラッグは小文字英数字とハイフンのみ使用可能です",
    }),
  isActive: z.boolean().default(true),
  requiredAtReservation: z.boolean().default(false),
  showInFooter: z.boolean().default(false),
});
```

- [ ] **Step 3: Update domain commands to accept new fields**

In `src/shared/domain/terms/commands.ts`, the `createTerms` and `updateTerms` functions use `omitUndefined(input)` which already passes through all validated fields. Verify that `CreateTermsInput` (derived from `createTermsSchema`) now includes the new fields — it should automatically since we updated the schema.

- [ ] **Step 4: Update admin queries to include new fields**

In `src/shared/domain/terms/admin-queries.ts`, add `requiredAtReservation: true` and `showInFooter: true` to all Terms select clauses used by the admin list and detail queries.

- [ ] **Step 5: Update TermsWithVersion and TermsDetail types**

In `src/shared/lib/validations/terms.ts`, add to `TermsWithVersion`:

```typescript
requiredAtReservation: boolean;
showInFooter: boolean;
```

And to `TermsDetail`:

```typescript
requiredAtReservation: boolean;
showInFooter: boolean;
```

- [ ] **Step 6: Type-check**

```bash
bun run type-check
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add RENTAL_TERMS type and requiredAtReservation/showInFooter fields

Update Terms validation schemas, domain commands, and admin queries
to support the new fields."
```

---

## Task 4: Admin UI — Terms Table & Editor

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/terms/_components/TermsTable.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/terms/_components/TermsInlineEditor.tsx` or edit page
- Modify: `src/app/(admin)/admin/(dashboard)/spaces/_components/space-edit-form/tabs/details-tab-panel.tsx`

- [ ] **Step 1: Add badge columns to TermsTable**

In `TermsTable.tsx`, add two columns after the existing columns:

- "予約時必須" — show Badge `variant="success"` when `requiredAtReservation` is true
- "フッター" — show Badge `variant="info"` when `showInFooter` is true

- [ ] **Step 2: Add checkboxes to Terms editor**

In the Terms edit form (either `TermsInlineEditor.tsx` or `terms/[id]/edit/page.tsx`), add two Checkbox fields:

- "予約フォームで同意必須" for `requiredAtReservation`
- "フッターにリンク表示" for `showInFooter`

- [ ] **Step 3: Filter Space edit dropdown to RENTAL_TERMS**

In `details-tab-panel.tsx` (line ~161), the "適用する利用規約" Select currently shows all active terms. Modify the query to filter by `type: RENTAL_TERMS`:

Change the `getActiveTermsForSelect()` call or add a parameter to filter. If the query already returns all types, filter client-side:

```typescript
const rentalTerms = allTerms.filter((t) => t.type === "RENTAL_TERMS");
```

Update the label from "適用する利用規約" to "施設利用規約".

- [ ] **Step 4: Type-check and lint**

```bash
bun run validate
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: admin UI — terms table badges and editor fields

Add requiredAtReservation/showInFooter badges to terms list table,
checkboxes to edit form, and filter space dropdown to RENTAL_TERMS only."
```

---

## Task 5: Public Queries for Terms

**Files:**

- Create: `src/shared/domain/terms/public-queries.ts`
- Modify: `src/shared/domain/terms/queries.ts` (existing — add getFooterTerms)

- [ ] **Step 1: Create public-queries.ts**

Create `src/shared/domain/terms/public-queries.ts`:

```typescript
import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { CACHE_LIFE, CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import {
  safeFetch,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { toPlainArray } from "@/shared/lib/serialize";
import type { Serialized } from "@/shared/lib/serialize";

export type ReservationTermsSummary = {
  id: string;
  title: string;
  slug: string;
  type: string;
  currentVersionId: string;
};

/**
 * 予約フォーム用: グローバル必須規約 + スペース別施設利用規約を取得
 */
export async function getReservationRequiredTerms(
  spaceId: string,
): Promise<Serialized<ReservationTermsSummary[]>> {
  "use cache";
  cacheLife(CACHE_LIFE.DYNAMIC_DATA);
  cacheTag(CACHE_TAGS.TERMS, getCacheTag.spaces.detail(spaceId));

  const result = await safeFetch({
    fetch: async () => {
      // 1. グローバル必須規約
      const globalTerms = await prisma.terms.findMany({
        where: {
          requiredAtReservation: true,
          isActive: true,
          versions: { some: { isCurrentVersion: true, status: "PUBLISHED" } },
        },
        select: {
          id: true,
          title: true,
          slug: true,
          type: true,
          versions: {
            where: { isCurrentVersion: true, status: "PUBLISHED" },
            take: 1,
            select: { id: true },
          },
        },
      });

      // 2. スペース別施設利用規約
      const space = await prisma.space.findUnique({
        where: { id: spaceId },
        select: {
          terms: {
            select: {
              id: true,
              title: true,
              slug: true,
              type: true,
              isActive: true,
              versions: {
                where: { isCurrentVersion: true, status: "PUBLISHED" },
                take: 1,
                select: { id: true },
              },
            },
          },
        },
      });

      // 3. マージ（重複排除）
      const allTerms = [...globalTerms];
      const spaceTerms = space?.terms;
      if (spaceTerms?.isActive && spaceTerms.versions[0]) {
        const alreadyIncluded = allTerms.some((t) => t.id === spaceTerms.id);
        if (!alreadyIncluded) {
          allTerms.push(spaceTerms);
        }
      }

      return allTerms
        .filter((t) => t.versions[0])
        .map((t) => ({
          id: t.id,
          title: t.title,
          slug: t.slug,
          type: t.type,
          currentVersionId: t.versions[0]!.id,
        }));
    },
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.HIGH,
    operationName: "getReservationRequiredTerms",
  });

  return toPlainArray(result);
}

export type FooterTermsLink = {
  title: string;
  slug: string;
};

/**
 * フッター用: showInFooter フラグが有効な規約リンク一覧
 */
export async function getFooterTerms(): Promise<Serialized<FooterTermsLink[]>> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.TERMS);

  const result = await safeFetch({
    fetch: () =>
      prisma.terms.findMany({
        where: { showInFooter: true, isActive: true },
        select: { title: true, slug: true },
        orderBy: { createdAt: "asc" },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.MEDIUM,
    operationName: "getFooterTerms",
  });

  return toPlainArray(result);
}
```

- [ ] **Step 2: Type-check**

```bash
bun run type-check
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/domain/terms/public-queries.ts
git commit -m "feat: add public queries for reservation terms and footer terms

getReservationRequiredTerms merges global required + space-specific terms.
getFooterTerms returns showInFooter terms for site footer."
```

---

## Task 6: Reservation Form — Dynamic Terms Checkboxes

**Files:**

- Modify: `src/shared/lib/validations/public-reservation.ts`
- Modify: `src/app/(public)/reservation/_components/reservation-form.tsx`
- Modify: `src/app/(public)/reservation/_components/customer-step.tsx`
- Modify: `src/app/(public)/_shared/actions/reservation.ts`
- Modify: `src/shared/domain/reservations/commands.ts:770-849`

- [ ] **Step 1: Update PublicReservationInput schema**

In `src/shared/lib/validations/public-reservation.ts`, replace:

```diff
- agreeToTerms: z.literal(true, {
-   error: "利用規約への同意が必要です",
- }),
+ agreedTermsIds: z.array(z.string().uuid({ error: "規約IDが不正です" })),
```

- [ ] **Step 2: Update customer-step.tsx for dynamic checkboxes**

Replace the hardcoded single checkbox with a dynamic list. The component receives `requiredTerms` as a prop:

```typescript
interface CustomerStepProps {
  // ...existing props...
  readonly requiredTerms: ReadonlyArray<{
    id: string;
    title: string;
    slug: string;
    currentVersionId: string;
  }>;
}
```

In the JSX, replace the single checkbox with:

```tsx
{
  requiredTerms.length > 0 ? (
    <div className="space-y-3">
      {requiredTerms.map((terms) => {
        const isChecked =
          form.watch("agreedTermsIds")?.includes(terms.id) ?? false;
        return (
          <label key={terms.id} className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 border-border accent-accent"
              checked={isChecked}
              onChange={(e) => {
                const current = form.getValues("agreedTermsIds") ?? [];
                if (e.target.checked) {
                  form.setValue("agreedTermsIds", [...current, terms.id]);
                } else {
                  form.setValue(
                    "agreedTermsIds",
                    current.filter((id: string) => id !== terms.id),
                  );
                }
              }}
            />
            <span className="text-sm text-muted-foreground">
              <a
                href={`/terms/${terms.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline transition-colors hover:text-foreground"
              >
                {terms.title}
              </a>
              に同意します
            </span>
          </label>
        );
      })}
      {form.formState.errors.agreedTermsIds?.message ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {form.formState.errors.agreedTermsIds.message}
        </p>
      ) : null}
    </div>
  ) : null;
}
```

Note: Use `useWatch` instead of `form.watch` per project rules (react-patterns.md). The above is illustrative — adapt to use `useWatch({ control, name: "agreedTermsIds" })`.

- [ ] **Step 3: Update reservation-form.tsx to fetch and pass terms**

In the reservation page or form, fetch required terms for the selected space and pass to `CustomerStep`:

```typescript
// In the page or parent component (Server Component)
import { getReservationRequiredTerms } from "@/shared/domain/terms/public-queries";

// Fetch once per space (passed to client component)
const requiredTerms = await getReservationRequiredTerms(spaceId);
```

Pass `requiredTerms` through to `CustomerStep`. The form's `defaultValues` should include:

```typescript
agreedTermsIds: [],
```

Add client-side validation: all required terms must be checked before form submission.

- [ ] **Step 4: Update submitReservation action**

In `src/app/(public)/_shared/actions/reservation.ts`, pass `agreedTermsIds` to the command:

```typescript
const result = await createPublicReservationCommand({
  ...parsed.data,
  userId: user?.id,
});
```

The `agreedTermsIds` field is already in `parsed.data` since we updated the schema.

- [ ] **Step 5: Update createPublicReservationCommand to save TermsAgreement**

In `src/shared/domain/reservations/commands.ts`, update the `PublicReservationInput` type and the transaction:

Add to the type:

```typescript
agreedTermsIds: string[];
```

Inside the `$transaction`, after creating the reservation and before the return:

```typescript
// Save terms agreements
if (input.agreedTermsIds.length > 0) {
  // Fetch current version IDs for the agreed terms
  const termsWithVersions = await tx.terms.findMany({
    where: {
      id: { in: input.agreedTermsIds },
      isActive: true,
    },
    select: {
      id: true,
      versions: {
        where: { isCurrentVersion: true, status: "PUBLISHED" },
        take: 1,
        select: { id: true },
      },
    },
  });

  const agreementData = termsWithVersions
    .filter((t) => t.versions[0])
    .map((t) => ({
      termsId: t.id,
      versionId: t.versions[0]!.id,
      reservationId: created.id,
      customerId,
      userId: input.userId || null,
    }));

  if (agreementData.length > 0) {
    await tx.termsAgreement.createMany({ data: agreementData });
  }
}
```

- [ ] **Step 6: Server-side validation of required terms**

In the command, before creating the reservation, verify all required terms are included:

```typescript
// Validate that all required terms are agreed to
const requiredTerms = await tx.terms.findMany({
  where: {
    requiredAtReservation: true,
    isActive: true,
    versions: { some: { isCurrentVersion: true, status: "PUBLISHED" } },
  },
  select: { id: true },
});

// Also check space-specific terms
const spaceTerms = await tx.space.findUnique({
  where: { id: input.spaceId },
  select: { termsId: true },
});

const allRequiredIds = new Set(requiredTerms.map((t) => t.id));
if (spaceTerms?.termsId) allRequiredIds.add(spaceTerms.termsId);

const agreedSet = new Set(input.agreedTermsIds);
for (const requiredId of allRequiredIds) {
  if (!agreedSet.has(requiredId)) {
    throw new DomainError("必須の規約に同意してください", "VALIDATION");
  }
}
```

- [ ] **Step 7: Type-check**

```bash
bun run type-check
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: dynamic terms checkboxes in reservation form

Replace hardcoded agreeToTerms checkbox with dynamic list from DB.
Save TermsAgreement records in reservation transaction.
Server-side validation ensures all required terms are agreed to."
```

---

## Task 7: Footer Terms Links

**Files:**

- Modify: `src/app/(public)/_shared/components/layouts/site-footer.tsx`

- [ ] **Step 1: Add terms links to footer**

In `site-footer.tsx`, import and call `getFooterTerms`:

```typescript
import { getFooterTerms } from "@/shared/domain/terms/public-queries";
```

In the component body, fetch terms:

```typescript
const footerTerms = await getFooterTerms();
```

Add a terms link row at the bottom of the footer, above the copyright:

```tsx
{
  footerTerms.length > 0 ? (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {footerTerms.map((terms) => (
        <Link
          key={terms.slug}
          href={`/terms/${terms.slug}`}
          className="transition-colors hover:text-foreground"
        >
          {terms.title}
        </Link>
      ))}
    </div>
  ) : null;
}
```

- [ ] **Step 2: Validate**

```bash
bun run validate
```

- [ ] **Step 3: Commit**

```bash
git add src/app/'(public)'/_shared/components/layouts/site-footer.tsx
git commit -m "feat: display terms links in footer from DB

Query Terms with showInFooter=true and render as links."
```

---

## Task 8: /terms Page Redirect & Breadcrumb Fix

**Files:**

- Modify: `src/app/(public)/terms/page.tsx`
- Modify: `src/app/(public)/terms/[slug]/page.tsx`
- Modify: `src/shared/lib/constants/default-page-sections.ts`

- [ ] **Step 1: Replace /terms page with redirect**

Replace `src/app/(public)/terms/page.tsx` content with:

```typescript
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { prisma } from "@/shared/db/prisma";

export default async function TermsPage() {
  await connection();

  // Find the first active terms to redirect to
  const firstTerms = await prisma.terms.findFirst({
    where: { isActive: true, type: "TERMS_OF_USE" },
    select: { slug: true },
    orderBy: { createdAt: "asc" },
  });

  if (firstTerms) {
    redirect(`/terms/${firstTerms.slug}`);
  }

  // Fallback: any active terms
  const anyTerms = await prisma.terms.findFirst({
    where: { isActive: true },
    select: { slug: true },
    orderBy: { createdAt: "asc" },
  });

  if (anyTerms) {
    redirect(`/terms/${anyTerms.slug}`);
  }

  // No terms exist — show 404
  const { notFound } = await import("next/navigation");
  notFound();
}
```

- [ ] **Step 2: Fix breadcrumb in /terms/[slug]**

In `src/app/(public)/terms/[slug]/page.tsx`, change the breadcrumb from:

```tsx
<Breadcrumb
  items={[{ label: "利用規約", href: "/terms" }, { label: terms.title }]}
/>
```

To:

```tsx
<Breadcrumb items={[{ label: terms.title }]} />
```

(Remove the "利用規約" parent link since `/terms` is now a redirect.)

- [ ] **Step 3: Remove terms entry from DEFAULT_PAGE_SECTIONS**

In `src/shared/lib/constants/default-page-sections.ts`, remove the entire `terms: [...]` entry.

- [ ] **Step 4: Validate**

```bash
bun run validate
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: /terms redirects to first active terms page

Replace section-based /terms page with redirect to /terms/terms-of-use.
Fix breadcrumb to remove hub link. Remove DEFAULT_PAGE_SECTIONS terms entry."
```

---

## Task 9: Seed All Term Types

**Files:**

- Modify: `src/shared/lib/terms-templates.ts`
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Add RENTAL_TERMS template**

In `src/shared/lib/terms-templates.ts`, add a `RENTAL_TERMS_TEMPLATE`:

```typescript
const RENTAL_TERMS_TEMPLATE: TermsTemplate = {
  id: "rental-terms",
  label: "施設利用規約",
  description: "レンタルスペースの施設利用に関する規約テンプレート",
  content: `<h2>施設利用規約</h2>
<p>本規約は、当施設のレンタルスペースをご利用いただくにあたり、遵守いただく事項を定めたものです。</p>

<h2>第1条（利用時間）</h2>
<p>利用時間は予約された時間帯に限ります。準備・片付けの時間も利用時間に含まれます。</p>

<h2>第2条（禁止事項）</h2>
<ul>
<li>大音量での音楽再生やその他の騒音行為</li>
<li>施設・備品の損壊</li>
<li>危険物の持ち込み</li>
<li>喫煙（指定場所を除く）</li>
<li>近隣への迷惑行為</li>
</ul>

<h2>第3条（原状回復）</h2>
<p>利用終了後は、利用前の状態に復元してください。ゴミはお持ち帰りいただくか、所定の場所に分別してください。</p>

<h2>第4条（損害賠償）</h2>
<p>故意または過失により施設・備品を損壊した場合、修理または交換にかかる費用を負担していただきます。</p>`,
};
```

Add to the `TERMS_TEMPLATES` export map.

- [ ] **Step 2: Update seed to create all 5 term types**

In `prisma/seed.ts`, update the terms creation section to seed all types:

```typescript
const termsData = [
  {
    type: "TERMS_OF_USE",
    slug: "terms-of-use",
    title: "利用規約",
    requiredAtReservation: false,
    showInFooter: true,
  },
  {
    type: "PRIVACY_POLICY",
    slug: "privacy-policy",
    title: "プライバシーポリシー",
    requiredAtReservation: true,
    showInFooter: true,
  },
  {
    type: "CANCELLATION",
    slug: "cancellation-policy",
    title: "キャンセルポリシー",
    requiredAtReservation: true,
    showInFooter: false,
  },
  {
    type: "PAYMENT",
    slug: "payment-terms",
    title: "支払い規約",
    requiredAtReservation: false,
    showInFooter: false,
  },
  {
    type: "RENTAL_TERMS",
    slug: "rental-terms",
    title: "施設利用規約",
    requiredAtReservation: false,
    showInFooter: false,
  },
];
```

For each, create the Terms record and a version 1 (PUBLISHED, isCurrentVersion: true) using the corresponding template content. Remove references to the old `cancellationTermsId` and terms agreement Settings fields.

Also update Space seed records to set `termsId` pointing to the RENTAL_TERMS record.

- [ ] **Step 3: Validate**

```bash
bun run validate
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: seed all 5 term types with published versions

Add RENTAL_TERMS template. Seed Terms + TermsVersion for each type
with appropriate requiredAtReservation/showInFooter defaults."
```

---

## Task 10: Space Detail — Terms Link Display

**Files:**

- Modify: `src/app/(public)/spaces/[slug]/_components/space-info.tsx` (or equivalent)
- Modify: `src/shared/domain/spaces/public-queries.ts` (add terms to select)

- [ ] **Step 1: Include terms in space public query**

In `src/shared/domain/spaces/public-queries.ts`, add to the space detail select:

```typescript
terms: {
  select: {
    title: true,
    slug: true,
    isActive: true,
  },
},
```

- [ ] **Step 2: Display terms link in space detail**

In the space info component, if `space.terms` exists and is active, show a link:

```tsx
{
  space.terms?.isActive ? (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <IconFileText className="h-4 w-4 shrink-0" aria-hidden="true" />
      <Link
        href={`/terms/${space.terms.slug}`}
        className="text-accent underline transition-colors hover:text-foreground"
      >
        {space.terms.title}
      </Link>
    </div>
  ) : null;
}
```

- [ ] **Step 3: Validate**

```bash
bun run validate
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: display space-specific terms link on detail page

Show RENTAL_TERMS link in space info when Space.termsId is set."
```

---

## Task 11: Admin — Reservation Detail Terms Agreements

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/reservations/[id]/page.tsx`

- [ ] **Step 1: Query TermsAgreement for reservation**

In the reservation detail page, fetch associated TermsAgreement records:

```typescript
const agreements = await prisma.termsAgreement.findMany({
  where: { reservationId: id },
  select: {
    id: true,
    agreedAt: true,
    ipAddress: true,
    terms: { select: { title: true, type: true } },
    version: { select: { version: true } },
  },
  orderBy: { agreedAt: "asc" },
});
```

- [ ] **Step 2: Display agreements in DetailSection**

Add a new `DetailSection` to the page:

```tsx
{
  agreements.length > 0 ? (
    <DetailSection title="規約同意記録">
      <div className="space-y-3">
        {agreements.map((a) => (
          <div key={a.id} className="flex items-center justify-between text-sm">
            <div>
              <span className="font-medium">{a.terms.title}</span>
              <span className="ml-2 text-muted-foreground">
                v{a.version.version}
              </span>
            </div>
            <div className="text-muted-foreground">
              {new Date(a.agreedAt).toLocaleString("ja-JP")}
            </div>
          </div>
        ))}
      </div>
    </DetailSection>
  ) : null;
}
```

- [ ] **Step 3: Validate**

```bash
bun run validate
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: show terms agreement records on reservation detail

Display which terms/versions the customer agreed to, with timestamps."
```

---

## Task 12: Tests

**Files:**

- Modify: `__tests__/unit/domain/terms/commands.test.ts`
- Modify: `__tests__/integration/actions/admin/terms.test.ts`
- Modify: `__tests__/integration/actions/public/reservation.test.ts`
- Modify: `__tests__/integration/actions/admin/settings-other.test.ts`

- [ ] **Step 1: Update terms commands unit tests**

Add tests for `requiredAtReservation` and `showInFooter` in create/update commands.

- [ ] **Step 2: Update terms admin action integration tests**

Ensure the new fields are included in create/update test payloads.

- [ ] **Step 3: Update reservation integration test**

Update the `submitReservation` test to include `agreedTermsIds` instead of `agreeToTerms`. Verify that TermsAgreement records are created.

- [ ] **Step 4: Remove or update settings-other tests**

Remove tests for `updateTermsAgreementSettings` which no longer exists.

- [ ] **Step 5: Run all tests**

```bash
bun run test
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test: update tests for terms system overhaul

Add requiredAtReservation/showInFooter tests, update reservation tests
for agreedTermsIds, remove obsolete settings tests."
```

---

## Task 13: Final Validation

- [ ] **Step 1: Full validation**

```bash
bun run validate && bun run build
```

- [ ] **Step 2: Run all tests**

```bash
bun run test
```

- [ ] **Step 3: Verify no remaining references to removed fields**

```bash
# Search for removed field names
grep -r "cancellationTermsId\|termsAgreementEnabled\|termsAgreementText\|requireTermsAgreement\|requirePrivacyAgreement\|agreeToTerms" src/ --include="*.ts" --include="*.tsx" -l
```

Expected: No results (except possibly test fixtures that need cleanup).

- [ ] **Step 4: Commit if any fixes needed**

```bash
git add -A
git commit -m "chore: final cleanup for terms system overhaul"
```
