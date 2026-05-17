"use server";

/**
 * クーポン Server Actions
 *
 * `useActionState` 統合経路に clean break 移行。delete / publish 系は
 * input ベース (table 経由) で残置。
 */

import { updateTag } from "next/cache";
import type { SubmissionResult } from "@conform-to/react";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  createCoupon as createCouponCommand,
  deleteCoupon as deleteCouponCommand,
  updateCoupon as updateCouponCommand,
  updateCouponActive as updateCouponActiveCommand,
} from "@/shared/domain/coupons/commands";
import { couponFormSchema } from "@/shared/lib/validations/coupon";

const idSchema = z.string().uuid({ error: "クーポンIDが不正です" });

export async function createCoupon(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, couponFormSchema, async (data) => {
    const result = await executeAdminMutationResult({
      resource: "coupon",
      action: "create",
      execute: async () => createCouponCommand(data),
      afterSuccess: () => {
        updateTag(CACHE_TAGS.COUPONS);
      },
      resolveAuditResourceId: (result) => result.id,
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}

export async function updateCoupon(
  couponId: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, couponFormSchema, async (data) => {
    const idValid = idSchema.safeParse(couponId);
    if (!idValid.success) {
      return { ok: false, error: "クーポンIDが不正です" };
    }
    const result = await executeAdminMutationResult({
      resource: "coupon",
      action: "update",
      resourceId: idValid.data,
      execute: async () => {
        await updateCouponCommand(idValid.data, data);
        return null;
      },
      afterSuccess: () => {
        updateTag(CACHE_TAGS.COUPONS);
        updateTag(getCacheTag.coupons.detail(idValid.data));
      },
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
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

export async function updateCouponActive(
  id: string,
  isActive: boolean,
): Promise<MutationResult<{ isActive: boolean }>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "coupon",
    action: "update",
    resourceId: validated.data,
    execute: async () => updateCouponActiveCommand(validated.data, isActive),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.COUPONS);
      updateTag(getCacheTag.coupons.detail(validated.data));
    },
  });
}
