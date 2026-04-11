import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { checkPermission } from "@/admin/lib/action-auth";
import { getCustomersForExport } from "@/shared/domain/customers/export-queries";
import { generateCsv } from "@/shared/lib/csv";
import { format } from "date-fns";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";

export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await checkPermission("customer", "read", request.headers);
    if (!auth.success) {
      return NextResponse.json({ error: auth.error.error }, { status: 403 });
    }

    const customers = await getCustomersForExport();

    const csv = generateCsv(customers, [
      { header: "顧客ID", accessor: (c) => c.id.slice(0, 8).toUpperCase() },
      { header: "姓", accessor: (c) => c.lastName },
      { header: "名", accessor: (c) => c.firstName },
      { header: "姓カナ", accessor: (c) => c.lastNameKana },
      { header: "名カナ", accessor: (c) => c.firstNameKana },
      { header: "会社名", accessor: (c) => c.companyName },
      { header: "メール", accessor: (c) => c.email },
      { header: "電話番号", accessor: (c) => c.phoneNumber },
      { header: "住所", accessor: (c) => c.address },
      { header: "ステータス", accessor: (c) => c.status },
      { header: "予約回数", accessor: (c) => c.totalReservations },
      { header: "利用総額", accessor: (c) => c.totalSpent },
      {
        header: "最終予約日",
        accessor: (c) =>
          c.lastReservationAt ? format(c.lastReservationAt, "yyyy/MM/dd") : "",
      },
      {
        header: "初回予約日",
        accessor: (c) =>
          c.firstReservationAt
            ? format(c.firstReservationAt, "yyyy/MM/dd")
            : "",
      },
      { header: "有効", accessor: (c) => (c.isActive ? "はい" : "いいえ") },
      {
        header: "登録日",
        accessor: (c) => format(c.createdAt, "yyyy/MM/dd HH:mm"),
      },
    ]);

    const filename = `customers-${format(new Date(), "yyyyMMdd")}.csv`;

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
      context: { operation: "exportCustomers" },
    });
    return NextResponse.json(
      { error: "エクスポートに失敗しました" },
      { status: 500 },
    );
  }
}
