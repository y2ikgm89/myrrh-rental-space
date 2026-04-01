# イベントカレンダー Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Event モデル + 管理画面 CRUD + 公開カレンダーページ + 詳細ページ（告知のみ、申込機能は Phase 2）を実装する。

**Architecture:** Prisma Event モデルを追加し、管理画面で CRUD（executeAdminMutationResult パターン）、公開ページで @fullcalendar/react による月/週/リスト表示 + 詳細ページを提供する。既存の Page-First Architecture・キャッシュ戦略・RBAC・Design System と完全に整合する。

**Tech Stack:** Next.js 16 (PPR + 'use cache'), Prisma 7, Zod 4, @fullcalendar/react 6, nuqs, Tailwind CSS 4, Tabler Icons

---

## File Structure

### 新規作成ファイル

```
prisma/
  migrations/YYYYMMDD_add_event_model/migration.sql  (自動生成)

src/shared/
  domain/events/
    commands.ts                    — createEventCommand, updateEventCommand, deleteEventCommand, publishEventCommand, cancelEventCommand
    admin-queries.ts               — getEvents, getEventById (管理画面用)
    public-queries.ts              — getPublishedEvents, getPublishedEventBySlug ('use cache')
  lib/validations/
    event.ts                       — eventFormSchema, updateEventSchema (Zod 4)

src/app/(admin)/admin/(dashboard)/events/
  page.tsx                         — リスト
  loading.tsx                      — ResourceLoading
  error.tsx                        — ResourceError
  new/
    page.tsx                       — 新規作成
    loading.tsx
    error.tsx
  [id]/
    page.tsx                       — 詳細
    loading.tsx
    error.tsx
    edit/
      page.tsx                     — 編集
      loading.tsx
      error.tsx
  _components/
    EventFilters.tsx               — nuqs フィルター
    EventTable.tsx                 — テーブル + SortableColumnHeader
    EventActionCell.tsx            — ActionDropdown
    EventForm.tsx                  — 作成/編集フォーム
    EventStatusBadge.tsx           — ステータスバッジ

src/app/(admin)/admin/(dashboard)/_shared/actions/
  event.ts                         — Server Actions (CRUD)

src/app/(public)/events/
  page.tsx                         — カレンダーページ
  loading.tsx
  [slug]/
    page.tsx                       — 詳細ページ
    loading.tsx

src/app/(public)/_shared/components/
  event-calendar/
    EventCalendar.tsx              — 'use client' FullCalendar ラッパー
    EventModal.tsx                 — 'use client' イベント概要モーダル
    CalendarSkeleton.tsx           — Suspense fallback

__tests__/unit/lib/validations/
  event.test.ts                    — Zod スキーマテスト

__tests__/integration/actions/admin/
  event.test.ts                    — Server Action テスト
```

### 変更するファイル

```
prisma/schema.prisma               — Event enum + Event モデル + Space/Customer リレーション追加
prisma/seed.ts                     — サンプルイベントデータ追加
src/shared/lib/constants/cache.ts  — EVENTS, EVENT_REGISTRATIONS タグ追加
src/shared/lib/nuqs/parsers.ts     — adminEventSearchParamsParsers 追加
src/app/(admin)/.../_shared/lib/permissions.ts — Resource に "event" 追加, ROLE_PERMISSIONS 更新
src/app/(admin)/.../_shared/components/sidebar/sidebar-items.tsx — イベントメニュー追加
```

---

## Task 1: Prisma スキーマ + マイグレーション

**Files:**

- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Event enum と Event モデルを追加**

`prisma/schema.prisma` に以下を追加:

```prisma
enum EventStatus {
  DRAFT
  PUBLISHED
  CANCELLED
  ARCHIVED
}

model Event {
  id                    String      @id @default(cuid()) @db.VarChar(21)
  title                 String      @db.VarChar(200)
  slug                  String      @unique @db.VarChar(100)
  description           String?     @db.Text
  contentJson           Json?
  thumbnailUrl          String?
  startTime             DateTime
  endTime               DateTime
  capacity              Int?
  price                 Int?
  location              String?     @db.VarChar(200)
  spaceId               String?     @db.VarChar(21)
  status                EventStatus @default(DRAFT)
  registrationOpen      Boolean     @default(true)
  googleCalendarEventId String?     @unique
  publishedAt           DateTime?
  deletedAt             DateTime?
  createdAt             DateTime    @default(now())
  updatedAt             DateTime    @updatedAt

  space         Space?  @relation(fields: [spaceId], references: [id], onDelete: SetNull)

  @@index([startTime, endTime])
  @@index([status])
  @@index([spaceId])
  @@index([deletedAt])
  @@map("events")
}
```

