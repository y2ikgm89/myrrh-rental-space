import "server-only";

import { prisma } from "@/shared/db/prisma";
import { buildCustomerExportWhere } from "@/shared/domain/customers/queries";
import type { CustomerFilters } from "@/shared/domain/customers/types";
import {
  ADMIN_EXPORT_ROW_LIMIT,
  type ExportRowsResult,
} from "@/shared/domain/exports/limits";
import type { Prisma } from "@/shared/lib/validations/enums/prisma-types";

const CUSTOMER_EXPORT_SELECT = {
  id: true,
  lastName: true,
  firstName: true,
  lastNameKana: true,
  firstNameKana: true,
  companyName: true,
  customerType: true,
  email: true,
  phoneNumber: true,
  postalCode: true,
  prefecture: true,
  city: true,
  streetAddress: true,
  building: true,
  status: true,
  totalReservations: true,
  totalSpent: true,
  lastReservationAt: true,
  firstReservationAt: true,
  isActive: true,
  marketingOptIn: true,
  phoneContactOptIn: true,
  createdAt: true,
} as const satisfies Prisma.CustomerSelect;

export type CustomerExportRow = Prisma.CustomerGetPayload<{
  select: typeof CUSTOMER_EXPORT_SELECT;
}>;

/**
 * CSV 用の顧客行。**絞り込みと行数上限を受ける（監査 A-32）。**
 *
 * 以前は引数を 1 つも取らず `where` も `take` も無かったので、顧客が育ったときに
 * 管理者が範囲を狭める手段が UI にも URL にも存在しなかった。単一 SQL が
 * `statement_timeout`(15s) を超えれば route は 500 を返し、以後この機能は永久に
 * 成功しない（部分出力も無い）。免れた場合は巨大な配列と CSV 文字列が
 * 1Gi・1 インスタンスの admin ヒープに同時に載る。
 */
export async function getCustomersForExport(
  filters: CustomerFilters = {},
): Promise<ExportRowsResult<CustomerExportRow>> {
  const where = buildCustomerExportWhere(filters);
  const rows = await prisma.customer.findMany({
    where,
    select: CUSTOMER_EXPORT_SELECT,
    orderBy: { createdAt: "desc" },
    take: ADMIN_EXPORT_ROW_LIMIT + 1,
  });

  if (rows.length > ADMIN_EXPORT_ROW_LIMIT) {
    return {
      truncated: true,
      totalCount: await prisma.customer.count({ where }),
    };
  }
  return { truncated: false, rows };
}
