"use server";

import { z } from "zod";
import { updateTag } from "next/cache";
import type { SubmissionResult } from "@conform-to/react";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { purgeHomeCache } from "@/shared/lib/cloudflare";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  createAnnouncementBar as createAnnouncementBarCommand,
  deleteAnnouncementBar as deleteAnnouncementBarCommand,
  type AnnouncementBarInput,
  toggleAnnouncementBarActive as toggleAnnouncementBarActiveCommand,
  updateAnnouncementBar as updateAnnouncementBarCommand,
} from "@/shared/domain/settings/announcement-bar";
import { barFormSchema } from "../../settings/appearance/_components/announcement-bar/bar-form-schema";

const idSchema = z.string().uuid({ error: "IDが不正です" });

function invalidateAnnouncementBarCache(): void {
  updateTag(CACHE_TAGS.ANNOUNCEMENT_BAR);
  fireAndForget(purgeHomeCache(), {
    operation: "purgeHomeCache",
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.LOW,
  });
}

export async function deleteAnnouncementBar(
  id: string,
): Promise<MutationResult> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "announcementBar",
    action: "delete",
    resourceId: parsed.data,
    execute: async () => {
      await deleteAnnouncementBarCommand(parsed.data);
      return null;
    },
    afterSuccess: invalidateAnnouncementBarCache,
  });
}

export async function toggleAnnouncementBarActive(
  id: string,
): Promise<MutationResult> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "announcementBar",
    action: "update",
    resourceId: parsed.data,
    execute: async () => {
      await toggleAnnouncementBarActiveCommand(parsed.data);
      return null;
    },
    afterSuccess: invalidateAnnouncementBarCache,
  });
}

// =============================================================================
// Conform `useActionState` 用 Server Actions (Phase 1 Task 8.1)
//
// `(prev, formData) => SubmissionResult` signature。BarFormDialog (Variant A) で
// mount-on-open + bind 部分適用で利用される。
// =============================================================================

function toAnnouncementBarInput(
  data: z.output<typeof barFormSchema>,
): AnnouncementBarInput {
  return {
    message: data.message,
    linkUrl: data.linkUrl || null,
    linkText: data.linkText || null,
    bgColor: null,
    textColor: null,
    isActive: data.isActive,
    priority: data.priority,
    startAt: data.startAt || null,
    endAt: data.endAt || null,
  };
}

export async function createAnnouncementBarAction(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, barFormSchema, async (data) => {
    const input = toAnnouncementBarInput(data);
    const result = await executeAdminMutationResult({
      resource: "announcementBar",
      action: "create",
      execute: async () => createAnnouncementBarCommand(input),
      afterSuccess: invalidateAnnouncementBarCache,
      resolveAuditResourceId: (output) => output.id,
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}

export async function updateAnnouncementBarAction(
  id: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, barFormSchema, async (data) => {
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) {
      return { ok: false, error: "IDが不正です" };
    }

    const input = toAnnouncementBarInput(data);
    const result = await executeAdminMutationResult({
      resource: "announcementBar",
      action: "update",
      resourceId: parsedId.data,
      execute: async () => {
        await updateAnnouncementBarCommand(parsedId.data, input);
        return null;
      },
      afterSuccess: invalidateAnnouncementBarCache,
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}
