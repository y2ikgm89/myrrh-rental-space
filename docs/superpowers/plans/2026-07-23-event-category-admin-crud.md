# EventCategory Data Model + Admin CRUD + EventForm Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `EventCategory` Prisma model (mirroring `SpaceCategory`'s shape and soft-delete mechanics), make `Event.categoryId` a required foreign key, and build the full admin CRUD stack (domain commands/queries, Server Actions, admin UI) plus the required category `<Select>` in the event create/edit form.

**Architecture:** Every layer mirrors the existing `SpaceCategory` implementation file-for-file (domain queries/commands, Zod validation shape, Server Action wrapper, admin UI components), renamed to `EventCategory`/`eventCategory`. Because `/admin/events` already owns the URL query key `tab` for its status filter (open/past/draft/cancelled/all — see `EventTabs.tsx`), the category management UI does **not** reuse `/admin/spaces`'s embedded-tab pattern (which relies on a page-level `tab` key with no collision risk there). Instead it gets its own dedicated route `/admin/events/categories` (mirroring the `PostCategory` precedent of a standalone admin route), linked from a header button on `/admin/events`.

**Tech Stack:** Prisma 7 + PostgreSQL, Zod 4, conform (`@conform-to/react` + `@conform-to/zod/v4`), nuqs, Next.js 16 Server Actions.

## Global Constraints

- Tests run only via `bun scripts/run-tests.ts <path>` — never bare `bun test <dir>`.
- `bun run validate` (type-check + lint) does not run tests; run `bun scripts/run-tests.ts` separately and both must be green before claiming completion.
- Prisma is imported only from `@/shared/db/prisma`; every file importing it needs `import "server-only"`.
- `@generated/prisma` direct imports are limited to `src/shared/db`, `src/shared/domain`, `src/shared/lib/validations/enums/` (gateway). Admin/app layers use the gateway (`@/shared/lib/validations/enums/prisma-types`).
- No `any`/non-null assertion (`!`)/`@ts-ignore`/structural `as {` casts — grep-gated at 0.
- **This migration triggers a breaking-migration planned-downtime deploy** (public/admin services `scaling=0` for ~310s) because it contains `ALTER COLUMN ... SET NOT NULL`. This was explicitly approved by the user on 2026-07-23 (see `docs/superpowers/specs/2026-07-23-event-findability-category-design.md`). Push this branch's migration during a low-traffic window.
- Existing applied `prisma/migrations/*/migration.sql` files must never be edited — only the new, not-yet-applied migration file created in Task 2 may be hand-edited (via `--create-only`, before running `prisma migrate dev` again).

---

## File Structure

**New files:**

- `prisma/migrations/<timestamp>_add_event_category/migration.sql` — hand-edited 3-stage expand/contract
- `src/shared/lib/validations/event-category.ts` — Zod schema + shared types (mirrors `space-category.ts`)
- `src/shared/domain/event-categories/queries.ts` — `getEventCategories`/`getEventCategoryById`/`getActiveEventCategories`
- `src/shared/domain/event-categories/commands.ts` — create/update/updateOrder/delete/updateActive
- `src/app/(admin)/admin/(dashboard)/_shared/actions/event-category.ts` — Server Actions
- `src/app/(admin)/admin/(dashboard)/_shared/queries/event-category.ts` — admin RBAC query wrapper
- `src/app/(admin)/admin/(dashboard)/event-categories/_components/CategoryFilters.tsx`
- `src/app/(admin)/admin/(dashboard)/event-categories/_components/CategoryForm.tsx`
- `src/app/(admin)/admin/(dashboard)/event-categories/_components/CategoryTable.tsx`
- `src/app/(admin)/admin/(dashboard)/event-categories/_components/CreateCategoryDialog.tsx`
- `src/app/(admin)/admin/(dashboard)/event-categories/_components/CategoryActionCell.tsx`
- `src/app/(admin)/admin/(dashboard)/events/categories/page.tsx` — new dedicated admin route
- `__tests__/unit/lib/validations/event-category.test.ts`
- `__tests__/integration/domain/event-categories/commands.test.ts`

**Modified files:**

- `prisma/schema.prisma` — new `EventCategory` model, `Event.categoryId` required FK
- `src/shared/lib/admin-resources.ts` — add `"eventCategory"` to `Resource` union + `RESOURCE_LABELS`
- `src/shared/lib/constants/cache.ts` — add `CACHE_TAGS.EVENT_CATEGORIES`
- `src/shared/lib/constants/cdn-cache-tags.ts` — add `CDN_CACHE_TAGS.EVENT_CATEGORY` + `NEXTJS_TAG_TO_CDN_TAG` mapping
- `src/shared/lib/nuqs/parsers.ts` — add `adminEventCategorySearchParamsParsers` + cache
- `src/app/(admin)/admin/(dashboard)/events/page.tsx` — add "カテゴリー管理" header link
- `src/app/(admin)/admin/(dashboard)/events/_components/event-form-schema.ts` — add required `categoryId`
- `src/app/(admin)/admin/(dashboard)/events/_components/EventBasicFields.tsx` — add category `<Select>`
- `src/app/(admin)/admin/(dashboard)/events/_components/EventForm.tsx` — lift `categoryId` state, hidden input, `categories` prop, tab error count
- `src/shared/domain/events/admin-queries.ts` — `categoryId` in selects, new `getCategoriesForEvent()`
- `src/shared/domain/events/commands.ts` — `categoryId` in `EventCommandInput` + create/update data blocks
- `src/app/(admin)/admin/(dashboard)/_shared/queries/event.ts` — re-export `getCategoriesForEvent`
- `src/app/(admin)/admin/(dashboard)/events/new/page.tsx` — fetch categories, pass to `EventForm`
- `src/app/(admin)/admin/(dashboard)/events/[id]/edit/page.tsx` — same
- `__tests__/unit/architecture-boundaries.test.ts` — add `event-category.ts` to `THIN_ADMIN_ACTION_FILES`
- `prisma/seed.ts` — new `seedEventCategories()`, `categoryId` on `eventSeedSource` entries
- `e2e/fixtures/test-data.ts` — add `eventCategoryFixtures`

---

### Task 1: Prisma schema — `EventCategory` model + `Event.categoryId`

**Files:**

- Modify: `prisma/schema.prisma`

**Interfaces:**

- Produces: `EventCategory` Prisma model (fields: `id: string(uuid)`, `name: string`, `description: string|null`, `icon: string|null`, `color: string|null`, `sortOrder: number`, `isActive: boolean`, `createdAt`/`updatedAt: Date`), `Event.categoryId: string` (required), `Event.category: EventCategory` relation.

- [ ] **Step 1: Add the `EventCategory` model**

Insert this directly above the `Event` model definition (around line 2151 of `prisma/schema.prisma`, just after the `EventTimeSlot` model closes):

```prisma
model EventCategory {
  id          String   @id @default(uuid()) @db.Uuid
  name        String
  description String?  @db.Text
  icon        String?
  color       String?
  sortOrder   Int      @default(0)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  events Event[]

  // SpaceCategory と同型: isActive:true な行の間でのみ name の一意性を強制する
  // partial unique index。無効化済みカテゴリーの名前を永久に予約しない。
  @@unique([name], map: "event_categories_name_active_key", where: { isActive: true })
  @@unique([sortOrder], map: "event_categories_sortOrder_key")
  @@index([sortOrder])
  @@map("event_categories")
}
```

- [ ] **Step 2: Add `categoryId`/`category` to the `Event` model**

In the `Event` model, add the field near `locationId`/`spaceId` (after the `format`/`meetingUrl`/`meetingProvider` block, before the closing `@@index` list):

```prisma
  /// イベントの種類・カテゴリー（必須）。EventCategory 側は onDelete: Restrict のため
  /// 紐づくイベントがある限り物理削除・非アクティブ化できない。
  categoryId String        @db.Uuid
  category   EventCategory @relation(fields: [categoryId], references: [id], onDelete: Restrict)
```

And add to the `@@index` list:

```prisma
  @@index([categoryId])
```

- [ ] **Step 3: Verify the schema parses**

Run: `bun run db:generate`

Expected: This will **fail** at this point because `Event.categoryId` has no default and the table already has rows from prior migrations/seed data — `prisma generate` itself only compiles the client and should succeed, but do not run `prisma migrate dev` yet. If `db:generate` fails with a schema syntax error, fix the Prisma DSL syntax before proceeding (it should not fail — this step only regenerates the client types, it does not touch the database).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(events): add EventCategory model and Event.categoryId field to schema"
```

---

### Task 2: Migration — 3-stage expand/contract

**Files:**

- Create: `prisma/migrations/<timestamp>_add_event_category/migration.sql`

**Interfaces:**

- Consumes: `EventCategory`/`Event.categoryId` from Task 1's schema.
- Produces: applied migration; `bun run db:generate` produces a Prisma Client with `prisma.eventCategory.*` available and `Event.categoryId: string` (non-null) in generated types.

- [ ] **Step 1: Generate the migration file without applying it**

Run: `bun run db:migrate --name add_event_category -- --create-only`

Expected output: Prisma reports the required column has no default and cannot be applied automatically, and creates `prisma/migrations/<timestamp>_add_event_category/migration.sql` **without** running it against the database. If prompted interactively, choose to create the migration file only (do not let it apply as-is).

- [ ] **Step 2: Hand-edit the generated `migration.sql`**

Open the newly created `prisma/migrations/<timestamp>_add_event_category/migration.sql` and replace its entire contents with:

```sql
-- CreateTable
CREATE TABLE "event_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_categories_name_active_key" ON "event_categories"("name") WHERE "isActive" = true;

-- CreateIndex
CREATE UNIQUE INDEX "event_categories_sortOrder_key" ON "event_categories"("sortOrder");

