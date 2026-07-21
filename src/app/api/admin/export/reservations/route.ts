import { unstable_rethrow } from "next/navigation";
import { checkPermission } from "@/admin/lib/action-auth";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { getReservationsForExport } from "@/shared/domain/reservations/export-queries";
import {
  isReservationTabFilter,
  type ReservationTabFilter,
} from "@/shared/lib/nuqs";
import { generateCsv } from "@/shared/lib/csv";
import {
  formatJstDateString,
  formatJstYmd,
  formatJstYmdHm,
  formatTimeShort,
} from "@/shared/lib/date-format";
import {
  RESERVATION_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { getRouteErrorStatus, jsonError } from "@/shared/lib/route-responses";

/**
 * 予約 CSV エクスポート
 *
 * @see docs/api-conventions.md — CSV/redirect は許可リスト（成功時のみ `new Response`）。
 *   エラー JSON は `jsonError` 経由。
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await checkPermission("reservation", "read", request.headers);
    if (!auth.success) {
      return jsonError(auth.error.error, getRouteErrorStatus(auth.error.error));
    }

    // Round-4 audit Finding #13: 一覧ページの現在の filter (tab/search/期間/
    // userId) を export にも反映する。CSV ボタンはこのクエリ文字列を含む href
    // を組み立てる (reservations/page.tsx 参照)。
    const url = new URL(request.url);
    const tabParam = url.searchParams.get("tab");
    const tab: ReservationTabFilter | undefined =
      tabParam !== null && isReservationTabFilter(tabParam)
        ? tabParam
        : undefined;
    const search = url.searchParams.get("search") ?? undefined;
    const startDate = url.searchParams.get("dateFrom") ?? undefined;
    const endDate = url.searchParams.get("dateTo") ?? undefined;
    const userId = url.searchParams.get("userId") ?? undefined;
    const spaceId = url.searchParams.get("spaceId") ?? undefined;

    const reservations = await getReservationsForExport({
      ...(tab !== undefined && { tab }),
      ...(search !== undefined && search !== "" && { search }),
      ...(startDate !== undefined && startDate !== "" && { startDate }),
      ...(endDate !== undefined && endDate !== "" && { endDate }),
      ...(userId !== undefined && userId !== "" && { userId }),
      ...(spaceId !== undefined && spaceId !== "" && { spaceId }),
    });

    await createAuditLogRecord({
      userId: auth.user.id,
      action: AuditAction.EXPORT,
      resource: "reservation",
      metadata: {
        format: "csv",
        exportedCount: reservations.length,
        ...(tab !== undefined && { filterTab: tab }),
        ...(search !== undefined && search !== "" && { filterSearch: search }),
        ...(userId !== undefined && userId !== "" && { filterUserId: userId }),
        ...(spaceId !== undefined &&
          spaceId !== "" && { filterSpaceId: spaceId }),
        ...(startDate !== undefined &&
          startDate !== "" && { filterStartDate: startDate }),
        ...(endDate !== undefined &&
          endDate !== "" && { filterEndDate: endDate }),
      },
    });

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
        header: "予約時氏名",
        accessor: (r) =>
          r.guestLastName
            ? `${r.guestLastName} ${r.guestFirstName ?? ""}`.trim()
            : null,
      },
      { header: "予約時電話", accessor: (r) => r.guestPhone },
      {
        header: "利用日",
        accessor: (r) => formatJstYmd(r.startTime),
      },
      { header: "開始", accessor: (r) => formatTimeShort(r.startTime) },
      { header: "終了", accessor: (r) => formatTimeShort(r.endTime) },
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
        accessor: (r) => formatJstYmdHm(r.createdAt),
      },
    ]);

    const filename = `reservations-${formatJstDateString(new Date()).replaceAll("-", "")}.csv`;

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        // 予約・顧客 PII の一括出力。共有・ブラウザ両キャッシュへの保存を禁止
        // （RFC 9111 §5.2.2.5 / .ics・calendar エンドポイントと同じ canonical な指定）
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "exportReservations" },
    });
    return jsonError("エクスポートに失敗しました", 500);
  }
}
