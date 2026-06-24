import "server-only";

import { prisma, type Coupon } from "@/shared/db/prisma";
import { Prisma } from "@generated/prisma/client";
import type { Decimal } from "@prisma/client/runtime/client";
import type {
  CouponData,
  CouponDetailData,
  CouponFilters,
  CouponPagination,
  CouponStatusValue,
  GetCouponsResult,
} from "@/shared/domain/coupons/types";
import { toPlainObject } from "@/shared/lib/serialize";

/**
 * `$queryRaw` の戻り値型（findMany 経路の `Coupon` と物理列を 1:1 対応させる）。
 *
 * Prisma の `result` 拡張（`createAppPrismaClient` の Decimal→number 変換）は
 * model API（`prisma.coupon.findMany` 等）にのみ適用され、`$queryRaw` には
 * かからない（公式仕様）。Decimal 列はそのまま `Prisma.Decimal` インスタンスで
 * 返ってくるため、findMany 経路と型契約を揃えるには row mapping で number に
 * 正規化する必要がある。
 *
 * @see https://www.prisma.io/docs/orm/prisma-client/using-raw-sql/raw-queries
 */
type CouponRawRow = Omit<
  Coupon,
  "discountValue" | "minReservationAmount" | "maxDiscountAmount"
> & {
  discountValue: Decimal;
  minReservationAmount: Decimal | null;
  maxDiscountAmount: Decimal | null;
};

/**
 * `$queryRaw` で返ってきた `Prisma.Decimal` を `number` に正規化する。
 *
 * `Decimal` は number ではなくクラスインスタンス（`{ toString(): string }` を持つ
 * オブジェクト）なので、`typeof === "object"` で null と判別する。null は
 * そのまま維持する（findMany 経路の `Coupon` 型と整合）。
 */
function normalizeCouponRow(row: CouponRawRow): Coupon {
  return {
    ...row,
    discountValue: Number(row.discountValue),
    minReservationAmount:
      row.minReservationAmount === null
        ? null
        : Number(row.minReservationAmount),
    maxDiscountAmount:
      row.maxDiscountAmount === null ? null : Number(row.maxDiscountAmount),
  };
}

const SORT_COLUMN_MAP = {
  code: Prisma.raw('"code"'),
  name: Prisma.raw('"name"'),
  createdAt: Prisma.raw('"createdAt"'),
  validFrom: Prisma.raw('"validFrom"'),
  usageCount: Prisma.raw('"usageCount"'),
} satisfies Record<NonNullable<CouponPagination["sortBy"]>, Prisma.Sql>;

// raw SQL は物理テーブル名で実行される。Coupon モデルは @@map("coupons")
// （schema.prisma）でマップされているため、テーブル名を一箇所に集約してドリフトを防ぐ。
const COUPONS_TABLE = Prisma.raw('"coupons"');

const couponDateFormatter = new Intl.DateTimeFormat("ja-JP", {
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

function buildStatusWhereClause(
  status: Exclude<CouponStatusValue, "active" | "limitReached">,
): Prisma.CouponWhereInput {
  const now = new Date();

  switch (status) {
    case "inactive":
      return { isActive: false };
    case "expired":
      return {
        isActive: true,
        validUntil: { lt: now },
      };
    case "notStarted":
      return {
        isActive: true,
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

  if (filters.status === "limitReached") {
    clauses.push(Prisma.sql`"isActive" = true`);
    clauses.push(Prisma.sql`"usageLimit" IS NOT NULL`);
    clauses.push(Prisma.sql`"usageCount" >= "usageLimit"`);
    clauses.push(Prisma.sql`"validFrom" <= ${now}`);
    clauses.push(Prisma.sql`("validUntil" IS NULL OR "validUntil" >= ${now})`);
  }

  if (filters.status === "active") {
    clauses.push(Prisma.sql`"isActive" = true`);
    clauses.push(Prisma.sql`"validFrom" <= ${now}`);
    clauses.push(Prisma.sql`("validUntil" IS NULL OR "validUntil" >= ${now})`);
    clauses.push(
      Prisma.sql`("usageLimit" IS NULL OR "usageCount" < "usageLimit")`,
    );
  }

  if (filters.type) {
    clauses.push(Prisma.sql`"type" = ${filters.type}`);
  }

  if (filters.search) {
    const pattern = `%${filters.search}%`;
    clauses.push(
      Prisma.sql`("code" ILIKE ${pattern} OR "name" ILIKE ${pattern})`,
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
  const {
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = pagination;

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
    // 公式仕様: $queryRaw は Prisma の result 拡張をバイパスし、Decimal 列を
    // `Prisma.Decimal` インスタンスのまま返す。findMany 経路の `Coupon`
    // （Decimal→number 変換済）と型契約を揃えるため row mapping で正規化する。
    const rawRows = await prisma.$queryRaw<CouponRawRow[]>`
      SELECT *
      FROM ${COUPONS_TABLE}
      ${whereSql}
      ORDER BY ${sortColumn} ${sortDirection}
      LIMIT ${limit}
      OFFSET ${(page - 1) * limit}
    `;
    coupons = rawRows.map(normalizeCouponRow);
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
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
  }

  return {
    coupons: coupons.map(formatCoupon),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
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
