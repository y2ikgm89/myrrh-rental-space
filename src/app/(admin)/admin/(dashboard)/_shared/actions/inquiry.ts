"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutation } from "@/admin/lib/admin-action";
import { checkReadPermissionFor } from "@/admin/lib/permissions";
import {
  createSuccess,
  type ActionResult,
} from "@/admin/types/server-actions";
import { updateInquiryStatus as updateInquiryStatusCommand, deleteInquiry as deleteInquiryCommand } from "@/shared/domain/inquiries/commands";
import {
  getInquiries as getInquiriesQuery,
  getInquiryById as getInquiryByIdQuery,
  getInquiryStats as getInquiryStatsQuery,
} from "@/shared/domain/inquiries/queries";
import type {
  GetInquiriesResult,
  InquiryData,
  InquiryFilters,
  InquiryPagination,
  InquiryStats,
} from "@/shared/domain/inquiries/types";
import { createValidationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { InquiryStatus } from "@/shared/db/enums";

const updateStatusSchema = z.object({
  id: z.string().uuid({ error: "お問い合わせIDが不正です" }),
  status: z.enum(InquiryStatus),
});

const idSchema = z.string().uuid({ error: "お問い合わせIDが不正です" });
const checkReadPermission = checkReadPermissionFor("inquiry");

export async function getInquiries(
  filters: InquiryFilters = {},
  pagination: InquiryPagination = {},
): Promise<GetInquiriesResult> {
  const canRead = await checkReadPermission();
  if (!canRead) {
    return { inquiries: [], total: 0, page: 1, limit: 10, totalPages: 0 };
  }

  return getInquiriesQuery(filters, pagination);
}

export async function getInquiryById(id: string): Promise<InquiryData | null> {
  const canRead = await checkReadPermission();
  if (!canRead) {
    return null;
  }

  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return null;
  }

  return getInquiryByIdQuery(validated.data);
}

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

export async function getInquiryStats(): Promise<InquiryStats> {
  const canRead = await checkReadPermission();
  if (!canRead) {
    return { total: 0, new: 0, inProgress: 0, resolved: 0, closed: 0 };
  }

  return getInquiryStatsQuery();
}