-- CreateIndex
CREATE INDEX "event_categories_sortOrder_idx" ON "event_categories"("sortOrder");

-- Seed a default category so existing events have somewhere to backfill to.
INSERT INTO "event_categories" ("id", "name", "sortOrder", "isActive", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), '未分類', 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- AlterTable: add categoryId as nullable first (expand step, no data yet)
ALTER TABLE "events" ADD COLUMN "categoryId" UUID;

-- Backfill: assign every existing event to the "未分類" category
UPDATE "events"
SET "categoryId" = (SELECT "id" FROM "event_categories" WHERE "name" = '未分類' LIMIT 1)
WHERE "categoryId" IS NULL;

-- AlterTable: contract step — make it required. This is the line that triggers
-- the deploy pipeline's breaking-migration detection (.github/workflows/deploy-production.yml:357)
-- squawk-ignore adding-not-nullable-field
ALTER TABLE "events" ALTER COLUMN "categoryId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "event_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "events_categoryId_idx" ON "events"("categoryId");
```

- [ ] **Step 2: Lint the migration**

Run: `bun scripts/lint-migrations.ts prisma/migrations/<timestamp>_add_event_category/migration.sql`

Expected: Exit code 0. The `-- squawk-ignore adding-not-nullable-field` comment must sit on the line immediately before the `ALTER COLUMN ... SET NOT NULL` statement — if squawk still flags it, confirm `.squawk.toml`'s `excluded_rules` still excludes `adding-foreign-key-constraint` (it should, this rule applies to the `ADD CONSTRAINT ... FOREIGN KEY` line) and that no other line needs its own ignore comment.

- [ ] **Step 3: Apply the migration**

Run: `bun run db:migrate --name add_event_category`

Expected: Prisma detects the migration file already exists (from Step 1) and applies it, or re-run with the exact same name to apply the edited file. If Prisma insists on generating a fresh migration instead of applying the edited one, use `prisma migrate deploy` locally against your dev database, or `prisma migrate resolve` per the file already on disk — confirm the `event_categories` table and `events.categoryId` column exist afterward via `bun run db:generate` succeeding with no drift warning.

- [ ] **Step 4: Regenerate the Prisma Client**

Run: `bun run db:generate`

Expected: Succeeds, `generated/prisma` now exposes `prisma.eventCategory.*` and `Event.categoryId` as non-null `string`.

- [ ] **Step 5: Also apply to the test database**

Run: `bun run test:db:migrate`

Expected: Exit code 0, test DB now has `event_categories` table and `events.categoryId` column.

- [ ] **Step 6: Commit**

```bash
git add prisma/migrations
git commit -m "feat(events): migrate EventCategory table and required Event.categoryId FK"
```

---

### Task 3: Validation schema + shared types

**Files:**

- Create: `src/shared/lib/validations/event-category.ts`
- Test: `__tests__/unit/lib/validations/event-category.test.ts`

**Interfaces:**

- Produces: `eventCategoryFormSchema` (Zod), `EventCategoryFormInput`/`EventCategoryFormData` types, `EventCategoryWithStats` type (`_count: {events: number}`), `GetEventCategoriesResult` type.

- [ ] **Step 1: Write the failing test**

Create `__tests__/unit/lib/validations/event-category.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { eventCategoryFormSchema } from "@/shared/lib/validations/event-category";

