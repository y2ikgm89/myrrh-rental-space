# 公開 /events 検索性向上 Implementation Plan (Plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 公開 `/events` に「開催予定/終了」タブ・キーワード検索・カテゴリー絞り込みを追加し、閲覧者が過去/未来のイベントを見つけやすくする。

**Architecture:** 既存 `EVENT_CALENDAR` セクションの `list` variant を、クライアント側月送りフィルタから「サーバー側 tab/q/categoryId フィルタ + ページネーション」に置き換える。`calendar` variant（月グリッド）は無変更。新規セクション type は作らない（`SpaceListSection` の `catalog` variant 拡張と同型の precedent に倣う）。

**Tech Stack:** Next.js 16 App Router (`cacheComponents: true`) / nuqs (`useQueryStates` + `createSearchParamsCache`) / Prisma 7 / Radix UI Tabs

**前提:** Plan 1（`EventCategory` データモデル + admin CRUD、PR #1434）は実装・マージ・本番デプロイ済み。`Event.categoryId` は必須 FK、`EventCategory` テーブルは稼働中。設計の全体像は [`docs/superpowers/specs/2026-07-23-event-findability-category-design.md`](../specs/2026-07-23-event-findability-category-design.md) のセクション 5-7 を参照(本 Plan はそのタスク分解)。

## Global Constraints

- `cacheComponents: true` のため、tab/q/categoryId に依存する一覧取得(`getPublishedEventsPaginated`)は **`'use cache'` を付けない**(`new Date()` を使う tab 判定のため、公式ガイド上も高カーディナリティ検索に cache は不可)。カテゴリー一覧(`getActiveEventCategories`)は低カーディナリティ参照データのため `'use cache'` + `cacheTag(CACHE_TAGS.EVENT_CATEGORIES)` を付ける。
- 依存方向は `app → shared` の一方向。`EventListTab` 型・`EVENT_LIST_TABS`・`isEventListTab` は `src/shared/domain/events/event-list-tab.ts`(shared 側)に置き、`src/app/(public)/_shared/lib/search-params.ts` から re-export する。**`src/shared/domain/*` から `src/app/(public)/*` を import してはいけない**(`src/shared/domain/spaces/space-sort.ts` の既存コメントが同じ制約を明記している — この plan の spec 原文の例示コードはこの制約を踏まえておらず、本 plan で修正済み)。
- `calendar` variant(月グリッド)・`calendar-list-toggle` の calendar 半分は無変更。フィルタ・検索・カテゴリーは `list` variant にのみ適用する。
- テストは必ず `bun scripts/run-tests.ts <path>` 経由で実行する(素の `bun test` 禁止)。
- 危険 cast(`as any` 等)・non-null assertion(`!`)は 0 件。`exactOptionalPropertyTypes` のため optional プロパティへ `undefined` を明示代入しない。
- 新規追加する UI テキストは日本語。
- Prisma 直 import は `src/shared/domain` 配下のみ(`@generated/prisma/enums` から値 import 可、`src/app/*` からの直 import は禁止)。

---

### Task 1: EventListTab ドメイン型 + nuqs parsers

**Files:**

- Create: `src/shared/domain/events/event-list-tab.ts`
- Create: `__tests__/unit/domain/events/event-list-tab.test.ts`
- Modify: `src/app/(public)/_shared/lib/search-params.ts`

**Interfaces:**

- Produces: `EVENT_LIST_TABS: readonly ["upcoming", "past"]`、`type EventListTab = "upcoming" | "past"`、`isEventListTab(value: string): value is EventListTab`(`src/shared/domain/events/event-list-tab.ts`)。`eventsListSearchParamsParsers`(`tab`/`q`/`categoryId`/`page`)と `eventsListSearchParams`(`src/app/(public)/_shared/lib/search-params.ts`、alias `@/public/lib/search-params`)。

- [ ] **Step 1: 失敗するテストを書く**

`__tests__/unit/domain/events/event-list-tab.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  EVENT_LIST_TABS,
  isEventListTab,
} from "@/shared/domain/events/event-list-tab";

describe("isEventListTab", () => {
  test("upcoming/past は true", () => {
    expect(isEventListTab("upcoming")).toBe(true);
    expect(isEventListTab("past")).toBe(true);
  });

  test("それ以外の文字列は false", () => {
    expect(isEventListTab("draft")).toBe(false);
    expect(isEventListTab("")).toBe(false);
    expect(isEventListTab("UPCOMING")).toBe(false);
  });

  test("EVENT_LIST_TABS は upcoming/past の2値", () => {
    expect(EVENT_LIST_TABS).toEqual(["upcoming", "past"]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `bun scripts/run-tests.ts __tests__/unit/domain/events/event-list-tab.test.ts`
Expected: FAIL(モジュールが存在しない)

- [ ] **Step 3: 実装**

`src/shared/domain/events/event-list-tab.ts`(新規):

```ts
/**
 * 公開イベント一覧の開催状況タブ SSoT。
 *
 * 依存方向: `src/shared/*` からも `src/app/(public)/*` の nuqs parser からも
 * 参照するため shared 側に置く(app → shared の一方向依存を守る。
 * `src/shared/domain/spaces/space-sort.ts` と同型の配置理由)。
 */

export const EVENT_LIST_TABS = ["upcoming", "past"] as const;

export type EventListTab = (typeof EVENT_LIST_TABS)[number];

const eventListTabSet = new Set<string>(EVENT_LIST_TABS);

