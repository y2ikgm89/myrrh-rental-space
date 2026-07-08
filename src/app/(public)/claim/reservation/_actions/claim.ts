"use server";

import { cookies } from "next/headers";
import { verifyReservationClaimToken } from "@/shared/lib/reservation-claim-token";
import { reservationDeadlineNow } from "@/shared/domain/reservations/server-deadline-instant";
import { claimReservationForCustomer } from "@/shared/domain/reservations/claim-commands";
import { ensureCustomerLinked } from "@/shared/domain/customers/link";
import { getCustomerSession } from "@/shared/lib/customer-auth";
import { checkActionRateLimit } from "@/shared/lib/action-helpers";
import { formSubmitRateLimiter } from "@/shared/lib/rate-limit";
import {
  createMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory } from "@/shared/lib/errors/server";

// proxy.ts（Edge middleware、`next/server` の NextRequest/NextResponse に依存）から
// この定数を import すると、Node runtime の Server Action ファイルに Edge 専用の型が
// 引き込まれてしまうため、値だけをここに再宣言する（proxy.ts の
// `RESERVATION_CLAIM_TOKEN_COOKIE_NAME` と文字列を同期させること）。
const RESERVATION_CLAIM_TOKEN_COOKIE_NAME = "reservation-claim-token";

/**
 * ゲスト予約を現在ログイン中の会員アカウントへ再紐付けする（claim）。
 *
 * トークンは HttpOnly cookie（`reservation-claim-token`）から読む。client から
 * token を引き取らないため URL/ログへの漏洩経路を構造的に遮断する。
 *
 * セキュリティ階層:
 *  1. IP rate-limit（formSubmitRateLimiter）
 *  2. 顧客セッション必須（未ログインなら OAuth 導線へ）
 *  3. cookie からトークン取り出し → 暗号検証
 *  4. ensureCustomerLinked で会員 Customer を解決（初回は自動作成）
 *  5. claimReservationForCustomer の compare-and-swap（先着1名のみ成立）
 *  6. 監査ログ記録（fire-and-forget）
 */
export async function claimReservationAction(): Promise<
  MutationResult<{ reservationId: string }>
> {
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError(rateLimit.error);

  const session = await getCustomerSession();
  if (!session) return createMutationError("認証が必要です");

  const cookieStore = await cookies();
  const token = cookieStore.get(RESERVATION_CLAIM_TOKEN_COOKIE_NAME)?.value;
  if (!token) {
    return createMutationError("リンクの有効期限が切れました");
  }

  const verified = verifyReservationClaimToken(token, reservationDeadlineNow());
  if (!verified.valid) {
    return createMutationError("リンクの有効期限が切れました");
  }

  const { customer } = await ensureCustomerLinked(session.user);
  const result = await claimReservationForCustomer(
    verified.reservationId,
    customer.id,
  );
  if (!result.claimed) {
    return createMutationError(
      "この予約は既に別のアカウントに反映されているため、追加できませんでした",
    );
  }

  fireAndForget(
    createAuditLogRecord({
      userId: session.user.id,
      action: AuditAction.UPDATE,
      resource: "reservation",
      resourceId: verified.reservationId,
      newValue: { customerId: customer.id },
      metadata: { claim: true },
    }),
    { operation: "auditReservationClaim", category: ErrorCategory.DATABASE },
  );

  return { reservationId: verified.reservationId };
}
