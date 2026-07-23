import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import type { Prisma } from "@generated/prisma/client";
import { prisma } from "@/shared/db/prisma";
import {
  CACHE_LIFE,
  CACHE_TAGS,
  PAGINATION_DEFAULTS,
  getCacheTag,
} from "@/shared/lib/constants";
import {
  ErrorCategory,
  ErrorSeverity,
  safeFetch,
} from "@/shared/lib/errors/server";
import { calcTotalPages, paginate } from "@/shared/lib/pagination";
import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";
import {
  parseFacilities,
  parseStringArray,
} from "@/shared/lib/json-validators";
import { parseGallery } from "@/shared/lib/validations/gallery";
import { isFeatureEnabled } from "@/shared/lib/features/check";
import { formatSpaceLineAddress } from "@/shared/domain/spaces/format-space-line-address";
import {
  EventStatus,
  ReservationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import type { SpaceSort } from "@/shared/domain/spaces/space-sort";
import {
  getBlockedSpaceIdsForDate,
  getBusinessHoursSettingsQuery,
} from "@/shared/domain/reservations/availability";
import { isWithinBusinessHours } from "@/shared/lib/reservation/time-slots-utils";

/**
 * 公開スペースクエリの共通 where 句。Space model に deletedAt 列はないため
 * isPublished + isActive gate のみ。新規 query 追加時の gate 漏れを構造的に防ぐ。
 */
const PUBLIC_WHERE = {
  isPublished: true,
  isActive: true,
} as const satisfies Prisma.SpaceWhereInput;

const spaceListSelect = {
  id: true,
  slug: true,
  name: true,
  descriptionPlainText: true,
  capacity: true,
  area: true,
  hourlyPrice: true,
  mainImageUrl: true,
  gallery: true,
  facilities: true,
  addressDetail: true,
  reviewsEnabled: true,
  category: { select: { id: true, name: true, icon: true } },
  location: { select: { name: true, address: true } },
} as const;

type SpaceListRow = Awaited<
  ReturnType<typeof prisma.space.findMany<{ select: typeof spaceListSelect }>>
>[number];

function mapSpaceListItem(s: SpaceListRow) {
  return {
    ...s,
    hourlyPrice: Number(s.hourlyPrice),
    area: s.area ? Number(s.area) : null,
    gallery: parseGallery(s.gallery),
    facilities: parseFacilities(s.facilities),
    lineAddress: formatSpaceLineAddress(s.location.address, s.addressDetail),
  };
}

// =============================================================================
// Facet filter contract
// =============================================================================

/**
 * 公開 /spaces catalog の facet 検索入力。
 *
 * `date` / `startTime` / `endTime` は本入力には含めない — 時間帯 facet は
 * {@link getPublishedSpacesPaginatedWithAvailability} が別引数で受け取り、
 * Reservation + EventTimeSlot の重複・営業時間・臨時休業（BlockedDate）を
 * 判定した上で「空きあり」グループを先に並べる（除外はしない。除外すると
 * 「他の時間帯なら予約できたかもしれない」候補が検索結果から消えてしまうため）。
 */
export interface SpaceCatalogFilter {
  readonly page?: number | undefined;
  readonly perPage?: number | undefined;
  readonly categoryId?: string | undefined;
  readonly locationId?: string | undefined;
  readonly q?: string | undefined;
  readonly minCapacity?: number | undefined;
  readonly facilities?: readonly string[] | undefined;
  readonly sort?: SpaceSort | undefined;
}

function buildSpaceWhereClause(
  input: SpaceCatalogFilter,
): Prisma.SpaceWhereInput {
  const where: Prisma.SpaceWhereInput = { ...PUBLIC_WHERE };

  if (input.categoryId) where.categoryId = input.categoryId;
  if (input.locationId) where.locationId = input.locationId;

  const q = input.q?.trim();
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { descriptionPlainText: { contains: q, mode: "insensitive" } },
      { addressDetail: { contains: q, mode: "insensitive" } },
      { location: { name: { contains: q, mode: "insensitive" } } },
      { location: { address: { contains: q, mode: "insensitive" } } },
    ];
  }

  if (typeof input.minCapacity === "number" && input.minCapacity > 0) {
    where.capacity = { gte: input.minCapacity };
  }

  const facilityNames = (input.facilities ?? []).filter(
    (name) => name.trim().length > 0,
  );
  if (facilityNames.length > 0) {
    // Postgres JSONB containment `@>` は「配列に部分オブジェクトを含む」判定なので
    // `iconName` を指定せず `{ name: X }` だけで facility 名一致になる。
    // 複数指定は AND (すべてを備えるスペースのみ)。
    where.AND = facilityNames.map((name) => ({
      facilities: { array_contains: [{ name }] },
    }));
  }

  return where;
}

