import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { checkPermission } from "@/admin/lib/action-auth";
import { getAuditLogsForExport } from "@/shared/domain/audit-log/queries";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { generateCsv } from "@/shared/lib/csv";
import { formatJstDateString, formatJstYmdHm } from "@/shared/lib/date-format";
import {
  AUDIT_ACTION_LABELS,
  getAuditActionFilterOrAll,
} from "@/shared/lib/validations/enums/helpers";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
} from "@/shared/lib/errors/server";
import { getRouteErrorStatus } from "@/shared/lib/route-responses";
import { isRecord } from "@/shared/lib/serialize";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};

const auditLogExportQuerySchema = z.object({
  action: z.string().optional().default(""),
  resource: z.string().trim().max(100).optional().default(""),
  userId: z.uuid().or(z.literal("")).optional().default(""),
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
  search: z.string().trim().max(200).optional().default(""),
  ipAddress: z.string().trim().max(64).optional().default(""),
  securityOnly: z
    .enum(["1", "true", "on"])
    .optional()
    .transform((value) => value !== undefined),
});

function stringifyAuditJson(value: unknown): string {
  if (value === null || value === undefined) return "";
  return JSON.stringify(value);
}

function metadataString(value: unknown, key: string): string {
  if (!isRecord(value)) return "";
  const item = value[key];
  return typeof item === "string" ? item : "";
}

function noStoreJsonError(error: string, status: number): Response {
  return Response.json({ error }, { status, headers: NO_STORE_HEADERS });
}

/**
 * 監査ログ CSV エクスポート。
 *
 * auditLog:manage のみ許可する。export 操作自体も AuditAction.EXPORT として残す。
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await checkPermission("auditLog", "manage", request.headers);
    if (!auth.success) {
      return noStoreJsonError(
        auth.error.error,
        getRouteErrorStatus(auth.error.error),
      );
    }

    const params = Object.fromEntries(new URL(request.url).searchParams);
    const validated = auditLogExportQuerySchema.safeParse(params);
    if (!validated.success) {
      return noStoreJsonError(
        validated.error.issues[0]?.message ?? "入力内容に誤りがあります",
        400,
      );
    }

    const filters = {
      page: 1,
      perPage: 10_000,
      action: getAuditActionFilterOrAll(validated.data.action),
      resource: validated.data.resource,
      userId: validated.data.userId,
      dateFrom: validated.data.dateFrom,
      dateTo: validated.data.dateTo,
      search: validated.data.search,
      ipAddress: validated.data.ipAddress,
      securityOnly: validated.data.securityOnly,
    };

    const logs = await getAuditLogsForExport(filters);

    const csv = generateCsv(logs, [
      { header: "Sequence", accessor: (log) => log.sequence },
      { header: "日時", accessor: (log) => formatJstYmdHm(log.createdAt) },
      {
        header: "ユーザー",
        accessor: (log) => log.user?.email ?? log.user?.name ?? "",
      },
      {
        header: "アクション",
        accessor: (log) => AUDIT_ACTION_LABELS[log.action] ?? log.action,
      },
      { header: "リソース", accessor: (log) => log.resource },
      { header: "リソースID", accessor: (log) => log.resourceId },
      {
        header: "IPアドレス",
        accessor: (log) => metadataString(log.metadata, "ipAddress"),
      },
      {
        header: "User-Agent",
        accessor: (log) => metadataString(log.metadata, "userAgent"),
      },
      { header: "旧値", accessor: (log) => stringifyAuditJson(log.oldValue) },
      { header: "新値", accessor: (log) => stringifyAuditJson(log.newValue) },
      {
        header: "メタデータ",
        accessor: (log) => stringifyAuditJson(log.metadata),
      },
      { header: "Previous Hash", accessor: (log) => log.previousHash },
      { header: "Entry Hash", accessor: (log) => log.entryHash },
      { header: "Hash Key ID", accessor: (log) => log.hashKeyId },
      { header: "Chain Version", accessor: (log) => log.chainVersion },
    ]);

    await createAuditLogRecord({
      userId: auth.user.id,
      action: AuditAction.EXPORT,
      resource: "auditLog",
      metadata: {
        format: "csv",
        exportedCount: logs.length,
        filters,
      },
    });

    const filename = `audit-logs-${formatJstDateString(new Date()).replaceAll("-", "")}.csv`;

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        ...NO_STORE_HEADERS,
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "exportAuditLogs" },
    });
    return noStoreJsonError("エクスポートに失敗しました", 500);
  }
}