export function isEventListTab(value: string): value is EventListTab {
  return eventListTabSet.has(value);
}
```

`src/app/(public)/_shared/lib/search-params.ts` を編集。まず import ブロック(ファイル冒頭)に追加:

```ts
import {
  createSearchParamsCache,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server";
import { parseDateTimeLocalAsJst } from "@/shared/lib/date-format";
import {
  SPACE_SORT_VALUES,
  isSpaceSort,
  type SpaceSort,
} from "@/shared/domain/spaces/space-sort";
import {
  EVENT_LIST_TABS,
  isEventListTab,
  type EventListTab,
} from "@/shared/domain/events/event-list-tab";

export { SPACE_SORT_VALUES, isSpaceSort };
export type { SpaceSort };
export { EVENT_LIST_TABS, isEventListTab };
export type { EventListTab };
```

次に、既存の `eventsSearchParams`(`view`/`y`/`m` の月送り専用パーサー)の直後、`reservationSearchParamsParsers` の直前に追加:

```ts
export const eventsListSearchParamsParsers = {
  tab: parseAsStringLiteral(EVENT_LIST_TABS).withDefault("upcoming"),
  q: parseAsString.withDefault(""),
  // 未指定 = null = "すべてのカテゴリー"(spaceSearchParamsParsers.category と同型)
  categoryId: parseAsString,
  page: parseAsInteger.withDefault(1),
};

export const eventsListSearchParams = createSearchParamsCache(
  eventsListSearchParamsParsers,
);
```

- [ ] **Step 4: テストが通ることを確認**

Run: `bun scripts/run-tests.ts __tests__/unit/domain/events/event-list-tab.test.ts`
Expected: PASS(3 tests)

- [ ] **Step 5: 型チェック**

Run: `bun run type-check`
Expected: エラーなし

- [ ] **Step 6: commit**

```bash
git add src/shared/domain/events/event-list-tab.ts __tests__/unit/domain/events/event-list-tab.test.ts src/app/\(public\)/_shared/lib/search-params.ts
git commit -m "feat(public): add EventListTab domain type and eventsListSearchParamsParsers"
```

---

### Task 2: EventCardData にカテゴリーを追加(select + 型 + バッジ表示)

**Files:**

- Modify: `src/shared/domain/events/public-queries.ts`
- Modify: `src/app/(public)/_components/event-calendar/event-card.tsx`
- Modify: `src/app/(public)/_shared/components/sections/section-renderer.tsx`(EVENT_CALENDAR ケースの既存 bulk mapping のみ。EVENT_CALENDAR ケース全体の書き換えは Task 9)
- Modify: `src/app/(public)/events/[slug]/_components/related-events.tsx`

**Interfaces:**

- Consumes: なし(既存 `publicEventSelect`/`mapPublicEvent` の拡張)
- Produces: `EventCardData.category: EventCardCategoryData`(`{id, name, color}`)。`PublicEventCardSource` 型(`src/shared/domain/events/public-queries.ts`)— Task 9 で `section-renderer.tsx` の mapper 関数が使う。

- [ ] **Step 1: `publicEventSelect` に category を追加**

`src/shared/domain/events/public-queries.ts` の `publicEventSelect` を編集(`space` の直後に追加):

```ts
const publicEventSelect = {
  id: true,
  title: true,
  slug: true,
  descriptionPlainText: true,
  thumbnailUrl: true,
  gallery: true,
  registrationDeadline: true,
  addressDetail: true,
  status: true,
  scheduleMode: true,
  registrationOpen: true,
  format: true,
  meetingUrl: true,
  meetingProvider: true,
  location: { select: { id: true, name: true, address: true } },
  space: { select: { id: true, name: true, slug: true } },
  category: { select: { id: true, name: true, color: true } },
  slots: {
    select: { id: true, startAt: true, endAt: true, capacity: true },
    orderBy: { startAt: "asc" as const },
  },
  tickets: {
    where: { isAvailable: true },
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      capacity: true,
      unitSize: true,
      sortOrder: true,
    },
    orderBy: { sortOrder: "asc" as const },
  },
};
```

同ファイルの import を編集し `Serialized` 型を追加:

```ts
import {
  toPlainArray,
  toPlainObject,
  type Serialized,
} from "@/shared/lib/serialize";
```

`mapPublicEvent` 関数の直後(`export async function getPublishedEvents()` の直前)に型 export を追加:

```ts
/** section-renderer.tsx 等が「取得済みイベント行 → EventCardData」の変換に使う共通ソース型 */
export type PublicEventCardSource = Serialized<
  ReturnType<typeof mapPublicEvent>
