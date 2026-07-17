"use server";

/**
 * 顧客マイページから定期予約 (ReservationSeries) を series-all で自らキャンセル
 * するための Server Action (Phase B.2.1 Task 4)。
 *
 * spec §goal 9: `Settings.customerCanCancelSeriesInFull=true` のとき、顧客が
 * マイページから「定期予約すべてキャンセル」できる。false のときは admin
 * 問い合わせ導線のみ (本 action は Settings gate で reject)。
 *
 * 呼出フロー: rate limit → Turnstile → 認証 → customer 解決 → Settings gate →
 * `cancelCustomerReservationSeries` (domain, ownership + `cancelReservationSeriesCommand`
 * を `channel: "customer-mypage"` で invoke) → cache invalidation。
 *
 * customer-token 経由 (ゲストのメールリンク) は series には想定していない
 * (series は認証済み顧客の予約のみ想定、guest reservation は series を持たない)。
 */

import { z } from "zod";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { createMutationError } from "@/shared/lib/mutation-result";
import { getCustomerSession } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { cancelCustomerReservationSeries } from "@/shared/domain/reservations/customer-commands";
import { getCustomerCanCancelSeriesInFull } from "@/shared/domain/reservations/payloads";
import {
  checkActionRateLimit,
  validateTurnstile,
} from "@/shared/lib/action-helpers";
import {
  formSubmitRateLimiter,
  getClientIpFromHeaders,
} from "@/shared/lib/rate-limit";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import { invalidateReservationCaches } from "@/shared/lib/cache/reservation-cache";

const seriesIdSchema = z.uuid({ error: "series id が不正です" });

export async function cancelReservationSeriesCustomerAction(
  seriesId: string,
  cancellationReason: string | null = null,
  turnstileToken?: string,
): Promise<MutationResult<{ cancelledCount: number }>> {
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError("リクエストが多すぎます");

  const turnstile = await validateTurnstile({
    token: turnstileToken,
    expectedAction: TURNSTILE_ACTIONS.mypage_reservation_series_cancel,
  });
  if (!turnstile.success) return createMutationError("認証に失敗しました");

  const parsedId = seriesIdSchema.safeParse(seriesId);
  if (!parsedId.success) return createMutationError("series id が不正です");

  const session = await getCustomerSession();
  if (!session) return createMutationError("認証が必要です");

  const customer = await getCustomerByUserId(session.user.id);
  if (!customer) return createMutationError("顧客情報が見つかりません");

  // Settings gate (spec §goal 9): false のときはボタンが露出しない設計だが、
  // 直接 action を叩かれるケースに備えて server 側でも fail-closed する。
  const canCancel = await getCustomerCanCancelSeriesInFull();
  if (!canCancel) {
    return createMutationError(
      "この機能は現在利用できません。管理者にお問い合わせください。",
    );
  }

  const ip = await getClientIpFromHeaders();
  const result = await cancelCustomerReservationSeries(
    parsedId.data,
    customer.id,
    cancellationReason,
    { ip, userAgent: null },
  );
  if (!result.success) return createMutationError(result.error);

  invalidateReservationCaches(parsedId.data, customer.id, { coupons: true });
  return { cancelledCount: result.payload.cancelledCount };
}
