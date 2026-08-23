import { unstable_rethrow } from "next/navigation";
import { checkPermission } from "@/admin/lib/action-auth";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { getAdminAgreements } from "@/shared/domain/terms/admin-queries";
import { generateCsv } from "@/shared/lib/csv";
import { formatJstDateString, formatJstYmdHm } from "@/shared/lib/date-format";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import {
  TERMS_TYPE_LABELS,
  TERMS_SCOPE_LABELS,
  isTermsScope,
} from "@/shared/lib/validations/terms";
import {
  AuditAction,
  type TermsScope,
} from "@/shared/lib/validations/enums/prisma-types";
import { getRouteErrorStatus, jsonError } from "@/shared/lib/route-responses";
import {
  ADMIN_EXPORT_ROW_LIMIT,
  EXPORT_TRUNCATED_MESSAGE,
} from "@/shared/domain/exports/limits";

/**
 * 規約同意記録 CSV エクスポート
 *
 * 法務監査 (個情法 33 条 開示請求 / GDPR Art.30 / 民法 548 条の 4) 対応の
 * 証跡出力。RBAC: terms:update 必須 (PII 一括 export)。Cache-Control: private, no-store。
 *
 * フィルタ: scope / termsId / guestEmail。全件取得は perPage=10000 上限で
 * 1 回の query で出す (証跡は 1 ユーザー数件程度のため数十万行スケールは
 * 想定外)。
 */

function parseScope(value: string | null): TermsScope | undefined {
  if (value === null) return undefined;
  return isTermsScope(value) ? value : undefined;
}

function nonEmpty(value: string | null): string | undefined {
  return value !== null && value.length > 0 ? value : undefined;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await checkPermission("terms", "update", request.headers);
    if (!auth.success) {
      return jsonError(auth.error.error, getRouteErrorStatus(auth.error.error));
    }

    const url = new URL(request.url);
    const scope = parseScope(url.searchParams.get("scope"));
    const termsId = nonEmpty(url.searchParams.get("termsId"));
    const guestEmailKeyword = nonEmpty(url.searchParams.get("guestEmail"));

    const { items, total } = await getAdminAgreements({
      page: 1,
      perPage: ADMIN_EXPORT_ROW_LIMIT,
      ...(scope !== undefined && { scope }),
      ...(termsId !== undefined && { termsId }),
      ...(guestEmailKeyword !== undefined && { guestEmailKeyword }),
    });

    const filters = {
      ...(scope !== undefined && { scope }),
      ...(termsId !== undefined && { termsId }),
      ...(guestEmailKeyword !== undefined && { guestEmailKeyword }),
    };

    // 上限超過は **409 + 実件数**（監査 A-32）。
    //
    // 旧実装は先頭 10,000 行だけを返して `X-Export-Truncated: true` ヘッダを付けていたが、
    // CSV をダウンロードするブラウザはヘッダを見せないので、受け取った側は
    // **欠けていることに気づけない**。同じ証跡系の audit-logs は既に 409 を返しており、
    // 同一の状況で振る舞いが割れていた。
    if (total > ADMIN_EXPORT_ROW_LIMIT) {
      await createAuditLogRecord({
        userId: auth.user.id,
        action: AuditAction.EXPORT,
        resource: "terms",
        metadata: {
          format: "csv",
          truncated: true,
          totalCount: total,
          filters,
        },
      });
      return Response.json(
        { error: EXPORT_TRUNCATED_MESSAGE, totalCount: total },
        { status: 409 },
      );
    }

    await createAuditLogRecord({
      userId: auth.user.id,
      action: AuditAction.EXPORT,
      resource: "terms",
      metadata: {
        format: "csv",
        exportedCount: items.length,
        totalCount: total,
        filters,
      },
    });

    const csv = generateCsv(items, [
      { header: "同意ID", accessor: (a) => a.id },
      { header: "規約タイトル", accessor: (a) => a.terms.title },
      { header: "規約スラッグ", accessor: (a) => a.terms.slug },
      {
        header: "規約タイプ",
        accessor: (a) => TERMS_TYPE_LABELS[a.terms.type] ?? a.terms.type,
      },
      {
        header: "適用画面",
        accessor: (a) => TERMS_SCOPE_LABELS[a.scope],
      },
      { header: "同意日時", accessor: (a) => formatJstYmdHm(a.agreedAt) },
      {
        header: "顧客名",
        accessor: (a) =>
          a.customer ? `${a.customer.lastName} ${a.customer.firstName}` : "",
      },
      {
        header: "顧客メール",
        accessor: (a) => a.customer?.email ?? "",
      },
      {
        header: "ゲストメール",
        accessor: (a) => a.guestEmail ?? "",
      },
      {
        header: "リソースID",
        accessor: (a) => a.resourceId ?? "",
      },
      { header: "IPアドレス", accessor: (a) => a.ipAddress ?? "" },
      { header: "UserAgent", accessor: (a) => a.userAgent ?? "" },
      {
        header: "コンテンツハッシュ (sha256)",
        accessor: (a) => a.contentHash,
      },
    ]);

    const filename = `terms-agreements-${formatJstDateString(new Date()).replaceAll("-", "")}.csv`;

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "exportTermsAgreements" },
    });
    return jsonError("エクスポートに失敗しました", 500);
  }
}