>;
```

- [ ] **Step 2: `EventCardData` にカテゴリーを追加**

`src/app/(public)/_components/event-calendar/event-card.tsx` を編集。`EventCardSlotData` の直後に追加:

```ts
export interface EventCardCategoryData {
  readonly id: string;
  readonly name: string;
  readonly color: string | null;
}
```

`EventCardData` interface に `category` を追加(`gallery` の直後):

```ts
export interface EventCardData {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  /** SEO / カード要約用プレーンテキスト(Lexical HTML から派生) */
  readonly descriptionPlainText: string;
  readonly location: string | null;
  readonly startTime: string;
  readonly endTime: string;
  readonly slots: readonly EventCardSlotData[];
  readonly price: number | null;
  readonly registrationOpen: boolean;
  readonly spaceName: string | null;
  readonly thumbnailUrl: string | null;
  /** ギャラリー画像(複数ある場合はカルーセルで表示) */
  readonly gallery: readonly GalleryItem[];
  readonly category: EventCardCategoryData;
}
```

`EventBadges` 関数を編集し、カテゴリーバッジを先頭に追加:

```tsx
function EventBadges({
  event,
  isPast,
}: {
  readonly event: EventCardData;
  readonly isPast: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="default">{event.category.name}</Badge>
      {isPast ? (
        <Badge variant="default" className="text-muted-foreground">
          終了
        </Badge>
      ) : null}
      {event.price !== null ? (
        <Badge variant={event.price === 0 ? "success" : "default"}>
          {formatEventPrice(event.price)}
        </Badge>
      ) : null}
      {!isPast && !event.registrationOpen ? (
        <Badge variant="warning">受付終了</Badge>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: 2 つの consumer に category を配線**

`src/app/(public)/_shared/components/sections/section-renderer.tsx` の EVENT_CALENDAR ケース内、`EventCardData` オブジェクトリテラル(`gallery: e.gallery,` の直後)に追加:

```ts
        gallery: e.gallery,
        category: e.category,
```

`src/app/(public)/events/[slug]/_components/related-events.tsx` の `cards` map(`gallery: e.gallery,` の直後)にも同様に追加:

```ts
    gallery: e.gallery,
    category: e.category,
```

- [ ] **Step 4: 型チェック**

Run: `bun run type-check`
Expected: エラーなし(`category` 未配線の consumer が残っていれば型エラーで検出される)

- [ ] **Step 5: commit**

```bash
git add src/shared/domain/events/public-queries.ts src/app/\(public\)/_components/event-calendar/event-card.tsx src/app/\(public\)/_shared/components/sections/section-renderer.tsx "src/app/(public)/events/[slug]/_components/related-events.tsx"
git commit -m "feat(public): add category badge to EventCard"
```

---

### Task 3: `getPublishedEventsPaginated` ドメインクエリ

**Files:**

- Modify: `src/shared/domain/events/public-queries.ts`
- Create: `__tests__/unit/domain/events/public-queries.test.ts`

**Interfaces:**

- Consumes: `PAGINATION_DEFAULTS`(`@/shared/lib/constants`)、`paginate`/`calcTotalPages`(`@/shared/lib/pagination`)、`EventListTab`(`@/shared/domain/events/event-list-tab`、Task 1)、`publicEventSelect`/`mapPublicEvent`(Task 2 で category 追加済み)
- Produces: `EventListFilter` 型、`getPublishedEventsPaginated(filter): Promise<{items: PublicEventCardSource[], totalCount: number, totalPages: number, currentPage: number}>`(`'use cache'` なし)— Task 9 が呼ぶ。

- [ ] **Step 1: 失敗するテストを書く**

`__tests__/unit/domain/events/public-queries.test.ts`:

```ts
import { beforeEach, describe, expect, mock, test } from "bun:test";

const cacheLifeMock = mock(() => {});
const cacheTagMock = mock(() => {});
mock.module("next/cache", () => ({
  cacheLife: cacheLifeMock,
  cacheTag: cacheTagMock,
}));

const eventFindMany = mock<(_args?: unknown) => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);
const eventCount = mock<(_args?: unknown) => Promise<number>>(() =>
  Promise.resolve(0),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    event: {
      findMany: (args: unknown) => eventFindMany(args),
      count: (args: unknown) => eventCount(args),
    },
  },
}));

interface SafeFetchOpts<T> {
  readonly fetch: () => Promise<T>;
  readonly fallback: T;
}
mock.module("@/shared/lib/errors/server", () => ({
  safeFetch: async <T>(opts: SafeFetchOpts<T>): Promise<T> => {
    try {
      return await opts.fetch();
    } catch {
      return opts.fallback;
    }
  },
  ErrorCategory: { DATABASE: "DATABASE" },
  ErrorSeverity: { LOW: "LOW" },
}));

const { getPublishedEventsPaginated } =
  await import("@/shared/domain/events/public-queries");

function resetAllMocks() {
  eventFindMany.mockReset();
  eventCount.mockReset();
  eventFindMany.mockResolvedValue([]);
  eventCount.mockResolvedValue(0);
}

interface FindManyCall {
  readonly where?: Record<string, unknown>;
  readonly orderBy?: Record<string, unknown>;
  readonly skip?: number;
  readonly take?: number;
}

function lastFindManyArg(): FindManyCall {
  const call = eventFindMany.mock.calls[0]?.[0];
  if (!call || typeof call !== "object") {
    throw new Error("event.findMany was not called");
  }
  return call as FindManyCall;
}

describe("getPublishedEventsPaginated where clause", () => {
  beforeEach(resetAllMocks);

  test("tab=upcoming は status=PUBLISHED + deletedAt:null + slots.some(endAt>=now)", async () => {
    await getPublishedEventsPaginated({
      tab: "upcoming",
      q: "",
      categoryId: null,
    });
    const { where } = lastFindManyArg();
    expect(where).toMatchObject({ status: "PUBLISHED", deletedAt: null });
    expect(where?.["slots"]).toEqual({
      some: { endAt: { gte: expect.any(Date) } },
    });
  });

  test("tab=past は slots.some(endAt>=now) を NOT で除外", async () => {
    await getPublishedEventsPaginated({
      tab: "past",
      q: "",
      categoryId: null,
    });
    const { where } = lastFindManyArg();
    expect(where?.["NOT"]).toEqual({
      slots: { some: { endAt: { gte: expect.any(Date) } } },
    });
  });

  test("q はタイトル ILIKE", async () => {
    await getPublishedEventsPaginated({
      tab: "upcoming",
      q: "ヨガ",
      categoryId: null,
    });
    const { where } = lastFindManyArg();
    expect(where?.["title"]).toEqual({ contains: "ヨガ", mode: "insensitive" });
  });

  test("空白のみの q は無効化", async () => {
    await getPublishedEventsPaginated({
      tab: "upcoming",
      q: "   ",
      categoryId: null,
    });
    const { where } = lastFindManyArg();
    expect(where?.["title"]).toBeUndefined();
  });

  test("categoryId が where に足される", async () => {
    await getPublishedEventsPaginated({
      tab: "upcoming",
      q: "",
      categoryId: "c1",
    });
    const { where } = lastFindManyArg();
    expect(where?.["categoryId"]).toBe("c1");
  });

  test("categoryId=null は絞り込みなし", async () => {
    await getPublishedEventsPaginated({
      tab: "upcoming",
      q: "",
      categoryId: null,
    });
    const { where } = lastFindManyArg();
    expect(where?.["categoryId"]).toBeUndefined();
  });

  test("tab=upcoming の orderBy は firstSlotStartAt asc", async () => {
    await getPublishedEventsPaginated({
      tab: "upcoming",
      q: "",
      categoryId: null,
    });
    expect(lastFindManyArg().orderBy).toEqual({
      firstSlotStartAt: { sort: "asc", nulls: "last" },
    });
  });

  test("tab=past の orderBy は lastSlotEndAt desc", async () => {
    await getPublishedEventsPaginated({ tab: "past", q: "", categoryId: null });
    expect(lastFindManyArg().orderBy).toEqual({
      lastSlotEndAt: { sort: "desc", nulls: "last" },
    });
  });

  test("page + perPage で skip/take が正しく計算される", async () => {
    await getPublishedEventsPaginated({
      tab: "upcoming",
      q: "",
      categoryId: null,
      page: 3,
      perPage: 5,
    });
    const { skip, take } = lastFindManyArg();
    expect(skip).toBe(10);
    expect(take).toBe(5);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `bun scripts/run-tests.ts __tests__/unit/domain/events/public-queries.test.ts`
Expected: FAIL(`getPublishedEventsPaginated` が存在しない)

- [ ] **Step 3: 実装**

`src/shared/domain/events/public-queries.ts` の import ブロックを編集(`toPlainArray`/`Serialized` は Task 2 で追加済み):

```ts
import { paginate, calcTotalPages } from "@/shared/lib/pagination";
import { PAGINATION_DEFAULTS } from "@/shared/lib/constants";
import type { EventListTab } from "@/shared/domain/events/event-list-tab";
```

`getPublishedEventBySlug` の直後(ファイル末尾)に追加:

```ts
export interface EventListFilter {
  readonly tab: EventListTab;
  readonly q: string;
  readonly categoryId: string | null;
  readonly page?: number | undefined;
  readonly perPage?: number | undefined;
}

/**
 * q はタイトルのみを ILIKE 対象にする(既存 `events_title_trgm_idx` を活用)。
 * admin 側の `searchEvents`(`admin-queries.ts` の `buildTabWhere` 隣接ロジック)も
 * title/addressDetail/location.name/space.name の OR で本文(descriptionPlainText)
 * は対象外にしており、descriptionPlainText には trigram index が無いため
 * ILIKE がシーケンシャルスキャンになる。既存パターンとの一貫性を優先しタイトルのみとする。
 */
function buildEventListWhereClause(
  filter: EventListFilter,
  now: Date,
): Prisma.EventWhereInput {
  const tabWhere: Prisma.EventWhereInput =
    filter.tab === "upcoming"
      ? { slots: { some: { endAt: { gte: now } } } }
      : { NOT: { slots: { some: { endAt: { gte: now } } } } };

  const where: Prisma.EventWhereInput = {
    status: EventStatus.PUBLISHED,
    deletedAt: null,
    ...tabWhere,
  };

  const q = filter.q.trim();
  if (q) {
    where.title = { contains: q, mode: "insensitive" };
  }

  if (filter.categoryId) {
    where.categoryId = filter.categoryId;
  }

  return where;
}

/**
 * 公開 `/events` list variant のページネーション付き取得。
 *
 * `'use cache'` 非対応(tab 判定に `new Date()` を使うため、呼び出し側が
 * `await connection()` 済みの動的スコープで呼ぶ必要がある。既存
 * `getUpcomingEventsExcluding` と同じ理由)。
 *
 * orderBy は `Event.firstSlotStartAt`/`lastSlotEndAt`(`schema.prisma` の
 * フィールドコメント)が示す意図の通り: upcoming は開催が近い順、
 * past は終了が遅い順(直近に終わったものを先に見せる)。
 */
export async function getPublishedEventsPaginated(filter: EventListFilter) {
  const now = new Date();
  const page = Math.max(1, filter.page ?? 1);
  const perPage = filter.perPage ?? PAGINATION_DEFAULTS.public.default;
  const where = buildEventListWhereClause(filter, now);
  const orderBy: Prisma.EventOrderByWithRelationInput =
    filter.tab === "upcoming"
      ? { firstSlotStartAt: { sort: "asc", nulls: "last" } }
      : { lastSlotEndAt: { sort: "desc", nulls: "last" } };
  const { skip, take } = paginate({ page, limit: perPage });

  return safeFetch({
    fetch: async () => {
      const [rawItems, totalCount] = await Promise.all([
        prisma.event.findMany({
          where,
          select: publicEventSelect,
          orderBy,
          skip,
          take,
        }),
        prisma.event.count({ where }),
      ]);
      return {
        items: toPlainArray(rawItems.map(mapPublicEvent)),
        totalCount,
        totalPages: calcTotalPages(totalCount, perPage),
        currentPage: page,
      };
    },
    fallback: { items: [], totalCount: 0, totalPages: 0, currentPage: page },
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublishedEventsPaginated",
  });
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `bun scripts/run-tests.ts __tests__/unit/domain/events/public-queries.test.ts`
Expected: PASS(9 tests)

- [ ] **Step 5: 型チェック**

Run: `bun run type-check`
Expected: エラーなし

- [ ] **Step 6: commit**

```bash
git add src/shared/domain/events/public-queries.ts __tests__/unit/domain/events/public-queries.test.ts
git commit -m "feat(public): add getPublishedEventsPaginated for /events list filtering"
```

---

### Task 4: `getActiveEventCategories` キャッシュ配線 + drift gate

**Files:**

- Modify: `src/shared/domain/event-categories/queries.ts`
- Modify: `__tests__/unit/architecture/type-safety-cast-and-cache-tag-drift.test.ts`
- Modify: `next.config.ts`

**Interfaces:**

- Consumes: `CACHE_TAGS.EVENT_CATEGORIES`/`CACHE_LIFE.PUBLIC_CONTENT`(Plan 1 で追加済み)
- Produces: `getActiveEventCategories()` が `cacheTag(CACHE_TAGS.EVENT_CATEGORIES)` producer になる(Task 9 が呼ぶ)。

- [ ] **Step 1: `getActiveEventCategories` にキャッシュ指示を追加**

`src/shared/domain/event-categories/queries.ts` の import ブロックを編集:

```ts
import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { paginate } from "@/shared/lib/pagination";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import {
  ErrorCategory,
  ErrorSeverity,
  safeFetch,
} from "@/shared/lib/errors/server";
import type {
  GetEventCategoriesResult,
  EventCategoryWithStats,
} from "@/shared/lib/validations/event-category";
```

`getActiveEventCategories` 関数本体を置き換え:

```ts
export async function getActiveEventCategories(): Promise<
  ActiveEventCategoryOption[]
> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.EVENT_CATEGORIES);

  return safeFetch({
    fetch: () =>
      prisma.eventCategory.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, icon: true, color: true },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getActiveEventCategories",
  });
}
```

- [ ] **Step 2: drift gate 1(producer 追加に伴う `INVALIDATION_ONLY` 更新)**

`__tests__/unit/architecture/type-safety-cast-and-cache-tag-drift.test.ts` の `INVALIDATION_ONLY` 配列から `"EVENT_CATEGORIES",` の行を削除する(producer が付いたため invalidation-only ではなくなる — `.claude/skills/add-cache-tag/SKILL.md` Step 4 の逆方向 drift):

```ts
const INVALIDATION_ONLY = [
  "BLOCK_TEMPLATES",
  "COUPONS",
  "CUSTOMERS",
  "EVENT_WAITLIST",
  "INQUIRIES",
  // ...(他の既存要素はそのまま)
];
```

- [ ] **Step 3: drift gate 2(CDN Cache-Tag emission)**

`next.config.ts` の `EVENTS_CACHE_TAG` に `CDN_CACHE_TAGS.EVENT_CATEGORY` を追加する(`/events` が今後 EVENT_CATEGORIES データに依存するため、`SPACES_CACHE_TAG` が `CDN_CACHE_TAGS.SPACE_CATEGORY` を含むのと同型):

```ts
const EVENTS_CACHE_TAG = joinWithSiteWide([
  CDN_CACHE_TAGS.EVENT,
  CDN_CACHE_TAGS.EVENT_CATEGORY,
  CDN_CACHE_TAGS.EVENT_WAITLIST,
]);
```

- [ ] **Step 4: テスト実行**

Run:

```bash
bun scripts/run-tests.ts __tests__/unit/architecture/type-safety-cast-and-cache-tag-drift.test.ts
bun scripts/run-tests.ts __tests__/unit/lib/cdn-cache-tags.test.ts
bun scripts/run-tests.ts __tests__/unit/architecture-boundaries.test.ts
```

Expected: 全て PASS

- [ ] **Step 5: 型チェック + build**

Run: `bun run type-check && bun run build:skip-env`
Expected: エラーなし(`next-config-cache-tag-ssot` ESLint ルールは `bun run validate` で別途確認)

- [ ] **Step 6: commit**

```bash
git add src/shared/domain/event-categories/queries.ts __tests__/unit/architecture/type-safety-cast-and-cache-tag-drift.test.ts next.config.ts
git commit -m "feat(public): wire getActiveEventCategories as a real cache producer"
```

---

### Task 5: `EventCalendarConfig` から `showPastEvents` を削除

**Files:**

- Modify: `src/shared/lib/sections/definitions/event-calendar/schema.ts`

**Interfaces:**

- Produces: `EventCalendarConfig` から `showPastEvents` フィールドが消える。既存 DB の `Section.config` JSON に残る古いキーは `safeParse` の `.default()`/`.prefault()` 契約により無視される(migration 不要)。

- [ ] **Step 1: フィールドを削除**

`src/shared/lib/sections/definitions/event-calendar/schema.ts` を編集:

```ts
import { z } from "zod";

import { field } from "../../field-registry";
import { sectionLayoutSchema } from "../_shared/layout";
import { sectionHeaderFields } from "../_shared/section-header";

const layouts = ["list", "calendar", "calendar-list-toggle"] as const;

export const eventCalendarConfigSchema = z.object({
  ...sectionHeaderFields({ sectionLabelDefault: "Events" }),
  description: field.portableTextBlock("説明文", { subGroup: "text" }),
  maxEvents: field.number("最大表示件数", {
    min: 1,
    max: 50,
    default: 50,
    suffix: "件",
    group: "advanced",
  }),
  displayLayout: field.select("表示形式", {
    options: layouts,
    default: "calendar-list-toggle",
    group: "design",
    helpText:
      "list: 一覧のみ / calendar: カレンダーのみ / calendar-list-toggle: タブ切替",
  }),
  layout: sectionLayoutSchema,
});

export type EventCalendarConfig = z.infer<typeof eventCalendarConfigSchema>;
```

- [ ] **Step 2: 型チェック + architecture-boundaries + registry**

Run:

```bash
bun run type-check
bun scripts/run-tests.ts __tests__/unit/architecture-boundaries.test.ts
bun scripts/run-tests.ts __tests__/unit/domain/sections/registry.test.ts
```

Expected: エラーなし(`showPastEvents` を参照する箇所は他に存在しない — 事前に repo 全体を grep 済み。`registry.test.ts` は `event-calendar` section type 自体への言及のみで `showPastEvents` field には依存していないことを確認済みだが、spec のドリフトゲート節が名指ししているため念のため実行する)

- [ ] **Step 3: commit**

```bash
git add src/shared/lib/sections/definitions/event-calendar/schema.ts
git commit -m "fix(public): remove EventCalendarConfig.showPastEvents (superseded by upcoming/past tab)"
```

---

### Task 6: `EventListFilters` コンポーネント(新規)

**Files:**

- Create: `src/app/(public)/_components/event-calendar/event-list-filters.tsx`

**Interfaces:**

- Consumes: `eventsListSearchParamsParsers`/`EVENT_LIST_TABS`/`isEventListTab`/`EventListTab`(`@/public/lib/search-params`、Task 1)
- Produces: `EventListFilters` component、`EventListFiltersCategory` 型(`{id, name, icon, color}`)— Task 7 が使う。

- [ ] **Step 1: 実装**

`src/app/(public)/_components/event-calendar/event-list-filters.tsx`(新規):

```tsx
"use client";

import { useTransition, type ChangeEvent } from "react";
import { Tabs } from "radix-ui";
import { useQueryStates } from "nuqs";
import { cn } from "@/shared/lib/cn";
import { Select } from "@/public/components/design-system/select";
import {
  EVENT_LIST_TABS,
  eventsListSearchParamsParsers,
  isEventListTab,
  type EventListTab,
} from "@/public/lib/search-params";

export interface EventListFiltersCategory {
  readonly id: string;
  readonly name: string;
  readonly icon: string | null;
  readonly color: string | null;
}

interface EventListFiltersProps {
  readonly categories: readonly EventListFiltersCategory[];
  readonly resultCount: number;
}

const TAB_LABELS: Record<EventListTab, string> = {
  upcoming: "開催予定",
  past: "終了",
};

const ALL_VALUE = "";

/**
 * 公開イベント一覧の検索性向上バー(タブ + 検索 + カテゴリー)。
 *
 * `/spaces` の FilterBar と異なり facet が 3 つのみのため Dialog は使わず
 * 常時表示の横並びバーにする。すべて nuqs `useQueryStates` で URL 同期し、
 * 任意 facet 変更で page=1 に戻す(結果セットが変わるため、`/spaces` FilterBar
 * と同じ house pattern)。
 */
export function EventListFilters({
  categories,
  resultCount,
}: EventListFiltersProps) {
  const [params, setParams] = useQueryStates(eventsListSearchParamsParsers, {
    history: "replace",
    shallow: false,
  });
  const [isPending, startTransition] = useTransition();

  function handleTabChange(value: string) {
    if (!isEventListTab(value)) return;
    startTransition(() => {
      void setParams({ tab: value, page: 1 });
    });
  }

  function handleSearchChange(event: ChangeEvent<HTMLInputElement>) {
    startTransition(() => {
      void setParams({ q: event.target.value, page: 1 });
    });
  }

  function handleCategoryChange(event: ChangeEvent<HTMLSelectElement>) {
    startTransition(() => {
      void setParams({
        categoryId:
          event.target.value === ALL_VALUE ? null : event.target.value,
        page: 1,
      });
    });
  }

  const categoryOptions = [
    { value: ALL_VALUE, label: "すべてのカテゴリー" },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-4 transition-opacity duration-300",
        isPending && "opacity-60",
      )}
    >
      <Tabs.Root value={params.tab} onValueChange={handleTabChange}>
        <Tabs.List
          aria-label="開催状況"
          className="flex border-b border-border"
        >
          {EVENT_LIST_TABS.map((tab) => (
            <Tabs.Trigger
              key={tab}
              value={tab}
              className={cn(
                "group whitespace-nowrap px-4 py-2.5 text-sm tracking-[0.08em] outline-none transition-colors",
                "text-muted-foreground hover:text-foreground",
                "data-[state=active]:text-accent",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              )}
            >
              <span
                className={cn(
                  "underline decoration-2 underline-offset-[6px] transition-colors",
                  "decoration-transparent group-data-[state=active]:decoration-accent",
                )}
              >
                {TAB_LABELS[tab]}
              </span>
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </Tabs.Root>

      <label className="flex min-h-11 min-w-[10rem] flex-1 flex-col gap-1 text-xs uppercase tracking-eyebrow text-muted-foreground">
        検索
        <input
          type="search"
          value={params.q}
          onChange={handleSearchChange}
          placeholder="イベントを検索"
          aria-label="イベントを検索"
          className="min-h-11 border-b border-border bg-transparent px-1 py-2 text-base tracking-wide text-foreground placeholder:text-muted-foreground focus-visible:border-accent focus-visible:outline-none"
        />
      </label>

      <Select
        label="カテゴリー"
        options={categoryOptions}
        value={params.categoryId ?? ALL_VALUE}
        onChange={handleCategoryChange}
        wrapperClassName="min-w-[10rem]"
      />

      <div className="text-sm text-muted-foreground" aria-live="polite">
        該当 <span className="font-medium text-foreground">{resultCount}</span>{" "}
        件
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: エラーなし

- [ ] **Step 3: commit**

```bash
git add src/app/\(public\)/_components/event-calendar/event-list-filters.tsx
git commit -m "feat(public): add EventListFilters (tab + search + category bar)"
```

---

### Task 7: `EventListView` を server-paginated に書き換え

**Files:**

- Modify: `src/app/(public)/_components/event-calendar/event-list-view.tsx`

**Interfaces:**

- Consumes: `EventListFilters`/`EventListFiltersCategory`(Task 6)、`EventCardData`(Task 2)、`Pagination`(`@/public/components/pagination`)
- Produces: `EventListView` は `EventListViewData` 1 プロップのみを受け取る Server Component(`"use client"` を削除)。`EventListViewData` 型(`items`/`categories`/`currentPage`/`totalPages`/`totalCount`/`filter`)— Task 8 が使う。

**注意:** 月送り(`CalendarMonthNav`/`useCalendarMonth`)は `event-calendar-view.tsx`(calendar variant)が引き続き使うため、そちらのファイルは変更しない。

- [ ] **Step 1: 実装(全体書き換え)**

`src/app/(public)/_components/event-calendar/event-list-view.tsx` を以下で全置換:

```tsx
import { ScrollRevealGroup } from "@/public/components/animations/scroll-reveal";
import { Pagination } from "@/public/components/pagination";
import type { EventListTab } from "@/public/lib/search-params";
import { EventCard, type EventCardData } from "./event-card";
import {
  EventListFilters,
  type EventListFiltersCategory,
} from "./event-list-filters";

export interface EventListFilterState {
  readonly tab: EventListTab;
  readonly q: string;
  readonly categoryId: string | null;
}

export interface EventListViewData {
  readonly items: readonly EventCardData[];
  readonly categories: readonly EventListFiltersCategory[];
  readonly currentPage: number;
  readonly totalPages: number;
  readonly totalCount: number;
  readonly filter: EventListFilterState;
}

interface EventListViewProps {
  readonly data: EventListViewData;
}

/**
 * ページ切替時も tab/q/categoryId を URL に保持する(`page` は Pagination が上書き)。
 * `SpaceListSection.buildPreservedQuery` と同型。
 */
function buildPreservedQuery(
  filter: EventListFilterState,
): Readonly<Record<string, string | undefined>> {
  const q: Record<string, string | undefined> = {};
  if (filter.tab !== "upcoming") q["tab"] = filter.tab;
  if (filter.q) q["q"] = filter.q;
  if (filter.categoryId) q["categoryId"] = filter.categoryId;
  return q;
}

export function EventListView({ data }: EventListViewProps) {
  const { items, categories, currentPage, totalPages, totalCount, filter } =
    data;
  // tab が upcoming/past を server 側で既に絞り込んでいるため、カードの
  // 「終了」バッジは個々の slot 時刻ではなくタブの意味そのもので決める。
  const isPast = filter.tab === "past";

  return (
    <div>
      <EventListFilters categories={categories} resultCount={totalCount} />

      {items.length === 0 ? (
        <div className="py-12 text-center md:py-16">
          <p className="text-muted-foreground">
            該当するイベントはありません。
          </p>
        </div>
      ) : (
        <ScrollRevealGroup className="mt-10 divide-y divide-divider">
          {items.map((event) => (
            <EventCard
              key={event.id}
              variant="list"
              event={event}
              isPast={isPast}
            />
          ))}
        </ScrollRevealGroup>
      )}

      <div className="mt-10 md:mt-14">
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          basePath="/events"
          preservedQuery={buildPreservedQuery(filter)}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: エラーなし(この時点で `EventCalendarSection`/`section-renderer.tsx` はまだ古い props 形状のまま参照しているため、Task 8/9 完了までは型エラーが残るのが正常。Task 8 完了後に再確認する)

- [ ] **Step 3: commit**

```bash
git add src/app/\(public\)/_components/event-calendar/event-list-view.tsx
git commit -m "refactor(public): rewrite EventListView as server-paginated (drop client month filter)"
```

---

### Task 8: `EventCalendarSection` を mode 判別共用体に書き換え

**Files:**

- Modify: `src/app/(public)/_components/EventCalendarSection.tsx`

**Interfaces:**

- Consumes: `EventListViewData`(Task 7)、`EventCardData`(Task 2)
- Produces: `EventCalendarMode` 判別共用体(`{kind:"calendar"|"list"|"toggle", ...}`)— Task 9 の `section-renderer.tsx` が構築する。

**参考:** `SpaceListSection.tsx` の `SpaceListMode`(`{kind:"simple"|"catalog"}`)と同型の precedent。

- [ ] **Step 1: 実装(全体書き換え)**

`src/app/(public)/_components/EventCalendarSection.tsx` を以下で全置換:

```tsx
/**
 * EventCalendarSection — events を list / calendar / toggle で render する section
 *
 * Server Component。`displayLayout` config に応じて 3 variant を dispatch する。
 * データ取得は `section-renderer.tsx` の EVENT_CALENDAR ケースが `mode` として
 * 事前に構築し渡す(`SpaceListSection` の `mode: SpaceListMode` と同型の precedent)。
 * - list: 一覧のみ(tab/検索/カテゴリー絞り込み + ページネーション)
 * - calendar: 自作カレンダーのみ(フィルタ非適用、無変更)
 * - calendar-list-toggle: タブ切替(EventsViewSwitcher)
 */

import type { ReactElement } from "react";
import { cn } from "@/shared/lib/cn";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { SplitText } from "@/public/components/animations/split-text";
import { Heading } from "@/public/components/design-system/heading";
import { SectionWrapper } from "@/public/components/sections/SectionWrapper";
import {
  getTitleClasses,
  getTitleStyle,
  getTextStyle,
} from "@/public/components/sections/section-style-helpers";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import type { EventCalendarConfig } from "@/shared/lib/sections/definitions/event-calendar/schema";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";
import {
  EventListView,
  type EventListViewData,
} from "./event-calendar/event-list-view";
import { EventCalendarView } from "./event-calendar/event-calendar-view";
import { EventsViewSwitcher } from "./event-calendar/events-view-switcher";
import type { EventCardData } from "./event-calendar/event-card";
import { PortableTextSpans } from "@/shared/components/portable-text/PortableTextSpans";
import { PortableText } from "@/shared/components/portable-text/PortableText";
import { serverEnv } from "@/shared/lib/env/server";

export type EventCalendarMode =
  | { readonly kind: "calendar"; readonly events: readonly EventCardData[] }
  | { readonly kind: "list"; readonly listData: EventListViewData }
  | {
      readonly kind: "toggle";
      readonly events: readonly EventCardData[];
      readonly listData: EventListViewData;
    };

interface EventCalendarSectionProps {
  readonly config: EventCalendarConfig;
  readonly style: SectionStylePayload;
  readonly mode: EventCalendarMode;
}

export function EventCalendarSection({
  config,
  style,
  mode,
}: EventCalendarSectionProps): ReactElement {
  const initialNowIso =
    serverEnv.E2E_RUNTIME === "1" ? serverEnv.E2E_FIXED_NOW_ISO : undefined;
  const clockProps = initialNowIso !== undefined ? { initialNowIso } : {};

  let body: ReactElement;
  if (mode.kind === "calendar") {
    body = <EventCalendarView events={mode.events} {...clockProps} />;
  } else if (mode.kind === "list") {
    body = <EventListView data={mode.listData} />;
  } else {
    body = (
      <EventsViewSwitcher
        listView={<EventListView data={mode.listData} />}
        calendarView={
          <EventCalendarView events={mode.events} {...clockProps} />
        }
      />
    );
  }

  const hasTitle = config.title.length > 0;
  const hasDescription = config.description.length > 0;
  const showHeader = hasTitle || hasDescription;

  return (
    <SectionWrapper style={style} layout={config.layout}>
      <div className="mx-auto max-w-5xl">
        {showHeader && (
          <div className="mb-10 text-center md:mb-14">
            {config.sectionLabel && (
              <ScrollReveal>
                <SectionLabel>{config.sectionLabel}</SectionLabel>
              </ScrollReveal>
            )}
            {hasTitle && (
              <div style={getTitleStyle(style)}>
                <Heading
                  level={2}
                  className={cn("mt-4 tracking-tight", getTitleClasses(style))}
                >
                  <SplitText>
                    <PortableTextSpans spans={config.title} />
                  </SplitText>
                </Heading>
              </div>
            )}
            {hasDescription && (
              <ScrollReveal delay={0.2}>
                <div
                  className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-foreground [&_p]:mt-0 [&_p+p]:mt-3"
                  style={getTextStyle(style)}
                >
                  <PortableText blocks={config.description} />
                </div>
              </ScrollReveal>
            )}
          </div>
        )}
        {body}
      </div>
    </SectionWrapper>
  );
}
```

**変更点の要約:** `events: readonly EventCardData[]` prop を `mode: EventCalendarMode` に置換。`EventListView` の呼び出しを `data={mode.listData}` に変更(旧: `events={events} {...clockProps}`)。calendar 経路は `{...clockProps}` を維持(`EventCalendarView` は無変更のため)。

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: `section-renderer.tsx`(Task 9 未実施)が旧 `events` prop で `EventCalendarSection` を呼んでいるためエラーが残るのが正常。

- [ ] **Step 3: commit**

```bash
git add src/app/\(public\)/_components/EventCalendarSection.tsx
git commit -m "refactor(public): EventCalendarSection takes EventCalendarMode discriminated union"
```

---

### Task 9: `section-renderer.tsx` の EVENT_CALENDAR ケース統合

**Files:**

- Modify: `src/app/(public)/_shared/components/sections/section-renderer.tsx`

**Interfaces:**

- Consumes: `getPublishedEventsPaginated`(Task 3)、`getActiveEventCategories`(Task 4)、`eventsListSearchParams`(Task 1)、`EventCalendarMode`(Task 8)、`PublicEventCardSource`(Task 2)
- Produces: `/events` の `list`/`calendar-list-toggle` layout が searchParams を server 側で反映する。

- [ ] **Step 1: import を追加**

`src/app/(public)/_shared/components/sections/section-renderer.tsx` の既存 import を編集。

`getPublishedEvents` の import 行を拡張:

```ts
import {
  getPublishedEvents,
  getPublishedEventsPaginated,
  type PublicEventCardSource,
} from "@/shared/domain/events/public-queries";
```

`getActiveEventCategories` の import を追加(新規 import 文):

```ts
import { getActiveEventCategories } from "@/shared/domain/event-categories/queries";
```

`@/public/lib/search-params` からの既存 import ブロックに `eventsListSearchParams` を追加:

```ts
import {
  eventsListSearchParams,
  newsSearchParams,
  parseSpaceTimeRange,
  postsSearchParams,
  reservationSearchParams,
  spaceSearchParams,
} from "@/public/lib/search-params";
```

`EventCalendarSection` の import 行の直後に `EventCalendarMode` の type import を追加:

```ts
import {
  EventCalendarSection,
  type EventCalendarMode,
} from "../../../_components/EventCalendarSection";
```

- [ ] **Step 2: EVENT_CALENDAR ケースを置換**

既存の EVENT_CALENDAR ケース(`case SectionType.EVENT_CALENDAR: { ... }`、旧実装は `getPublishedEvents()` を無条件に呼び `EventCardData[]` を組み立てるだけだった)を、以下に置換:

```tsx
    case SectionType.EVENT_CALENDAR: {
      const config = getEventCalendarConfig(section.config);
      const layout = config.displayLayout;

      function toEventCardData(e: PublicEventCardSource): EventCardData {
        return {
          id: e.id,
          title: e.title,
          slug: e.slug,
          descriptionPlainText: e.descriptionPlainText,
          location: formatEventVenue({
            location: e.location,
            space: e.space,
            addressDetail: e.addressDetail,
          }),
          startTime: e.startTime,
          endTime: e.endTime,
          slots: e.slots.map((slot) => ({
            id: slot.id,
            startTime: slot.startAt,
            endTime: slot.endAt,
            capacity: slot.capacity,
          })),
          price: e.tickets[0]?.price ?? null,
          registrationOpen: e.registrationOpen,
          spaceName: e.space?.name ?? null,
          thumbnailUrl: e.thumbnailUrl ?? null,
          gallery: e.gallery,
          category: e.category,
        };
      }

      async function fetchEventListData() {
        const sp = await eventsListSearchParams.parse(
          searchParams ?? Promise.resolve({}),
        );
        const filter = { tab: sp.tab, q: sp.q, categoryId: sp.categoryId };
        const [paginated, categories] = await Promise.all([
          getPublishedEventsPaginated({ ...filter, page: sp.page }),
          getActiveEventCategories(),
        ]);
        return {
          items: paginated.items.map(toEventCardData),
          categories,
          currentPage: paginated.currentPage,
          totalPages: paginated.totalPages,
          totalCount: paginated.totalCount,
          filter,
        };
      }

      let mode: EventCalendarMode;
      if (layout === "calendar") {
        const rawEvents = await getPublishedEvents();
        mode = { kind: "calendar", events: rawEvents.map(toEventCardData) };
      } else if (layout === "list") {
        mode = { kind: "list", listData: await fetchEventListData() };
      } else {
        const [rawEvents, listData] = await Promise.all([
          getPublishedEvents(),
          fetchEventListData(),
        ]);
        mode = {
          kind: "toggle",
          events: rawEvents.map(toEventCardData),
          listData,
        };
      }

      return <EventCalendarSection config={config} style={resolved} mode={mode} />;
    }
```

- [ ] **Step 3: 型チェック**

Run: `bun run type-check`
Expected: エラーなし(Task 7/8 で保留していたエラーもここで解消される)

- [ ] **Step 4: lint**

Run: `bun run lint-format`
Expected: エラーなし

- [ ] **Step 5: commit**

```bash
git add src/app/\(public\)/_shared/components/sections/section-renderer.tsx
git commit -m "feat(public): wire searchParams-driven event list fetch into EVENT_CALENDAR case"
```

---

### Task 10: `/events` ページに searchParams を forward

**Files:**

- Modify: `src/app/(public)/events/page.tsx`

**Interfaces:**

- Consumes: `SectionStack` の既存 `searchParams` prop(`spaces/page.tsx` と同型)

- [ ] **Step 1: 実装**

`src/app/(public)/events/page.tsx` を以下で全置換:

```tsx
/**
 * /events — イベント一覧ページ
 *
 * Page-Template Architecture: 全 section を SectionRenderer 経由で描画。
 * calendar / list / toggle は event-calendar section の variant で表現。
 * list variant の tab/検索/カテゴリー絞り込みのため searchParams を
 * SectionStack に forward する(`spaces/page.tsx` と同型)。
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import type { SearchParams } from "nuqs/server";
import { connection } from "next/server";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import { SectionStack } from "@/public/components/sections/section-stack";
import { requireFeatureEnabled } from "@/shared/lib/features/check";
import { requireSystemPagePublished } from "@/shared/lib/pages/require-published";

interface EventsPageProps {
  readonly searchParams: Promise<SearchParams>;
}

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return generatePageMetadata("events");
}

export default async function EventsPage({
  searchParams,
}: EventsPageProps): Promise<ReactElement> {
  await connection();
  await requireFeatureEnabled("events");
  await requireSystemPagePublished("events");

  const sections = await getPageSectionsWithFallback("events");

  return (
    <>
      <SectionStack
        sections={sections}
        searchParams={searchParams}
        pageSlug="events"
      />
    </>
  );
}
```

**注意:** `spaces/page.tsx` と異なり `PageLayout`/`SiteCTA` は追加しない(既存コメント「filter / 中間挿入 / SiteCTA なし」の方針を維持。spec の非ゴールにも SiteCTA 追加は含まれない)。

- [ ] **Step 2: `SectionStack` が `searchParams` を受け取れることを確認**

Run: `bun run type-check`
Expected: エラーなし(`SectionStack` は既に `spaces/page.tsx` から同じ prop で呼ばれているため型は既存で対応済みのはず。エラーが出た場合は `src/app/(public)/_shared/components/sections/section-stack.tsx` の props 型を確認する)

- [ ] **Step 3: commit**

```bash
git add src/app/\(public\)/events/page.tsx
git commit -m "feat(public): forward searchParams to /events SectionStack"
```

---

### Task 11: e2e スペック(`/events` findability)

**Files:**

- Create: `e2e/public/events-filters.spec.ts`

**Interfaces:**

- Consumes: `urls.events`/`eventCategoryFixtures`(`e2e/fixtures`、Plan 1 で追加済み)

- [ ] **Step 1: 実装**

`e2e/public/events-filters.spec.ts`(新規):

```ts
import { test, expect } from "@playwright/test";
import { urls, eventCategoryFixtures } from "../fixtures";

const appSurface = process.env["APP_SURFACE"] ?? "admin";

test.skip(
  appSurface !== "public",
  "Public /events findability filter spec is served only on public surface.",
);

/**
 * 公開サイト - /events 検索性向上 UI E2E
 *
 * 責務: `eventsListSearchParamsParsers` の URL → UI 双方向反映を pin する。
 * tab/q/categoryId の Prisma 変換ロジックは
 * `__tests__/unit/domain/events/public-queries.test.ts` が担当。
 *
 * 規約 SSoT: `.claude/rules/testing-e2e.md`
 */

test.describe("/events findability — URL 双方向反映", () => {
  test("root で開催予定タブが選択状態、検索欄とカテゴリー select が描画される", async ({
    page,
  }) => {
    const res = await page.goto(urls.events);
    expect(res?.status()).toBe(200);

    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("tab", { name: "開催予定" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("tab", { name: "終了" })).toBeVisible();
    await expect(page.getByLabel("イベントを検索")).toBeVisible();
    await expect(page.getByLabel("カテゴリー")).toBeVisible();
  });

  test("?tab=past で終了タブが選択状態になる", async ({ page }) => {
    await page.goto(`${urls.events}?tab=past`);
    await expect(page.getByRole("tab", { name: "終了" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("終了タブをクリックすると URL の tab=past に反映される", async ({
    page,
  }) => {
    await page.goto(urls.events);
    await page.getByRole("tab", { name: "終了" }).click();
    await expect(page).toHaveURL(/[?&]tab=past/);
  });

  test("検索欄に入力すると URL の q に反映され値が保持される", async ({
    page,
  }) => {
    await page.goto(urls.events);
    const searchInput = page.getByLabel("イベントを検索");
    await searchInput.fill("ヨガ");
    await expect(page).toHaveURL(/[?&]q=/);
    await expect(searchInput).toHaveValue("ヨガ");
  });

  test(`?categoryId で「${eventCategoryFixtures.workshopName}」が select に反映される`, async ({
    page,
  }) => {
    await page.goto(urls.events);
    const select = page.getByLabel("カテゴリー");
    const optionValue = await select
      .locator("option", { hasText: eventCategoryFixtures.workshopName })
      .getAttribute("value");
    expect(optionValue).toBeTruthy();

    await page.goto(`${urls.events}?categoryId=${optionValue}`);
    await expect(select).toHaveValue(optionValue ?? "");
  });
});
```

- [ ] **Step 2: 実行**

Run: `bunx playwright test e2e/public/events-filters.spec.ts --project=chromium-smoke`
Expected: 全 test PASS(`APP_SURFACE=public` の実行環境が必要。既存 `spaces-filters.spec.ts` と同じ CI gate で走る)

- [ ] **Step 3: 既存イベント e2e の regression 確認**

Run:

```bash
bunx playwright test e2e/public/events.spec.ts e2e/public/events-calendar.spec.ts --project=chromium-smoke
```

Expected: 全 test PASS(`events-calendar.spec.ts` は既存の view タブ(list/calendar 切替、本 Plan の対象外)のみを検査するため無影響のはず)

- [ ] **Step 4: commit**

```bash
git add e2e/public/events-filters.spec.ts
git commit -m "test(e2e): add /events findability filter spec"
```

---

### Task 12: 最終検証ゲート

**Files:** なし(検証のみ)

- [ ] **Step 1: 型チェック + lint**

Run: `bun run validate`
Expected: exit 0

- [ ] **Step 2: unit テスト**

Run: `bun run test:unit`
Expected: 全 PASS(Task 1/3 の新規テストを含む)

- [ ] **Step 3: integration テスト**

Run: `bun run test:integration`
Expected: 全 PASS(本 Plan は新規 integration テストを追加しないが、`publicEventSelect`/`EventCalendarConfig` 変更が既存 integration テストに影響しないことを確認する)

- [ ] **Step 4: build**

Run: `bun run build:skip-env`
Expected: exit 0(route 表・型が正しく解決されることを確認。実 env が必要なら `bun run build`)

- [ ] **Step 5: e2e スモーク**

Run: `bunx playwright test --project=chromium-smoke`
Expected: 全 PASS

- [ ] **Step 6: 手動ブラウザ確認**

開発サーバーが起動していれば(`feedback_dev-server-manual`: Claude からは起動/停止しない)、Claude Browser tool で `/events` を開き以下を目視確認する:

- デフォルト(`calendar-list-toggle`)で「一覧」タブに開催予定イベントが表示される
- 「開催予定」/「終了」タブ切替で結果が変わる
- 検索欄への入力で結果が絞り込まれる
- カテゴリー select でカテゴリー絞り込みが機能する
- カード上部にカテゴリーバッジが表示される
- ページネーションが機能する(該当件数が `PAGINATION_DEFAULTS.public.default`(10)を超える場合)
- 「カレンダー」タブ(既存 view 切替)が引き続き従来通り動作する(フィルタ非適用)
- モバイル幅(375px 程度)でフィルタバーが崩れない

開発サーバーが起動していなければ、目視確認ができない旨を明示的に報告する(feature 完了の主張には実コマンド出力または実ブラウザ確認のいずれかが必須)。

- [ ] **Step 7: 完了報告**

全 gate が green であることを確認した上で、`superpowers:finishing-a-development-branch` へ進む。
