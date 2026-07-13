/**
 * イベント キャンセル待ち（waitlist）関連メール
 *
 * 登録完了通知・繰り上げ当選通知・繰り上げ当選期限切れ通知の送信。
 *
 * 他の `*-emails.ts`（`data: XxxEmailData` を受け取り、呼び出し側が既に読み込んだ
 * データを渡すパターン）とは異なり、この 3 関数は `registrationId` のみを受け取り
 * 自前で必要データを読み込む（`event-emails.ts` の `sendEventCancelledToAllParticipants`
 * 等と同型 — cron / 複数呼び出し元から ID だけで呼べることを優先した設計）。
 * そのため `@/shared/db/prisma` を直接 import する
 * （`__tests__/unit/architecture-boundaries.test.ts` の placement gate ALLOWLIST に
 * `event-emails.ts` / `inquiry-emails.ts` と並んで登録済み）。
 *
 * @module shared/lib/email/event-waitlist-emails
 */

import "server-only";

import { prisma } from "@/shared/db/prisma";
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
import { WAITLIST_ACTIVE_STATUSES } from "@/shared/lib/validations/enums/helpers";
import { omitUndefined } from "../serialize";
import { sendEmail } from "./send";
import type { EmailResult } from "./types";

/**
 * `EmailResult` に `reason: "not_found"`（registrationId に該当する申込が存在しない、
 * または削除済み等）を additive に加えたローカル型。共有 `EmailResult` union
 * 自体は他の全 sender が使う型のため変更しない。
 */
type WaitlistEmailResult = EmailResult | { ok: false; reason: "not_found" };

interface WaitlistEmailRegistration {
  id: string;
  name: string;
  customerId: string | null;
  slotId: string;
  ticketId: string;
  quantity: number;
  waitlistedAt: Date | null;
  eventTitle: string;
  eventSlug: string;
  slotStartAt: Date;
  slotEndAt: Date;
  ticketName: string;
}

/** 3 sender 共通のデータ読み込み。表示・リンク生成に必要な最小 select のみ。 */
async function loadRegistrationForEmail(
  registrationId: string,
): Promise<WaitlistEmailRegistration | null> {
  const registration = await prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    select: {
      id: true,
      name: true,
      customerId: true,
      slotId: true,
      ticketId: true,
      quantity: true,
      waitlistedAt: true,
      event: { select: { title: true, slug: true } },
      slot: { select: { startAt: true, endAt: true } },
      ticket: { select: { name: true } },
    },
  });
  if (!registration) return null;
  return {
    id: registration.id,
    name: registration.name,
    customerId: registration.customerId,
    slotId: registration.slotId,
    ticketId: registration.ticketId,
    quantity: registration.quantity,
    waitlistedAt: registration.waitlistedAt,
    eventTitle: registration.event.title,
    eventSlug: registration.event.slug,
    slotStartAt: registration.slot.startAt,
    slotEndAt: registration.slot.endAt,
    ticketName: registration.ticket.name,
  };
}

/** ゲスト（customerId なし）向け: マイページに追加する claim リンク。会員は undefined。 */
function buildClaimUrl(
  customerId: string | null,
  registrationId: string,
): string | undefined {
  if (customerId) return undefined;
  return `${getAppUrl()}/claim/event-registration?token=${createEventRegistrationClaimToken(registrationId)}`;
}

/** 会員（customerId あり）向け: マイページ申込一覧 URL。ゲストは undefined。 */
function buildMemberUrl(customerId: string | null): string | undefined {
  if (!customerId) return undefined;
  return `${getAppUrl()}/mypage/events`;
}

