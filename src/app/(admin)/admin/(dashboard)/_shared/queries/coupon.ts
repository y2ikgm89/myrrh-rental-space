import "server-only";

import {
  getCouponById as getCouponByIdQuery,
  getCoupons as getCouponsQuery,
} from "@/shared/domain/coupons/queries";
import type {
  CouponDetailData,
  CouponFilters,
  CouponPagination,
  GetCouponsResult,
} from "@/shared/domain/coupons/types";
import { uuidIdSchema } from "@/shared/lib/validations/params";
import { requireAdminPermission } from "./_helpers";

const idSchema = uuidIdSchema("クーポン");

export async function getCoupons(
  filters: CouponFilters = {},
  pagination: CouponPagination = {},
): Promise<GetCouponsResult> {
  await requireAdminPermission("coupon", "read");
  return getCouponsQuery(filters, pagination);
}

export async function getCouponById(
  id: string,
): Promise<CouponDetailData | null> {
  await requireAdminPermission("coupon", "read");

  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return null;
  }

  return getCouponByIdQuery(validated.data);
}
