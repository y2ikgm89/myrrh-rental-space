import { unstable_rethrow } from "next/navigation";
import { checkPermission } from "@/admin/lib/action-auth";
import { getCustomersForExport } from "@/shared/domain/customers/export-queries";
import { generateCsv } from "@/shared/lib/csv";
import {
  formatJstDateString,
  formatJstYmd,
  formatJstYmdHm,
} from "@/shared/lib/date-format";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import {
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { getRouteErrorStatus, jsonError } from "@/shared/lib/route-responses";

/**
 * 顧客 CSV エクスポート
 *
 * @see docs/api-conventions.md — CSV/redirect は許可リスト（成功時のみ `new Response`）。
 *   エラー JSON は `jsonError` 経由。
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await checkPermission("customer", "read", request.headers);
    if (!auth.success) {
      return jsonError(auth.error.error, getRouteErrorStatus(auth.error.error));
    }

    const customers = await getCustomersForExport();

    const csv = generateCsv(customers, [
      { header: "顧客ID", accessor: (c) => c.id.slice(0, 8).toUpperCase() },
      { header: "姓", accessor: (c) => c.lastName },
      { header: "名", accessor: (c) => c.firstName },
      { header: "姓カナ", accessor: (c) => c.lastNameKana },
      { header: "名カナ", accessor: (c) => c.firstNameKana },
      { header: "会社名", accessor: (c) => c.companyName },
      {
        header: "顧客タイプ",
        accessor: (c) => CUSTOMER_TYPE_LABELS[c.customerType],
      },
      { header: "メール", accessor: (c) => c.email },
      { header: "電話番号", accessor: (c) => c.phoneNumber },
      { header: "郵便番号", accessor: (c) => c.postalCode },
      { header: "都道府県", accessor: (c) => c.prefecture },
      { header: "市区町村", accessor: (c) => c.city },
      { header: "町名・番地", accessor: (c) => c.streetAddress },
      { header: "建物名", accessor: (c) => c.building },
      {
        header: "ステータス",
        accessor: (c) => CUSTOMER_STATUS_LABELS[c.status],
      },
      { header: "予約回数", accessor: (c) => c.totalReservations },
      { header: "利用総額", accessor: (c) => c.totalSpent },
      {
        header: "メルマガ受信",
        accessor: (c) => (c.marketingOptIn ? "可" : "不可"),
      },
      {
        header: "電話連絡",
        accessor: (c) => (c.phoneContactOptIn ? "可" : "不可"),
      },
      {
        header: "最終予約日",
        accessor: (c) =>
          c.lastReservationAt ? formatJstYmd(c.lastReservationAt) : "",
      },
      {
        header: "初回予約日",
        accessor: (c) =>
          c.firstReservationAt ? formatJstYmd(c.firstReservationAt) : "",
      },
      { header: "有効", accessor: (c) => (c.isActive ? "はい" : "いいえ") },
      {
        header: "登録日",
        accessor: (c) => formatJstYmdHm(c.createdAt),
      },
    ]);

    const filename = `customers-${formatJstDateString(new Date()).replaceAll("-", "")}.csv`;

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        // 顧客 PII の一括出力。共有・ブラウザ両キャッシュへの保存を禁止
        // （RFC 9111 §5.2.2.5 / .ics・calendar エンドポイントと同じ canonical な指定）
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "exportCustomers" },
    });
    return jsonError("エクスポートに失敗しました", 500);
  }
}
