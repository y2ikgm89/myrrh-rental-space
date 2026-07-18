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
import { formatSpaceLineAddress } from "@/shared/domain/spaces/format-space-line-address";
import {
  EventStatus,
  ReservationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import type { SpaceSort } from "@/shared/domain/spaces/space-sort";

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
 * `runSpacesPaginated` の内部を bypass して {@link getPublishedSpacesPaginatedWithAvailability}
 * が Reservation + EventTimeSlot と cross overlap 検査した上で `excludeSpaceIds` として
 * 差し込む（時間帯有効時は cache 経路が dynamic に切り替わる契約）。
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

interface RunSpacesInput extends SpaceCatalogFilter {
  readonly excludeSpaceIds?: readonly string[] | undefined;
}

function buildSpaceWhereClause(input: RunSpacesInput): Prisma.SpaceWhereInput {
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

  if (input.excludeSpaceIds && input.excludeSpaceIds.length > 0) {
    where.id = { notIn: [...input.excludeSpaceIds] };
  }

  return where;
}

function buildSpaceOrderBy(
  sort: SpaceSort | undefined,
): Prisma.SpaceOrderByWithRelationInput {
  switch (sort) {
    case "capacity-asc":
      return { capacity: "asc" };
    case "capacity-desc":
      return { capacity: "desc" };
    case "price-asc":
      return { hourlyPrice: "asc" };
    case "price-desc":
      return { hourlyPrice: "desc" };
    case "recommended":
    case undefined:
      return { name: "asc" };
  }
}

async function runSpacesPaginated(input: RunSpacesInput) {
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
 * 時間帯 facet 込みの検索。指定期間で Reservation / EventTimeSlot と overlap する
 * space を除外した結果を返す。dynamic 経路（cache なし）— SectionRenderer が
 * `await connection()` 済みで呼ぶ前提。
 *
 * `range.from < endTime AND range.to > startTime` の半開区間 overlap を Space namespace
 * (Reservation.spaceId + EventTimeSlot.spaceId, いずれも非 null かつ event.status = PUBLISHED) で判定。
 * どちらかに衝突があれば「空きなし」とみなし id を除外リストに積む。
 */
export async function getPublishedSpacesPaginatedWithAvailability(
  input: SpaceCatalogFilter,
  range: { from: Date; to: Date },
) {
  // RECENT-04: getUnavailableSpaceIds は Reservation + EventTimeSlot への 2 クエリ
  // を発火する。以前は safeFetch の外側で await していたため、DB 接続断や
  // statement_timeout でここが throw すると SpaceListSection catalog 経路
  // (section-renderer.tsx) が丸ごと error boundary に落ち、時間帯 facet 経路だけ
  // 非対称に落ちる non-uniform degrade を発生させていた (facet 未使用の
  // getPublishedSpacesPaginated 側は safeFetch fallback で degrade 保護済み)。
  // ここでも safeFetch でラップし、fallback として「availability 判定なし=
  // 全 space 表示」に degrade する (facet 検索は失敗せず ideal 挙動から劣化するだけ)。
  const unavailable = await safeFetch({
    fetch: () => getUnavailableSpaceIds(range.from, range.to),
    fallback: new Set<string>() as ReadonlySet<string>,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName:
      "getPublishedSpacesPaginatedWithAvailability.getUnavailableSpaceIds",
  });
  return safeFetch({
    fetch: () =>
      runSpacesPaginated({
        ...input,
        excludeSpaceIds: [...unavailable],
      }),
    fallback: {
      items: [],
      totalCount: 0,
      totalPages: 0,
      currentPage: Math.max(1, input.page ?? 1),
    },
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublishedSpacesPaginatedWithAvailability",
  });
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
