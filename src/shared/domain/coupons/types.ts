import type { CouponType } from "@/shared/db/enums";
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

export type CouponStatusFilter =
  | "active"
  | "inactive"
  | "expired"
  | "limitReached"
  | "notStarted";

export type CouponFilters = {
  status?: CouponStatusFilter | undefined;
  type?: CouponType | undefined;
  search?: string | undefined;
};

export type CouponPagination = {
  page?: number;
  limit?: number;
  sortBy?: "code" | "name" | "createdAt" | "validFrom" | "usageCount";
  sortOrder?: "asc" | "desc";
};