function buildSpaceOrderBy(
  sort: SpaceSort | undefined,
): Prisma.SpaceOrderByWithRelationInput {
  switch (sort) {
    case "price-asc":
      return { hourlyPrice: "asc" };
    case "price-desc":
      return { hourlyPrice: "desc" };
    case "recommended":
    case undefined:
      return { name: "asc" };
  }
}

async function runSpacesPaginated(input: SpaceCatalogFilter) {
  const page = Math.max(1, input.page ?? 1);
  const perPage = input.perPage ?? PAGINATION_DEFAULTS.public.default;
  const where = buildSpaceWhereClause(input);
  const orderBy = buildSpaceOrderBy(input.sort);
  const { skip, take } = paginate({ page, limit: perPage });

  const [rawItems, totalCount] = await Promise.all([
    prisma.space.findMany({
      where,
      select: spaceListSelect,
      orderBy,
      skip,
      take,
    }),
    prisma.space.count({ where }),
  ]);

  return {
    items: toPlainArray(rawItems.map((s) => mapSpaceListItem(s))),
    totalCount,
    totalPages: calcTotalPages(totalCount, perPage),
    currentPage: page,
  };
}

// =============================================================================
// 公開 API
// =============================================================================

export type PaginatedSpaces = Awaited<ReturnType<typeof runSpacesPaginated>>;

/**
 * 公開済み・有効なスペース一覧をページネーション付きで取得（facet 対応）。
 *
 * 時間帯 facet を含まない cache-safe 経路。時間帯 facet を使う場合は
 * {@link getPublishedSpacesPaginatedWithAvailability} を呼ぶ。
 */
export async function getPublishedSpacesPaginated(input: SpaceCatalogFilter) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.SPACES);

  return safeFetch({
    fetch: () => runSpacesPaginated(input),
    fallback: {
      items: [],
      totalCount: 0,
      totalPages: 0,
      currentPage: Math.max(1, input.page ?? 1),
    },
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublishedSpacesPaginated",
  });
}

/**
 * 時間帯 facet 込みの検索。指定した日時が営業時間内か、Reservation / EventTimeSlot /
 * BlockedDate（臨時休業）と重複しないかを判定し、「空きあり」グループを先に、
 * 「空きなし」グループを後ろに並べる。dynamic 経路（cache なし）— SectionRenderer が
 * `await connection()` 済みで呼ぶ前提。
 *
 * 除外はしない。指定した時間帯に重複があっても、その日の別の時間なら予約できる
 * 可能性があるスペースを検索結果から消してしまうと、ユーザーが本来見つけられた
 * はずの候補を発見できなくなる。各アイテムに `isAvailableForSearch` を付与し、
 * UI 側で「この日時は空きがありません」等のバッジ表示に使う。
 *
 * 判定は 3 種類:
 * 1. 営業時間（`Settings.businessHours`、`isWithinBusinessHours` — 予約フォームの
 *    スロット生成 `getAvailableTimeSlots` と同じ判定ロジックを共有し、二重実装を避ける）。
 *    営業時間外ならサイト全体の設定のため個別のスペース差はなく、全件「空きなし」
 * 2. Reservation + EventTimeSlot の重複（`getUnavailableSpaceIds`、半開区間 overlap）
 * 3. BlockedDate（臨時休業、GLOBAL/LOCATION/SPACE 3 階層 cascade、`getBlockedSpaceIdsForDate`）
 *
 * ページネーションは「空きあり」「空きなし」2 グループそれぞれの count を求め、
 * skip/take をグループ境界で分割して実現する（型安全な Prisma query のみで完結させ、
 * conditional ORDER BY のための生 SQL は使わない）。
 */
