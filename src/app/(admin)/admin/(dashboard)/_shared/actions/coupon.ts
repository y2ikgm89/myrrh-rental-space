"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  createCoupon as createCouponCommand,
  deleteCoupon as deleteCouponCommand,
  toggleCouponActive as toggleCouponActiveCommand,
  updateCoupon as updateCouponCommand,
} from "@/shared/domain/coupons/commands";
import {
  couponFormSchema,
  type CouponFormInput,
} from "@/shared/lib/validations/coupon";

const idSchema = z.string().uuid({ error: "クーポンIDが不正です" });

export async function createCoupon(
  input: CouponFormInput,
): Promise<MutationResult<{ id: string }>> {
  const parsed = couponFormSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "coupon",
    action: "create",
    execute: async () => createCouponCommand(parsed.data),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.COUPONS);
    },
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updateCoupon(
  id: string,
  input: CouponFormInput,
): Promise<MutationResult> {
  const validatedId = idSchema.safeParse(id);
  if (!validatedId.success) {
    return createValidationMutationError(validatedId.error);
  }

  const parsed = couponFormSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "coupon",
    action: "update",
    resourceId: validatedId.data,
    execute: async () => {
      await updateCouponCommand(validatedId.data, parsed.data);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.COUPONS);
      updateTag(getCacheTag.coupons.detail(validatedId.data));
    },
  });
}

export async function deleteCoupon(id: string): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "coupon",
    action: "delete",
    resourceId: validated.data,
    execute: async () => {
      await deleteCouponCommand(validated.data);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.COUPONS);
      updateTag(getCacheTag.coupons.detail(validated.data));
    },
  });
}

export async function toggleCouponActive(
  id: string,
): Promise<MutationResult<{ isActive: boolean }>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "coupon",
    action: "update",
    resourceId: validated.data,
    execute: async () => toggleCouponActiveCommand(validated.data),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.COUPONS);
      updateTag(getCacheTag.coupons.detail(validated.data));
    },
  });
}
