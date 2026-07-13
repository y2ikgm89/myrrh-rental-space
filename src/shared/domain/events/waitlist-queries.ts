import "server-only";

import { prisma } from "@/shared/db/prisma";
import { RegistrationStatus } from "@/shared/lib/validations/enums/prisma-types";
import { WAITLIST_ACTIVE_STATUSES } from "@/shared/lib/validations/enums/helpers";

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
 * 繰り上げ当選確認ページ (`/events/waitlist-offer/[id]` 想定) 向けの単票取得クエリ。
 *
 * WAITLISTED_OFFERED（確認待ち）/ CONFIRMED（確認済み）/ EXPIRED（期限切れ表示）の
 * 3 status のみ対象。WAITLISTED（まだ順番待ち）・CANCELLED はこのページの対象外。
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
      ticket: { select: { price: true } },
      event: {
        select: {
          title: true,
          slug: true,
          registrationDeadline: true,
        },
      },
      slot: { select: { startAt: true, capacity: true } },
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
    event: registration.event,
    slot: registration.slot,
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
 */
export async function findExpiredWaitlistOfferCandidates(now: Date) {
  return prisma.eventRegistration.findMany({
    where: {
      status: RegistrationStatus.WAITLISTED_OFFERED,
      expiresAt: { lt: now },
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