export async function getPublishedSpacesPaginatedWithAvailability(
  input: SpaceCatalogFilter,
  window: {
    readonly date: string;
    readonly startTime: string;
    readonly endTime: string;
    readonly from: Date;
    readonly to: Date;
  },
) {
  const page = Math.max(1, input.page ?? 1);
  const perPage = input.perPage ?? PAGINATION_DEFAULTS.public.default;

  const businessHours = await safeFetch({
    fetch: () => getBusinessHoursSettingsQuery(),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName:
      "getPublishedSpacesPaginatedWithAvailability.getBusinessHoursSettingsQuery",
  });
  const openForWindow = isWithinBusinessHours(
    businessHours,
    window.date,
    window.startTime,
    window.endTime,
  );

  return safeFetch({
    fetch: () =>
      openForWindow
        ? runSpacesPaginatedWithAvailabilitySplit(input, window, page, perPage)
        : runSpacesPaginatedAllUnavailable(input, page, perPage),
    fallback: {
      items: [],
      totalCount: 0,
      totalPages: 0,
      currentPage: page,
    },
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublishedSpacesPaginatedWithAvailability",
  });
}

/** 営業時間外: サイト全体の設定のため個別差はなく、通常の並びで全件「空きなし」として返す。 */
async function runSpacesPaginatedAllUnavailable(
  input: SpaceCatalogFilter,
  page: number,
  perPage: number,
) {
  const result = await runSpacesPaginated({ ...input, page, perPage });
  return {
    ...result,
    items: result.items.map((item) => ({
      ...item,
      isAvailableForSearch: false,
    })),
  };
}

/** 営業時間内: Reservation/EventTimeSlot 重複 + BlockedDate を判定し、空きあり優先で並べる。 */
async function runSpacesPaginatedWithAvailabilitySplit(
  input: SpaceCatalogFilter,
  window: { readonly date: string; readonly from: Date; readonly to: Date },
  page: number,
  perPage: number,
) {
  const where = buildSpaceWhereClause(input);
  const orderBy = buildSpaceOrderBy(input.sort);

  const [busyIds, candidates] = await Promise.all([
    getUnavailableSpaceIds(window.from, window.to),
    prisma.space.findMany({
      where,
      select: { id: true, locationId: true },
    }),
  ]);
  const blockedIds = await getBlockedSpaceIdsForDate(
    window.date,
    candidates.map((c) => ({ spaceId: c.id, locationId: c.locationId })),
  );

  const unavailableIds = new Set<string>([...busyIds, ...blockedIds]);
  const availableWhere: Prisma.SpaceWhereInput = {
    ...where,
    id: { notIn: [...unavailableIds] },
  };
  const unavailableWhere: Prisma.SpaceWhereInput = {
    ...where,
    id: { in: [...unavailableIds] },
  };

  const [availableCount, unavailableCount] = await Promise.all([
    prisma.space.count({ where: availableWhere }),
    unavailableIds.size > 0
      ? prisma.space.count({ where: unavailableWhere })
      : Promise.resolve(0),
  ]);

  const totalCount = availableCount + unavailableCount;
  // skip/take は paginate() の clamp 済み値を使う（raw な perPage を直接使うと
  // 0/負値/非整数のときに takeFromAvailable/takeFromUnavailable が破綻する）。
  const { skip, take: clampedPerPage } = paginate({ page, limit: perPage });

  const skipInAvailable = Math.min(skip, availableCount);
  const takeFromAvailable = Math.max(
    0,
    Math.min(clampedPerPage, availableCount - skipInAvailable),
  );
  const skipInUnavailable = Math.max(0, skip - availableCount);
  const takeFromUnavailable = clampedPerPage - takeFromAvailable;

  const [availableRows, unavailableRows] = await Promise.all([
    takeFromAvailable > 0
      ? prisma.space.findMany({
          where: availableWhere,
          select: spaceListSelect,
          orderBy,
          skip: skipInAvailable,
          take: takeFromAvailable,
        })
      : Promise.resolve([]),
    takeFromUnavailable > 0 && unavailableIds.size > 0
      ? prisma.space.findMany({
          where: unavailableWhere,
          select: spaceListSelect,
          orderBy,
          skip: skipInUnavailable,
          take: takeFromUnavailable,
        })
      : Promise.resolve([]),
  ]);

  const items = [
    ...availableRows.map((s) => ({
      ...mapSpaceListItem(s),
      isAvailableForSearch: true,
    })),
    ...unavailableRows.map((s) => ({
      ...mapSpaceListItem(s),
      isAvailableForSearch: false,
    })),
  ];

  return {
    items: toPlainArray(items),
    totalCount,
    totalPages: calcTotalPages(totalCount, clampedPerPage),
    currentPage: page,
  };
}

