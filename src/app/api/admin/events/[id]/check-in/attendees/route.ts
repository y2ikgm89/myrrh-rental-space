import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { checkPermission } from "@/admin/lib/action-auth";
import { getEventCheckInAttendees } from "@/shared/domain/events/registration-queries";
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

const eventIdSchema = prismaCuidIdSchema("イベント");

type RouteParams = { params: Promise<{ id: string }> };

/**
 * 当日受付 (check-in) 画面の attendees 取得 endpoint。
 *
 * - 全件 JSON で返却 (検索/フィルタはクライアント側で実行)
 * - private, no-store: PII (氏名/電話) を含むため CDN/ブラウザどちらにもキャッシュさせない
 * - RBAC: event:read 権限が必要
 *
 * @see docs/api-conventions.md — status code 規約 / レスポンスヘルパー
 *   PII を含む成功レスポンスは `Cache-Control: private, no-store` を明示するため
 *   `jsonSuccess` ではなく `NextResponse.json` 直返しを許可している。
 */
export async function GET(
  request: Request,
  { params }: RouteParams,
): Promise<Response> {
  try {
    const auth = await checkPermission("event", "read", request.headers);
    if (!auth.success) {
      return jsonError(auth.error.error, getRouteErrorStatus(auth.error.error));
    }

    const { id } = await params;
    const parsed = eventIdSchema.safeParse(id);
    if (!parsed.success) {
      return jsonValidationError(parsed.error, "eventId が不正です");
    }

    const result = await getEventCheckInAttendees(parsed.data);

    return NextResponse.json(
      {
        registrations: result.registrations.map((r) => ({
          id: r.id,
          name: r.name,
          email: r.email,
          phone: r.phone,
          quantity: r.quantity,
          attendedAt: r.attendedAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
          ticket: r.ticket,
        })),
        totalRegistrations: result.totalRegistrations,
        totalQuantity: result.totalQuantity,
        attendedQuantity: result.attendedQuantity,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    unstable_rethrow(error);
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "getEventCheckInAttendees" },
    });
    return jsonError("出席者一覧の取得に失敗しました", 500);
  }
}
