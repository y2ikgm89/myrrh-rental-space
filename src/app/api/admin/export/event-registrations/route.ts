import { unstable_rethrow } from "next/navigation";
import ExcelJS from "exceljs";
import { z } from "zod";
import { checkPermission } from "@/admin/lib/action-auth";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { getEventRegistrationsForExport } from "@/shared/domain/events/export-queries";
import { generateCsv } from "@/shared/lib/csv";
import { formatJstDateString, formatJstYmdHm } from "@/shared/lib/date-format";
import { REGISTRATION_STATUS_LABELS } from "@/shared/lib/validations/enums/helpers";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import {
  getRouteErrorStatus,
  jsonError,
  jsonValidationError,
} from "@/shared/lib/route-responses";
import { prismaCuidIdSchema } from "@/shared/lib/validations/params";
import type { CsvColumn } from "@/shared/lib/csv";

const eventIdSchema = prismaCuidIdSchema("イベント");
const exportFormatSchema = z.enum(["csv", "xlsx"], {
  error: "format が不正です",
});
const EXCEL_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type EventRegistrationExportRow = Awaited<
  ReturnType<typeof getEventRegistrationsForExport>
>[number];

const eventRegistrationExportColumns: CsvColumn<EventRegistrationExportRow>[] =
  [
    { header: "氏名", accessor: (r) => r.name },
    { header: "メール", accessor: (r) => r.email ?? "" },
    { header: "電話番号", accessor: (r) => r.phone },
    { header: "参加人数", accessor: (r) => r.quantity },
    {
      header: "ステータス",
      accessor: (r) => REGISTRATION_STATUS_LABELS[r.status],
    },
    { header: "備考", accessor: (r) => r.note },
    {
      header: "イベント名",
      accessor: (r) => r.event.title,
    },
    {
      header: "開催日時",
      accessor: (r) => formatJstYmdHm(r.event.startTime),
    },
    {
      header: "開催場所",
      accessor: (r) => r.event.location,
    },
    {
      header: "出席日時",
      accessor: (r) => (r.attendedAt ? formatJstYmdHm(r.attendedAt) : ""),
    },
    {
      header: "キャンセル日",
      accessor: (r) => (r.cancelledAt ? formatJstYmdHm(r.cancelledAt) : ""),
    },
    {
      header: "申込日",
      accessor: (r) => formatJstYmdHm(r.createdAt),
    },
  ];

async function generateEventRegistrationsWorkbook(
  registrations: EventRegistrationExportRow[],
): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Myrrh Rental Space";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet("イベント申込");
  worksheet.columns = eventRegistrationExportColumns.map((column) => ({
    header: column.header,
    key: column.header,
    width: Math.max(12, column.header.length * 2),
  }));
  worksheet.addRows(
    registrations.map((registration) =>
      Object.fromEntries(
        eventRegistrationExportColumns.map((column) => [
          column.header,
          column.accessor(registration) ?? "",
        ]),
      ),
    ),
  );
  worksheet.getRow(1).font = { bold: true };
  worksheet.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: EXCEL_CONTENT_TYPE });
}

/**
 * イベント申込者 CSV / Excel エクスポート
 *
 * @see docs/api-conventions.md — CSV/redirect は許可リスト（成功時のみ `new Response`）。
 *   エラー JSON は `jsonError` 経由。
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await checkPermission("event", "read", request.headers);
    if (!auth.success) {
      return jsonError(auth.error.error, getRouteErrorStatus(auth.error.error));
    }

    const { searchParams } = new URL(request.url);
    const eventIdParam = searchParams.get("eventId");
    const parsed = eventIdSchema.safeParse(eventIdParam);

    if (!parsed.success) {
      return jsonValidationError(parsed.error, "eventId が不正です");
    }

    const eventId = parsed.data;
    const formatParsed = exportFormatSchema.safeParse(
      searchParams.get("format") ?? "csv",
    );
    if (!formatParsed.success) {
      return jsonValidationError(formatParsed.error, "format が不正です");
    }

    const registrations = await getEventRegistrationsForExport(eventId);
    const dateSuffix = formatJstDateString(new Date()).replaceAll("-", "");

    await createAuditLogRecord({
      userId: auth.user.id,
      action: AuditAction.EXPORT,
      resource: "event",
      resourceId: eventId,
      metadata: {
        format: formatParsed.data,
        exportedCount: registrations.length,
      },
    });

    if (formatParsed.data === "xlsx") {
      const workbook = await generateEventRegistrationsWorkbook(registrations);
      return new Response(workbook, {
        headers: {
          "Content-Type": EXCEL_CONTENT_TYPE,
          "Content-Disposition": `attachment; filename="event-registrations-${dateSuffix}.xlsx"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    const csv = generateCsv(registrations, eventRegistrationExportColumns);
    const filename = `event-registrations-${dateSuffix}.csv`;

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        // 申込者 PII の一括出力。共有・ブラウザ両キャッシュへの保存を禁止
        // （RFC 9111 §5.2.2.5 / .ics・calendar エンドポイントと同じ canonical な指定）
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "exportEventRegistrations" },
    });
    return jsonError("エクスポートに失敗しました", 500);
  }
}
