import "server-only";

import { isAdminOrHigherRole } from "@/shared/lib/admin-roles";
import {
  getInquiries as getInquiriesQuery,
  getInquiryById as getInquiryByIdQuery,
  getInquiryStats as getInquiryStatsQuery,
  listAssignableStaffQuery,
  listInquiryTagsQuery,
} from "@/shared/domain/inquiries/queries";
import type {
  AssignableStaffOption,
  GetInquiriesResult,
  InquiryFilters,
  InquiryPagination,
  InquiryStats,
  InquiryTagOption,
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

/** タグマスタ一覧 (フィルタ・タグ付与 UI・タグ管理ページ共通)。 */
export async function listInquiryTags(): Promise<InquiryTagOption[]> {
  await requireAdminPermission("inquiry", "read");
  return listInquiryTagsQuery();
}

/** 担当者アサイン候補のスタッフ一覧 (フィルタ・詳細サイドバー共通)。 */
export async function listAssignableStaff(): Promise<AssignableStaffOption[]> {
  await requireAdminPermission("inquiry", "read");
  return listAssignableStaffQuery();
}

/**
 * 詳細画面の内部メモ UI 用に、現在の操作者情報を返す。
 * `canDeleteOthersNotes` は ADMIN 以上のロールかどうか (deleteInquiryInternalNoteCommand
 * の権限判定と同じ SSoT `isAdminOrHigherRole` を使う)。
 */
export async function getInquiryActor(): Promise<{
  id: string;
  canDeleteOthersNotes: boolean;
}> {
  const user = await requireAdminPermission("inquiry", "read");
  return { id: user.id, canDeleteOthersNotes: isAdminOrHigherRole(user.role) };
}
