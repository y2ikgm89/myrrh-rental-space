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
import { validateTurnstile } from "@/shared/domain/settings/turnstile";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { assertCustomerActive } from "@/shared/domain/customers/guard";
import { assertLoginSignupReagreed } from "@/shared/lib/terms-consent-gate";
import { isFeatureEnabled } from "@/shared/domain/features/check";
import { DomainError } from "@/shared/domain/domain-error";
import { cancelCustomerReservationSeries } from "@/shared/domain/reservations/customer-commands";
import { getCustomerCanCancelSeriesInFull } from "@/shared/domain/reservations/payloads";
import { checkActionRateLimit } from "@/shared/lib/action-helpers";
import { formSubmitRateLimiter } from "@/shared/lib/rate-limit";
import { buildAuditRequestContext } from "@/shared/lib/audit-request-context";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import { invalidateReservationSeriesCaches } from "@/shared/lib/cache/reservation-cache";

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

  try {
    await assertCustomerActive(customer.id);
    await assertLoginSignupReagreed(customer.id);
  } catch (error) {
    if (error instanceof DomainError) {
      return createMutationError(error.message);
    }
    throw error;
  }

  // FEAT-3PLANE-02 (Codex #1433): reservation feature gate。ボタンが露出しない
  // 設計でも、action を直接叩かれるケースに備えて server 側でも fail-closed する
  // (下記 Settings gate と同型パターン)。
  if (!(await isFeatureEnabled("reservation"))) {
    return createMutationError(
      "この機能は現在利用できません。管理者にお問い合わせください。",
    );
  }

  // Settings gate (spec §goal 9): false のときはボタンが露出しない設計だが、
  // 直接 action を叩かれるケースに備えて server 側でも fail-closed する。
  const canCancel = await getCustomerCanCancelSeriesInFull();
  if (!canCancel) {
    return createMutationError(
      "この機能は現在利用できません。管理者にお問い合わせください。",
    );
  }

  // UA-HORIZ-01: 以前は userAgent=null 固定で、顧客セッション濫用時の forensics
  // (UA fingerprint 不一致検知) が silently 弱かった。admin 側 series キャンセル
  // (buildAuditRequestContext) と経路を揃え、AuditLog metadata の対称性を担保する。
  const request = await buildAuditRequestContext();
  const result = await cancelCustomerReservationSeries(
    parsedId.data,
    customer.id,
    cancellationReason,
    request,
  );
  if (!result.success) return createMutationError(result.error);

  // CRITIC-5: 以前は `invalidateReservationCaches(seriesId, ...)` を呼んで
  // `reservations-<seriesId>` という dead tag を emit していた
  // (`getCacheTag.reservations.detail` の producer は Reservation 単体側のみ)。
  // 現時点では site-wide `RESERVATIONS` タグでも invalidate されるため実害は
  // ないが、将来 detail-only invalidator を分離した瞬間 silent stale になる。
  // series 経路用の helper に切り替え、dead tag を残さない。
  //
  // instanceIds は customer 経路 (customer-commands.ts の
  // `cancelCustomerReservationSeries`) が現状返り値に含めていないため未指定。
  // site-wide `RESERVATIONS` タグで list / detail 両方が invalidate されるので
  // 顧客体感は変わらない。将来 customer-commands.ts 側で
  // `cancelledReservationIds` を expose したら `instanceIds` を渡す。
  invalidateReservationSeriesCaches(parsedId.data, customer.id, {
    coupons: true,
  });
  return { cancelledCount: result.payload.cancelledCount };
}
