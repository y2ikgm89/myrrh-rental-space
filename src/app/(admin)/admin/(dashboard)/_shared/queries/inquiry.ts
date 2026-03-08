import "server-only";

import { z } from "zod";
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
import { requireAdminPermission } from "./_helpers";

const idSchema = z.string().uuid({ error: "お問い合わせIDが不正です" });

export async function getInquiries(
  filters: InquiryFilters = {},
  pagination: InquiryPagination = {},
): Promise<GetInquiriesResult> {
  await requireAdminPermission("inquiry", "read");
  return getInquiriesQuery(filters, pagination);
}

export async function getInquiryById(id: string): Promise<InquiryData | null> {
  await requireAdminPermission("inquiry", "read");

  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return null;
  }

  return getInquiryByIdQuery(validated.data);
}

export async function getInquiryStats(): Promise<InquiryStats> {
  await requireAdminPermission("inquiry", "read");
  return getInquiryStatsQuery();
}
