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
import { verifyCustomerSession } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { getCustomerReservationDetail } from "@/shared/domain/reservations/customer-queries";
import { getReservationDeadlineSettings } from "@/shared/domain/settings/public-queries";
import { getPublishedTermsByType } from "@/shared/domain/terms/queries";
import { CANCELLATION_POLICY_TERMS_TYPE } from "@/shared/lib/validations/terms";
import { isFeatureEnabled } from "@/shared/lib/features/check";
import { isWithinDeadline } from "@/shared/domain/reservations/deadline";
import { reservationDeadlineNow } from "@/shared/domain/reservations/server-deadline-instant";
import { ACTIVE_RESERVATION_STATUSES } from "@/shared/lib/validations/enums/helpers";
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
import { ReviewForm } from "./_components/review-form";
import { ReviewDisplay } from "./_components/review-display";
import { toAppRoute } from "@/shared/lib/typed-routes";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CANCELLABLE_STATUSES = new Set(ACTIVE_RESERVATION_STATUSES);

const REDIRECT_REASONS = ["status", "deadline", "discount"] as const;
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

  const { id } = await params;
  const sp = await searchParams;
  const reasonRaw = typeof sp["reason"] === "string" ? sp["reason"] : null;
  const reason: RedirectReason | null =
    reasonRaw && isRedirectReason(reasonRaw) ? reasonRaw : null;

  const { user } = await verifyCustomerSession();
  const customer = await getCustomerByUserId(user.id);

  if (!customer) {
    redirect("/login");
  }

  const [reservation, deadlineSettings] = await Promise.all([
    getCustomerReservationDetail(id, customer.id),
    getReservationDeadlineSettings(),
  ]);

  if (!reservation) {
    notFound();
  }

  const isCancellableStatus = CANCELLABLE_STATUSES.has(reservation.status);

  const now = reservationDeadlineNow();

  const canCancel =
    isCancellableStatus &&
    isWithinDeadline(
      reservation.startTime,
      deadlineSettings.cancellationDeadlineHours,
      now,
    );

  const hasManualDiscount =
    (reservation.couponDiscountAmount != null &&
      reservation.couponDiscountAmount > 0) ||
    (reservation.durationDiscountAmount != null &&
      reservation.durationDiscountAmount > 0) ||
    (reservation.spaceDiscountAmount != null &&
      reservation.spaceDiscountAmount > 0);

  const canEdit =
    isCancellableStatus &&
    !hasManualDiscount &&
    isWithinDeadline(
      reservation.startTime,
      deadlineSettings.modificationDeadlineHours,
      now,
    );

  const isCompleted = reservation.status === ReservationStatus.COMPLETED;

  const [existingReview, turnstileSiteKey, reviewsEnabled, cancellationPolicy] =
    await Promise.all([
      isCompleted
        ? getReviewForReservation(reservation.id, customer.id)
        : Promise.resolve(null),
      getTurnstileSiteKey(),
      isFeatureEnabled("reviews"),
      getPublishedTermsByType(CANCELLATION_POLICY_TERMS_TYPE),
    ]);
  const cancellationPolicyUrl = cancellationPolicy
    ? `/terms/${cancellationPolicy.slug}`
    : undefined;

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
          </p>
        </div>
      )}

      <ReservationDetail
        reservation={serializedReservation}
        deadlineSettings={deadlineSettings}
        cancellationPolicyUrl={cancellationPolicyUrl}
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
