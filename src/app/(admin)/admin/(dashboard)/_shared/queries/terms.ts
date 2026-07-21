import "server-only";

import {
  getAdminTermsList as getAdminTermsListQuery,
  getDeletedTermsList as getDeletedTermsListQuery,
  getDeletedTermsCount as getDeletedTermsCountQuery,
  getAdminTermsById as getAdminTermsByIdQuery,
  getReagreeAffectedCustomerCount as getReagreeAffectedCustomerCountQuery,
  getAdminAgreements as getAdminAgreementsQuery,
} from "@/shared/domain/terms/admin-queries";
import type {
  AdminTermsListItem,
  AdminTermsDetail,
  AdminAgreementsFilter,
  AdminAgreementListItem,
} from "@/shared/domain/terms/admin-queries";
import { requireAdminPermission } from "./_helpers";

export async function getAdminTermsList(): Promise<AdminTermsListItem[]> {
  await requireAdminPermission("terms", "read");
  return getAdminTermsListQuery();
}

export async function getDeletedTermsList(): Promise<AdminTermsListItem[]> {
  await requireAdminPermission("terms", "read");
  return getDeletedTermsListQuery();
}

export async function getDeletedTermsCount(): Promise<number> {
  await requireAdminPermission("terms", "read");
  return getDeletedTermsCountQuery();
}

export async function getAdminTermsById(
  id: string,
): Promise<AdminTermsDetail | null> {
  await requireAdminPermission("terms", "read");
  return getAdminTermsByIdQuery(id);
}

export async function getReagreeAffectedCustomerCount(termsId: string) {
  await requireAdminPermission("terms", "read");
  return getReagreeAffectedCustomerCountQuery(termsId);
}

export async function getAdminAgreements(
  filter: AdminAgreementsFilter = {},
): Promise<{
  items: AdminAgreementListItem[];
  total: number;
}> {
  await requireAdminPermission("terms", "read");
  return getAdminAgreementsQuery(filter);
}
