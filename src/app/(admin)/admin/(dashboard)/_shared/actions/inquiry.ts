"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutation } from "@/admin/lib/admin-action";
import {
  createSuccess,
  type ActionResult,
} from "@/admin/types/server-actions";
import { updateInquiryStatus as updateInquiryStatusCommand, deleteInquiry as deleteInquiryCommand } from "@/shared/domain/inquiries/commands";
import { createValidationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { InquiryStatus } from "@/shared/db/enums";

const updateStatusSchema = z.object({
  id: z.string().uuid({ error: "お問い合わせIDが不正です" }),
  status: z.enum(InquiryStatus),
});

const idSchema = z.string().uuid({ error: "お問い合わせIDが不正です" });

export async function updateInquiryStatus(
  id: string,
  status: InquiryStatus,
): Promise<ActionResult<void>> {
  const parsed = updateStatusSchema.safeParse({ id, status });
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "inquiry",
    action: "update",
    resourceId: parsed.data.id,
    execute: async () => {
      await updateInquiryStatusCommand(parsed.data.id, parsed.data.status);
    },
    success: () => createSuccess("ステータスを更新しました"),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.INQUIRIES);
      updateTag(getCacheTag.inquiries.detail(parsed.data.id));
    },
  });
}

export async function deleteInquiry(id: string): Promise<ActionResult<void>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationError(validated.error);
  }

  return executeAdminMutation({
    resource: "inquiry",
    action: "delete",
    resourceId: validated.data,
    execute: async () => {
      await deleteInquiryCommand(validated.data);
    },
    success: () => createSuccess("お問い合わせを削除しました"),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.INQUIRIES);
    },
  });
}
