import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  PaymentStatus,
  RegistrationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { WAITLIST_ACTIVE_STATUSES } from "@/shared/lib/validations/enums/helpers";
import { getAppUrl } from "@/shared/lib/constants";
import { createWaitlistOfferToken } from "@/shared/lib/tokens/waitlist-offer-token";
import { formatEventVenue } from "./venue";

/**
 * 管理画面のキャンセル待ち一覧向けクエリ。
 *
 * 表示順は「status DESC, waitlistedAt ASC」。RegistrationStatus の文字列順で
 * WAITLISTED < WAITLISTED_OFFERED となるため、`status: "desc"` とすることで
 * 期限が迫る OFFERED（要対応）を一覧の先頭に表示できる。
 */
export async function getWaitlistQueue(eventId: string) {
  const rows = await prisma.eventRegistration.findMany({
    where: {
      eventId,
      status: { in: [...WAITLIST_ACTIVE_STATUSES] },
    },
    orderBy: [
      { status: "desc" }, // OFFERED を先、WAITLISTED を後 (視認性)
      { waitlistedAt: "asc" },
    ],
    select: {
      id: true,
      name: true,
      email: true,
      quantity: true,
      slotId: true,
      slot: { select: { startAt: true } },
      ticketId: true,
      ticket: { select: { name: true } },
      status: true,
      waitlistedAt: true,
      offeredAt: true,
      expiresAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    quantity: r.quantity,
    slotId: r.slotId,
    slotStartAt: r.slot.startAt,
    ticketId: r.ticketId,
    ticketName: r.ticket.name,
    // `where: {status: {in: WAITLIST_ACTIVE_STATUSES}}` により実行時は WAITLISTED /
    // WAITLISTED_OFFERED のみだが、Prisma の select 型は絞り込みを型に反映しないため
    // RegistrationStatus のまま返す（literal union への cast は避ける。呼び出し側は
    // RegistrationStatus.WAITLISTED / WAITLISTED_OFFERED と比較すればよい）。
    status: r.status,
    waitlistedAt: r.waitlistedAt,
    offeredAt: r.offeredAt,
    expiresAt: r.expiresAt,
  }));
}

/**
 * イベント詳細ページの「キャンセル待ち (N件)」リンク表示用の軽量カウント。
 *
 * `getWaitlistQueue` は slot/ticket を join して一覧行を組み立てるため、件数だけが
 * 欲しい呼び出し元 (`events/[id]/page.tsx`) ではこちらを使う（同ファイル内の
 * 「1 consumer = 1 query」方針を踏襲）。WHERE 条件は `getWaitlistQueue` と同じ
 * `WAITLIST_ACTIVE_STATUSES` を使い、表示件数の食い違いを防ぐ。
 */
export async function getWaitlistQueueCount(eventId: string): Promise<number> {
  return prisma.eventRegistration.count({
    where: {
      eventId,
      status: { in: [...WAITLIST_ACTIVE_STATUSES] },
    },
  });
}

/**
 * 繰り上げ当選確認ページ (`/events/waitlist/confirm` および
 * `/events/waitlist/checkout/[token]`) 向けの単票取得クエリ。
 *
 * WAITLISTED_OFFERED（確認待ち）/ CONFIRMED（確認済み）/ EXPIRED（期限切れ表示）の
 * 3 status のみ対象。WAITLISTED（まだ順番待ち）・CANCELLED はこのページの対象外。
 *
 * `paymentStatus` / `stripeCheckoutSessionId` は Fix commit（レビュー Important #3）
 * で追加: confirm page が「status: EXPIRED + paymentStatus: PENDING +
 * stripeCheckoutSessionId あり」を『決済は進行中/成功したがレース（cron や
 * confirmWaitlistOfferCommand 自身の容量再チェック敗北）で offer が EXPIRED
 * 化した』signal として検出し、一般的な（決済すらしていない）期限切れと区別した
 * 案内を出すために使う。
 */
export async function getEventRegistrationForConfirm(registrationId: string) {
  const registration = await prisma.eventRegistration.findFirst({
    where: {
      id: registrationId,
      status: {
        in: [
          RegistrationStatus.WAITLISTED_OFFERED,
          RegistrationStatus.CONFIRMED,
          RegistrationStatus.EXPIRED,
        ],
      },
    },
    select: {
      id: true,
      eventId: true,
      slotId: true,
      ticketId: true,
      quantity: true,
      status: true,
      customerId: true,
      expiresAt: true,
      paymentStatus: true,
      stripeCheckoutSessionId: true,
      ticket: { select: { price: true } },
      event: {
        select: {
          title: true,
          slug: true,
          registrationDeadline: true,
        },
      },
      slot: { select: { startAt: true, endAt: true, capacity: true } },
    },
  });
  if (!registration) return null;
  return {
    id: registration.id,
    eventId: registration.eventId,
    slotId: registration.slotId,
    ticketId: registration.ticketId,
    quantity: registration.quantity,
    status: registration.status,
    ticketPrice: registration.ticket.price,
    customerId: registration.customerId,
    expiresAt: registration.expiresAt,
    paymentStatus: registration.paymentStatus,
    stripeCheckoutSessionId: registration.stripeCheckoutSessionId,
    event: registration.event,
    slot: registration.slot,
  };
}

