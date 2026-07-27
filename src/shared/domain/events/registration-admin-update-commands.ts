import "server-only";

import { prisma } from "@/shared/db/prisma";
import { RegistrationStatus } from "@/shared/lib/validations/enums/prisma-types";
import { DomainError } from "@/shared/domain/domain-error";
import { WAITLIST_XACT_LOCK_NAMESPACE } from "./waitlist-locks";

/**
 * 管理者による参加登録の事後編集。氏名/email/電話/備考/数量をまとめて更新する。
 *
 * quantity 変更は定員再判定が必要なため、createWalkInRegistrationCommand と同じ
 * advisory lock（728350, hashtext(eventId)）を取得した tx 内で処理する。
 * WAITLISTED_OFFERED 中の quantity 変更は禁止（updateMany WHERE で status 別に
 * claim 済みの状態を破壊するため、business-domain.md の既存不変条件）。
 * CANCELLED/EXPIRED な登録は編集不可（updateMany WHERE で最終ガード）。
 */
export async function updateEventRegistrationCommand(data: {
  registrationId: string;
  name: string;
  email: string | null;
  phone: string | null;
  note: string | null;
  quantity: number;
}): Promise<{
  previous: {
    name: string;
    email: string | null;
    phone: string | null;
    note: string | null;
    quantity: number;
  };
}> {
  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.eventRegistration.findUnique({
        where: { id: data.registrationId },
        select: {
          eventId: true,
          slotId: true,
          ticketId: true,
          status: true,
          name: true,
          email: true,
          phone: true,
          note: true,
          quantity: true,
        },
      });
      if (!existing) {
        throw new DomainError("参加登録が見つかりません", "NOT_FOUND");
      }

      if (
        existing.status === RegistrationStatus.CANCELLED ||
        existing.status === RegistrationStatus.EXPIRED
      ) {
        throw new DomainError("この参加登録は編集できません", "CONFLICT");
      }

      const quantityChanged = data.quantity !== existing.quantity;

      if (
        quantityChanged &&
        existing.status === RegistrationStatus.WAITLISTED_OFFERED
      ) {
        throw new DomainError(
          "繰り上げ当選中は参加人数を変更できません。一度キャンセルして再度お申込みください",
          "VALIDATION",
        );
      }

      if (quantityChanged && existing.status === RegistrationStatus.CONFIRMED) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${WAITLIST_XACT_LOCK_NAMESPACE}::int4, hashtext(${existing.eventId}))`;

        const slot = await tx.eventTimeSlot.findUnique({
          where: { id: existing.slotId },
          select: { capacity: true },
        });
        if (!slot) {
          throw new DomainError(
            "指定されたタイムスロットが見つかりません",
            "NOT_FOUND",
          );
        }

        const slotConfirmed = await tx.eventRegistration.aggregate({
          where: {
            slotId: existing.slotId,
            status: RegistrationStatus.CONFIRMED,
            id: { not: data.registrationId },
          },
          _sum: { quantity: true },
        });
        const slotRemaining =
          slot.capacity - (slotConfirmed._sum.quantity ?? 0);
        if (data.quantity > slotRemaining) {
          throw new DomainError(
            `このスロットは残り${String(slotRemaining)}枠です。参加人数を${String(slotRemaining)}名以下にしてください`,
            "VALIDATION",
          );
        }

        const ticket = await tx.eventTicket.findUnique({
          where: { id: existing.ticketId },
          select: { name: true, capacity: true },
        });
        if (ticket?.capacity != null) {
          const ticketConfirmed = await tx.eventRegistration.aggregate({
            where: {
              ticketId: existing.ticketId,
              slotId: existing.slotId,
              status: RegistrationStatus.CONFIRMED,
              id: { not: data.registrationId },
            },
            _sum: { quantity: true },
          });
          const remaining =
            ticket.capacity - (ticketConfirmed._sum.quantity ?? 0);
          if (data.quantity > remaining) {
            throw new DomainError(
              `「${ticket.name}」は残り${String(remaining)}枠です。参加人数を${String(remaining)}名以下にしてください`,
              "VALIDATION",
            );
          }
        }
      }

      const updated = await tx.eventRegistration.updateMany({
        where: {
          id: data.registrationId,
          status: {
            notIn: [RegistrationStatus.CANCELLED, RegistrationStatus.EXPIRED],
          },
        },
        data: {
          name: data.name,
          email: data.email,
          phone: data.phone,
          note: data.note,
          quantity: data.quantity,
        },
      });
      if (updated.count === 0) {
        throw new DomainError(
          "この参加登録は既にキャンセル/期限切れのため編集できません",
          "CONFLICT",
        );
      }

      return {
        previous: {
          name: existing.name,
          email: existing.email,
          phone: existing.phone,
          note: existing.note,
          quantity: existing.quantity,
        },
      };
    },
    // 他の event 系コマンド（create/cancel）と同一の既定値。このコマンドは refund
    // 系（Stripe API 呼び出しを内包するため maxWait/timeout を意図的に伸ばしている
    // payment-commands.ts の refundReservationPaymentCommand 等）と異なり、tx 内は
    // 全て内部 DB クエリのみで外部 I/O を待たない。実 DB 統合テストで一時観測された
    // "Unable to start a transaction in the given time" は、開発機上で並行する他
    // プロセスの CPU 負荷による Prisma pool 接続確保の遅延が原因であり（詳細は
    // update-registration-command.test.ts 側の対策コメント参照）、本コマンド自体の
    // tx 設計や本番の運用要件を理由に maxWait/timeout を broaden する根拠ではない。
    { maxWait: 5000, timeout: 10000 },
  );
}
