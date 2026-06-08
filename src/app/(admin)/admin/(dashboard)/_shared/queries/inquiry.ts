import "server-only";

import { z } from "zod";
import {
  getInquiries as getInquiriesQuery,
  getInquiryById as getInquiryByIdQuery,
  getInquiryStats as getInquiryStatsQuery,
} from "@/shared/domain/inquiries/queries";
import type {
  GetInquiriesResult,
  InquiryFilters,
  InquiryPagination,
  InquiryStats,
  InquiryWithCustomer,
} from "@/shared/domain/inquiries/types";
import type { Serialized } from "@/shared/lib/serialize";
import { requireAdminPermission } from "./_helpers";

const idSchema = z.uuid({ error: "お問い合わせIDが不正です" });

export async function getInquiries(
  filters: InquiryFilters = {},
  pagination: InquiryPagination = {},
): Promise<Serialized<GetInquiriesResult>> {
  await requireAdminPermission("inquiry", "read");
  return getInquiriesQuery(filters, pagination);
}

export async function getInquiryById(
  id: string,
): Promise<Serialized<InquiryWithCustomer> | null> {
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
