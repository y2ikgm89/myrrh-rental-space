import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  EventRegistrationSource,
  EventStatus,
  RegistrationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { DomainError } from "@/shared/domain/domain-error";
import { WAITLIST_XACT_LOCK_NAMESPACE } from "./waitlist-locks";

/**
 * 当日参加 (walk-in) の新規申込を作成し、同一トランザクション内で attendedAt も
 * セットして即出席扱いにする。
 *
 * - 定員 TOCTOU は createEventRegistrationCommand と同じ pg_advisory_xact_lock で防止
 * - customerId は null 固定 (会員紐付け UI は Phase 1 では持たない)
 * - email は任意 (受付係が代行入力する省略可) — null も許容
 * - 確認メールは送信しない (呼出側 Server Action で常時 suppress)
 */
export async function createWalkInRegistrationCommand(data: {
  eventId: string;
  slotId: string;
  ticketId: string;
  name: string;
  email: string | null;
  phone?: string | null;
  note?: string | null;
  quantity: number;
}) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${WAITLIST_XACT_LOCK_NAMESPACE}::int4, hashtext(${data.eventId}))`;

      const event = await tx.event.findFirst({
        where: {
          id: data.eventId,
          deletedAt: null,
          status: EventStatus.PUBLISHED,
        },
        select: { id: true, title: true, slug: true },
      });
      if (!event)
        throw new DomainError("イベントが見つかりません", "NOT_FOUND");

      // スロット取得 + eventId 整合性確認
      const slot = await tx.eventTimeSlot.findUnique({
        where: { id: data.slotId },
        select: { id: true, eventId: true, capacity: true },
      });
      if (!slot || slot.eventId !== data.eventId) {
        throw new DomainError(
          "指定されたタイムスロットが見つかりません",
          "NOT_FOUND",
        );
      }

      const ticket = await tx.eventTicket.findFirst({
        where: { id: data.ticketId, eventId: data.eventId, isAvailable: true },
        select: { id: true, name: true, capacity: true },
      });
      if (!ticket) {
        throw new DomainError(
          "指定されたチケット種別が見つかりません",
          "NOT_FOUND",
        );
      }

      const slotConfirmed = await tx.eventRegistration.aggregate({
        where: { slotId: data.slotId, status: RegistrationStatus.CONFIRMED },
        _sum: { quantity: true },
      });

      const slotRemaining = slot.capacity - (slotConfirmed._sum.quantity ?? 0);
      if (data.quantity > slotRemaining) {
        throw new DomainError(
          slotRemaining <= 0
            ? "このタイムスロットは満員です"
            : `このスロットは残り${String(slotRemaining)}枠です。参加人数を${String(slotRemaining)}名以下にしてください`,
          "VALIDATION",
        );
      }

      const ticketConfirmed =
        ticket.capacity != null
          ? await tx.eventRegistration.aggregate({
              where: {
                eventId: event.id,
                ticketId: ticket.id,
                slotId: data.slotId,
                status: RegistrationStatus.CONFIRMED,
              },
              _sum: { quantity: true },
            })
          : null;

      if (ticket.capacity != null && ticketConfirmed) {
        const remaining =
          ticket.capacity - (ticketConfirmed._sum.quantity ?? 0);
        if (data.quantity > remaining) {
          throw new DomainError(
            remaining <= 0
              ? `「${ticket.name}」は満員です`
              : `「${ticket.name}」は残り${String(remaining)}枠です。参加人数を${String(remaining)}名以下にしてください`,
            "VALIDATION",
          );
        }
      }

      const registration = await tx.eventRegistration.create({
        data: {
          eventId: data.eventId,
          slotId: data.slotId,
          ticketId: data.ticketId,
          name: data.name,
          email: data.email,
          phone: data.phone ?? null,
          note: data.note ?? null,
          quantity: data.quantity,
          customerId: null,
          // 現地で集金するので Stripe checkout は存在しない。未決済 fail-safe cron
          // の対象から外す（`unpaid-expiry.ts`）。ここを ONLINE のままにすると、
          // 有料チケットの当日受付が 60 分で自動キャンセルされる。
          source: EventRegistrationSource.WALK_IN,
          attendedAt: new Date(),
        },
        select: {
          id: true,
          eventId: true,
          slotId: true,
          name: true,
          quantity: true,
          attendedAt: true,
        },
      });

      return { registration, event: { title: event.title, slug: event.slug } };
    },
    { maxWait: 5000, timeout: 10000 },
  );
}

/**
 * 管理者代行 (admin proxy) の新規申込を作成する。
 *
 * 用途: 電話・口頭で申込を受けた参加者を admin が代理で登録するケース。
 * walk-in との違いを対称に整理:
 *
 * | 項目           | walk-in                        | admin proxy                    |
 * |----------------|--------------------------------|--------------------------------|
 * | 出席打刻        | attendedAt: new Date() 即打刻   | attendedAt: null (事前登録)     |
 * | email          | 任意 (null 許容)                 | 必須 (呼出側 Zod で強制)         |
 * | 確認メール送信   | 送らない (walk-in 契約)          | 送る (呼出側 action で fire)    |
 * | customerId     | null                            | null                           |
 * | 定員 TOCTOU 防止 | `lockEventRegistrationForTransaction` | 同 (共通契約)             |
 *
 * `createWalkInRegistrationCommand` と大部分の実装が共通だが、下記の理由で
 * 別 command として並置している (共通化はしない):
 * - walk-in の「即受付・メール無し」文言保証 (WalkInDialog.tsx L163) と、
 *   admin proxy の「事前登録・確認メール送信する」宣言を分離するため
 * - 将来 walk-in / admin proxy のどちらかに追加要件 (e.g. QR コード発券) が
 *   入ったときに片方のみ変更できるように、書き込みブランチを最初から分離する
 */
export async function createAdminProxyRegistrationCommand(data: {
  eventId: string;
  slotId: string;
  ticketId: string;
  name: string;
  email: string;
  phone?: string | null;
  note?: string | null;
  quantity: number;
}) {
  return prisma.$transaction(
    async (tx) => {
      // 定員 TOCTOU 防止: createWalkInRegistrationCommand と同じ event 単位の
      // advisory xact lock を先頭で取得。walk-in / 公開申込と直列化される。
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${WAITLIST_XACT_LOCK_NAMESPACE}::int4, hashtext(${data.eventId}))`;

      const event = await tx.event.findFirst({
        where: {
          id: data.eventId,
          deletedAt: null,
          status: EventStatus.PUBLISHED,
        },
        select: { id: true, title: true, slug: true },
      });
      if (!event)
        throw new DomainError("イベントが見つかりません", "NOT_FOUND");

      // スロット取得 + eventId 整合性確認
      const slot = await tx.eventTimeSlot.findUnique({
        where: { id: data.slotId },
        select: { id: true, eventId: true, capacity: true },
      });
      if (!slot || slot.eventId !== data.eventId) {
        throw new DomainError(
          "指定されたタイムスロットが見つかりません",
          "NOT_FOUND",
        );
      }

      const ticket = await tx.eventTicket.findFirst({
        where: { id: data.ticketId, eventId: data.eventId, isAvailable: true },
        select: { id: true, name: true, capacity: true },
      });
      if (!ticket) {
        throw new DomainError(
          "指定されたチケット種別が見つかりません",
          "NOT_FOUND",
        );
      }

      const slotConfirmed = await tx.eventRegistration.aggregate({
        where: { slotId: data.slotId, status: RegistrationStatus.CONFIRMED },
        _sum: { quantity: true },
      });

      const slotRemaining = slot.capacity - (slotConfirmed._sum.quantity ?? 0);
      if (data.quantity > slotRemaining) {
        throw new DomainError(
          slotRemaining <= 0
            ? "このタイムスロットは満員です"
            : `このスロットは残り${String(slotRemaining)}枠です。参加人数を${String(slotRemaining)}名以下にしてください`,
          "VALIDATION",
        );
      }

      const ticketConfirmed =
        ticket.capacity != null
          ? await tx.eventRegistration.aggregate({
              where: {
                eventId: event.id,
                ticketId: ticket.id,
                slotId: data.slotId,
                status: RegistrationStatus.CONFIRMED,
              },
              _sum: { quantity: true },
            })
          : null;

      if (ticket.capacity != null && ticketConfirmed) {
        const remaining =
          ticket.capacity - (ticketConfirmed._sum.quantity ?? 0);
        if (data.quantity > remaining) {
          throw new DomainError(
            remaining <= 0
              ? `「${ticket.name}」は満員です`
              : `「${ticket.name}」は残り${String(remaining)}枠です。参加人数を${String(remaining)}名以下にしてください`,
            "VALIDATION",
          );
        }
      }

      const registration = await tx.eventRegistration.create({
        data: {
          eventId: data.eventId,
          slotId: data.slotId,
          ticketId: data.ticketId,
          name: data.name,
          email: data.email,
          phone: data.phone ?? null,
          note: data.note ?? null,
          quantity: data.quantity,
          customerId: null,
          // 集金は請求書等の場外。walk-in と同じく fail-safe cron の対象外。
          source: EventRegistrationSource.ADMIN_PROXY,
          // walk-in と対称: admin proxy は「事前登録」なので出席は打たない。
          // 当日 CheckInClient から出席トグルを別途叩く。
          attendedAt: null,
        },
        select: {
          id: true,
          eventId: true,
          slotId: true,
          ticketId: true,
          name: true,
          email: true,
          quantity: true,
          icsSequence: true,
        },
      });

      return { registration, event: { title: event.title, slug: event.slug } };
    },
    { maxWait: 5000, timeout: 10000 },
  );
}
