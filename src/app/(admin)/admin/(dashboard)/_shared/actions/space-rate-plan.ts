"use server";

import type { SubmissionResult } from "@conform-to/react";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  createSpaceRatePlan,
  deleteSpaceRatePlan,
  updateSpaceRatePlan,
} from "@/shared/domain/spaces/rate-plan-commands";
import { spaceRatePlanFormSchema } from "@/admin/lib/validations/space-rate-plan";
import { prismaCuidIdSchema } from "@/shared/lib/validations/params";

const ratePlanIdSchema = prismaCuidIdSchema("料金プラン");

/**
 * 管理画面 新規 SpaceRatePlan 作成 — conform `useActionState` canonical
 *
 * `spaceRatePlanFormSchema` の出力は Task 6 `CreateSpaceRatePlanInput` と
 * 同形なので、そのまま `createSpaceRatePlan` に渡せる。cache invalidation
 * (`invalidateSpaceRatePlansCache`) は Task 6 の command 内で完結しているため、
 * ここでの `afterSuccess` は不要。
 */
export async function createSpaceRatePlanAction(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    spaceRatePlanFormSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "space",
        action: "create",
        execute: async () => createSpaceRatePlan(data),
        resolveAuditResourceId: (payload) => payload.id,
      });
      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
  );
}

/**
 * 管理画面 SpaceRatePlan 更新 — conform `useActionState` canonical
 *
 * id（SpaceRatePlan 自身の cuid）は `bind(null, ratePlan.id)` で部分適用する。
 * `spaceRatePlanFormSchema` は共有スキーマのため spaceId も parse するが、
 * `UpdateSpaceRatePlanInput`（Task 6）は spaceId を持たない（親 Space の
 * 付け替えは未対応の設計）ため、command 呼び出し前に除外する。
 * 存在しない id は `updateSpaceRatePlan` 内の `ensureSpaceRatePlanExists` が
 * `DomainError("NOT_FOUND")` を throw し、`executeAdminMutationResult` が
 * `MutationError` に変換する。
 */
export async function updateSpaceRatePlanAction(
  id: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  const validatedId = ratePlanIdSchema.safeParse(id);
  if (!validatedId.success) {
    return {
      status: "error",
      error: { "": ["料金プランIDが不正です"] },
    } satisfies SubmissionResult;
  }
  const ratePlanId = validatedId.data;

  return executeConformMutation(
    formData,
    spaceRatePlanFormSchema,
    async (data) => {
      // spaceId は UpdateSpaceRatePlanInput に存在しない（親 Space 付け替え不可）。
      // 破棄する前提を明示するため destructure + void で捨てる
      // （space.ts の buildSpaceCommandInput と同型のパターン）。
      const { spaceId: _spaceId, ...updateInput } = data;
      void _spaceId;

      const result = await executeAdminMutationResult({
        resource: "space",
        action: "update",
        resourceId: ratePlanId,
        execute: async () => updateSpaceRatePlan(ratePlanId, updateInput),
      });
      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
  );
}

/**
 * SpaceRatePlan を削除する。
 *
 * 存在しない id は `deleteSpaceRatePlan` 内の `ensureSpaceRatePlanExists` が
 * `DomainError("NOT_FOUND")` を throw し、`executeAdminMutationResult` が
 * `MutationError` に変換する。
 */
export async function deleteSpaceRatePlanAction(
  id: string,
): Promise<MutationResult<{ id: string }>> {
  const parsed = ratePlanIdSchema.safeParse(id);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "space",
    action: "delete",
    resourceId: parsed.data,
    execute: async () => {
      await deleteSpaceRatePlan(parsed.data);
      return { id: parsed.data };
    },
  });
}
