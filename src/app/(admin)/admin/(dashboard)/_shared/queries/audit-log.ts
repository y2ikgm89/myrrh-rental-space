import "server-only";

import { z } from "zod";
import { AuditAction } from "@/shared/db/enums";
import {
  createSuccess,
  type ActionResult,
} from "@/admin/types/server-actions";
import { createValidationError } from "@/shared/lib/action-helpers";
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
): Promise<ActionResult<AuditLogResult>> {
  await requireAdminPermission("auditLog", "read");

  const validated = filtersSchema.safeParse(filters ?? {});
  if (!validated.success) {
    return createValidationError(validated.error, "入力が不正です");
  }

  const data = await getAuditLogsQuery(validated.data);
  return createSuccess("監査ログを取得しました", data);
}

export async function getAuditLogStats(): Promise<ActionResult<AuditLogStats>> {
  await requireAdminPermission("auditLog", "read");
  const data = await getAuditLogStatsQuery();
  return createSuccess("統計を取得しました", data);
}

export async function getAuditLogResources(): Promise<ActionResult<string[]>> {
  await requireAdminPermission("auditLog", "read");
  const data = await getAuditLogResourcesQuery();
  return createSuccess("リソース一覧を取得しました", data);
}
