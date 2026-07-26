"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { getCustomerVisibleSmartLockPasscodesForReservation } from "@/shared/domain/smart-lock/customer-passcode-queries";
import type { CustomerVisiblePasscode } from "@/shared/domain/smart-lock/customer-passcode-queries";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { assertCustomerActive } from "@/shared/domain/customers/guard";
import { getCustomerSession } from "@/shared/lib/customer-auth";
import { DomainError } from "@/shared/domain/domain-error";
import { RESERVATION_STATUS_TOKEN_COOKIE_NAME } from "@/shared/lib/constants";
import { verifyStatusToken } from "@/shared/lib/reservation-status-token";
import { reservationDeadlineNow } from "@/shared/domain/reservations/server-deadline-instant";
import {
  createMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import { checkActionRateLimit } from "@/shared/lib/action-helpers";
import {
  passcodeRevealByIpRateLimiter,
  passcodeRevealByUserRateLimiter,
} from "@/shared/lib/rate-limit";

const reservationIdSchema = z.uuid({ error: "予約IDが不正です" });

export type RevealReservationPasscodesData = {
  readonly status: "visible" | "pending" | "outside_window" | "unavailable";
  readonly passcodes: readonly CustomerVisiblePasscode[];
};

/**
 * 予約詳細ハブから暗証番号をオンデマンド開示する。
 *
 * - 会員: Better Auth session + reservation.customerId ownership
 * - ゲスト: cookie の reservation-status token の rid 一致
 * - 平文は本 action の戻り値のみ（RSC 初期 props には載せない）
 */
export async function revealReservationPasscodesAction(
  reservationId: string,
): Promise<MutationResult<RevealReservationPasscodesData>> {
  const ipLimit = await checkActionRateLimit(passcodeRevealByIpRateLimiter);
  if (!ipLimit.success) {
    return createMutationError(ipLimit.error);
  }

  const parsedId = reservationIdSchema.safeParse(reservationId);
  if (!parsedId.success) {
    return createMutationError("予約IDが不正です");
  }

  const now = reservationDeadlineNow();
  const cookieStore = await cookies();
  const statusToken =
    cookieStore.get(RESERVATION_STATUS_TOKEN_COOKIE_NAME)?.value ?? null;
  const verifiedToken = statusToken
    ? verifyStatusToken(statusToken, now)
    : { valid: false as const };

  // ゲスト status ハブは cookie が正本。ログイン中でも rid 一致 token があれば優先する。
  let auth:
    | { kind: "customer"; customerId: string }
    | { kind: "status-token"; reservationId: string };

  if (verifiedToken.valid && verifiedToken.reservationId === parsedId.data) {
    auth = {
      kind: "status-token",
      reservationId: verifiedToken.reservationId,
    };
  } else {
    const session = await getCustomerSession();
    const sessionUser = session?.user;
    if (!sessionUser) {
      if (statusToken && !verifiedToken.valid) {
        return createMutationError("リンクが無効または期限切れです");
      }
      return createMutationError("認証が必要です");
    }

    const userLimit = await passcodeRevealByUserRateLimiter.check(
      sessionUser.id,
    );
    if (!userLimit.success) {
      return createMutationError(
        "リクエストが多すぎます。しばらく経ってから再度お試しください。",
      );
    }

    const customer = await getCustomerByUserId(sessionUser.id);
    if (!customer) {
      return createMutationError("顧客情報が見つかりません");
    }
    try {
      await assertCustomerActive(customer.id);
    } catch (error) {
      if (error instanceof DomainError) {
        return createMutationError(error.message);
      }
      throw error;
    }
    auth = { kind: "customer", customerId: customer.id };
  }

  const result = await getCustomerVisibleSmartLockPasscodesForReservation(
    parsedId.data,
    auth,
    { reveal: true, now },
  );

  switch (result.status) {
    case "unauthorized":
      return createMutationError("権限がありません");
    case "unavailable":
      return {
        status: "unavailable",
        passcodes: [],
      };
    case "pending":
      return {
        status: "pending",
        passcodes: [],
      };
    case "outside_window":
      return {
        status: "outside_window",
        passcodes: [],
      };
    case "visible":
      if (!result.revealed) {
        return createMutationError("解錠番号を取得できませんでした");
      }
      return {
        status: "visible",
        passcodes: result.passcodes,
      };
    default: {
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }
}
