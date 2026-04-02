import "server-only";

import { prisma, type Coupon } from "@/shared/db/prisma";
import {
  Prisma as PrismaNamespace,
  type Prisma,
} from "@generated/prisma/client";
import type {
  CouponData,
  CouponDetailData,
  CouponFilters,
  CouponPagination,
  CouponStatusFilter,
  GetCouponsResult,
} from "@/shared/domain/coupons/types";
import type { CouponType } from "@generated/prisma/enums";
import { toPlainObject } from "@/shared/lib/serialize";

const SORT_COLUMN_MAP = {
  code: PrismaNamespace.raw('"code"'),
  name: PrismaNamespace.raw('"name"'),
  createdAt: PrismaNamespace.raw('"createdAt"'),
  validFrom: PrismaNamespace.raw('"validFrom"'),
  usageCount: PrismaNamespace.raw('"usageCount"'),
} satisfies Record<NonNullable<CouponPagination["sortBy"]>, Prisma.Sql>;

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
  status: Exclude<CouponStatusFilter, "active" | "limitReached">,
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
    clauses.push(PrismaNamespace.sql`"isActive" = true`);
    clauses.push(PrismaNamespace.sql`"usageLimit" IS NOT NULL`);
    clauses.push(PrismaNamespace.sql`"usageCount" >= "usageLimit"`);
    clauses.push(PrismaNamespace.sql`"validFrom" <= ${now}`);
    clauses.push(
      PrismaNamespace.sql`("validUntil" IS NULL OR "validUntil" >= ${now})`,
    );
  }

  if (filters.status === "active") {
    clauses.push(PrismaNamespace.sql`"isActive" = true`);
    clauses.push(PrismaNamespace.sql`"validFrom" <= ${now}`);
    clauses.push(
      PrismaNamespace.sql`("validUntil" IS NULL OR "validUntil" >= ${now})`,
    );
    clauses.push(
      PrismaNamespace.sql`("usageLimit" IS NULL OR "usageCount" < "usageLimit")`,
    );
  }

  if (filters.type) {
    clauses.push(PrismaNamespace.sql`"type" = ${filters.type}`);
  }

  if (filters.search) {
    const pattern = `%${filters.search}%`;
    clauses.push(
      PrismaNamespace.sql`("code" ILIKE ${pattern} OR "name" ILIKE ${pattern})`,
    );
  }

  if (clauses.length === 0) {
    return PrismaNamespace.empty;
  }

  return PrismaNamespace.sql`WHERE ${PrismaNamespace.join(clauses, " AND ")}`;
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
      sortOrder === "asc"
        ? PrismaNamespace.raw("ASC")
        : PrismaNamespace.raw("DESC");
    const countResult = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "Coupon"
      ${whereSql}
    `;

    total = Number(countResult[0]?.count ?? 0n);
    coupons = await prisma.$queryRaw<Coupon[]>`
      SELECT *
      FROM "Coupon"
      ${whereSql}
      ORDER BY ${sortColumn} ${sortDirection}
      LIMIT ${limit}
      OFFSET ${(page - 1) * limit}
    `;
  } else {
    const where = buildCouponWhere(filters);
    [total, coupons] = await prisma.$transaction([
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

export type ValidatedCouponData = {
  id: string;
  code: string;
  name: string;
  type: CouponType;
  discountValue: number;
  maxDiscountAmount: number | null;
  canCombineWithDurationDiscount: boolean;
};

export type CouponValidationResult =
  | { valid: true; coupon: ValidatedCouponData }
  | { valid: false; errorMessage: string };

export async function validateCouponCodeQuery(
  code: string,
  reservationAmount?: number,
): Promise<CouponValidationResult> {
  const normalizedCode = code.toUpperCase().trim();
  const coupon = await prisma.coupon.findUnique({
    where: { code: normalizedCode },
  });
  const now = new Date();

  if (!coupon || !coupon.isActive) {
    return { valid: false, errorMessage: "無効なクーポンコードです" };
  }

  if (coupon.validFrom > now) {
    return { valid: false, errorMessage: "無効なクーポンコードです" };
  }
  if (coupon.validUntil && coupon.validUntil < now) {
    return { valid: false, errorMessage: "無効なクーポンコードです" };
  }
  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    return { valid: false, errorMessage: "無効なクーポンコードです" };
  }
  if (
    reservationAmount !== undefined &&
    coupon.minReservationAmount !== null &&
    reservationAmount < coupon.minReservationAmount
  ) {
    return {
      valid: false,
      errorMessage: `このクーポンは¥${coupon.minReservationAmount.toLocaleString()}以上のご利用で適用できます`,
    };
  }

  return {
    valid: true,
    coupon: {
      id: coupon.id,
      code: coupon.code,
      name: coupon.name,
      type: coupon.type,
      discountValue: coupon.discountValue,
      maxDiscountAmount: coupon.maxDiscountAmount,
      canCombineWithDurationDiscount: coupon.canCombineWithDurationDiscount,
    },
  };
}
