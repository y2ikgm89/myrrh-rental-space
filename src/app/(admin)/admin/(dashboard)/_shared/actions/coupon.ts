"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutation } from "@/admin/lib/admin-action";
import { checkReadPermissionFor } from "@/admin/lib/permissions";
import {
  createSuccess,
  type ActionResult,
} from "@/admin/types/server-actions";
import { createValidationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import {
  createCoupon as createCouponCommand,
  deleteCoupon as deleteCouponCommand,
  toggleCouponActive as toggleCouponActiveCommand,
  updateCoupon as updateCouponCommand,
} from "@/shared/domain/coupons/commands";
import {
  getCouponById as getCouponByIdQuery,
  getCoupons as getCouponsQuery,
} from "@/shared/domain/coupons/queries";
import type {
  CouponData,
  CouponFilters,
  CouponPagination,
  GetCouponsResult,
} from "@/shared/domain/coupons/types";
import {
  couponFormSchema,
  type CouponFormInput,
} from "@/shared/lib/validations/coupon";

const checkReadPermission = checkReadPermissionFor("coupon");
const idSchema = z.string().uuid({ error: "クーポンIDが不正です" });

export async function getCoupons(
  filters: CouponFilters = {},
  pagination: CouponPagination = {},
): Promise<GetCouponsResult> {
  if (!(await checkReadPermission())) {
    return { coupons: [], total: 0, page: 1, limit: 10, totalPages: 0 };
  }

  return getCouponsQuery(filters, pagination);
}

export async function getCouponById(id: string): Promise<CouponData | null> {
  if (!(await checkReadPermission())) {
    return null;
  }

  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return null;
  }

  return getCouponByIdQuery(validated.data);
}

export async function createCoupon(
  input: CouponFormInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = couponFormSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "coupon",
    action: "create",
    execute: async () => createCouponCommand(parsed.data),
    success: (result) => createSuccess("クーポンを作成しました", result),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.COUPONS);
    },
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updateCoupon(
  id: string,
  input: CouponFormInput,
): Promise<ActionResult<void>> {
  const validatedId = idSchema.safeParse(id);
  if (!validatedId.success) {
    return createValidationError(validatedId.error);
  }

  const parsed = couponFormSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "coupon",
    action: "update",
    resourceId: validatedId.data,
    execute: async () => {
      await updateCouponCommand(validatedId.data, parsed.data);
    },
    success: () => createSuccess("クーポンを更新しました"),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.COUPONS);
      updateTag(getCacheTag.coupons.detail(validatedId.data));
    },
  });
}

export async function deleteCoupon(id: string): Promise<ActionResult<void>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationError(validated.error);
  }

  return executeAdminMutation({
    resource: "coupon",
    action: "delete",
    resourceId: validated.data,
    execute: async () => {
      await deleteCouponCommand(validated.data);
    },
    success: () => createSuccess("クーポンを削除しました"),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.COUPONS);
      updateTag(getCacheTag.coupons.detail(validated.data));
    },
  });
}

export async function toggleCouponActive(
  id: string,
): Promise<ActionResult<void>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationError(validated.error);
  }

  return executeAdminMutation({
    resource: "coupon",
    action: "update",
    resourceId: validated.data,
    execute: async () => toggleCouponActiveCommand(validated.data),
    success: (result) =>
      createSuccess(
        result.isActive ? "クーポンを有効化しました" : "クーポンを無効化しました",
        result,
      ),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.COUPONS);
      updateTag(getCacheTag.coupons.detail(validated.data));
    },
  });
}
