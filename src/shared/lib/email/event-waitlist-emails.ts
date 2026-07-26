/**
 * イベント キャンセル待ち（waitlist）関連メール
 *
 * 登録完了通知・繰り上げ当選通知・繰り上げ当選期限切れ通知の送信。
 * DB 読み込みは domain (`waitlist-queries.ts`) 側で行い、本モジュールは
 * 取得済み payload + render + send のみ担当する。
 *
 * @module shared/lib/email/event-waitlist-emails
 */

import "server-only";

import { EventWaitlistRegisteredEmail } from "@/shared/emails/event-waitlist-registered";
import { EventWaitlistOfferedEmail } from "@/shared/emails/event-waitlist-offered";
import { EventWaitlistExpiredEmail } from "@/shared/emails/event-waitlist-expired";
import { getEmailFooterData } from "@/shared/emails/_shared/footer-data";
import {
  formatDateWithWeekday,
  formatTimeShort,
} from "@/shared/lib/date-format";
import { formatPrice } from "@/shared/lib/pricing/format";
import { getAppUrl } from "@/shared/lib/constants";
import { createEventRegistrationClaimToken } from "@/shared/lib/event-registration-claim-token";
import { omitUndefined } from "../serialize";
import { buildEventRegistrationHubUrl } from "./event-emails";
import { sendEmail } from "./send";
import type { EmailResult } from "./types";

export type WaitlistEmailRegistrationData = {
  readonly id: string;
  readonly name: string;
  readonly customerId: string | null;
  readonly slotId: string;
  readonly ticketId: string;
  readonly quantity: number;
  readonly waitlistedAt: Date | null;
  readonly eventTitle: string;
  readonly eventSlug: string;
  readonly slotStartAt: Date;
  readonly slotEndAt: Date;
  readonly ticketName: string;
};

/** ゲスト（customerId なし）向け: マイページに追加する claim リンク。会員は undefined。 */
function buildClaimUrl(
  customerId: string | null,
  registrationId: string,
): string | undefined {
  if (customerId) return undefined;
  return `${getAppUrl()}/claim/event-registration?token=${createEventRegistrationClaimToken(registrationId)}`;
}

/**
 * キャンセル待ち登録完了メールを送信。
 */
export async function sendEventWaitlistRegistered(args: {
  registration: WaitlistEmailRegistrationData;
  position: number;
  to: string;
}): Promise<EmailResult> {
  const { registration } = args;
  const footer = await getEmailFooterData();

  const eventDate = formatDateWithWeekday(registration.slotStartAt);
  const startTime = formatTimeShort(registration.slotStartAt);
  const endTime = formatTimeShort(registration.slotEndAt);

  return sendEmail({
    payload: {
      to: args.to,
      subject: `【${footer.siteName}】キャンセル待ちに登録しました - ${registration.eventTitle}`,
      react: EventWaitlistRegisteredEmail(
        omitUndefined({
          customerName: registration.name,
          eventTitle: registration.eventTitle,
          eventDate,
          startTime,
          endTime,
          quantity: registration.quantity,
          ticketName: registration.ticketName,
          position: args.position,
          eventRegistrationHubUrl: buildEventRegistrationHubUrl(
            registration.customerId,
            registration.id,
          ),
          claimUrl: buildClaimUrl(registration.customerId, registration.id),
          footer,
        }),
      ),
    },
    idempotencyKey: `event-waitlist-registered/${registration.id}`,
    operation: "sendEventWaitlistRegistered",
    context: { registrationId: registration.id },
  });
}

/**
 * 繰り上げ当選通知メールを送信。
 *
 * `expiresAt` を idempotencyKey に含めることで、offer window（24h）ごとに
 * 一意な送信になる（同一 registrationId が再度 waitlist → 再 offer された場合、
 * 前回と異なる key になり Resend の idempotency で誤って抑止されない）。
 */
export async function sendEventWaitlistOffered(args: {
  registration: WaitlistEmailRegistrationData;
  to: string;
  expiresAt: Date;
  paymentContext:
    | { kind: "free"; confirmUrl: string }
    | { kind: "paid"; checkoutUrl: string; price: number };
}): Promise<EmailResult> {
  const { registration } = args;
  const footer = await getEmailFooterData();
  const eventDate = formatDateWithWeekday(registration.slotStartAt);
  const startTime = formatTimeShort(registration.slotStartAt);
  const endTime = formatTimeShort(registration.slotEndAt);
  const expiresAtDate = formatDateWithWeekday(args.expiresAt);
  const expiresAtTime = formatTimeShort(args.expiresAt);

  const isPaid = args.paymentContext.kind === "paid";
  const actionUrl =
    args.paymentContext.kind === "free"
      ? args.paymentContext.confirmUrl
      : args.paymentContext.checkoutUrl;
  const priceDisplay =
    args.paymentContext.kind === "paid"
      ? formatPrice(args.paymentContext.price)
      : undefined;

  const subject = isPaid
    ? `【${footer.siteName}】繰り上げ当選のお知らせ（要お支払い） - ${registration.eventTitle}`
    : `【${footer.siteName}】繰り上げ当選のお知らせ - ${registration.eventTitle}`;

  return sendEmail({
    payload: {
      to: args.to,
      subject,
      react: EventWaitlistOfferedEmail(
        omitUndefined({
          customerName: registration.name,
          eventTitle: registration.eventTitle,
          eventDate,
          startTime,
          endTime,
          quantity: registration.quantity,
          expiresAtDate,
          expiresAtTime,
          actionUrl,
          eventRegistrationHubUrl: buildEventRegistrationHubUrl(
            registration.customerId,
            registration.id,
          ),
          isPaid,
          priceDisplay,
          footer,
        }),
      ),
    },
    idempotencyKey: `event-waitlist-offered/${registration.id}/${args.expiresAt.getTime()}`,
    operation: "sendEventWaitlistOffered",
    context: { registrationId: registration.id },
  });
}

/**
 * 繰り上げ当選の期限切れ通知メールを送信。
 */
export async function sendEventWaitlistExpired(args: {
  registration: WaitlistEmailRegistrationData;
  to: string;
}): Promise<EmailResult> {
  const { registration } = args;
  const footer = await getEmailFooterData();
  const eventUrl = `${getAppUrl()}/events/${registration.eventSlug}`;

  return sendEmail({
    payload: {
      to: args.to,
      subject: `【${footer.siteName}】繰り上げ当選の期限切れ - ${registration.eventTitle}`,
      react: EventWaitlistExpiredEmail({
        customerName: registration.name,
        eventTitle: registration.eventTitle,
        eventUrl,
        footer,
      }),
    },
    idempotencyKey: `event-waitlist-expired/${registration.id}`,
    operation: "sendEventWaitlistExpired",
    context: { registrationId: registration.id },
  });
}