Space モデルに `events Event[]` リレーション追加。

- [ ] **Step 2: マイグレーション実行**

Run: `bunx --bun prisma migrate dev --name add-event-model`

- [ ] **Step 3: 型確認**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(prisma): add Event model with EventStatus enum"
```

---

## Task 2: キャッシュタグ + RBAC + nuqs パーサー

**Files:**

- Modify: `src/shared/lib/constants/cache.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/lib/permissions.ts`
- Modify: `src/shared/lib/nuqs/parsers.ts`

- [ ] **Step 1: CACHE_TAGS と getCacheTag にイベント用エントリ追加**

`src/shared/lib/constants/cache.ts`:

CACHE_TAGS に追加:

```typescript
/** イベント */
EVENTS: "events",
/** イベント参加登録 */
EVENT_REGISTRATIONS: "event-registrations",
```

getCacheTag に追加:

```typescript
events: {
  list: () => CACHE_TAGS.EVENTS,
  detail: (id: string) => `${CACHE_TAGS.EVENTS}-${id}`,
  slug: (slug: string) => `${CACHE_TAGS.EVENTS}-slug-${slug}`,
},
eventRegistrations: {
  list: (eventId: string) => `${CACHE_TAGS.EVENT_REGISTRATIONS}-${eventId}`,
},
```

- [ ] **Step 2: permissions.ts に Resource "event" を追加**

`src/app/(admin)/admin/(dashboard)/_shared/lib/permissions.ts`:

Resource 型に `| "event"` を追加。

ROLE_PERMISSIONS の各ロールに追加:

```
SUPER_ADMIN: "event:create", "event:read", "event:update", "event:delete", "event:publish"
ADMIN:       "event:create", "event:read", "event:update", "event:delete", "event:publish"
EDITOR:      "event:read", "event:update"
VIEWER:      "event:read"
```

- [ ] **Step 3: nuqs パーサー追加**

`src/shared/lib/nuqs/parsers.ts` に追加:

```typescript
// ============================================================
// 管理画面: イベント
// ============================================================

const eventSortByValues = ["startTime", "createdAt", "title"] as const;

export const adminEventSearchParamsParsers = {
  search: parseAsQuery,
  status: parseAsString.withDefault(""),
  page: parseAsPage,
  perPage: parseAsPerPage,
  sortBy: parseAsStringLiteral(eventSortByValues).withDefault("startTime"),
  sortOrder: parseAsSortOrder,
  dateFrom: parseAsString.withDefault(""),
  dateTo: parseAsString.withDefault(""),
};

const adminEventSearchParamsCache = createSearchParamsCache(
  adminEventSearchParamsParsers,
);

/** 管理画面イベント検索パラメータローダー */
export async function loadAdminEventSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminEventSearchParamsCache.parse(searchParams);
  return adminEventSearchParamsCache.all();
}
```

- [ ] **Step 4: 型確認**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/shared/lib/constants/cache.ts src/shared/lib/nuqs/parsers.ts
git add 'src/app/(admin)/admin/(dashboard)/_shared/lib/permissions.ts'
git commit -m "feat: add event cache tags, RBAC permissions, and nuqs parsers"
```

---

## Task 3: Zod バリデーションスキーマ + テスト

**Files:**

- Create: `src/shared/lib/validations/event.ts`
- Create: `__tests__/unit/lib/validations/event.test.ts`

- [ ] **Step 1: テストファイル作成**

