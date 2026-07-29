/**
 * /mypage/events/[id] — イベント申込詳細ページ
 *
 * ログイン中の顧客が所有する申込のみ表示。領収書 DL・Checkout・キャンセル・
 * 参加 URL は一覧カードと同じ gate で出し分ける。
 */

import type { ReactElement } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import type { SearchParams } from "nuqs/server";
import { requireMypageSession } from "@/shared/lib/customer-auth/gates";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import {
  isFeatureEnabled,
  requireFeatureEnabled,
} from "@/shared/domain/features/check";
import { getCustomerEventRegistrationDetail } from "@/shared/domain/events/registration-queries";
import { eventDeadlineNow } from "@/shared/domain/events/server-deadline-instant";
import {
  eventRegistrationEditEligibilityErrorMessage,
  isEventRegistrationEditableForCustomerSelfServe,
  type EventRegistrationEditEligibilityReason,
} from "@/shared/domain/events/edit-eligibility";
import { findReceiptSerialNoByEventRegistrationId } from "@/shared/domain/receipts/queries";
import { getWaitlistPositionMapForRegistrations } from "@/shared/domain/events/waitlist-queries";
import { resolveTransferAccountsForCustomerDisplay } from "@/shared/domain/settings/transfer-account-queries";
import { getTurnstileSiteKey } from "@/shared/data/turnstile";
import { getValidPaymentStatus } from "@/shared/lib/validations/enums/helpers";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { toAppRoute } from "@/shared/lib/typed-routes";
import { EventRegistrationDetail } from "./_components/event-registration-detail";

interface PageProps {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<SearchParams>;
}

const REDIRECT_REASONS = ["status", "payment", "deadline"] as const;
const REDIRECT_REASON_SET = new Set<string>(REDIRECT_REASONS);
function isRedirectReason(
  value: string,
): value is EventRegistrationEditEligibilityReason {
  return REDIRECT_REASON_SET.has(value);
}

export default async function MypageEventRegistrationDetailPage({
  params,
  searchParams,
}: PageProps): Promise<ReactElement> {
  await connection();

  await requireFeatureEnabled("events");

  const { id } = await params;
  const sp = await searchParams;
  const reasonRaw = typeof sp["reason"] === "string" ? sp["reason"] : null;
  const reason: EventRegistrationEditEligibilityReason | null =
    reasonRaw && isRedirectReason(reasonRaw) ? reasonRaw : null;

  const { user } = await requireMypageSession();
  const customer = await getCustomerByUserId(user.id);

  if (!customer) {
    redirect("/login");
  }

  const registration = await getCustomerEventRegistrationDetail(
    id,
    customer.id,
  );

  if (!registration) {
    notFound();
  }

  const nowIso = eventDeadlineNow().toISOString();
  const now = eventDeadlineNow();
  const editEligibility = isEventRegistrationEditableForCustomerSelfServe({
    status: registration.status,
    paymentStatus: registration.paymentStatus,
    slotStartAt: registration.event.startTime,
    now,
  });
  const editHref = editEligibility.ok
    ? `/mypage/events/${registration.id}/edit`
    : null;

  const [
    receiptSerialNo,
    waitlistPositionMap,
    turnstileSiteKey,
    paymentEnabled,
  ] = await Promise.all([
    findReceiptSerialNoByEventRegistrationId(registration.id),
    getWaitlistPositionMapForRegistrations([
      {
        id: registration.id,
        slotId: registration.slotId,
        ticketId: registration.ticketId,
        waitlistedAt: registration.waitlistedAt,
      },
    ]),
    getTurnstileSiteKey(),
    isFeatureEnabled("payment"),
  ]);

  const transferDisplay = await resolveTransferAccountsForCustomerDisplay({
    paymentFeatureEnabled: paymentEnabled,
    paymentStatus: getValidPaymentStatus(registration.paymentStatus),
  });

  const serializedRegistration = {
    ...registration,
    createdAt: registration.createdAt.toISOString(),
    cancelledAt: registration.cancelledAt?.toISOString() ?? null,
    waitlistedAt: registration.waitlistedAt?.toISOString() ?? null,
    offeredAt: registration.offeredAt?.toISOString() ?? null,
    expiresAt: registration.expiresAt?.toISOString() ?? null,
    event: {
      ...registration.event,
      startTime: registration.event.startTime.toISOString(),
      endTime: registration.event.endTime.toISOString(),
    },
  };

  return (
    <Stack gap="lg" className="mx-auto max-w-2xl">
      <div>
        <Link
          href={toAppRoute("/mypage/events")}
          className="mb-4 inline-flex min-h-11 items-center text-sm text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-accent"
        >
          ← イベント一覧に戻る
        </Link>
        <Heading level={1}>イベント申込詳細</Heading>
      </div>

      {reason && (
        <div
          role="alert"
          className="border border-warning/30 bg-warning/5 p-4 text-sm"
        >
          <p className="font-medium text-foreground">
            申込変更ページから戻りました
          </p>
          <p className="mt-1 text-muted-foreground">
            {eventRegistrationEditEligibilityErrorMessage(reason)}
          </p>
        </div>
      )}

      <EventRegistrationDetail
        registration={serializedRegistration}
        ticketName={registration.ticketName}
        turnstileSiteKey={turnstileSiteKey}
        nowIso={nowIso}
        receiptSerialNo={receiptSerialNo}
        waitlistPosition={waitlistPositionMap.get(registration.id) ?? null}
        paymentEnabled={paymentEnabled}
        transferDisplay={transferDisplay}
        editHref={editHref}
      />
    </Stack>
  );
}