/**
 * FIFO キューにおける 1-indexed の現在順番を計算する。
 *
 * 同一 (slotId, ticketId) の `WAITLIST_ACTIVE_STATUSES`（WAITLISTED +
 * WAITLISTED_OFFERED）を `waitlistedAt` 昇順で数え、自分の `waitlistedAt` 以下の
 * 件数を返す（`offerNextWaitlistEntryCommand` の FIFO 選定条件と同じ
 * (slotId, ticketId) スコープ — スロット全体でなくチケット種別ごとに独立した
 * キューのため、ticketId を落とすと表示上の順番が実際の繰り上げ順と食い違う）。
 *
 * status は WAITLISTED 単独ではなく、`getWaitlistQueue`
 * （`waitlist-queries.ts`）と同じ SSoT `WAITLIST_ACTIVE_STATUSES` を使う:
 * 自分より前に WAITLISTED_OFFERED（オファー提示中だがまだキューの席を離脱して
 * いない）が存在する場合、それをカウントから除外すると実際より若い番号を
 * 表示してしまう（under-report）。WAITLISTED 単独への絞り込みに戻さないこと。
 *
 * `waitlistedAt` が null（WAITLISTED 作成直後の不変条件が崩れた異常系）の
 * 場合は非致命的に 1 をフォールバック値として返す。
 */
async function computeWaitlistPosition(
  registration: WaitlistEmailRegistration,
): Promise<number> {
  if (!registration.waitlistedAt) return 1;
  return prisma.eventRegistration.count({
    where: {
      slotId: registration.slotId,
      ticketId: registration.ticketId,
      status: { in: [...WAITLIST_ACTIVE_STATUSES] },
      waitlistedAt: { lte: registration.waitlistedAt },
    },
  });
}

/**
 * キャンセル待ち登録完了メールを送信。
 *
 * `registerWaitlistEntryCommand` 成功直後の呼び出し想定。
 */
export async function sendEventWaitlistRegistered(args: {
  registrationId: string;
  to: string;
}): Promise<WaitlistEmailResult> {
  const registration = await loadRegistrationForEmail(args.registrationId);
  if (!registration) return { ok: false, reason: "not_found" };

  const [position, footer] = await Promise.all([
    computeWaitlistPosition(registration),
    getEmailFooterData(),
  ]);

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
          position,
          memberEventRegistrationUrl: buildMemberUrl(registration.customerId),
          claimUrl: buildClaimUrl(registration.customerId, registration.id),
          footer,
        }),
      ),
    },
    idempotencyKey: `event-waitlist-registered/${args.registrationId}`,
    operation: "sendEventWaitlistRegistered",
    context: { registrationId: args.registrationId },
  });
}

/**
 * 繰り上げ当選通知メールを送信。
 *
 * `expireAndPromoteWaitlistForEventCommand` の `offered[]` 結果と
 * `getEventWaitlistOfferPaymentContext` の戻り値を呼び出し側が組み合わせて渡す。
 * `expiresAt` を idempotencyKey に含めることで、offer window（24h）ごとに
 * 一意な送信になる（同一 registrationId が再度 waitlist → 再 offer された場合、
 * 前回と異なる key になり Resend の idempotency で誤って抑止されない）。
 */
export async function sendEventWaitlistOffered(args: {
  registrationId: string;
  to: string;
  expiresAt: Date;
  paymentContext:
    | { kind: "free"; confirmUrl: string }
    | { kind: "paid"; checkoutUrl: string; price: number };
}): Promise<WaitlistEmailResult> {
  const registration = await loadRegistrationForEmail(args.registrationId);
  if (!registration) return { ok: false, reason: "not_found" };

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
          isPaid,
          priceDisplay,
          footer,
        }),
      ),
    },
    idempotencyKey: `event-waitlist-offered/${args.registrationId}/${args.expiresAt.getTime()}`,
    operation: "sendEventWaitlistOffered",
    context: { registrationId: args.registrationId },
  });
}

/**
 * 繰り上げ当選の期限切れ通知メールを送信。
 *
 * cron `waitlist-expire` の `expired[]` 結果に対して呼ばれる想定。
 */
export async function sendEventWaitlistExpired(args: {
  registrationId: string;
  to: string;
}): Promise<WaitlistEmailResult> {
  const registration = await loadRegistrationForEmail(args.registrationId);
  if (!registration) return { ok: false, reason: "not_found" };

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
    idempotencyKey: `event-waitlist-expired/${args.registrationId}`,
    operation: "sendEventWaitlistExpired",
    context: { registrationId: args.registrationId },
  });
}
