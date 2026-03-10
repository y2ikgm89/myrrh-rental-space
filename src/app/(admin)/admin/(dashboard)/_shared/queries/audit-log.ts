import "server-only";

import { z } from "zod";
import { AuditAction } from "@/shared/db/enums";
import {
  getAuditLogResources as getAuditLogResourcesQuery,
  getAuditLogs as getAuditLogsQuery,
  getAuditLogStats as getAuditLogStatsQuery,
  type AuditLogFilters,
  type AuditLogResult,
  type AuditLogStats,
} from "@/shared/domain/audit-log/queries";
import { requireAdminPermission } from "./_helpers";

const filtersSchema = z.object({
  page: z.number().int().positive().optional().default(1),
  perPage: z.number().int().positive().max(100).optional().default(50),
  action: z.enum(AuditAction).or(z.literal("ALL")).optional().default("ALL"),
  resource: z.string().optional().default(""),
  userId: z.string().uuid().optional().default(""),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "開始日の形式が不正です" })
    .or(z.literal(""))
    .optional()
    .default(""),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "終了日の形式が不正です" })
    .or(z.literal(""))
    .optional()
    .default(""),
});

export async function getAuditLogs(
  filters?: AuditLogFilters,
): Promise<AuditLogResult> {
  await requireAdminPermission("auditLog", "read");

  const validated = filtersSchema.safeParse(filters ?? {});
  if (!validated.success) {
    return { logs: [], total: 0, page: 1, totalPages: 1 };
  }

  return getAuditLogsQuery(validated.data);
}

export async function getAuditLogStats(): Promise<AuditLogStats> {
  await requireAdminPermission("auditLog", "read");
  return getAuditLogStatsQuery();
}

export async function getAuditLogResources(): Promise<string[]> {
  await requireAdminPermission("auditLog", "read");
  return getAuditLogResourcesQuery();
}
