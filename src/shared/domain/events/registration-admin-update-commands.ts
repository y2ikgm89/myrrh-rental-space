import "server-only";

import { prisma } from "@/shared/db/prisma";
import { RegistrationStatus } from "@/shared/lib/validations/enums/prisma-types";
import type { PaymentStatus } from "@/shared/lib/validations/enums/prisma-types";
import { DomainError } from "@/shared/domain/domain-error";
import { PAYMENT_STATUSES_REOPENABLE_FOR_CHECKOUT } from "@/shared/domain/payment/payment-status-guards";
import { lockEventRegistrationForTransaction } from "./waitlist-locks";

/**
 * 参加人数を変更してよい決済状態。
 *
 * `as const` タプルのままだと `.includes()` の引数型が
 * `"UNPAID" | "FAILED"` に狭まり、任意の `PaymentStatus` を渡せない。
 * `readonly PaymentStatus[]` へ**代入で広げる**（キャストではない）。
 * 同型: `reservation-calendar-inbound.ts` の
 * `PAYMENT_STATUSES_BLOCKING_TIME_CHANGE`。
 */
const QUANTITY_EDITABLE_PAYMENT_STATUSES: readonly PaymentStatus[] =
  PAYMENT_STATUSES_REOPENABLE_FOR_CHECKOUT;

/**
 * 管理者による参加登録の事後編集。氏名/email/電話/備考/数量をまとめて更新する。
 *
 * quantity 変更は定員再判定が必要なため、createWalkInRegistrationCommand と同じ
 * advisory lock（728350, hashtext(eventId)）を取得した tx 内で処理する。
 * WAITLISTED_OFFERED 中の quantity 変更は禁止（updateMany WHERE で status 別に
 * claim 済みの状態を破壊するため）。実 DB での検証は
 * `__tests__/integration/domain/events/update-registration-command.test.ts`。
 * CANCELLED/EXPIRED な登録は編集不可（updateMany WHERE で最終ガード）。
 *
 * **quantity 変更は未決済（UNPAID / FAILED）に限る（監査 A-06）。** 請求額は
 * `eventTicketChargeAmount(ticket, quantity)` = `price × ceil(quantity / unitSize)` で、
 * 決済確定時に `paidAmount` へ焼かれる（`payment-commands.ts` の settle / 手動入金）。
 * 決済後に quantity だけ動かすと `paidAmount` が据え置きのまま定員消費と名簿だけが
 * 増え、差額が無償になる。DB 側の CHECK は `paid_amount >= 0` だけで、この乖離を
 * 止めない。顧客セルフ編集（`registration-customer-update-commands.ts`）と
 * 予約側の管理編集（`reservations/admin-commands.ts`）は既に同じガードを持つ。
 * name / email / phone / note の変更は決済後も可（請求額に影響しない）。
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
          paymentStatus: true,
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

      if (
        quantityChanged &&
        !QUANTITY_EDITABLE_PAYMENT_STATUSES.includes(existing.paymentStatus)
      ) {
        throw new DomainError(
          "決済が確定または処理中の申込は参加人数を変更できません。返金またはキャンセルのうえ、あらためてお申し込みください",
          "VALIDATION",
        );
      }

      if (quantityChanged && existing.status === RegistrationStatus.CONFIRMED) {
        await lockEventRegistrationForTransaction(tx, existing.eventId);

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
          // 上の事前判定と同じ条件を書込にも置く。読取から書込までの間に
          // Stripe webhook が PAID を確定させる並行経路があるため、事前判定だけでは
          // 決済済みの行に quantity を書けてしまう（顧客セルフ編集と同型の claim）。
          ...(quantityChanged
            ? {
                paymentStatus: {
                  in: [...PAYMENT_STATUSES_REOPENABLE_FOR_CHECKOUT],
                },
              }
            : {}),
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
          quantityChanged
            ? "この参加登録は編集できません（キャンセル/期限切れ、または決済が確定しました）。画面を再読み込みしてください"
            : "この参加登録は既にキャンセル/期限切れのため編集できません",
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
