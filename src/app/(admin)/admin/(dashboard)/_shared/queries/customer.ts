import "server-only";

import {
  getCustomerById as getCustomerByIdQuery,
  getCustomerStats as getCustomerStatsQuery,
  getCustomers as getCustomersQuery,
  searchCustomers as searchCustomersQuery,
} from "@/shared/domain/customers/queries";
import type {
  CustomerFilters,
  CustomerPagination,
  CustomerSearchResult,
  CustomerStats,
  CustomerWithReservationsAndAccount,
  GetCustomersResult,
} from "@/shared/domain/customers/types";
import { uuidIdSchema } from "@/shared/lib/validations/params";
import { requireAdminPermission } from "./_helpers";

const idSchema = uuidIdSchema("顧客");

export async function getCustomers(
  filters: CustomerFilters = {},
  pagination: CustomerPagination = {},
): Promise<GetCustomersResult> {
  await requireAdminPermission("customer", "read");
  return getCustomersQuery(filters, pagination);
}

export async function getCustomerById(
  id: string,
): Promise<CustomerWithReservationsAndAccount | null> {
  await requireAdminPermission("customer", "read");

  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return null;
  }

  return getCustomerByIdQuery(validated.data);
}

export async function getCustomerStats(): Promise<CustomerStats> {
  await requireAdminPermission("customer", "read");
  return getCustomerStatsQuery();
}

export async function searchCustomers(
  query: string,
): Promise<CustomerSearchResult[]> {
  await requireAdminPermission("customer", "read");
  return searchCustomersQuery(query);
}
