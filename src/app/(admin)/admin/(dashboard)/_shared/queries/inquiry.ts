import "server-only";

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
import { uuidIdSchema } from "@/shared/lib/validations/params";
import { requireAdminPermission } from "./_helpers";

const idSchema = uuidIdSchema("お問い合わせ");

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
