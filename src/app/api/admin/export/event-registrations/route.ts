import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { checkPermission } from "@/admin/lib/action-auth";
import { getEventRegistrationsForExport } from "@/shared/domain/events/export-queries";
import { generateCsv } from "@/shared/lib/csv";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { REGISTRATION_STATUS_LABELS } from "@/shared/lib/validations/enums/helpers";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";

const eventIdSchema = z.string().uuid({ error: "eventId が不正です" });

export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await checkPermission("event", "read", request.headers);
    if (!auth.success) {
      return NextResponse.json({ error: auth.error.error }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const eventIdParam = searchParams.get("eventId");
    const parsed = eventIdSchema.safeParse(eventIdParam);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "eventId が不正です" },
        { status: 400 },
      );
    }

    const eventId = parsed.data;

    const registrations = await getEventRegistrationsForExport(eventId);

    const csv = generateCsv(registrations, [
      { header: "氏名", accessor: (r) => r.name },
      { header: "メール", accessor: (r) => r.email },
      { header: "電話番号", accessor: (r) => r.phone },
      { header: "参加人数", accessor: (r) => r.numberOfPeople },
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
        accessor: (r) =>
          format(r.event.startTime, "yyyy/MM/dd HH:mm", { locale: ja }),
      },
      {
        header: "開催場所",
        accessor: (r) => r.event.location,
      },
      {
        header: "キャンセル日",
        accessor: (r) =>
          r.cancelledAt
            ? format(r.cancelledAt, "yyyy/MM/dd HH:mm", { locale: ja })
            : "",
      },
      {
        header: "申込日",
        accessor: (r) =>
          format(r.createdAt, "yyyy/MM/dd HH:mm", { locale: ja }),
      },
    ]);

    const filename = `event-registrations-${format(new Date(), "yyyyMMdd")}.csv`;

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "exportEventRegistrations" },
    });
    return NextResponse.json(
      { error: "エクスポートに失敗しました" },
      { status: 500 },
    );
  }
}
