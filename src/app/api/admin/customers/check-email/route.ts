/**
 * 顧客メールアドレス重複候補チェック API
 *
 * Customer.email は所有権キーではなくなったため重複をブロックしない。
 * 同じ canonical email の候補有無を `duplicateCandidate` で返す。
 * 未リンク guest 同士の重複だけは DB の部分一意制約に当たるため、
 * `unlinkedDuplicateCandidate` も返す。
 *
 * 認証: customer:read 権限（`checkPermission`）
 * レスポンス: `{ duplicateCandidate: boolean, unlinkedDuplicateCandidate: boolean }`
 *
 * @see docs/api-conventions.md — status code 規約 / レスポンスヘルパー
 */

import type { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { checkPermission } from "@/admin/lib/action-auth";
import {
  findCustomerByEmailExcept,
  findGuestCustomerByEmailExcept,
} from "@/shared/domain/customers/queries";
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

    const [existing, existingGuest] = await Promise.all([
      findCustomerByEmailExcept(email, excludeId),
      findGuestCustomerByEmailExcept(email, excludeId),
    ]);

    return jsonSuccess({
      duplicateCandidate: existing !== null,
      unlinkedDuplicateCandidate: existingGuest !== null,
    });
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
