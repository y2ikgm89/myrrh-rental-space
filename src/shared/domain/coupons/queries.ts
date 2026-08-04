import "server-only";

import { prisma, type Coupon } from "@/shared/db/prisma";
import { Prisma } from "@generated/prisma/client";
import type {
  CouponData,
  CouponDetailData,
  CouponFilters,
  CouponPagination,
  CouponStatusValue,
  GetCouponsResult,
} from "@/shared/domain/coupons/types";
import { calcTotalPages, paginate } from "@/shared/lib/pagination";
import { toPlainObject } from "@/shared/lib/serialize";

/** `$queryRaw` の戻り値型（findMany 経路の `Coupon` と 1:1 対応）。 */
type CouponRawRow = Coupon;

/**
 * Prisma field 名 → 物理列名の対応表。
 *
 * **`SELECT *` を使ってはいけない。** `$queryRaw` の結果は Prisma が field 名へ
 * 写し戻さず **物理列名のまま**返る。列を `@map` で rename すると、戻り値の型は
 * `Coupon`（camelCase）のままなのでコンパイルは通り、`coupon.validFrom` が
 * `undefined` になって実行時にはじめて落ちる — 型検査が一切効かない種類の壊れ方。
 *
 * 明示的な `"物理列" AS "field名"` リストにしておけば、rename の影響はこの表
 * 1 箇所に閉じる。`satisfies Record<keyof CouponRawRow, string>` が列の増減を
 * tsc で検出するので、モデルに列を足して SELECT に入れ忘れることもできない。
 */
const COUPON_COLUMNS = {
  id: "id",
  code: "code",
  name: "name",
  description: "description",
  type: "type",
  discountValue: "discount_value",
  minReservationAmount: "min_reservation_amount",
  maxDiscountAmount: "max_discount_amount",
  validFrom: "valid_from",
  validUntil: "valid_until",
  usageLimit: "usage_limit",
  usageCount: "usage_count",
  isActive: "is_active",
  canCombineWithDurationDiscount: "can_combine_with_duration_discount",
  createdAt: "created_at",
  updatedAt: "updated_at",
} satisfies Record<keyof CouponRawRow, string>;

/** WHERE / ORDER BY 用のクォート済み物理列参照。 */
function couponColumn(field: keyof CouponRawRow): Prisma.Sql {
  return Prisma.raw(`"${COUPON_COLUMNS[field]}"`);
}

/** `SELECT` 用の `"物理列" AS "field名"` リスト（`SELECT *` の代替）。 */
const COUPON_SELECT_LIST = Prisma.join(
  Object.entries(COUPON_COLUMNS).map(([field, column]) =>
    Prisma.raw(`"${column}" AS "${field}"`),
  ),
  ", ",
);

const SORT_COLUMN_MAP = {
  code: couponColumn("code"),
  name: couponColumn("name"),
  createdAt: couponColumn("createdAt"),
  validFrom: couponColumn("validFrom"),
  usageCount: couponColumn("usageCount"),
} satisfies Record<NonNullable<CouponPagination["sortBy"]>, Prisma.Sql>;

// raw SQL は物理テーブル名で実行される。Coupon モデルは @@map("coupons")
// （schema.prisma）でマップされているため、テーブル名を一箇所に集約してドリフトを防ぐ。
const COUPONS_TABLE = Prisma.raw('"coupons"');

// JST-DRIFT-02: timeZone 未指定だと server-local (Cloud Run UTC) で解釈され
// validFrom / validUntil の JST 表示が 9 時間ずれる silent bug。
// date-format.ts の SSoT 契約 (CLAUDE.md 絶対規約 10) に従い明示的に JST 固定。
const couponDateFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatCoupon(
  coupon: Pick<
    Coupon,
    | "id"
    | "code"
    | "name"
    | "description"
    | "type"
    | "discountValue"
    | "minReservationAmount"
    | "maxDiscountAmount"
    | "validFrom"
    | "validUntil"
    | "usageLimit"
    | "usageCount"
    | "isActive"
    | "canCombineWithDurationDiscount"
    | "createdAt"
    | "updatedAt"
  >,
): CouponData {
  return toPlainObject({
    ...coupon,
    validFrom: coupon.validFrom.toISOString(),
    validUntil: coupon.validUntil?.toISOString() ?? null,
    createdAt: coupon.createdAt.toISOString(),
    updatedAt: coupon.updatedAt.toISOString(),
  });
}

function formatCouponDetail(
  coupon: Pick<
    Coupon,
    | "id"
    | "code"
    | "name"
    | "description"
    | "type"
    | "discountValue"
    | "minReservationAmount"
    | "maxDiscountAmount"
    | "validFrom"
    | "validUntil"
    | "usageLimit"
    | "usageCount"
    | "isActive"
    | "canCombineWithDurationDiscount"
    | "createdAt"
    | "updatedAt"
  >,
): CouponDetailData {
  return {
    ...formatCoupon(coupon),
    validFromLabel: couponDateFormatter.format(coupon.validFrom),
    validUntilLabel: coupon.validUntil
      ? couponDateFormatter.format(coupon.validUntil)
      : null,
  };
}