/**
 * `confirmWaitlistOfferAction` 成功直後（CONFIRMED 化した後）の確認メール
 * (`sendEventRegistrationConfirmation`) 送信に必要なフィールドを取得する。
 *
 * `getEventRegistrationForConfirm` は `event.title/slug/registrationDeadline`
 * のみを select しており name/email/customerId/icsSequence/location を含まない
 * ため、`getEventRegistrationForCalendar`（`registration-queries.ts`）と同型の
 * 専用クエリを設ける（同ファイルの「1 consumer = 1 query」方針を踏襲）。
 */
export async function getWaitlistConfirmationEmailDetails(
  registrationId: string,
): Promise<{
  readonly id: string;
  readonly name: string;
  readonly email: string | null;
  readonly customerId: string | null;
  readonly quantity: number;
  readonly icsSequence: number;
  readonly eventTitle: string;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly location: string | null;
} | null> {
  const registration = await prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    select: {
      id: true,
      name: true,
      email: true,
      customerId: true,
      quantity: true,
      icsSequence: true,
      slot: { select: { startAt: true, endAt: true } },
      event: {
        select: {
          title: true,
          addressDetail: true,
          location: { select: { name: true } },
          space: { select: { name: true } },
        },
      },
    },
  });
  if (!registration) return null;
  return {
    id: registration.id,
    name: registration.name,
    email: registration.email,
    customerId: registration.customerId,
    quantity: registration.quantity,
    icsSequence: registration.icsSequence,
    eventTitle: registration.event.title,
    startTime: registration.slot.startAt,
    endTime: registration.slot.endAt,
    location: formatEventVenue({
      location: registration.event.location,
      space: registration.event.space,
      addressDetail: registration.event.addressDetail,
    }),
  };
}

/**
 * cron `/api/cron/waitlist-expire`（hourly）用の走査クエリ。
 *
 * 期限切れ（`expiresAt < now`）の WAITLISTED_OFFERED を全 event 横断で取得する。
 * `@@index([status, expiresAt])` を使うため Seq Scan にならない。呼び出し側
 * (route.ts) が eventId でグルーピングし、event 単位で
 * `expireAndPromoteWaitlistForEventCommand` に渡す（advisory session lock が
 * event scope のため、処理そのものは event 単位でしか行えない）。
 *
 * `paymentStatus: {not: PENDING}` (Codex review Critical #1, defense-in-depth #1):
 * Stripe checkout session が live（決済処理中）の offer を候補から除外する。
 * 除外しないと「cron が offer を EXPIRED 化した直後に顧客が Stripe 決済を完了する」
 * レースで money captured / 確認不能状態になる
 * （`createWaitlistOfferCheckoutSessionCommand` 側の Stripe session `expires_at`
 * 整合と対になる二段防御。詳細は `expireAndPromoteWaitlistForEventCommand` の
 * JSDoc も参照）。
 */
export async function findExpiredWaitlistOfferCandidates(now: Date) {
  return prisma.eventRegistration.findMany({
    where: {
      status: RegistrationStatus.WAITLISTED_OFFERED,
      expiresAt: { lt: now },
      paymentStatus: { not: PaymentStatus.PENDING },
    },
    select: {
      id: true,
      eventId: true,
      slotId: true,
      ticketId: true,
      name: true,
      email: true,
    },
  });
}

/**
 * 繰り上げ当選メール (`sendEventWaitlistOffered`) の CTA 用 payment context を組み立てる。
 *
 * `ticket.price === 0` なら無料イベントの確定 URL（`/events/waitlist/confirm`）、
 * それ以外は有料イベントの Stripe Checkout 起動 URL（`/events/waitlist/checkout/[token]`）
 * を返す。両 URL とも `createWaitlistOfferToken` が発行する HMAC purpose-bound token
 * を埋め込む（token 自体に exp claim は無く、有効期限は `EventRegistration.expiresAt`
 * が正本 — `waitlist-offer-token.ts` の docblock 参照）。
 *
 * `createEventCheckoutSessionCommand`（`payment-commands.ts`）と同様、URL 組み立てに
 * `getAppUrl()` をこの domain 層で直接呼ぶ（同ファイル内の既存 precedent）。
 *
 * registrationId に該当する申込が存在しない場合は null を返す（呼び出し側で
 * 「既に処理済み/削除済み」を non-fatal に扱えるようにする）。
 */
export async function getEventWaitlistOfferPaymentContext(
  registrationId: string,
): Promise<
  | { kind: "free"; confirmUrl: string }
  | { kind: "paid"; checkoutUrl: string; price: number }
  | null
> {
  const registration = await prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    select: { id: true, ticket: { select: { price: true } } },
  });
  if (!registration) return null;

  const baseUrl = getAppUrl();
  const token = createWaitlistOfferToken({ registrationId });

  if (registration.ticket.price === 0) {
    return {
      kind: "free",
      confirmUrl: `${baseUrl}/events/waitlist/confirm?token=${token}`,
    };
  }

  return {
    kind: "paid",
    checkoutUrl: `${baseUrl}/events/waitlist/checkout/${token}`,
    price: registration.ticket.price,
  };
}
