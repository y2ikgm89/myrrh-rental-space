import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { checkPermission } from "@/admin/lib/action-auth";
import { getEventRegistrationsForExport } from "@/shared/domain/events/export-queries";
import { generateCsv } from "@/shared/lib/csv";
import { formatJstDateString, formatJstYmdHm } from "@/shared/lib/date-format";
import { REGISTRATION_STATUS_LABELS } from "@/shared/lib/validations/enums/helpers";
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

const eventIdSchema = z.uuid({ error: "eventId が不正です" });

/**
 * イベント申込者 CSV エクスポート
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

    const registrations = await getEventRegistrationsForExport(eventId);

    const csv = generateCsv(registrations, [
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
    ]);

    const filename = `event-registrations-${formatJstDateString(new Date()).replaceAll("-", "")}.csv`;

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