/**
 * 指定期間と overlap する予約・イベントスロットを持つ Space ID の集合を返す。
 *
 * - Reservation: `status ∈ {PENDING, CONFIRMED}` かつ `deletedAt IS NULL`
 * - EventTimeSlot: `event.status = PUBLISHED` かつ event 未削除 かつ `event.spaceId` が対象
 *   （EventTimeSlot 自身は spaceId を持たず、Event.spaceId 経由。null 会場は空間検索対象外）
 * - 半開区間: `startTime < range.to AND endTime > range.from`
 */
async function getUnavailableSpaceIds(
  from: Date,
  to: Date,
): Promise<ReadonlySet<string>> {
  const [reservations, eventSlots] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        deletedAt: null,
        status: {
          in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED],
        },
        startTime: { lt: to },
        endTime: { gt: from },
      },
      select: { spaceId: true },
      distinct: ["spaceId"],
    }),
    prisma.eventTimeSlot.findMany({
      where: {
        event: {
          status: EventStatus.PUBLISHED,
          deletedAt: null,
          spaceId: { not: null },
        },
        startAt: { lt: to },
        endAt: { gt: from },
      },
      select: { event: { select: { spaceId: true } } },
    }),
  ]);

  const busy = new Set<string>();
  for (const r of reservations) busy.add(r.spaceId);
  for (const s of eventSlots) {
    if (s.event.spaceId) busy.add(s.event.spaceId);
  }
  return busy;
}

/**
 * スラッグからスペース詳細を取得（公開済み・有効のみ）。
 *
 * ## cacheTag に LOCATIONS を含める理由 (Codex PR #1041 P2)
 *
 * このクエリは `location.address / latitude / longitude / accessLines / parkingInfo`
 * を select し、`/spaces/[slug]` の `AccessMap` (Google Maps Embed) を駆動する。
 * 管理画面の `updateLocationAction` 系ミューテーションは `CACHE_TAGS.LOCATIONS`
 * のみを invalidate するため、SPACES tag だけだと Location 側の座標編集が
 * 公開ページに反映されず PUBLIC_CONTENT lifetime いっぱいまで旧位置の地図が
 * 表示され続ける silent bug が発生する。Location 依存フィールドを select する
 * cached クエリは LOCATIONS tag も同時に貼るのが SSoT パターン。
 */
export async function getSpaceBySlug(slug: string) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(
    CACHE_TAGS.SPACES,
    CACHE_TAGS.LOCATIONS,
    getCacheTag.spaces.detail(slug),
  );

  const space = await safeFetch({
    fetch: () =>
      prisma.space.findFirst({
        where: { ...PUBLIC_WHERE, slug },
        select: {
          id: true,
          slug: true,
          name: true,
          descriptionJson: true,
          descriptionHtml: true,
          descriptionPlainText: true,
          capacity: true,
          area: true,
          hourlyPrice: true,
          mainImageUrl: true,
          gallery: true,
          facilities: true,
          addressDetail: true,
          reviewsEnabled: true,
          metaDescription: true,
          ogpTitle: true,
          ogpDescription: true,
          ogpImageUrl: true,
          category: { select: { id: true, name: true, icon: true } },
          location: {
            select: {
              id: true,
              name: true,
              address: true,
              latitude: true,
              longitude: true,
              accessLines: true,
              parkingInfo: true,
            },
          },
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getSpaceBySlug",
  });

  if (!space) return null;

  return toPlainObject({
    ...space,
    gallery: parseGallery(space.gallery),
    facilities: parseFacilities(space.facilities),
    location: {
      ...space.location,
      accessLines: parseStringArray(space.location.accessLines),
    },
    lineAddress: formatSpaceLineAddress(
      space.location.address,
      space.addressDetail,
    ),
    hourlyPrice: Number(space.hourlyPrice),
  });
}

/**
 * 関連スペースを取得（同カテゴリ優先、現在のスペースを除外）
 */
export async function getRelatedSpaces(
  currentId: string,
  categoryId: string | null,
  limit = 3,
) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.SPACES);

  const spaces = await safeFetch({
    fetch: () =>
      prisma.space.findMany({
        where: {
          ...PUBLIC_WHERE,
          id: { not: currentId },
          ...(categoryId ? { categoryId } : {}),
        },
        select: {
          id: true,
          slug: true,
          name: true,
          capacity: true,
          hourlyPrice: true,
          mainImageUrl: true,
          gallery: true,
        },
        take: limit,
        orderBy: { name: "asc" },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getRelatedSpaces",
  });

  return toPlainArray(
    spaces.map((s) => ({
      ...s,
      hourlyPrice: Number(s.hourlyPrice),
      gallery: parseGallery(s.gallery),
    })),
  );
}

/**
 * スペースが指定ロケーションに属するか検証する（予約フォーム用）
 * キャッシュなし（ミューテーション前の整合性チェック用途）
 */
export async function verifySpaceBelongsToLocation(
  spaceId: string,
  locationId: string,
): Promise<boolean> {
  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    select: { locationId: true },
  });
  return space !== null && space.locationId === locationId;
}