describe("eventCategoryFormSchema", () => {
  test("正常なデータが検証を通過する", () => {
    const validData = {
      name: "ワークショップ",
      description: "体験型のワークショップイベント",
      icon: "icon-name",
      color: "#ff0000",
    };

    const result = eventCategoryFormSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("最小限のフィールドで検証を通過する", () => {
    const minimalData = {
      name: "ワークショップ",
    };

    const result = eventCategoryFormSchema.safeParse(minimalData);
    expect(result.success).toBe(true);
  });

  test("name が必須である", () => {
    const data = {
      description: "説明",
    };

    const result = eventCategoryFormSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("name が空文字列の場合エラーになる", () => {
    const data = { name: "" };

    const result = eventCategoryFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "カテゴリー名を入力してください",
      );
    }
  });

  test("name が50文字を超える場合エラーになる", () => {
    const data = { name: "a".repeat(51) };

    const result = eventCategoryFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "カテゴリー名は50文字以内で入力してください",
      );
    }
  });

  test("description が500文字を超える場合エラーになる", () => {
    const data = { name: "ワークショップ", description: "a".repeat(501) };

    const result = eventCategoryFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "説明は500文字以内で入力してください",
      );
    }
  });

  test("color が不正な形式の場合エラーになる", () => {
    const data = { name: "ワークショップ", color: "red" };

    const result = eventCategoryFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "有効なカラーコードを入力してください",
      );
    }
  });

  test("sortOrder は schema に含まれない（システム管理）", () => {
    const result = eventCategoryFormSchema.safeParse({
      name: "ワークショップ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("sortOrder" in result.data).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun scripts/run-tests.ts __tests__/unit/lib/validations/event-category.test.ts`
Expected: FAIL — `Cannot find module '@/shared/lib/validations/event-category'`.

- [ ] **Step 3: Write the implementation**

Create `src/shared/lib/validations/event-category.ts`:

```typescript
import { z } from "zod";

export const eventCategoryFormSchema = z.strictObject({
  name: z
    .string()
    .min(1, { error: "カテゴリー名を入力してください" })
    .max(50, { error: "カテゴリー名は50文字以内で入力してください" }),
  description: z
    .string()
    .max(500, { error: "説明は500文字以内で入力してください" })
    .optional()
    .or(z.literal("")),
  icon: z
    .string()
    .max(50, { error: "アイコン名は50文字以内で入力してください" })
    .optional()
    .or(z.literal("")),
  color: z
    .string()
    .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, {
      error: "有効なカラーコードを入力してください",
    })
    .optional()
    .or(z.literal("")),
  // sortOrder はシステム管理（D&D 並び替えが SSoT、手動入力なし）
});

export type EventCategoryFormInput = z.input<typeof eventCategoryFormSchema>;
export type EventCategoryFormData = z.output<typeof eventCategoryFormSchema>;

export const defaultEventCategoryFormValues: EventCategoryFormInput = {
  name: "",
  description: "",
  icon: "",
  color: "",
};

export type EventCategoryWithStats = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    events: number;
  };
};

export type GetEventCategoriesResult = {
  categories: EventCategoryWithStats[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun scripts/run-tests.ts __tests__/unit/lib/validations/event-category.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/validations/event-category.ts __tests__/unit/lib/validations/event-category.test.ts
git commit -m "feat(events): add EventCategory Zod validation schema"
```

---

### Task 4: Domain queries

**Files:**

- Create: `src/shared/domain/event-categories/queries.ts`

**Interfaces:**

- Consumes: `GetEventCategoriesResult`, `EventCategoryWithStats` from Task 3.
- Produces: `getEventCategories(options)`, `getEventCategoryById(id)`, `getActiveEventCategories()`.

- [ ] **Step 1: Write the implementation**

Create `src/shared/domain/event-categories/queries.ts`:

```typescript
import "server-only";

import { prisma } from "@/shared/db/prisma";
import { paginate } from "@/shared/lib/pagination";
import type {
  GetEventCategoriesResult,
  EventCategoryWithStats,
} from "@/shared/lib/validations/event-category";

type ActiveEventCategoryOption = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
};

export async function getEventCategories(options: {
  includeInactive?: boolean;
  search?: string;
  page: number;
  limit: number;
}): Promise<GetEventCategoriesResult> {
  const { includeInactive = false, search } = options;
  const { skip, take, page, limit } = paginate({
    page: options.page,
    limit: options.limit,
  });

  const where = {
    ...(includeInactive ? {} : { isActive: true }),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            {
              description: { contains: search, mode: "insensitive" as const },
            },
          ],
        }
      : {}),
  };

  const [categories, total] = await Promise.all([
    prisma.eventCategory.findMany({
      where,
      orderBy: { sortOrder: "asc" },
      skip,
      take,
      include: {
        _count: {
          select: { events: true },
        },
      },
    }),
    prisma.eventCategory.count({ where }),
  ]);

  const formattedCategories: EventCategoryWithStats[] = categories.map(
    (category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      icon: category.icon,
      color: category.color,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
      _count: category._count,
    }),
  );

  const totalPages = total === 0 ? 1 : Math.ceil(total / limit);

  return {
    categories: formattedCategories,
    total,
    page,
    limit,
    totalPages,
  };
}

export async function getEventCategoryById(
  id: string,
): Promise<EventCategoryWithStats | null> {
  const category = await prisma.eventCategory.findUnique({
    where: { id },
    include: {
      _count: {
        select: { events: true },
      },
    },
  });

  if (!category) {
    return null;
  }

  return {
    id: category.id,
    name: category.name,
    description: category.description,
    icon: category.icon,
    color: category.color,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
    _count: category._count,
  };
}

export async function getActiveEventCategories(): Promise<
  ActiveEventCategoryOption[]
> {
  return prisma.eventCategory.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      icon: true,
      color: true,
    },
  });
}
```

- [ ] **Step 2: Type-check**

Run: `bun run type-check`
Expected: Exit code 0 (no errors referencing this new file).

- [ ] **Step 3: Commit**

```bash
git add src/shared/domain/event-categories/queries.ts
git commit -m "feat(events): add EventCategory domain queries"
```

---

### Task 5: Domain commands + integration test

**Files:**

- Create: `src/shared/domain/event-categories/commands.ts`
- Test: `__tests__/integration/domain/event-categories/commands.test.ts`

**Interfaces:**

- Consumes: `EventCategoryFormData` from Task 3.
- Produces: `createEventCategory(data)`, `updateEventCategory(id, data)`, `updateEventCategoryOrder(items)`, `deleteEventCategory(id)`, `updateEventCategoryActive(id, isActive)` — same signatures as their `SpaceCategory` counterparts.

- [ ] **Step 1: Write the failing integration test**

Create `__tests__/integration/domain/event-categories/commands.test.ts`:

```typescript
import { describe, test, expect, beforeEach } from "bun:test";
import { prisma } from "@/shared/db/prisma";
import {
  createEventCategory,
  updateEventCategory,
  updateEventCategoryOrder,
  deleteEventCategory,
  updateEventCategoryActive,
} from "@/shared/domain/event-categories/commands";
import { DomainError } from "@/shared/domain/domain-error";

describe("event-categories/commands", () => {
  beforeEach(async () => {
    await prisma.event.deleteMany({});
    await prisma.eventCategory.deleteMany({});
  });

  test("createEventCategory は末尾に自動採番して作成する", async () => {
    const first = await createEventCategory({ name: "ワークショップ" });
    const second = await createEventCategory({ name: "マルシェ" });

    const rows = await prisma.eventCategory.findMany({
      orderBy: { sortOrder: "asc" },
    });
    expect(rows.map((r) => r.id)).toEqual([first.id, second.id]);
    expect(rows[0]?.sortOrder).toBe(0);
    expect(rows[1]?.sortOrder).toBe(1);
  });

  test("createEventCategory は isActive:true な同名カテゴリーがあると CONFLICT で拒否する", async () => {
    await createEventCategory({ name: "ワークショップ" });

    await expect(
      createEventCategory({ name: "ワークショップ" }),
    ).rejects.toThrow(DomainError);
  });

  test("updateEventCategory は名前・説明・アイコン・色を更新する", async () => {
    const created = await createEventCategory({ name: "ワークショップ" });

    await updateEventCategory(created.id, {
      name: "ワークショップ改",
      description: "説明を更新",
    });

    const updated = await prisma.eventCategory.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(updated.name).toBe("ワークショップ改");
    expect(updated.description).toBe("説明を更新");
  });

  test("updateEventCategory は存在しない id で NOT_FOUND を投げる", async () => {
    await expect(
      updateEventCategory("00000000-0000-0000-0000-000000000000", {
        name: "test",
      }),
    ).rejects.toThrow(DomainError);
  });

  test("updateEventCategoryOrder は sortOrder を並び替える", async () => {
    const a = await createEventCategory({ name: "A" });
    const b = await createEventCategory({ name: "B" });

    await updateEventCategoryOrder([
      { id: a.id, sortOrder: 1 },
      { id: b.id, sortOrder: 0 },
    ]);

    const rows = await prisma.eventCategory.findMany({
      orderBy: { sortOrder: "asc" },
    });
    expect(rows.map((r) => r.id)).toEqual([b.id, a.id]);
  });

  test("deleteEventCategory はイベントが紐づく場合 CONFLICT で拒否する", async () => {
    const created = await createEventCategory({ name: "ワークショップ" });
    await prisma.event.create({
      data: {
        title: "テストイベント",
        slug: `test-event-${created.id}`,
        descriptionJson: {},
        descriptionHtml: "",
        descriptionPlainText: "",
        status: "DRAFT",
        scheduleMode: "SINGLE_OCCURRENCE",
        categoryId: created.id,
      },
    });

    await expect(deleteEventCategory(created.id)).rejects.toThrow(DomainError);
  });

  test("deleteEventCategory はイベント紐づけがなければ isActive:false にする", async () => {
    const created = await createEventCategory({ name: "ワークショップ" });

    await deleteEventCategory(created.id);

    const row = await prisma.eventCategory.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(row.isActive).toBe(false);
  });

  test("updateEventCategoryActive はイベントが紐づく場合の非アクティブ化を CONFLICT で拒否する", async () => {
    const created = await createEventCategory({ name: "ワークショップ" });
    await prisma.event.create({
      data: {
        title: "テストイベント2",
        slug: `test-event-2-${created.id}`,
        descriptionJson: {},
        descriptionHtml: "",
        descriptionPlainText: "",
        status: "DRAFT",
        scheduleMode: "SINGLE_OCCURRENCE",
        categoryId: created.id,
      },
    });

    await expect(updateEventCategoryActive(created.id, false)).rejects.toThrow(
      DomainError,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun scripts/run-tests.ts __tests__/integration/domain/event-categories/commands.test.ts`
Expected: FAIL — `Cannot find module '@/shared/domain/event-categories/commands'`.

- [ ] **Step 3: Write the implementation**

Create `src/shared/domain/event-categories/commands.ts`:

```typescript
import "server-only";

import { prisma } from "@/shared/db/prisma";
import { Prisma } from "@generated/prisma/client";
import { DomainError } from "@/shared/domain/domain-error";
import {
  buildOrderScopeLockSql,
  buildUuidOrderSqlFragments,
} from "@/shared/domain/order-sql";
import type { EventCategoryFormData } from "@/shared/lib/validations/event-category";

type EventCategoryOrderInput = {
  id: string;
  sortOrder: number;
};

/**
 * name の一意性は isActive: true な行の間でのみ強制される partial unique
 * index（SpaceCategory と同型）。無効化済みカテゴリーの名前を永久に予約しない。
 */
async function ensureNameAvailable(
  name: string,
  currentId?: string,
): Promise<void> {
  const existing = await prisma.eventCategory.findFirst({
    where: {
      name,
      isActive: true,
      ...(currentId ? { id: { not: currentId } } : {}),
    },
    select: { id: true },
  });

  if (existing) {
    throw new DomainError("同じ名前のカテゴリーが既に存在します", "CONFLICT");
  }
}

function toEventCategoryData(data: EventCategoryFormData) {
  return {
    name: data.name,
    description: data.description || null,
    icon: data.icon || null,
    color: data.color || null,
  };
}

export async function createEventCategory(
  data: EventCategoryFormData,
): Promise<{ id: string }> {
  await ensureNameAvailable(data.name);

  const category = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(buildOrderScopeLockSql("event_categories:all"));

    const maxOrder = await tx.eventCategory.aggregate({
      _max: { sortOrder: true },
    });

    return tx.eventCategory.create({
      data: {
        ...toEventCategoryData(data),
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
    });
  });

  return { id: category.id };
}

export async function updateEventCategory(
  id: string,
  data: EventCategoryFormData,
): Promise<{ id: string }> {
  const category = await prisma.eventCategory.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!category) {
    throw new DomainError("カテゴリーが見つかりません", "NOT_FOUND");
  }

  await ensureNameAvailable(data.name, id);

  await prisma.eventCategory.update({
    where: { id },
    data: toEventCategoryData(data),
  });

  return { id };
}

export async function updateEventCategoryOrder(
  items: readonly EventCategoryOrderInput[],
): Promise<{ updated: number }> {
  if (items.length === 0) {
    return { updated: 0 };
  }

  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new DomainError("同じIDを複数指定することはできません", "VALIDATION");
  }
  if (new Set(items.map((item) => item.sortOrder)).size !== items.length) {
    throw new DomainError(
      "同じ並び順を複数指定することはできません",
      "VALIDATION",
    );
  }

  const existingCategories = await prisma.eventCategory.findMany({
    select: { id: true },
  });
  const existingIds = new Set(
    existingCategories.map((category) => category.id),
  );

  for (const item of items) {
    if (!existingIds.has(item.id)) {
      throw new DomainError("カテゴリーが見つかりません", "NOT_FOUND");
    }
  }

  if (existingCategories.length !== items.length) {
    throw new DomainError("カテゴリー数が一致しません（過不足）", "VALIDATION");
  }

  const { ids, tempCases, finalCases } = buildUuidOrderSqlFragments(
    items,
    (item) => item.id,
    (item) => item.sortOrder,
  );

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(buildOrderScopeLockSql("event_categories:all"));

    await tx.$executeRaw`
      UPDATE "event_categories"
      SET "sortOrder" = CASE "id" ${Prisma.join(tempCases, " ")} END
      WHERE "id" IN (${Prisma.join(ids)})
    `;

    await tx.$executeRaw`
      UPDATE "event_categories"
      SET "sortOrder" = CASE "id" ${Prisma.join(finalCases, " ")} END
      WHERE "id" IN (${Prisma.join(ids)})
    `;
  });

  return { updated: items.length };
}

export async function deleteEventCategory(id: string): Promise<{ id: string }> {
  const category = await prisma.eventCategory.findUnique({
    where: { id },
    include: {
      _count: {
        select: { events: true },
      },
    },
  });

  if (!category) {
    throw new DomainError("カテゴリーが見つかりません", "NOT_FOUND");
  }

  if (category._count.events > 0) {
    throw new DomainError(
      `このカテゴリーには${category._count.events}件のイベントが紐づいています。先にイベントのカテゴリーを変更してください。`,
      "CONFLICT",
    );
  }

  await prisma.eventCategory.update({
    where: { id },
    data: { isActive: false },
  });

  return { id };
}

export async function updateEventCategoryActive(
  id: string,
  isActive: boolean,
): Promise<{ id: string; isActive: boolean }> {
  const category = await prisma.eventCategory.findUnique({
    where: { id },
    include: {
      _count: {
        select: { events: true },
      },
    },
  });

  if (!category) {
    throw new DomainError("カテゴリーが見つかりません", "NOT_FOUND");
  }

  if (!isActive && category._count.events > 0) {
    throw new DomainError(
      `このカテゴリーには${category._count.events}件のイベントが紐づいています。先にイベントのカテゴリーを変更してください。`,
      "CONFLICT",
    );
  }

  if (isActive) {
    await ensureNameAvailable(category.name, id);
  }

  await prisma.eventCategory.update({
    where: { id },
    data: { isActive },
  });

  return { id, isActive };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun scripts/run-tests.ts __tests__/integration/domain/event-categories/commands.test.ts`
Expected: PASS (8 tests). This requires the local test DB to be up and migrated (Task 2, Step 5).

- [ ] **Step 5: Commit**

```bash
git add src/shared/domain/event-categories/commands.ts __tests__/integration/domain/event-categories/commands.test.ts
git commit -m "feat(events): add EventCategory domain commands with CRUD guards"
```

---

### Task 6: Resource, cache tag, and CDN tag registration

**Files:**

- Modify: `src/shared/lib/admin-resources.ts`
- Modify: `src/shared/lib/constants/cache.ts`
- Modify: `src/shared/lib/constants/cdn-cache-tags.ts`

**Interfaces:**

- Produces: `Resource` union includes `"eventCategory"`; `CACHE_TAGS.EVENT_CATEGORIES = "event-categories"`; `CDN_CACHE_TAGS.EVENT_CATEGORY`; `NEXTJS_TAG_TO_CDN_TAG[CACHE_TAGS.EVENT_CATEGORIES]`.

- [ ] **Step 1: Add `"eventCategory"` to the `Resource` union**

In `src/shared/lib/admin-resources.ts`, add `"eventCategory"` to the `Resource` union type (alongside the existing `"spaceCategory"` and `"event"` entries) and add a matching entry to `RESOURCE_LABELS`:

```typescript
  eventCategory: "イベントカテゴリー",
```

(Place both additions immediately after the existing `event: "イベント",` line for readability.)

- [ ] **Step 2: Add the cache tag**

In `src/shared/lib/constants/cache.ts`, inside the `CACHE_TAGS` object, add near the existing `EVENTS`/`EVENT_WAITLIST` entries:

```typescript
  /** イベントカテゴリ */
  EVENT_CATEGORIES: "event-categories",
```

- [ ] **Step 3: Add the CDN tag and mapping**

In `src/shared/lib/constants/cdn-cache-tags.ts`, add to `CDN_CACHE_TAGS` near the existing `EVENT`/`EVENT_WAITLIST` entries:

```typescript
  EVENT_CATEGORY: defineCdnTag("event-category-v1"),
```

And add to `NEXTJS_TAG_TO_CDN_TAG` near the existing `CACHE_TAGS.EVENTS` mapping:

```typescript
  [CACHE_TAGS.EVENT_CATEGORIES]: CDN_CACHE_TAGS.EVENT_CATEGORY,
```

- [ ] **Step 4: Type-check**

Run: `bun run type-check`
Expected: Exit code 0.

- [ ] **Step 5: Run the cache-tag drift gate**

Run: `bun scripts/run-tests.ts __tests__/unit/architecture-boundaries.test.ts`
Expected: PASS. If it fails citing `CACHE_TAGS.EVENT_CATEGORIES` has no producer, this will be satisfied once Task 8's `getActiveEventCategories` admin query and the eventual public query (Plan 2) exist — if this test blocks here, proceed to Task 8 first and re-run.

- [ ] **Step 6: Commit**

```bash
git add src/shared/lib/admin-resources.ts src/shared/lib/constants/cache.ts src/shared/lib/constants/cdn-cache-tags.ts
git commit -m "feat(events): register eventCategory resource and EVENT_CATEGORIES cache tag"
```

---

### Task 7: nuqs parsers for the admin category list

**Files:**

- Modify: `src/shared/lib/nuqs/parsers.ts`

**Interfaces:**

- Produces: `adminEventCategorySearchParamsParsers` (`search`, `includeInactive`, `page`, `perPage`), `adminEventCategorySearchParamsCache` (`createSearchParamsCache` wrapper), `loadAdminEventCategorySearchParams(searchParams)`.

- [ ] **Step 1: Add the parser map and cache**

In `src/shared/lib/nuqs/parsers.ts`, add near the existing `adminSpaceSearchParamsParsers` definition:

```typescript
export const adminEventCategorySearchParamsParsers = {
  search: parseAsQuery,
  includeInactive: parseAsBoolean.withDefault(false),
  page: parseAsPage,
  perPage: parseAsPerPage,
};

export const adminEventCategorySearchParamsCache = createSearchParamsCache(
  adminEventCategorySearchParamsParsers,
);

export async function loadAdminEventCategorySearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminEventCategorySearchParamsCache.parse(searchParams);
  return adminEventCategorySearchParamsCache.all();
}
```

(This is a standalone route, unlike `space-categories`' embedded-tab `cat*`-prefixed keys — there is no sibling page on `/admin/events/categories` competing for the `search`/`page` keys, so no prefix is needed.)

- [ ] **Step 2: Type-check**

Run: `bun run type-check`
Expected: Exit code 0.

- [ ] **Step 3: Commit**

```bash
git add src/shared/lib/nuqs/parsers.ts
git commit -m "feat(events): add nuqs parsers for the event category admin list"
```

---

### Task 8: Admin queries wrapper + Server Actions

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/queries/event-category.ts`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/actions/event-category.ts`
- Modify: `__tests__/unit/architecture-boundaries.test.ts` (register in `THIN_ADMIN_ACTION_FILES`)

**Interfaces:**

- Consumes: `getEventCategories`/`getEventCategoryById`/`getActiveEventCategories` from Task 4, `createEventCategory`/`updateEventCategory`/`updateEventCategoryOrder`/`deleteEventCategory`/`updateEventCategoryActive` from Task 5.
- Produces: `getEventCategories`, `getEventCategoryById`, `getActiveEventCategories` (admin RBAC wrapped); `createEventCategory`, `updateEventCategory`, `updateEventCategoryOrder`, `deleteEventCategory`, `updateEventCategoryActive` (Server Actions).

- [ ] **Step 1: Write the admin queries wrapper**

Create `src/app/(admin)/admin/(dashboard)/_shared/queries/event-category.ts`:

```typescript
import "server-only";

import {
  getActiveEventCategories as getActiveEventCategoriesQuery,
  getEventCategories as getEventCategoriesQuery,
  getEventCategoryById as getEventCategoryByIdQuery,
} from "@/shared/domain/event-categories/queries";
import type {
  GetEventCategoriesResult,
  EventCategoryWithStats,
} from "@/shared/lib/validations/event-category";
import { requireAdminPermission } from "./_helpers";

export async function getEventCategories(options: {
  includeInactive?: boolean;
  search?: string;
  page: number;
  limit: number;
}): Promise<GetEventCategoriesResult> {
  await requireAdminPermission("eventCategory", "read");
  return getEventCategoriesQuery(options);
}

export async function getEventCategoryById(
  id: string,
): Promise<EventCategoryWithStats | null> {
  await requireAdminPermission("eventCategory", "read");
  return getEventCategoryByIdQuery(id);
}

export async function getActiveEventCategories(): Promise<
  { id: string; name: string; icon: string | null; color: string | null }[]
> {
  await requireAdminPermission("eventCategory", "read");
  return getActiveEventCategoriesQuery();
}
```

- [ ] **Step 2: Write the Server Actions**

Create `src/app/(admin)/admin/(dashboard)/_shared/actions/event-category.ts`:

```typescript
"use server";

import type { SubmissionResult } from "@conform-to/react";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { invalidateSiteWideCache } from "@/shared/lib/cache/site-wide";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  createEventCategory as createEventCategoryCommand,
  deleteEventCategory as deleteEventCategoryCommand,
  updateEventCategory as updateEventCategoryCommand,
  updateEventCategoryActive as updateEventCategoryActiveCommand,
  updateEventCategoryOrder as updateEventCategoryOrderCommand,
} from "@/shared/domain/event-categories/commands";
import { eventCategoryFormSchema } from "@/shared/lib/validations/event-category";
import { uuidIdSchema } from "@/shared/lib/validations/params";

const idSchema = uuidIdSchema("イベントカテゴリ");
const categoryOrderSchema = z
  .array(
    z.strictObject({
      id: z.uuid({ error: "カテゴリーIDが不正です" }),
      sortOrder: z.number().int().min(0, { error: "並び順が不正です" }),
    }),
  )
  .refine((items) => new Set(items.map((i) => i.id)).size === items.length, {
    error: "同じIDを複数指定することはできません",
  })
  .refine(
    (items) =>
      new Set(items.map((item) => item.sortOrder)).size === items.length,
    {
      error: "同じ並び順を複数指定することはできません",
    },
  );

export async function createEventCategory(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    eventCategoryFormSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "eventCategory",
        action: "create",
        execute: async () => createEventCategoryCommand(data),
        afterSuccess: () => {
          invalidateSiteWideCache(CACHE_TAGS.EVENT_CATEGORIES);
        },
        resolveAuditResourceId: (result) => result.id,
      });
      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
  );
}

export async function updateEventCategory(
  categoryId: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    eventCategoryFormSchema,
    async (data) => {
      const idValid = idSchema.safeParse(categoryId);
      if (!idValid.success) {
        return { ok: false, error: "カテゴリーIDが不正です" };
      }
      const result = await executeAdminMutationResult({
        resource: "eventCategory",
        action: "update",
        resourceId: idValid.data,
        execute: async () => updateEventCategoryCommand(idValid.data, data),
        afterSuccess: () => {
          invalidateSiteWideCache(CACHE_TAGS.EVENT_CATEGORIES);
        },
        resolveAuditResourceId: (result) => result.id,
      });
      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
  );
}

export async function updateEventCategoryOrder(
  items: { id: string; sortOrder: number }[],
): Promise<MutationResult<{ updated: number }>> {
  const parsed = categoryOrderSchema.safeParse(items);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "eventCategory",
    action: "update",
    execute: async () => updateEventCategoryOrderCommand(parsed.data),
    afterSuccess: () => {
      invalidateSiteWideCache(CACHE_TAGS.EVENT_CATEGORIES);
    },
  });
}

export async function deleteEventCategory(
  id: string,
): Promise<MutationResult<{ id: string }>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "eventCategory",
    action: "delete",
    resourceId: validated.data,
    execute: async () => deleteEventCategoryCommand(validated.data),
    afterSuccess: () => {
      invalidateSiteWideCache(CACHE_TAGS.EVENT_CATEGORIES);
    },
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updateEventCategoryActive(
  id: string,
  isActive: boolean,
): Promise<MutationResult<{ id: string; isActive: boolean }>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "eventCategory",
    action: "update",
    resourceId: validated.data,
    execute: async () =>
      updateEventCategoryActiveCommand(validated.data, isActive),
    afterSuccess: () => {
      invalidateSiteWideCache(CACHE_TAGS.EVENT_CATEGORIES);
    },
  });
}
```

- [ ] **Step 3: Register in `THIN_ADMIN_ACTION_FILES`**

In `__tests__/unit/architecture-boundaries.test.ts`, add an entry for `_shared/actions/event-category.ts` to the `THIN_ADMIN_ACTION_FILES` array, in the same `join(...)`-built form as the existing `space-category.ts` entry (copy that line and change `space-category` to `event-category`).

- [ ] **Step 4: Type-check and run the boundaries test**

Run: `bun run type-check && bun scripts/run-tests.ts __tests__/unit/architecture-boundaries.test.ts`
Expected: Both exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/queries/event-category.ts src/app/\(admin\)/admin/\(dashboard\)/_shared/actions/event-category.ts __tests__/unit/architecture-boundaries.test.ts
git commit -m "feat(events): add EventCategory admin queries wrapper and Server Actions"
```

---

### Task 9: Admin UI components

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/event-categories/_components/CategoryFilters.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/event-categories/_components/CategoryForm.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/event-categories/_components/CategoryTable.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/event-categories/_components/CreateCategoryDialog.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/event-categories/_components/CategoryActionCell.tsx`

**Interfaces:**

- Consumes: `EventCategoryWithStats` (Task 3), Server Actions from Task 8, `adminEventCategorySearchParamsParsers` from Task 7.
- Produces: `<CategoryFilters/>`, `<CategoryForm/>`, `<CategoryTable categories sortable startIndex/>`, `<CreateCategoryDialog/>`, `<CategoryActionCell category/>`.

- [ ] **Step 1: `CategoryFilters.tsx`**

```typescript
"use client";

import { useQueryStates } from "nuqs";
import { adminEventCategorySearchParamsParsers } from "@/shared/lib/nuqs";
import { useRef, useEffect } from "react";
import { Checkbox, Label, Input } from "@/admin/components/ui";

export function CategoryFilters() {
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [params, setParams] = useQueryStates(
    adminEventCategorySearchParamsParsers,
    {
      history: "replace",
      shallow: false,
    },
  );

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const setSearchDebounced = (value: string) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      void setParams({ search: value || null, page: 1 });
    }, 300);
  };

  const handleIncludeInactiveChange = (checked: boolean) => {
    void setParams({ includeInactive: checked || null, page: 1 });
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="flex items-center gap-2">
        <Checkbox
          id="includeInactive"
          checked={params.includeInactive}
          onCheckedChange={handleIncludeInactiveChange}
        />
        <Label htmlFor="includeInactive" className="text-sm cursor-pointer">
          非アクティブを含める
        </Label>
      </div>

      <div className="flex-1">
        <Input
          type="search"
          placeholder="名前・説明で検索..."
          defaultValue={params.search}
          onChange={(e) => setSearchDebounced(e.target.value)}
          leadingIcon="IconSearch"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `CategoryForm.tsx`**

```typescript
"use client";

/**
 * EventCategory form
 *
 * Dialog 内 conform 化。`useForm` (@conform-to/react) を内側に持ち、
 * parent dialog から `lastResult` / `formAction` / `formId` / `isPending` を
 * 受け取る。`SubmitButton` は parent dialog footer に置かれ `form={formId}` で
 * connect する。
 *
 * - icon は `IconPickerField` + `useInputControl` で hidden input sync。
 * - color は `<input type="color">` と `<Input type="text">` の 2 入力を
 *   `useInputControl` で共通 state にバインドし、hidden input で送信値を確定。
 * - sortOrder はシステム管理（D&D 並び替えが SSoT）のためフォームに持たない。
 */

import type { SubmissionResult } from "@conform-to/react";
import {
  getFormProps,
  getInputProps,
  getTextareaProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { Input, Textarea, Label } from "@/admin/components/ui";
import { IconPickerField } from "@/admin/components/icon-picker/IconPickerField";
import {
  eventCategoryFormSchema,
  type EventCategoryWithStats,
} from "@/shared/lib/validations/event-category";

type CategoryFormProps = {
  readonly category?: EventCategoryWithStats;
  readonly isPending: boolean;
  readonly lastResult: SubmissionResult | undefined;
  readonly formAction: (formData: FormData) => void;
  readonly formId: string;
};

export function CategoryForm({
  category,
  isPending,
  lastResult,
  formAction,
  formId,
}: CategoryFormProps) {
  const [form, fields] = useForm({
    id: formId,
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: eventCategoryFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: category
      ? {
          name: category.name,
          description: category.description ?? "",
          icon: category.icon ?? "",
          color: category.color ?? "",
        }
      : {
          name: "",
          description: "",
          icon: "",
          color: "",
        },
  });

  const iconControl = useInputControl(fields.icon);
  const colorControl = useInputControl(fields.color);
  const iconValue = iconControl.value ?? "";
  const colorValue = colorControl.value ?? "";
  const formErrors = form.errors;

  return (
    <form {...getFormProps(form)} action={formAction} className="space-y-4">
      <input type="hidden" name={fields.icon.name} value={iconValue} />
      <input type="hidden" name={fields.color.name} value={colorValue} />

      <div className="space-y-2">
        <Label htmlFor={fields.name.id}>カテゴリー名 *</Label>
        <Input
          {...getInputProps(fields.name, { type: "text" })}
          placeholder="例: ワークショップ"
          disabled={isPending}
        />
        {fields.name.errors && (
          <p id={fields.name.errorId} className="text-sm text-destructive">
            {fields.name.errors.join(", ")}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={fields.description.id}>説明</Label>
        <Textarea
          {...getTextareaProps(fields.description)}
          placeholder="カテゴリーの説明（オプション）"
          rows={3}
          disabled={isPending}
        />
        {fields.description.errors && (
          <p
            id={fields.description.errorId}
            className="text-sm text-destructive"
          >
            {fields.description.errors.join(", ")}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={fields.icon.id}>アイコン</Label>
          <IconPickerField
            id={fields.icon.id}
            value={iconValue}
            onChange={(name) => iconControl.change(name)}
            disabled={isPending}
            aria-describedby={
              fields.icon.errors ? fields.icon.errorId : undefined
            }
          />
          {fields.icon.errors && (
            <p id={fields.icon.errorId} className="text-sm text-destructive">
              {fields.icon.errors.join(", ")}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor={fields.color.id}>色</Label>
          <div className="flex items-center gap-2">
            <input
              id={fields.color.id}
              type="color"
              value={colorValue || "#000000"}
              onChange={(e) => colorControl.change(e.target.value)}
              onBlur={colorControl.blur}
              disabled={isPending}
              aria-label="カラーピッカー"
              aria-invalid={fields.color.errors ? true : undefined}
              aria-describedby={
                fields.color.errors ? fields.color.errorId : undefined
              }
              className="h-10 w-16 cursor-pointer rounded-md border border-input bg-background p-1"
            />
            <Input
              type="text"
              value={colorValue}
              onChange={(e) => colorControl.change(e.target.value)}
              onBlur={colorControl.blur}
              placeholder="#3B82F6"
              className="flex-1"
              disabled={isPending}
              aria-label="カラーコード"
              aria-invalid={fields.color.errors ? true : undefined}
              aria-describedby={
                fields.color.errors ? fields.color.errorId : undefined
              }
            />
          </div>
          {fields.color.errors && (
            <p id={fields.color.errorId} className="text-sm text-destructive">
              {fields.color.errors.join(", ")}
            </p>
          )}
        </div>
      </div>

      {formErrors && formErrors.length > 0 && (
        <div
          id={form.errorId}
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {formErrors.join(", ")}
        </div>
      )}
    </form>
  );
}
```

- [ ] **Step 3: `CategoryTable.tsx`**

```typescript
"use client";

/**
 * CategoryTable
 *
 * イベントカテゴリー一覧テーブル。`sortable`（検索・絞り込みなし）のとき
 * D&D 並び替えを有効化し、`updateEventCategoryOrder` に {id, sortOrder} を渡す。
 * sortOrder はシステム管理（手動入力なし、create=末尾自動採番 / reorder=D&D SSoT /
 * update=不変）。`startIndex` はページオフセットで、global な sortOrder を維持する。
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Badge,
  PublishSwitch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
  toTranslate3d,
  type DragEndEvent,
} from "@/admin/components/ui";
import { DragHandle } from "@/admin/components/ui/sortable";
import { stopRowClick } from "@/admin/components/table";
import { EmptyState } from "@/admin/components/EmptyState";
import { CuratedIcon } from "@/shared/components/icon-curation/CuratedIcon";
import {
  updateEventCategoryActive,
  updateEventCategoryOrder,
} from "@/admin/actions/event-category";
import { isMutationError } from "@/shared/lib/mutation-result";
import { cn } from "@/shared/lib/cn";
import { CategoryActionCell } from "./CategoryActionCell";
import type { EventCategoryWithStats } from "@/shared/lib/validations/event-category";

type CategoryTableProps = {
  readonly categories: EventCategoryWithStats[];
  /** 検索・絞り込みなしのとき true（D&D 並び替えを有効化） */
  readonly sortable: boolean;
  /** ページオフセット（global な sortOrder 維持用） */
  readonly startIndex: number;
};

type SortableRowProps = {
  readonly category: EventCategoryWithStats;
  readonly sortable: boolean;
  readonly isPending: boolean;
};

function SortableRow({ category, sortable, isPending }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id, disabled: !sortable || isPending });

  const style = {
    transform: toTranslate3d(transform),
    transition,
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn(
        "group",
        isDragging && "z-50 shadow-lg ring-2 ring-primary/20",
      )}
    >
      <TableCell className="hidden w-12 md:table-cell" onClick={stopRowClick}>
        {sortable ? (
          <div {...attributes} {...listeners}>
            <DragHandle disabled={isPending} />
          </div>
        ) : (
          <span className="block h-4 w-4" aria-hidden="true" />
        )}
      </TableCell>
      <TableCell className="font-medium">{category.name}</TableCell>
      <TableCell className="hidden lg:table-cell">
        <span className="text-sm text-muted-foreground line-clamp-2">
          {category.description || "-"}
        </span>
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        {category.icon ? (
          <span className="inline-flex items-center gap-2">
            <CuratedIcon
              name={category.icon}
              className="h-4 w-4 text-foreground"
            />
            <code className="text-xs text-muted-foreground">
              {category.icon}
            </code>
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        {category.color ? (
          <div className="flex items-center gap-2">
            <div
              className="h-6 w-6 rounded border"
              style={{ backgroundColor: category.color }}
            />
            <code className="text-xs text-muted-foreground">
              {category.color}
            </code>
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell className="hidden text-right md:table-cell">
        <Badge variant="secondary">{category._count.events}件</Badge>
      </TableCell>
      <TableCell className="whitespace-nowrap" onClick={stopRowClick}>
        <PublishSwitch
          id={category.id}
          isPublished={category.isActive}
          onToggle={updateEventCategoryActive}
          resourceLabel={`${category.name} の有効状態`}
          label={{
            published: "アクティブ",
            unpublished: "非アクティブ",
          }}
        />
      </TableCell>
      <TableCell className="text-right" onClick={stopRowClick}>
        <CategoryActionCell category={category} />
      </TableCell>
    </TableRow>
  );
}

export function CategoryTable({
  categories: initialCategories,
  sortable,
  startIndex,
}: CategoryTableProps) {
  const router = useRouter();
  const [categories, setCategories] = useState<EventCategoryWithStats[]>(() => [
    ...initialCategories,
  ]);

  // React 19: props 変化を render 中に state へ同期
  const [previousInitial, setPreviousInitial] = useState(initialCategories);
  if (initialCategories !== previousInitial) {
    setPreviousInitial(initialCategories);
    setCategories([...initialCategories]);
  }

  const [isPending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !sortable || isPending) return;

    const oldIndex = categories.findIndex((c) => c.id === active.id);
    const newIndex = categories.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(categories, oldIndex, newIndex);
    setCategories(reordered);

    startTransition(async () => {
      const items = reordered.map((category, index) => ({
        id: category.id,
        sortOrder: startIndex + index,
      }));
      const result = await updateEventCategoryOrder(items);
      if (isMutationError(result)) {
        toast.error(result.error);
        setCategories([...initialCategories]);
        return;
      }
      toast.success("カテゴリーの並び順を更新しました");
      router.refresh();
    });
  };

  if (categories.length === 0) {
    return <EmptyState message="カテゴリーがありません" />;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {sortable
          ? "ドラッグ&ドロップで並び替えできます"
          : "並び替えは検索・絞り込みを解除すると有効になります"}
      </p>
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <DndContext
            id="event-category-sortable"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={categories.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="hidden w-12 md:table-cell" />
                    <TableHead>カテゴリー名</TableHead>
                    <TableHead className="hidden lg:table-cell">説明</TableHead>
                    <TableHead className="hidden w-24 lg:table-cell">
                      アイコン
                    </TableHead>
                    <TableHead className="hidden w-24 lg:table-cell">
                      色
                    </TableHead>
                    <TableHead className="hidden w-24 text-right md:table-cell">
                      イベント数
                    </TableHead>
                    <TableHead className="w-28">状態</TableHead>
                    <TableHead className="w-32 text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((category) => (
                    <SortableRow
                      key={category.id}
                      category={category}
                      sortable={sortable}
                      isPending={isPending}
                    />
                  ))}
                </TableBody>
              </Table>
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `CreateCategoryDialog.tsx`**

```typescript
"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconPlus } from "@tabler/icons-react";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  SubmitButton,
} from "@/admin/components/ui";
import { createEventCategory } from "@/admin/actions/event-category";
import { CategoryForm } from "./CategoryForm";

const FORM_ID = "event-category-create-form";

export function CreateCategoryDialog() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [lastResult, formAction, isPending] = useActionState(
    createEventCategory,
    undefined,
  );

  // success を render 中 derive + close を render 中 sync で表現
  // (set-state-in-effect 違反回避、公式「Adjusting State During Render」パターン)
  const [previousLastResult, setPreviousLastResult] = useState(lastResult);
  if (lastResult !== previousLastResult) {
    setPreviousLastResult(lastResult);
    if (lastResult && lastResult.initialValue === null) {
      setIsOpen(false);
    }
  }

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("作成しました");
      router.refresh();
    }
  }, [lastResult, router]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>
          <IconPlus className="mr-2 h-4 w-4" />
          カテゴリ追加
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>カテゴリー作成</DialogTitle>
        </DialogHeader>
        <CategoryForm
          isPending={isPending}
          lastResult={lastResult}
          formAction={formAction}
          formId={FORM_ID}
        />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsOpen(false)}
            disabled={isPending}
          >
            キャンセル
          </Button>
          <SubmitButton
            isPending={isPending}
            label="作成"
            pendingLabel="作成中..."
            form={FORM_ID}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: `CategoryActionCell.tsx`**

```typescript
"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "@/admin/components/ActionDropdown";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SubmitButton,
} from "@/admin/components/ui";
import {
  updateEventCategory,
  deleteEventCategory,
} from "@/admin/actions/event-category";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { EventCategoryWithStats } from "@/shared/lib/validations/event-category";
import { CategoryForm } from "./CategoryForm";

type CategoryActionCellProps = {
  category: EventCategoryWithStats;
};

export function CategoryActionCell({ category }: CategoryActionCellProps) {
  const router = useRouter();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeletePending, startDeleteTransition] = useTransition();

  const boundUpdate = updateEventCategory.bind(null, category.id);
  const [lastResult, formAction, isEditPending] = useActionState(
    boundUpdate,
    undefined,
  );

  const formId = `event-category-edit-form-${category.id}`;
  const hasEvents = category._count.events > 0;

  // success を render 中 derive + close を render 中 sync で表現
  // (set-state-in-effect 違反回避、公式「Adjusting State During Render」パターン)
  const [previousLastResult, setPreviousLastResult] = useState(lastResult);
  if (lastResult !== previousLastResult) {
    setPreviousLastResult(lastResult);
    if (lastResult && lastResult.initialValue === null) {
      setIsEditOpen(false);
    }
  }

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("保存しました");
      router.refresh();
    }
  }, [lastResult, router]);

  const handleDelete = () => {
    startDeleteTransition(async () => {
      const result = await deleteEventCategory(category.id);
      if (!isMutationError(result)) {
        toast.success("削除しました");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <>
      <ActionDropdown>
        <ActionDropdownItem onClick={() => setIsEditOpen(true)}>
          編集
        </ActionDropdownItem>
        <ActionDropdownSeparator />
        <ActionDropdownItem
          destructive
          disabled={hasEvents}
          onClick={() => setIsDeleteOpen(true)}
        >
          {hasEvents
            ? `削除 (${category._count.events}件のイベントあり)`
            : "削除"}
        </ActionDropdownItem>
      </ActionDropdown>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>カテゴリー編集</DialogTitle>
          </DialogHeader>
          <CategoryForm
            category={category}
            isPending={isEditPending}
            lastResult={lastResult}
            formAction={formAction}
            formId={formId}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditOpen(false)}
              disabled={isEditPending}
            >
              キャンセル
            </Button>
            <SubmitButton
              form={formId}
              isPending={isEditPending}
              label="更新"
              pendingLabel="更新中..."
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        itemName={category.name}
        onConfirm={handleDelete}
        isPending={isDeletePending}
      />
    </>
  );
}
```

- [ ] **Step 6: Type-check**

Run: `bun run type-check`
Expected: Exit code 0.

- [ ] **Step 7: Admin design-token gate**

Run: `bun scripts/run-tests.ts __tests__/unit/architecture/admin-design-tokens.test.ts`
Expected: PASS (no raw Tailwind palette classes introduced).

- [ ] **Step 8: Commit**

```bash
git add "src/app/(admin)/admin/(dashboard)/event-categories"
git commit -m "feat(events): add EventCategory admin UI components"
```

---

### Task 10: Dedicated `/admin/events/categories` route + header link

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/events/categories/page.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/events/page.tsx`

**Interfaces:**

- Consumes: `CategoryFilters`, `CategoryTable`, `CreateCategoryDialog` from Task 9, `getEventCategories` from Task 8, `loadAdminEventCategorySearchParams` from Task 7.
- Produces: `/admin/events/categories` page; a "カテゴリー管理" link on `/admin/events`.

- [ ] **Step 1: Write the new route**

Create `src/app/(admin)/admin/(dashboard)/events/categories/page.tsx`:

```typescript
import { Suspense } from "react";
import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import type { Metadata } from "next";
import type { SearchParams } from "nuqs/server";
import { connection } from "next/server";
import { getEventCategories } from "@/admin/queries/event-category";
import { loadAdminEventCategorySearchParams } from "@/shared/lib/nuqs";
import { omitUndefined } from "@/shared/lib/serialize";
import { Button, Pagination } from "@/admin/components/ui";
import { LoadingState } from "@/admin/components/LoadingState";
import { CategoryFilters } from "../../event-categories/_components/CategoryFilters";
import { CategoryTable } from "../../event-categories/_components/CategoryTable";
import { CreateCategoryDialog } from "../../event-categories/_components/CreateCategoryDialog";

export const metadata: Metadata = {
  title: "イベントカテゴリー管理 | Myrrh Rental Space",
};

// カテゴリーは taxonomy 的な小規模データのため、D&D 並び替え中は全件を
// 1 ページで取得する（space-categories/spaces/_components/CategoryTabContent.tsx
// の SORTABLE_VIEW_LIMIT と同じ理由: sortOrder はページをまたぐ全体の連番）。
const SORTABLE_VIEW_LIMIT = 1000;

type PageProps = {
  searchParams: Promise<SearchParams>;
};

async function CategoryList({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await connection();
  const params = await loadAdminEventCategorySearchParams(searchParams);
  const sortable = !params.search && params.includeInactive;

  const result = await getEventCategories(
    omitUndefined({
      includeInactive: params.includeInactive,
      search: params.search || undefined,
      page: sortable ? 1 : params.page,
      limit: sortable ? SORTABLE_VIEW_LIMIT : params.perPage,
    }),
  );

  const startIndex = (result.page - 1) * params.perPage;

  return (
    <>
      <CategoryTable
        categories={result.categories}
        sortable={sortable}
        startIndex={startIndex}
      />
      {!sortable && (
        <Pagination
          currentPage={result.page}
          totalPages={result.totalPages}
          total={result.total}
          perPage={params.perPage}
        />
      )}
    </>
  );
}

export default async function EventCategoriesPage({
  searchParams,
}: PageProps) {
  await connection();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
            <Link href="/admin/events">
              <IconArrowLeft className="mr-1 h-4 w-4" />
              イベント管理に戻る
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            イベントカテゴリー管理
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            イベントの種類・カテゴリーを管理します
          </p>
        </div>
        <CreateCategoryDialog />
      </div>

      <div className="space-y-4">
        <Suspense fallback={<LoadingState variant="inline" />}>
          <CategoryFilters />
        </Suspense>
        <Suspense fallback={<LoadingState />}>
          <CategoryList searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add a header link from `/admin/events`**

In `src/app/(admin)/admin/(dashboard)/events/page.tsx`, add a "カテゴリー管理" button next to the existing "全参加者CSV"/"新規作成" buttons in the header `<div className="flex gap-2">`:

```tsx
<Button asChild size="sm" variant="outline">
  <Link href="/admin/events/categories">カテゴリー管理</Link>
</Button>
```

(Insert it as the first button in that `flex gap-2` group, before the existing "全参加者CSV" button.)

- [ ] **Step 3: Type-check**

Run: `bun run type-check`
Expected: Exit code 0.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(admin)/admin/(dashboard)/events/categories" "src/app/(admin)/admin/(dashboard)/events/page.tsx"
git commit -m "feat(events): add dedicated admin route for event category management"
```

---

### Task 11: Required `categoryId` in the Event create/edit form

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/events/_components/event-form-schema.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/events/_components/EventBasicFields.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/events/_components/EventForm.tsx`

**Interfaces:**

- Consumes: `getActiveEventCategories`-shaped category list (`{id, name}[]`) via a new `categories` prop.
- Produces: `EventFormData.categoryId: string` (required uuid); `EventFormProps` gains `categories: CategoryOption[]`.

- [ ] **Step 1: Add `categoryId` to `event-form-schema.ts`**

In `eventFormBaseSchema` (in `event-form-schema.ts`), add immediately after the `slug` field definition:

```typescript
  categoryId: z
    .string()
    .min(1, { error: "カテゴリーを選択してください" })
    .pipe(z.uuid({ error: "カテゴリーIDが無効です" })),
```

- [ ] **Step 2: Add the category `<Select>` to `EventBasicFields.tsx`**

Replace the full contents of `EventBasicFields.tsx` with:

```typescript
"use client";

import type { ReactElement } from "react";
import { getInputProps } from "@conform-to/react";
import {
  Input,
  Label,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import type { EventFormFields } from "./event-form-fields-types";

type CategoryOption = { id: string; name: string };

type EventBasicFieldsProps = {
  fields: EventFormFields;
  isPending: boolean;
  categories: CategoryOption[];
  categoryId: string;
  onCategoryChange: (categoryId: string) => void;
};

export function EventBasicFields({
  fields,
  isPending,
  categories,
  categoryId,
  onCategoryChange,
}: EventBasicFieldsProps): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>基本情報</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor={fields.title.id}>タイトル</Label>
          <Input
            {...getInputProps(fields.title, { type: "text" })}
            disabled={isPending}
          />
          {fields.title.errors && (
            <p
              id={fields.title.errorId}
              className="mt-1 text-sm text-destructive"
            >
              {fields.title.errors.join(", ")}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor={fields.slug.id}>スラッグ</Label>
          <Input
            {...getInputProps(fields.slug, { type: "text" })}
            disabled={isPending}
          />
          {fields.slug.errors && (
            <p
              id={fields.slug.errorId}
              className="mt-1 text-sm text-destructive"
            >
              {fields.slug.errors.join(", ")}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="event-categoryId">カテゴリー</Label>
          {categories.length === 0 ? (
            <p className="text-sm text-destructive">
              カテゴリーが登録されていません。イベント管理の「カテゴリー管理」から先にカテゴリーを作成してください。
            </p>
          ) : (
            <Select
              {...(categoryId !== "" ? { value: categoryId } : {})}
              onValueChange={onCategoryChange}
              disabled={isPending}
            >
              <SelectTrigger
                id="event-categoryId"
                aria-invalid={fields.categoryId.errors ? true : undefined}
                aria-describedby={
                  fields.categoryId.errors
                    ? fields.categoryId.errorId
                    : undefined
                }
              >
                <SelectValue placeholder="カテゴリーを選択" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {fields.categoryId.errors && (
            <p
              id={fields.categoryId.errorId}
              className="mt-1 text-sm text-destructive"
            >
              {fields.categoryId.errors.join(", ")}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Wire `categoryId` state through `EventForm.tsx`**

In `EventForm.tsx`, make these changes:

a) Add a `categories` prop to `EventFormProps`:

```typescript
type EventFormProps = {
  event?: EventData;
  locations: LocationOption[];
  spaces: SpaceOption[];
  categories: { id: string; name: string }[];
};
```

and destructure it in the function signature:

```typescript
export function EventForm({
  event,
  locations,
  spaces,
  categories,
}: EventFormProps): ReactElement {
```

b) Add controlled state next to the existing `locationId`/`spaceId` state:

```typescript
const [categoryId, setCategoryId] = useState<string>(event?.categoryId ?? "");
```

c) Add a hidden input next to the existing `locationId`/`spaceId` hidden inputs:

```typescript
      <input
        type="hidden"
        name={fields.categoryId.name}
        value={categoryId}
      />
```

d) Add `categoryId` to both branches of the `useForm`'s `defaultValue`:

In the `event ? {...}` branch, add `categoryId: event.categoryId,` (place it after `slug: event.slug,`).
In the `: {...}` (create) branch, add `categoryId: "",` (place it after `slug: "",`).

e) Add `fields.categoryId` to the `basic` tab's error count array:

```typescript
    basic: [
      fields.title,
      fields.slug,
      fields.categoryId,
      fields.scheduleMode,
      fields.slots,
    ].filter((f) => fieldHasErrors(f.errors)).length,
```

f) Pass the new props to `<EventBasicFields>`:

```tsx
<EventBasicFields
  fields={fields}
  isPending={isPending}
  categories={categories}
  categoryId={categoryId}
  onCategoryChange={setCategoryId}
/>
```

- [ ] **Step 4: Type-check**

Run: `bun run type-check`
Expected: This will fail until Task 12 updates `admin-queries.ts`/`new/page.tsx`/`edit/page.tsx` to supply `event.categoryId` and the `categories` prop — proceed directly to Task 12 before running this check standalone.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(admin)/admin/(dashboard)/events/_components/event-form-schema.ts" "src/app/(admin)/admin/(dashboard)/events/_components/EventBasicFields.tsx" "src/app/(admin)/admin/(dashboard)/events/_components/EventForm.tsx"
git commit -m "feat(events): add required categoryId field to EventForm"
```

---

### Task 12: Wire `categoryId` through domain layer, admin queries, and edit/create pages

**Files:**

- Modify: `src/shared/domain/events/admin-queries.ts`
- Modify: `src/shared/domain/events/commands.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/queries/event.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/events/new/page.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/events/[id]/edit/page.tsx`

**Interfaces:**

- Consumes: `getActiveEventCategories` is _not_ reused here — a dedicated `getCategoriesForEvent()` (all active categories, `{id, name}` shape) is added instead, matching the existing `getLocationsForEvent`/`getSpacesForEvent` sibling pattern.
- Produces: `getCategoriesForEvent(): Promise<{id: string, name: string}[]>`; `EventCommandInput.categoryId: string`; `EventForm` on both pages receives a real `categories` prop and `event.categoryId`.

- [ ] **Step 1: Add `categoryId` to selects and a new query in `admin-queries.ts`**

In `src/shared/domain/events/admin-queries.ts`:

a) Add `categoryId: true` to `eventListSelect` (near the existing `location`/`space` select entries).
b) `eventDetailSelect` already spreads `...eventListSelect`, so it inherits `categoryId` automatically — no separate edit needed there.
c) Add a new function near `getLocationsForEvent`/`getSpacesForEvent`:

```typescript
export async function getCategoriesForEvent() {
  return prisma.eventCategory.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { sortOrder: "asc" },
  });
}
```

- [ ] **Step 2: Add `categoryId` to `EventCommandInput` and the create/update data blocks**

In `src/shared/domain/events/commands.ts`:

a) Add to the `EventCommandInput` interface (as a required field, unlike the optional `locationId?`/`spaceId?`):

```typescript
categoryId: string;
```

b) In `createEventCommand`'s `tx.event.create` data block, add (near the existing `locationId: data.locationId ?? null,` line):

```typescript
      categoryId: data.categoryId,
```

c) In `updateEventCommand`'s `tx.event.update` data block, add the same line.

- [ ] **Step 3: Re-export `getCategoriesForEvent` through the admin RBAC wrapper**

In `src/app/(admin)/admin/(dashboard)/_shared/queries/event.ts`, add:

```typescript
export async function getCategoriesForEvent() {
  await requireAdminPermission("event", "read");
  return getCategoriesForEventQuery();
}
```

(importing `getCategoriesForEvent as getCategoriesForEventQuery` from `@/shared/domain/events/admin-queries`, added to the existing import statement alongside `getLocationsForEvent`/`getSpacesForEvent`.)

- [ ] **Step 4: Wire the `new` page**

In `src/app/(admin)/admin/(dashboard)/events/new/page.tsx`, change:

```typescript
const [locations, spaces] = await Promise.all([
  getLocationsForEvent(),
  getSpacesForEvent(),
]);
```

to:

```typescript
const [locations, spaces, categories] = await Promise.all([
  getLocationsForEvent(),
  getSpacesForEvent(),
  getCategoriesForEvent(),
]);
```

and pass `categories={categories}` to `<EventForm locations={locations} spaces={spaces} categories={categories} />`. Add `getCategoriesForEvent` to the import from `@/admin/queries/event` (or wherever `getLocationsForEvent`/`getSpacesForEvent` are imported from on this page).

- [ ] **Step 5: Wire the `edit` page**

Apply the identical change to `src/app/(admin)/admin/(dashboard)/events/[id]/edit/page.tsx`.

- [ ] **Step 6: Type-check**

Run: `bun run type-check`
Expected: Exit code 0.

- [ ] **Step 7: Run the events admin test suite**

Run: `bun scripts/run-tests.ts __tests__/unit/domain/events` and `bun scripts/run-tests.ts __tests__/integration/domain/events`
Expected: Both exit 0. If any existing test constructs an `Event` fixture without `categoryId`, it will now fail type-check or fail at runtime with a Prisma required-field error — fix each failing fixture by adding a valid `categoryId` (create or reuse a seeded/test `EventCategory` row first).

- [ ] **Step 8: Commit**

```bash
git add src/shared/domain/events/admin-queries.ts src/shared/domain/events/commands.ts "src/app/(admin)/admin/(dashboard)/_shared/queries/event.ts" "src/app/(admin)/admin/(dashboard)/events/new/page.tsx" "src/app/(admin)/admin/(dashboard)/events/[id]/edit/page.tsx"
git commit -m "feat(events): wire categoryId through domain commands, admin queries, and event form pages"
```

---

### Task 13: Seed data and E2E fixtures

**Files:**

- Modify: `prisma/seed.ts`
- Modify: `e2e/fixtures/test-data.ts`

**Interfaces:**

- Produces: `seedEventCategories()` function; `eventSeedSource` entries each carry a valid `categoryId`; `e2e/fixtures/test-data.ts` exposes `eventCategoryFixtures`.

- [ ] **Step 1: Add `seedEventCategories()`**

In `prisma/seed.ts`, add a new function near `seedSpaceCategories()` (same file, same idempotent `findFirst({isActive:true}) → update or create-with-computed-sortOrder` pattern — do **not** use `upsert({where:{name}})`, since `name` is only partially unique):

```typescript
async function seedEventCategories() {
  const categories = [
    { name: "ワークショップ", sortOrder: 0 },
    { name: "マルシェ・展示", sortOrder: 1 },
    { name: "セミナー・交流会", sortOrder: 2 },
    { name: "その他", sortOrder: 3 },
  ];

  for (const cat of categories) {
    const existing = await prisma.eventCategory.findFirst({
      where: { name: cat.name, isActive: true },
    });
    if (existing) {
      await prisma.eventCategory.update({
        where: { id: existing.id },
        data: cat,
      });
    } else {
      const maxOrder = await prisma.eventCategory.aggregate({
        _max: { sortOrder: true },
      });
      await prisma.eventCategory.create({
        data: { ...cat, sortOrder: (maxOrder._max.sortOrder ?? -1) + 1 },
      });
    }
  }

  console.log("✅ Upserted event categories");
}
```

- [ ] **Step 2: Call it before `seedEvents()`, and look up category ids**

Find where `seedEvents()` (the function containing `eventSeedSource`) is invoked in the main seed flow (near the existing `await seedSpaceCategories();` calls at lines ~5023/~5094) and add `await seedEventCategories();` immediately before each `seedEvents()`-equivalent call (search for the function name that contains `eventSeedSource` if it differs from `seedEvents`).

Inside that function, immediately before the `eventSeedSource` array declaration, add:

```typescript
const eventCategories = await prisma.eventCategory.findMany({
  orderBy: { sortOrder: "asc" },
});
const workshopCategoryId = eventCategories.find(
  (c) => c.name === "ワークショップ",
)!.id;
const marketCategoryId = eventCategories.find(
  (c) => c.name === "マルシェ・展示",
)!.id;
const seminarCategoryId = eventCategories.find(
  (c) => c.name === "セミナー・交流会",
)!.id;
const otherCategoryId = eventCategories.find((c) => c.name === "その他")!.id;
```

(Non-null assertion is acceptable here only because `seedEventCategories()` is guaranteed to run first in the same seed invocation and creates exactly these four names — this file is a dev/seed script, not `src/`, and is outside the grep-gated `!` ban which applies to `src/`.)

- [ ] **Step 3: Add `categoryId` to the type and each of the 6 entries**

Add `categoryId: string;` to the `eventSeedSource` array's inline type (after `locationId?: string | null;`), then add a `categoryId: <...>` line to each of the 6 entries, picking a category that fits the event's theme:

- `"yoga-mindfulness-workshop"` → `categoryId: workshopCategoryId,`
- `"photography-workshop"` → `categoryId: workshopCategoryId,`
- `"business-networking"` → `categoryId: seminarCategoryId,`
- `"kids-art-school"` → `categoryId: workshopCategoryId,`
- `"spring-calligraphy-archived"` → `categoryId: workshopCategoryId,`
- `"waitlist-test"` → `categoryId: workshopCategoryId,`

(`marketCategoryId`/`otherCategoryId` are seeded for admin-UI variety even though no current fixture event uses them yet.)

- [ ] **Step 4: Add E2E fixtures**

In `e2e/fixtures/test-data.ts`, add near `eventFixtures`:

```typescript
export const eventCategoryFixtures = {
  workshopName: "ワークショップ",
  marketName: "マルシェ・展示",
} as const;
```

- [ ] **Step 5: Re-run the dev seed**

Run: `bun run db:generate && bun scripts/run-tests.ts __tests__/integration/domain/event-categories/commands.test.ts` (re-confirm the integration suite still passes after schema/seed changes), then manually verify seeding works: `bun prisma/seed.ts` (or the project's documented seed invocation script) and confirm no errors.

- [ ] **Step 6: Commit**

```bash
git add prisma/seed.ts e2e/fixtures/test-data.ts
git commit -m "feat(events): seed EventCategory rows and assign categoryId to seeded events"
```

---

### Task 14: Full verification gate

**Files:** None (verification only).

- [ ] **Step 1: Type-check and lint**

Run: `bun run validate`
Expected: Exit code 0.

- [ ] **Step 2: Unit tests**

Run: `bun run test:unit`
Expected: Exit code 0, including `__tests__/unit/lib/validations/event-category.test.ts` and `__tests__/unit/architecture-boundaries.test.ts`.

- [ ] **Step 3: Integration tests**

Run: `bun run test:integration`
Expected: Exit code 0, including `__tests__/integration/domain/event-categories/commands.test.ts` and the existing `__tests__/integration/domain/events/*` suite (now exercising the required `categoryId`).

- [ ] **Step 4: Production build**

Run: `bun run build`
Expected: Exit code 0. Confirm the route table includes `/admin/events/categories`.

- [ ] **Step 5: Manual smoke check**

Run `bun run dev` (user-managed per project convention — do not start/stop it yourself), then manually verify in a browser: `/admin/events/categories` loads, category create/edit/delete/reorder work, and `/admin/events/new` requires selecting a category before submit succeeds.

- [ ] **Step 6: Final commit (if any fixups were needed)**

```bash
git add -A
git commit -m "chore(events): fix up EventCategory integration after full verification"
```

(Skip this commit if Steps 1-4 passed with no changes needed.)

---

## Notes for the next plan

This plan intentionally stops at the admin/data-model boundary. The public-facing `/events` findability work (searchParams-driven tabs/search/category filter, `EVENT_CALENDAR` section rework, `getPublishedEventsPaginated`, removing the month-nav UI and `showPastEvents` config) is a separate, dependent plan — write it only after this one is merged and deployed, since it consumes the `EventCategory` data this plan creates. See `docs/superpowers/specs/2026-07-23-event-findability-category-design.md` §5-7 for that scope.