`__tests__/unit/lib/validations/event.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import {
  eventFormSchema,
  updateEventSchema,
} from "@/shared/lib/validations/event";

describe("eventFormSchema", () => {
  const validInput = {
    title: "テストイベント",
    slug: "test-event",
    startTime: "2026-05-01T10:00:00.000Z",
    endTime: "2026-05-01T12:00:00.000Z",
    status: "DRAFT",
  };

  it("有効な入力を受け入れる", () => {
    const result = eventFormSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("タイトルが空の場合エラー", () => {
    const result = eventFormSchema.safeParse({ ...validInput, title: "" });
    expect(result.success).toBe(false);
  });

  it("終了時刻が開始時刻より前の場合エラー", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      startTime: "2026-05-01T12:00:00.000Z",
      endTime: "2026-05-01T10:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("定員が0以下の場合エラー", () => {
    const result = eventFormSchema.safeParse({ ...validInput, capacity: 0 });
    expect(result.success).toBe(false);
  });

  it("定員がnullの場合は無制限として受け入れる", () => {
    const result = eventFormSchema.safeParse({ ...validInput, capacity: null });
    expect(result.success).toBe(true);
  });

  it("無効なステータスを拒否する", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      status: "INVALID",
    });
    expect(result.success).toBe(false);
  });

  it("オプションフィールドを受け入れる", () => {
    const result = eventFormSchema.safeParse({
      ...validInput,
      description: "説明文",
      capacity: 30,
      price: 1000,
      location: "会議室A",
      spaceId: "space123",
      registrationOpen: true,
      thumbnailUrl: "https://example.com/image.jpg",
    });
    expect(result.success).toBe(true);
  });
});

describe("updateEventSchema", () => {
  it("idが必須", () => {
    const result = updateEventSchema.safeParse({ title: "更新" });
    expect(result.success).toBe(false);
  });

  it("有効な更新入力を受け入れる", () => {
    const result = updateEventSchema.safeParse({
      id: "test-id",
      title: "更新イベント",
      slug: "updated-event",
      startTime: "2026-05-01T10:00:00.000Z",
      endTime: "2026-05-01T12:00:00.000Z",
      status: "PUBLISHED",
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: テスト実行して失敗を確認**

Run: `bun test __tests__/unit/lib/validations/event.test.ts`
Expected: FAIL (モジュールが存在しない)

- [ ] **Step 3: Zod スキーマ実装**

`src/shared/lib/validations/event.ts`:

```typescript
import { z } from "zod";

const EVENT_STATUS_VALUES = [
  "DRAFT",
  "PUBLISHED",
  "CANCELLED",
  "ARCHIVED",
] as const;

export const eventFormSchema = z
  .object({
    title: z
      .string()
      .min(1, { error: "タイトルは必須です" })
      .max(200, { error: "タイトルは200文字以内です" }),
    slug: z
      .string()
      .min(1, { error: "スラッグは必須です" })
      .max(100, { error: "スラッグは100文字以内です" }),
    description: z.string().nullable().optional(),
    contentJson: z.unknown().nullable().optional(),
    thumbnailUrl: z.string().nullable().optional(),
    startTime: z.string().datetime({ error: "有効な日時を入力してください" }),
    endTime: z.string().datetime({ error: "有効な日時を入力してください" }),
    capacity: z
      .number()
      .int()
      .min(1, { error: "定員は1以上です" })
      .nullable()
      .optional(),
    price: z
      .number()
      .int()
      .min(0, { error: "料金は0以上です" })
      .nullable()
      .optional(),
    location: z.string().max(200).nullable().optional(),
    spaceId: z.string().nullable().optional(),
    status: z.enum(EVENT_STATUS_VALUES, { error: "無効なステータスです" }),
    registrationOpen: z.boolean().optional(),
  })
  .refine((data) => new Date(data.endTime) > new Date(data.startTime), {
    message: "終了時刻は開始時刻より後である必要があります",
    path: ["endTime"],
  });

export type EventFormInput = z.infer<typeof eventFormSchema>;

export const updateEventSchema = z
  .object({
    id: z.string().min(1, { error: "IDは必須です" }),
  })
  .and(eventFormSchema);