/**
 * 有効なスペースカテゴリ一覧を取得（フィルター UI 用）
 */
export async function getActiveCategories() {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.SPACE_CATEGORIES);

  const categories = await safeFetch({
    fetch: () =>
      prisma.spaceCategory.findMany({
        where: { isActive: true },
        select: { id: true, name: true, icon: true },
        orderBy: { sortOrder: "asc" },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getActiveCategories",
  });

  return toPlainArray(categories);
}

/**
 * 公開済み・有効スペースに紐付く facility 名の集合。
 * `Space.facilities` は `{name, iconName}[]` の JSON。全 space 分をアプリ側で
 * 重複除去して返す（現状のカーディナリティは施設あたり数百件 * facility 数個で
 * 十分軽い + `'use cache'` で 1 リクエスト内はメモ化される）。
 */
export async function getPublicSpaceFacilityNames(): Promise<
  readonly string[]
> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.SPACES);

  const rows = await safeFetch({
    fetch: () =>
      prisma.space.findMany({
        where: PUBLIC_WHERE,
        select: { facilities: true },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublicSpaceFacilityNames",
  });

  const names = new Set<string>();
  for (const row of rows) {
    for (const item of parseFacilities(row.facilities)) {
      names.add(item.name);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b, "ja"));
}

/**
 * 指定ロケーションの公開済み・有効スペース一覧（編集フォーム用）
 */
export async function getActiveSpacesByLocationId(locationId: string) {
  const spaces = await prisma.space.findMany({
    where: { ...PUBLIC_WHERE, locationId },
    select: {
      id: true,
      name: true,
      capacity: true,
      hourlyPrice: true,
    },
    orderBy: { name: "asc" },
  });

  return spaces.map((s) => ({
    ...s,
    hourlyPrice: Number(s.hourlyPrice),
  }));
}

/**
 * スペースカード埋め込みブロック（Lexical `SpaceCardNode`）の解決用データ。
 * 写真・料金・定員のみを保持する最小構成（`resolveSpaceCardEmbeds` が
 * 税込み価格ラベルの整形を担当するため、ここでは raw な number のまま返す）。
 */
export type SpaceCardEmbedData = {
  id: string;
  slug: string;
  name: string;
  capacity: number;
  hourlyPrice: number;
  mainImageUrl: string;
};

/**
 * スペースカード埋め込みブロックの id 群を公開フィルタ付きで一括解決する。
 *
 * 参照先が非公開/非アクティブなら Map に含まれない（呼び出し側でカードを描画しない
 * ＝404 防止、`resolveLinkCardsByType` と同じ方針）。spaces Feature Module が
 * OFF の場合も空 Map を返す（挿入 UI 側では防がないため、ここが最終防衛線）。
 * 常に最新データを返すため `'use cache'` は付けない（freshness 優先 + id 配列の
 * cache key 肥大回避、既存 resolveSpaceCards と同じ理由）。
 */
export async function resolveSpaceCardEmbedData(
  ids: readonly string[],
): Promise<Map<string, SpaceCardEmbedData>> {
  if (ids.length === 0) return new Map();
  if (!(await isFeatureEnabled("spaces"))) return new Map();

  const uniqueIds = Array.from(new Set(ids));
  const rows = await safeFetch({
    fetch: () =>
      prisma.space.findMany({
        where: { ...PUBLIC_WHERE, id: { in: uniqueIds } },
        select: {
          id: true,
          slug: true,
          name: true,
          capacity: true,
          hourlyPrice: true,
          mainImageUrl: true,
        },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "resolveSpaceCardEmbedData",
  });

  const map = new Map<string, SpaceCardEmbedData>();
  for (const r of rows) {
    map.set(r.id, {
      id: r.id,
      slug: r.slug,
      name: r.name,
      capacity: r.capacity,
      hourlyPrice: Number(r.hourlyPrice),
      mainImageUrl: r.mainImageUrl,
    });
  }
  return map;
}
