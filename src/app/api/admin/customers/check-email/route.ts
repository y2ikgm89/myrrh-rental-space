/**
 * 顧客メールアドレス重複事前チェック API
 *
 * 顧客作成・編集フォームで onBlur 時に呼び出し、UNIQUE 制約 P2002 失敗を
 * 事前に画面上で警告するための軽量エンドポイント。
 *
 * 認証: 認証済み admin ロール（`checkAdminAuth`）
 * レスポンス: `{ available: boolean }` のみ（重複時の ID は漏洩防止のため返さない）
 *
 * @see docs/api-conventions.md — status code 規約 / レスポンスヘルパー
 */

import type { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { checkPermission } from "@/admin/lib/action-auth";
import { findCustomerByEmailExcept } from "@/shared/domain/customers/queries";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import {
  getRouteErrorStatus,
  jsonError,
  jsonSuccess,
  jsonValidationError,
} from "@/shared/lib/route-responses";

const querySchema = z.object({
  email: z.email(),
  excludeId: z.uuid().optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const auth = await checkPermission("customer", "read", request.headers);
    if (!auth.success) {
      return jsonError(auth.error.error, getRouteErrorStatus(auth.error.error));
    }

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      email: url.searchParams.get("email"),
      excludeId: url.searchParams.get("excludeId") ?? undefined,
    });
    if (!parsed.success) {
      return jsonValidationError(parsed.error, "Invalid query parameters");
    }

    const { email, excludeId } = parsed.data;

    const existing = await findCustomerByEmailExcept(email, excludeId);

    return jsonSuccess({ available: existing === null });
  } catch (error: unknown) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "checkCustomerEmail" },
    });
    return jsonError("Internal server error", 500);
  }
}