export type UpdateEventInput = z.infer<typeof updateEventSchema>;
```

- [ ] **Step 4: テスト実行して成功を確認**

Run: `bun test __tests__/unit/lib/validations/event.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/shared/lib/validations/event.ts __tests__/unit/lib/validations/event.test.ts
git commit -m "feat: add event Zod validation schemas with tests"
```

---

## Task 4: ドメインコマンド + クエリ

**Files:**

- Create: `src/shared/domain/events/commands.ts`
- Create: `src/shared/domain/events/admin-queries.ts`
- Create: `src/shared/domain/events/public-queries.ts`

- [ ] **Step 1: ドメインコマンド作成**

`src/shared/domain/events/commands.ts`:

```typescript
import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/lib/errors";
import { generateSlug } from "@/shared/lib/utils";
import type { EventFormInput } from "@/shared/lib/validations/event";

export async function createEventCommand(data: EventFormInput) {
  const slug = await ensureUniqueSlug(data.slug);

  const event = await prisma.event.create({
    data: {
      title: data.title,
      slug,
      description: data.description ?? null,
      contentJson: data.contentJson ?? null,
      thumbnailUrl: data.thumbnailUrl ?? null,
      startTime: new Date(data.startTime),
      endTime: new Date(data.endTime),
      capacity: data.capacity ?? null,
      price: data.price ?? null,
      location: data.location ?? null,
      spaceId: data.spaceId ?? null,
      status: data.status,
      registrationOpen: data.registrationOpen ?? true,
      publishedAt: data.status === "PUBLISHED" ? new Date() : null,
    },
    select: { id: true, slug: true },
  });

  return event;
}

export async function updateEventCommand(id: string, data: EventFormInput) {
  const existing = await prisma.event.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, slug: true, status: true },
  });
  if (!existing) throw new DomainError("イベントが見つかりません");

  const slug =
    data.slug !== existing.slug
      ? await ensureUniqueSlug(data.slug, id)
      : data.slug;

  const wasPublished =
    existing.status !== "PUBLISHED" && data.status === "PUBLISHED";

  await prisma.event.update({
    where: { id },
    data: {
      title: data.title,
      slug,
      description: data.description ?? null,
      contentJson: data.contentJson ?? null,
      thumbnailUrl: data.thumbnailUrl ?? null,
      startTime: new Date(data.startTime),
      endTime: new Date(data.endTime),
      capacity: data.capacity ?? null,
      price: data.price ?? null,
      location: data.location ?? null,
      spaceId: data.spaceId ?? null,
      status: data.status,
      registrationOpen: data.registrationOpen ?? true,
      publishedAt: wasPublished ? new Date() : undefined,
    },
  });
}

export async function deleteEventCommand(id: string) {
  const event = await prisma.event.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!event) throw new DomainError("イベントが見つかりません");

  await prisma.event.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function publishEventCommand(id: string) {
  const event = await prisma.event.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, title: true, status: true },
  });
  if (!event) throw new DomainError("イベントが見つかりません");
  if (!event.title) throw new DomainError("タイトルが必要です");

  await prisma.event.update({
    where: { id },
    data: { status: "PUBLISHED", publishedAt: new Date() },
  });
}

export async function cancelEventCommand(id: string) {
  const event = await prisma.event.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!event) throw new DomainError("イベントが見つかりません");

  await prisma.event.update({
    where: { id },
    data: { status: "CANCELLED" },
  });
}

