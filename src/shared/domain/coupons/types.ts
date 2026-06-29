import type { CouponType } from "@generated/prisma/enums";
import type { PaginationInput } from "@/shared/lib/pagination";
import type { Serialized } from "@/shared/lib/serialize";

type CouponRecord = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  type: CouponType;
  discountValue: number;
  minReservationAmount: number | null;
  maxDiscountAmount: number | null;
  validFrom: Date;
  validUntil: Date | null;
  usageLimit: number | null;
  usageCount: number;
  isActive: boolean;
  canCombineWithDurationDiscount: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CouponData = Serialized<CouponRecord>;
export type CouponDetailData = CouponData & {
  validFromLabel: string;
  validUntilLabel: string | null;
};

export type GetCouponsResult = {
  coupons: CouponData[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

/**
 * クーポンの派生表示ステータス（domain layer の SSoT）。
 *
 * `parseAsStringLiteral` ベースの URL filter 型（`@/shared/lib/nuqs` の
 * `CouponStatusFilter` = sentinel `"ALL"` 込み）とは責務を分離する:
 * - `CouponStatusValue`: domain 層・query 層・badge 層が扱う実ステータス値
 * - `CouponStatusFilter`: URL クエリのフィルター値（"ALL" sentinel 込み）
 */
export type CouponStatusValue =
  "active" | "inactive" | "expired" | "limitReached" | "notStarted";

export type CouponFilters = {
  status?: CouponStatusValue | undefined;
  type?: CouponType | undefined;
  search?: string | undefined;
};

export type CouponPagination = PaginationInput<
  "code" | "name" | "createdAt" | "validFrom" | "usageCount"
>;
