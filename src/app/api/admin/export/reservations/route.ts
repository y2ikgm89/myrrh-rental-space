import { NextResponse } from "next/server";
import { checkPermission } from "@/admin/lib/action-auth";
import { getReservationsForExport } from "@/shared/domain/reservations/export-queries";
import { generateCsv } from "@/shared/lib/csv";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import {
  RESERVATION_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from "@/shared/lib/validations/enums/helpers";

export async function GET(request: Request): Promise<Response> {
  const auth = await checkPermission("reservation", "read", request.headers);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error.error }, { status: 403 });
  }

  const reservations = await getReservationsForExport();

  const csv = generateCsv(reservations, [
    { header: "予約ID", accessor: (r) => r.id.slice(0, 8).toUpperCase() },
    { header: "スペース", accessor: (r) => r.space.name },
    {
      header: "顧客名",
      accessor: (r) => `${r.customer.lastName} ${r.customer.firstName}`,
    },
    { header: "会社名", accessor: (r) => r.customer.companyName },
    { header: "メール", accessor: (r) => r.customer.email },
    { header: "電話番号", accessor: (r) => r.customer.phoneNumber },
    {
      header: "利用日",
      accessor: (r) => format(r.startTime, "yyyy/MM/dd", { locale: ja }),
    },
    { header: "開始", accessor: (r) => format(r.startTime, "HH:mm") },
    { header: "終了", accessor: (r) => format(r.endTime, "HH:mm") },
    { header: "基本料金", accessor: (r) => r.basePrice },
    { header: "割引額", accessor: (r) => r.couponDiscountAmount },
    { header: "合計", accessor: (r) => r.totalPrice },
    { header: "クーポン", accessor: (r) => r.coupon?.code },
    {
      header: "予約ステータス",
      accessor: (r) => RESERVATION_STATUS_LABELS[r.status] ?? r.status,
    },
    {
      header: "決済ステータス",
      accessor: (r) =>
        PAYMENT_STATUS_LABELS[r.paymentStatus] ?? r.paymentStatus,
    },
    { header: "備考", accessor: (r) => r.notes },
    {
      header: "作成日",
      accessor: (r) => format(r.createdAt, "yyyy/MM/dd HH:mm"),
    },
  ]);

  const filename = `reservations-${format(new Date(), "yyyyMMdd")}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