/** 属性ベースのステータスフィルタ（Prisma findMany 経路）。
 *
 * 一覧バッジ `getCouponStatus` は inactive 優先の排他判定だが、フィルタは
 * 属性ごとに独立（例: 無効化済みでも期限切れフィルタに含める）— 意図的に重複しうる。
 */
function buildStatusWhereClause(
  status: Exclude<CouponStatusValue, "active" | "limitReached">,
): Prisma.CouponWhereInput {
  const now = new Date();

  switch (status) {
    case "inactive":
      return { isActive: false };
    case "expired":
      return {
        validUntil: { not: null, lt: now },
      };
    case "notStarted":
      return {
        validFrom: { gt: now },
      };
  }
}

function buildCouponWhere(filters: CouponFilters): Prisma.CouponWhereInput {
  const where: Prisma.CouponWhereInput = {};

  if (
    filters.status &&
    filters.status !== "active" &&
    filters.status !== "limitReached"
  ) {
    Object.assign(where, buildStatusWhereClause(filters.status));
  }

  if (filters.type) {
    where.type = filters.type;
  }

  if (filters.search) {
    where.OR = [
      { code: { contains: filters.search, mode: "insensitive" } },
      { name: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  return where;
}

function buildRawCouponWhere(filters: CouponFilters): Prisma.Sql {
  const now = new Date();
  const clauses: Prisma.Sql[] = [];

  const usageLimit = couponColumn("usageLimit");
  const usageCount = couponColumn("usageCount");

  if (filters.status === "limitReached") {
    clauses.push(Prisma.sql`${usageLimit} IS NOT NULL`);
    clauses.push(Prisma.sql`${usageCount} >= ${usageLimit}`);
  }

  if (filters.status === "active") {
    const validUntil = couponColumn("validUntil");
    clauses.push(Prisma.sql`${couponColumn("isActive")} = true`);
    clauses.push(Prisma.sql`${couponColumn("validFrom")} <= ${now}`);
    clauses.push(
      Prisma.sql`(${validUntil} IS NULL OR ${validUntil} >= ${now})`,
    );
    clauses.push(
      Prisma.sql`(${usageLimit} IS NULL OR ${usageCount} < ${usageLimit})`,
    );
  }

  if (filters.type) {
    clauses.push(Prisma.sql`${couponColumn("type")} = ${filters.type}`);
  }

  if (filters.search) {
    const pattern = `%${filters.search}%`;
    clauses.push(
      Prisma.sql`(${couponColumn("code")} ILIKE ${pattern} OR ${couponColumn("name")} ILIKE ${pattern})`,
    );
  }

  if (clauses.length === 0) {
    return Prisma.empty;
  }

  return Prisma.sql`WHERE ${Prisma.join(clauses, " AND ")}`;
}

export async function getCoupons(
  filters: CouponFilters = {},
  pagination: CouponPagination = {},
): Promise<GetCouponsResult> {
  const { sortBy = "createdAt", sortOrder = "desc" } = pagination;
  const { skip, take, page, limit } = paginate(pagination);

  let total: number;
  let coupons: Coupon[];

  if (filters.status === "active" || filters.status === "limitReached") {
    const whereSql = buildRawCouponWhere(filters);
    const sortColumn = SORT_COLUMN_MAP[sortBy];
    const sortDirection =
      sortOrder === "asc" ? Prisma.raw("ASC") : Prisma.raw("DESC");
    const countResult = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM ${COUPONS_TABLE}
      ${whereSql}
    `;

    total = Number(countResult[0]?.count ?? 0n);
    const rawRows = await prisma.$queryRaw<CouponRawRow[]>`
      SELECT ${COUPON_SELECT_LIST}
      FROM ${COUPONS_TABLE}
      ${whereSql}
      ORDER BY ${sortColumn} ${sortDirection}
      LIMIT ${take}
      OFFSET ${skip}
    `;
    coupons = rawRows;
  } else {
    const where = buildCouponWhere(filters);
    [total, coupons] = await Promise.all([
      prisma.coupon.count({ where }),
      prisma.coupon.findMany({
        where,
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          type: true,
          discountValue: true,
          minReservationAmount: true,
          maxDiscountAmount: true,
          validFrom: true,
          validUntil: true,
          usageLimit: true,
          usageCount: true,
          isActive: true,
          canCombineWithDurationDiscount: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
        take,
      }),
    ]);
  }

  return {
    coupons: coupons.map(formatCoupon),
    total,
    page,
    limit,
    totalPages: calcTotalPages(total, limit),
  };
}

export async function getCouponById(
  id: string,
): Promise<CouponDetailData | null> {
  const coupon = await prisma.coupon.findUnique({
    where: { id },
  });

  if (!coupon) {
    return null;
  }

  return formatCouponDetail(coupon);
}
