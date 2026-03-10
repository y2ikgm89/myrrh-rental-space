"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import {
  updateInquiryStatus as updateInquiryStatusCommand,
  deleteInquiry as deleteInquiryCommand,
} from "@/shared/domain/inquiries/commands";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { InquiryStatus } from "@/shared/db/enums";
import type { MutationResult } from "@/shared/lib/mutation-result";

const updateStatusSchema = z.object({
  id: z.string().uuid({ error: "お問い合わせIDが不正です" }),
  status: z.enum(InquiryStatus),
});

const idSchema = z.string().uuid({ error: "お問い合わせIDが不正です" });

export async function updateInquiryStatus(
  id: string,
  status: InquiryStatus,
): Promise<MutationResult> {
  const parsed = updateStatusSchema.safeParse({ id, status });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "inquiry",
    action: "update",
    resourceId: parsed.data.id,
    execute: async () => {
      await updateInquiryStatusCommand(parsed.data.id, parsed.data.status);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.INQUIRIES);
      updateTag(getCacheTag.inquiries.detail(parsed.data.id));
    },
  });
}

export async function deleteInquiry(id: string): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "inquiry",
    action: "delete",
    resourceId: validated.data,
    execute: async () => {
      await deleteInquiryCommand(validated.data);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.INQUIRIES);
    },
  });
}
