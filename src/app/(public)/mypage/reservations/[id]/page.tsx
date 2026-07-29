/**
 * /mypage/reservations/[id] — 予約詳細ページ
 *
 * 顧客の予約詳細を表示。キャンセル期限内かつキャンセル可能ステータスの場合のみキャンセルボタンを表示。
 */

import type { ReactElement } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import type { SearchParams } from "nuqs/server";
import { requireMypageSession } from "@/shared/lib/customer-auth/gates";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import {
  getCustomerReservationDetail,
  getCustomerReservationSeriesInfo,
} from "@/shared/domain/reservations/customer-queries";
import { findReceiptSerialNoByReservationId } from "@/shared/domain/receipts/queries";
import {
  getPublicRefundPolicySettings,
  getReservationDeadlineSettings,
} from "@/shared/domain/settings/public-queries";
import { formatRefundPolicyDisplayLines } from "@/shared/domain/refund/format-refund-policy-display";
import { getPublishedTermsByType } from "@/shared/domain/terms/queries";
import { CANCELLATION_POLICY_TERMS_TYPE } from "@/shared/lib/validations/terms";
import { isFeatureEnabled } from "@/shared/domain/features/check";
import { resolveTransferAccountsForCustomerDisplay } from "@/shared/domain/settings/transfer-account-queries";
import { isOnlinePaymentAvailable } from "@/shared/domain/payment/availability";
import { getValidPaymentStatus } from "@/shared/lib/validations/enums/helpers";
import { canCustomerInitiateCancellation } from "@/shared/domain/reservations/cancel-core";
import { reservationDeadlineNow } from "@/shared/domain/reservations/server-deadline-instant";
import { isReservationEditableForCustomerSelfServe } from "@/shared/domain/reservations/edit-eligibility";
import { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";
import { toPlainObject } from "@/shared/lib/serialize";
import { getReviewForReservation } from "@/shared/domain/reviews/public-queries";
import { Heading } from "@/public/components/design-system/heading";
import { Button } from "@/public/components/design-system/button";
import { Stack } from "@/public/components/design-system/stack";
import { Divider } from "@/public/components/design-system/divider";
import { getTurnstileSiteKey } from "@/shared/data/turnstile";
import { ReservationDetail } from "./_components/reservation-detail";
import { CancelButton } from "./_components/cancel-button";
import { CustomerSeriesInfo } from "./_components/customer-series-info";
import { getCustomerCanCancelSeriesInFull } from "@/shared/domain/reservations/payloads";
import { ReviewForm } from "./_components/review-form";
import { ReviewDisplay } from "./_components/review-display";
import { toAppRoute } from "@/shared/lib/typed-routes";
import { getPasscodeRevealState } from "@/shared/domain/smart-lock/customer-passcode-queries";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REDIRECT_REASONS = ["status", "deadline", "discount", "payment"] as const;
type RedirectReason = (typeof REDIRECT_REASONS)[number];
const REDIRECT_REASON_SET = new Set<string>(REDIRECT_REASONS);
function isRedirectReason(value: string): value is RedirectReason {
  return REDIRECT_REASON_SET.has(value);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface PageProps {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<SearchParams>;
}

export default async function ReservationDetailPage({
  params,
  searchParams,
}: PageProps): Promise<ReactElement> {
  await connection();

  // NOTE: 閲覧専用の本ページは意図的に requireFeatureEnabled("reservation") を
  // 掛けない。/mypage (bare, 非 gate) が常に `/mypage/reservations/${id}` への
  // リンクを含む予約一覧を表示するため、ここを 404 化すると reservation feature
  // OFF 時に /mypage 自身が dead link を大量に抱える regression になる
  // (Codex #1424 指摘)。予約変更・キャンセルという「新規ミューテーション」に
  // 相当する edit ページのみ gate し、過去予約の閲覧・領収書導線は
  // reservation feature の ON/OFF に関わらず残す
  // (mypage/terms/reagree の returnTo allowlist が過去予約詳細を証跡アクセスとして
  // 明示的に許可しているのと同じ設計判断)。

  const { id } = await params;
  const sp = await searchParams;
  const reasonRaw = typeof sp["reason"] === "string" ? sp["reason"] : null;
  const reason: RedirectReason | null =
    reasonRaw && isRedirectReason(reasonRaw) ? reasonRaw : null;

  const { user } = await requireMypageSession();
  const customer = await getCustomerByUserId(user.id);

  if (!customer) {
    redirect("/login");
  }

  const [
    reservation,
    deadlineSettings,
    seriesInfo,
    customerCanCancelSeriesInFull,
    reservationFeatureEnabled,
    refundPolicy,
  ] = await Promise.all([
    getCustomerReservationDetail(id, customer.id),
    getReservationDeadlineSettings(),
    getCustomerReservationSeriesInfo(id, customer.id),
    getCustomerCanCancelSeriesInFull(),
    isFeatureEnabled("reservation"),
    getPublicRefundPolicySettings(),
  ]);
  const refundPolicyLines = refundPolicy
    ? formatRefundPolicyDisplayLines(refundPolicy)
    : undefined;

  if (!reservation) {
    notFound();
  }

  const now = reservationDeadlineNow();

  const canCancel =
    reservationFeatureEnabled &&
    canCustomerInitiateCancellation({
      status: reservation.status,
      paymentStatus: reservation.paymentStatus,
      startTime: reservation.startTime,
      cancellationDeadlineHours: deadlineSettings.cancellationDeadlineHours,
      now,
    });

  const canEdit =
    reservationFeatureEnabled &&
    isReservationEditableForCustomerSelfServe({
      status: reservation.status,
      paymentStatus: reservation.paymentStatus,
      discountAmounts: {
        couponDiscountAmount: reservation.couponDiscountAmount,
        durationDiscountAmount: reservation.durationDiscountAmount,
        spaceDiscountAmount: reservation.spaceDiscountAmount,
      },
      startTime: reservation.startTime,
      modificationDeadlineHours: deadlineSettings.modificationDeadlineHours,
      now,
    }).ok;

  const isCompleted = reservation.status === ReservationStatus.COMPLETED;

  const [
    existingReview,
    turnstileSiteKey,
    reviewsEnabled,
    paymentEnabled,
    cancellationPolicy,
    receiptSerialNo,
    passcodeRevealState,
  ] = await Promise.all([
    isCompleted
      ? getReviewForReservation(reservation.id, customer.id)
      : Promise.resolve(null),
    getTurnstileSiteKey(),
    isFeatureEnabled("reviews"),
    isOnlinePaymentAvailable(),
    getPublishedTermsByType(CANCELLATION_POLICY_TERMS_TYPE),
    findReceiptSerialNoByReservationId(reservation.id),
    getPasscodeRevealState(
      reservation.id,
      { kind: "customer", customerId: customer.id },
      { now },
    ),
  ]);
  const cancellationPolicyUrl = cancellationPolicy
    ? `/terms/${cancellationPolicy.slug}`
    : undefined;

  const paymentFeatureEnabled = await isFeatureEnabled("payment");
  const transferDisplay = await resolveTransferAccountsForCustomerDisplay({
    paymentFeatureEnabled,
    paymentStatus: getValidPaymentStatus(reservation.paymentStatus),
  });

  const serializedReservation = toPlainObject({
    ...reservation,
    startTime: reservation.startTime.toISOString(),
    endTime: reservation.endTime.toISOString(),
    createdAt: reservation.createdAt.toISOString(),
    paidAt: reservation.paidAt ? reservation.paidAt.toISOString() : null,
    cancelledAt: reservation.cancelledAt
      ? reservation.cancelledAt.toISOString()
      : null,
  });

  return (
    <Stack gap="lg" className="mx-auto max-w-2xl">
      <Heading level={1}>予約詳細</Heading>

      {reason && (
        <div
          role="alert"
          className="border border-warning/30 bg-warning/5 p-4 text-sm"
        >
          <p className="font-medium text-foreground">
            予約変更ページから戻りました
          </p>
          <p className="mt-1 text-muted-foreground">
            {reason === "status" && "この予約は変更できないステータスです。"}
            {reason === "deadline" && "予約変更の受付期限を過ぎています。"}
            {reason === "discount" && (
              <>
                割引が適用されているため、オンラインでは変更できません。
                <Link
                  href={toAppRoute("/contact")}
                  className="ml-1 underline underline-offset-4 hover:text-foreground"
                >
                  お問い合わせください
                </Link>
                。
              </>
            )}
            {reason === "payment" &&
              "決済処理が開始された予約は変更できません。キャンセル後に新規予約をお願いいたします。"}
          </p>
        </div>
      )}

      {seriesInfo && (
        <CustomerSeriesInfo
          series={seriesInfo}
          customerCanCancelSeriesInFull={
            customerCanCancelSeriesInFull && reservationFeatureEnabled
          }
          turnstileSiteKey={turnstileSiteKey}
        />
      )}

      <ReservationDetail
        reservation={serializedReservation}
        deadlineSettings={deadlineSettings}
        cancellationPolicyUrl={cancellationPolicyUrl}
        refundPolicyLines={refundPolicyLines}
        paymentEnabled={paymentEnabled}
        receiptSerialNo={receiptSerialNo}
        passcodeRevealState={passcodeRevealState}
        transferDisplay={transferDisplay}
      />

      {(canEdit || canCancel) && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          {canEdit && (
            <Button
              size="sm"
              href={toAppRoute(`/mypage/reservations/${reservation.id}/edit`)}
            >
              予約を変更する
            </Button>
          )}
          {canCancel && (
            <CancelButton
              reservationId={reservation.id}
              turnstileSiteKey={turnstileSiteKey}
              refundPolicyLines={refundPolicyLines}
            />
          )}
        </div>
      )}

      {isCompleted && existingReview ? (
        <>
          <Divider variant="subtle" />
          <ReviewDisplay review={existingReview} />
        </>
      ) : null}

      {isCompleted && !existingReview ? (
        <>
          <Divider variant="subtle" />
          <ReviewForm
            key={reservation.id}
            reservationId={reservation.id}
            spaceName={reservation.space.name}
            reviewsEnabled={reservation.space.reviewsEnabled}
            reviewsFeatureEnabled={reviewsEnabled}
            turnstileSiteKey={turnstileSiteKey}
          />
        </>
      ) : null}
    </Stack>
  );
}