async function ensureUniqueSlug(
  slug: string,
  excludeId?: string,
): Promise<string> {
  const existing = await prisma.event.findFirst({
    where: {
      slug,
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });

  if (!existing) return slug;

  const randomSuffix = crypto.randomUUID().slice(0, 8);
  return `${slug}-${randomSuffix}`;
}
```

- [ ] **Step 2: 管理画面用クエリ作成**

`src/shared/domain/events/admin-queries.ts`:

```typescript
import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { Prisma } from "@generated/prisma";

const eventListSelect = {
  id: true,
  title: true,
  slug: true,
  startTime: true,
  endTime: true,
  capacity: true,
  price: true,
  location: true,
  status: true,
  registrationOpen: true,
  publishedAt: true,
  deletedAt: true,
  createdAt: true,
  space: { select: { id: true, name: true } },
} satisfies Prisma.EventSelect;

const eventDetailSelect = {
  ...eventListSelect,
  description: true,
  contentJson: true,
  thumbnailUrl: true,
  spaceId: true,
  googleCalendarEventId: true,
  updatedAt: true,
} satisfies Prisma.EventSelect;

interface GetEventsOptions {
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  perPage?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export async function getEvents(options: GetEventsOptions = {}) {
  const {
    search = "",
    status = "",
    dateFrom = "",
    dateTo = "",
    page = 1,
    perPage = 10,
    sortBy = "startTime",
    sortOrder = "desc",
  } = options;

  const where: Prisma.EventWhereInput = {
    deletedAt: null,
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { location: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(status
      ? { status: status as Prisma.EnumEventStatusFilter["equals"] }
      : {}),
    ...(dateFrom ? { startTime: { gte: new Date(dateFrom) } } : {}),
    ...(dateTo ? { endTime: { lte: new Date(dateTo) } } : {}),
  };

  const orderBy: Prisma.EventOrderByWithRelationInput = {
    [sortBy]: sortOrder,
  };

  const [events, totalCount] = await Promise.all([
    prisma.event.findMany({
      where,
      select: eventListSelect,
      orderBy,
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.event.count({ where }),
  ]);

  return {
    events,
    total: totalCount,
    page,
    totalPages: Math.ceil(totalCount / perPage),
  };
}

export async function getEventById(id: string) {
  return prisma.event.findFirst({
    where: { id, deletedAt: null },
    select: eventDetailSelect,
  });
}

export async function getSpacesForEvent() {
  return prisma.space.findMany({
    where: { deletedAt: null, isPublished: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
```

- [ ] **Step 3: 公開ページ用クエリ作成**

`src/shared/domain/events/public-queries.ts`:

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
import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";

const publicEventSelect = {
  id: true,
  title: true,
  slug: true,
  description: true,
  thumbnailUrl: true,
  startTime: true,
  endTime: true,
  capacity: true,
  price: true,
  location: true,
  status: true,
  registrationOpen: true,
  space: { select: { id: true, name: true } },
};

const publicEventDetailSelect = {
  ...publicEventSelect,
  contentJson: true,
  publishedAt: true,
};

export async function getPublishedEvents() {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.EVENTS);

  const events = await safeFetch({
    fetch: () =>
      prisma.event.findMany({
        where: {
          status: "PUBLISHED",
          deletedAt: null,
        },
        select: publicEventSelect,
        orderBy: { startTime: "asc" },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublishedEvents",
  });

  return toPlainArray(events);
}

export async function getPublishedEventBySlug(slug: string) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.EVENTS, getCacheTag.events.slug(slug));

  const event = await safeFetch({
    fetch: () =>
      prisma.event.findFirst({
        where: {
          slug,
          status: "PUBLISHED",
          deletedAt: null,
        },
        select: publicEventDetailSelect,
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublishedEventBySlug",
  });

  if (!event) return null;
  return toPlainObject(event);
}
```

- [ ] **Step 4: 型確認**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/shared/domain/events/
git commit -m "feat: add event domain commands and queries"
```

---

## Task 5: 管理画面 Server Actions

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/actions/event.ts`

- [ ] **Step 1: Server Actions 作成**

`src/app/(admin)/admin/(dashboard)/_shared/actions/event.ts`:

```typescript
"use server";

import { updateTag } from "next/cache";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  eventFormSchema,
  updateEventSchema,
  type EventFormInput,
  type UpdateEventInput,
} from "@/shared/lib/validations/event";
import {
  createEventCommand,
  updateEventCommand,
  deleteEventCommand,
  publishEventCommand,
  cancelEventCommand,
} from "@/shared/domain/events/commands";

function invalidateEventCache(id?: string, slug?: string) {
  updateTag(CACHE_TAGS.EVENTS);
  if (id) updateTag(getCacheTag.events.detail(id));
  if (slug) updateTag(getCacheTag.events.slug(slug));
}

export async function createEvent(
  input: EventFormInput,
): Promise<MutationResult<{ id: string; slug: string }>> {
  const parsed = eventFormSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "event",
    action: "create",
    execute: async () => createEventCommand(parsed.data),
    afterSuccess: (data) => {
      invalidateEventCache(data.id, data.slug);
    },
    resolveAuditResourceId: (data) => data.id,
  });
}

export async function updateEvent(
  id: string,
  input: EventFormInput,
): Promise<MutationResult<null>> {
  const parsed = eventFormSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "event",
    action: "update",
    resourceId: id,
    execute: async () => {
      await updateEventCommand(id, parsed.data);
      return null;
    },
    afterSuccess: () => {
      invalidateEventCache(id, parsed.data.slug);
    },
  });
}

export async function deleteEvent(id: string): Promise<MutationResult<null>> {
  return executeAdminMutationResult({
    resource: "event",
    action: "delete",
    resourceId: id,
    execute: async () => {
      await deleteEventCommand(id);
      return null;
    },
    afterSuccess: () => {
      invalidateEventCache(id);
    },
  });
}

export async function publishEvent(id: string): Promise<MutationResult<null>> {
  return executeAdminMutationResult({
    resource: "event",
    action: "publish",
    resourceId: id,
    execute: async () => {
      await publishEventCommand(id);
      return null;
    },
    afterSuccess: () => {
      invalidateEventCache(id);
    },
  });
}

export async function cancelEvent(id: string): Promise<MutationResult<null>> {
  return executeAdminMutationResult({
    resource: "event",
    action: "update",
    resourceId: id,
    execute: async () => {
      await cancelEventCommand(id);
      return null;
    },
    afterSuccess: () => {
      invalidateEventCache(id);
    },
  });
}
```

- [ ] **Step 2: 型確認**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/_shared/actions/event.ts'
git commit -m "feat: add event admin server actions"
```

---

## Task 6: 管理画面コンポーネント

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/events/_components/EventStatusBadge.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/events/_components/EventFilters.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/events/_components/EventTable.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/events/_components/EventActionCell.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/events/_components/EventForm.tsx`

- [ ] **Step 1: EventStatusBadge 作成**

既存の ReservationStatusBadge パターンに従い、EventStatus ごとの Badge variant マッピングを作成する。

- [ ] **Step 2: EventFilters 作成**

`adminEventSearchParamsParsers` を使用した nuqs フィルター。検索・ステータス・日付範囲フィルター。既存の ReservationFilters パターンに従う。

- [ ] **Step 3: EventTable 作成**

`SortableColumnHeader` + `Table` で一覧表示。カラム: タイトル、開始日時、終了日時、場所、ステータス、操作。既存の PostTable / ReservationTable パターンに従う。

- [ ] **Step 4: EventActionCell 作成**

`ActionDropdown` で編集・公開・中止・削除アクション。既存の PostActionCell パターンに従う。

- [ ] **Step 5: EventForm 作成**

`'use client'` の RHF フォーム。タイトル、slug、説明、開始/終了日時、定員、料金、場所、スペース選択、ステータス、受付フラグ。日時は `input[type="datetime-local"]`。既存の PostForm パターン（Lexical エディタ含む）に従う。

- [ ] **Step 6: 型確認**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/events/_components/'
git commit -m "feat(admin): add event management components"
```

---

## Task 7: 管理画面ページ

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/events/page.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/events/loading.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/events/error.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/events/new/page.tsx` + loading.tsx + error.tsx
- Create: `src/app/(admin)/admin/(dashboard)/events/[id]/page.tsx` + loading.tsx + error.tsx
- Create: `src/app/(admin)/admin/(dashboard)/events/[id]/edit/page.tsx` + loading.tsx + error.tsx
- Modify: サイドバーナビゲーション

- [ ] **Step 1: リストページ作成**

`events/page.tsx`: Server Component。`loadAdminEventSearchParams` でパラメータ解析 → `getEvents` でデータ取得 → `EventTable` + `Pagination` 表示。ヘッダーに「新規イベント」ボタン。`Suspense` + `EventFilters`。既存の reservations/page.tsx パターンに従う。

- [ ] **Step 2: loading.tsx / error.tsx 作成**

全サブルートに共通パターンを適用:

```typescript
// loading.tsx
export { default } from "../_shared/components/ResourceLoading";

// error.tsx
("use client");
export { default } from "../_shared/components/ResourceError";
```

- [ ] **Step 3: 新規作成ページ作成**

`events/new/page.tsx`: `AdminDetailLayout` + `EventForm`。`getSpacesForEvent()` でスペース一覧取得。

- [ ] **Step 4: 詳細ページ作成**

`events/[id]/page.tsx`: `AdminDetailLayout` + `DetailSection`。`getEventById(id)` でデータ取得。`DetailDeleteButton` + 編集ボタン。`generateMetadata` でタイトル設定。

- [ ] **Step 5: 編集ページ作成**

`events/[id]/edit/page.tsx`: `AdminDetailLayout` + `EventForm`。`getEventById(id)` + `getSpacesForEvent()` でデータ取得。

- [ ] **Step 6: サイドバーにイベントメニュー追加**

`sidebar-items.tsx` に `{ label: "イベント", href: "/admin/events", icon: <IconCalendarEvent /> }` を追加。予約管理の下に配置。

- [ ] **Step 7: 型確認**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 8: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/events/'
git add 'src/app/(admin)/admin/(dashboard)/_shared/components/sidebar/'
git commit -m "feat(admin): add event CRUD pages with navigation"
```

---

## Task 8: FullCalendar パッケージインストール

**Files:**

- Modify: `package.json` / `bun.lock`

- [ ] **Step 1: パッケージインストール**

Run: `bun add @fullcalendar/core @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/list @fullcalendar/interaction`

- [ ] **Step 2: 型確認**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add package.json bun.lock
git commit -m "deps: add @fullcalendar packages for event calendar UI"
```

---

## Task 9: 公開カレンダーコンポーネント

**Files:**

- Create: `src/app/(public)/_shared/components/event-calendar/EventCalendar.tsx`
- Create: `src/app/(public)/_shared/components/event-calendar/EventModal.tsx`
- Create: `src/app/(public)/_shared/components/event-calendar/CalendarSkeleton.tsx`

- [ ] **Step 1: CalendarSkeleton 作成**

Server Component。カレンダーのプレースホルダー（Skeleton UI）。

- [ ] **Step 2: EventCalendar 作成**

`'use client'` コンポーネント。FullCalendar をラップし、月/週/リスト 3ビュー切替。イベントクリックで EventModal を表示。props として `events` 配列を受け取る。

```typescript
"use client";

import { useState, useCallback } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import { EventModal } from "./EventModal";

// FullCalendar のイベントデータ変換 + モーダル制御
```

- [ ] **Step 3: EventModal 作成**

`'use client'` コンポーネント。Design System の `Dialog` を使用。タイトル・日時・場所・説明を表示し、「詳細を見る」ボタンで `/events/[slug]` へ遷移。

- [ ] **Step 4: 型確認**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add 'src/app/(public)/_shared/components/event-calendar/'
git commit -m "feat(public): add EventCalendar, EventModal, CalendarSkeleton components"
```

---

## Task 10: 公開カレンダーページ

**Files:**

- Create: `src/app/(public)/events/page.tsx`
- Create: `src/app/(public)/events/loading.tsx`

- [ ] **Step 1: カレンダーページ作成**

`src/app/(public)/events/page.tsx`:

```typescript
import { Suspense } from "react";
import type { Metadata } from "next";
import { Container } from "@/public/_shared/components/design-system/container";
import { Heading } from "@/public/_shared/components/design-system/heading";
import { Stack } from "@/public/_shared/components/design-system/stack";
import { CalendarSkeleton } from "@/public/_shared/components/event-calendar/CalendarSkeleton";
import { EventCalendar } from "@/public/_shared/components/event-calendar/EventCalendar";
import { getPublishedEvents } from "@/shared/domain/events/public-queries";

export const metadata: Metadata = {
  title: "イベントカレンダー",
  description: "開催予定のイベント・ワークショップ情報",
};

async function EventCalendarLoader() {
  const events = await getPublishedEvents();
  return <EventCalendar events={events} />;
}

export default function EventsPage() {
  return (
    <main id="main-content">
      <Container>
        <Stack gap="lg">
          <Heading level={1}>イベントカレンダー</Heading>
          <Suspense fallback={<CalendarSkeleton />}>
            <EventCalendarLoader />
          </Suspense>
        </Stack>
      </Container>
    </main>
  );
}
```

- [ ] **Step 2: loading.tsx 作成**

```typescript
import { CalendarSkeleton } from "@/public/_shared/components/event-calendar/CalendarSkeleton";
import { Container } from "@/public/_shared/components/design-system/container";

export default function EventsLoading() {
  return (
    <main>
      <Container>
        <CalendarSkeleton />
      </Container>
    </main>
  );
}
```

- [ ] **Step 3: 型確認**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add 'src/app/(public)/events/'
git commit -m "feat(public): add event calendar page with PPR + Suspense"
```

---

## Task 11: 公開イベント詳細ページ

**Files:**

- Create: `src/app/(public)/events/[slug]/page.tsx`
- Create: `src/app/(public)/events/[slug]/loading.tsx`

- [ ] **Step 1: 詳細ページ作成**

`src/app/(public)/events/[slug]/page.tsx`:

```typescript
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@/public/_shared/components/design-system/container";
import { Stack } from "@/public/_shared/components/design-system/stack";
import { Heading } from "@/public/_shared/components/design-system/heading";
import { Badge } from "@/public/_shared/components/design-system/badge";
import { Prose } from "@/public/_shared/components/design-system/prose";
import { getPublishedEventBySlug } from "@/shared/domain/events/public-queries";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const event = await getPublishedEventBySlug(slug);
  if (!event) return { title: "イベントが見つかりません" };
  return {
    title: event.title,
    description: event.description ?? undefined,
  };
}

export default async function EventDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const event = await getPublishedEventBySlug(slug);
  if (!event) notFound();

  const formattedDate = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  });

  return (
    <main id="main-content">
      <Container>
        <Stack gap="lg">
          <div>
            <Heading level={1}>{event.title}</Heading>
            <p className="mt-2 text-lg text-foreground/70">
              {formattedDate.format(new Date(event.startTime))} 〜{" "}
              {formattedDate.format(new Date(event.endTime))}
            </p>
          </div>

          {event.location && (
            <p className="text-foreground/70">場所: {event.location}</p>
          )}

          {event.space && (
            <p className="text-foreground/70">スペース: {event.space.name}</p>
          )}

          {event.capacity != null && (
            <Badge variant="info">定員: {event.capacity}名</Badge>
          )}

          {event.price != null && event.price > 0 && (
            <p className="text-lg font-semibold">
              参加費: {new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(event.price)}
            </p>
          )}

          {event.price === 0 && (
            <Badge variant="success">無料</Badge>
          )}

          {event.description && (
            <p className="text-foreground/80">{event.description}</p>
          )}

          {/* Phase 2 で申込フォームを追加 */}
          <div className="rounded-lg border border-border bg-surface p-6 text-center">
            <p className="text-foreground/60">
              申込機能は近日公開予定です
            </p>
          </div>
        </Stack>
      </Container>
    </main>
  );
}
```

- [ ] **Step 2: loading.tsx 作成**

- [ ] **Step 3: 型確認**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add 'src/app/(public)/events/'
git commit -m "feat(public): add event detail page"
```

---

## Task 12: seed データ + 全体検証

**Files:**

- Modify: `prisma/seed.ts`

- [ ] **Step 1: seed にサンプルイベントデータ追加**

`prisma/seed.ts` にサンプルイベント 3-5 件を追加（PUBLISHED 2件、DRAFT 1件、CANCELLED 1件）。各イベントは異なる日時・スペース・定員設定。

- [ ] **Step 2: seed 実行**

Run: `bun prisma/seed.ts`
Expected: エラーなし

- [ ] **Step 3: 全体検証**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 4: ビルド検証**

Run: `bun run build:skip-env`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add prisma/seed.ts
git commit -m "feat: add sample event seed data"
```

---

## Task 13: テスト追加

**Files:**

- Modify: `package.json` (test script にバッチ追加)

- [ ] **Step 1: テスト実行**

Run: `bun test __tests__/unit/lib/validations/event.test.ts`
Expected: PASS

- [ ] **Step 2: package.json の test スクリプトに event バッチ追加**

既存の test スクリプトに `bun test __tests__/unit/lib/validations` のパスが含まれていれば追加不要（既存バッチでカバーされる）。含まれていない場合はバッチを追加する。

- [ ] **Step 3: 全テスト実行**

Run: `bun run test`
Expected: PASS

- [ ] **Step 4: 最終検証**

Run: `bun run validate && bun run build:skip-env`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add package.json
git commit -m "test: ensure event validation tests are included in test suite"
```
