import "server-only";

import { prisma } from "@/shared/db/prisma";
import { PAYMENT_STATUSES_REOPENABLE_FOR_CHECKOUT } from "@/shared/domain/payment/payment-status-guards";
import { DomainError } from "@/shared/domain/domain-error";
import {
  eventRegistrationEditEligibilityErrorMessage,
  isEventRegistrationEditableForCustomerSelfServe,
} from "@/shared/domain/events/edit-eligibility";
import { eventDeadlineNow } from "@/shared/domain/events/server-deadline-instant";
import { RegistrationStatus } from "@/shared/lib/validations/enums/prisma-types";
import { lockEventRegistrationForTransaction } from "./waitlist-locks";
import type { PaymentStatus } from "@/shared/lib/validations/enums/prisma-types";

export type EventRegistrationSelfServeUpdateInput = {
  name: string;
  email: string;
  phone: string | null;
  note: string | null;
  quantity: number;
};

export type EventRegistrationSelfServeUpdatePayload = {
  registrationId: string;
  updatedAt: Date;
  previous: {
    name: string;
    email: string | null;
    phone: string | null;
    note: string | null;
    quantity: number;
  };
};

export type EventRegistrationSelfServeUpdateResult =
  | { success: true; payload: EventRegistrationSelfServeUpdatePayload }
  | { success: false; error: string };

const SELF_SERVE_EDITABLE_STATUSES = [
  RegistrationStatus.CONFIRMED,
  RegistrationStatus.WAITLISTED,
  RegistrationStatus.WAITLISTED_OFFERED,
] as const;

function validateEventRegistrationEditableForUpdate(
  registration: {
    status: RegistrationStatus;
    paymentStatus: PaymentStatus;
    slotStartAt: Date;
  },
  inputQuantity: number,
  existingQuantity: number,
): { ok: true; quantityEditable: boolean } | { ok: false; error: string } {
  const eligibility = isEventRegistrationEditableForCustomerSelfServe({
    status: registration.status,
    paymentStatus: registration.paymentStatus,
    slotStartAt: registration.slotStartAt,
    now: eventDeadlineNow(),
  });
  if (!eligibility.ok) {
    if (eligibility.reason === "deadline") {
      return {
        ok: false,
        error: "イベント開始後は申込内容を変更できません",
      };
    }
    return {
      ok: false,
      error: eventRegistrationEditEligibilityErrorMessage(eligibility.reason),
    };
  }

  const quantityChanged = inputQuantity !== existingQuantity;
  if (quantityChanged && !eligibility.quantityEditable) {
    return {
      ok: false,
      error:
        "繰り上げ当選中は参加人数を変更できません。一度キャンセルして再度お申込みください",
    };
  }

  return { ok: true, quantityEditable: eligibility.quantityEditable };
}

async function updateEventRegistrationSelfServeCommand(input: {
  registrationId: string;
  data: EventRegistrationSelfServeUpdateInput;
  ownership: { kind: "customer"; customerId: string } | { kind: "token" };
}): Promise<EventRegistrationSelfServeUpdateResult> {
  const { registrationId, data, ownership } = input;

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.eventRegistration.findFirst({
        where: {
          id: registrationId,
          event: { deletedAt: null },
          ...(ownership.kind === "customer"
            ? { customerId: ownership.customerId }
            : {}),
        },
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
          slot: { select: { startAt: true } },
        },
      });

      if (!existing) {
        return { success: false, error: "申込が見つかりません" };
      }

      const eligibility = validateEventRegistrationEditableForUpdate(
        {
          status: existing.status,
          paymentStatus: existing.paymentStatus,
          slotStartAt: existing.slot.startAt,
        },
        data.quantity,
        existing.quantity,
      );
      if (!eligibility.ok) {
        return { success: false, error: eligibility.error };
      }

      const quantityChanged = data.quantity !== existing.quantity;

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
            id: { not: registrationId },
          },
          _sum: { quantity: true },
        });
        const slotRemaining =
          slot.capacity - (slotConfirmed._sum.quantity ?? 0);
        if (data.quantity > slotRemaining) {
          return {
            success: false,
            error: `このスロットは残り${String(slotRemaining)}枠です。参加人数を${String(slotRemaining)}名以下にしてください`,
          };
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
              id: { not: registrationId },
            },
            _sum: { quantity: true },
          });
          const remaining =
            ticket.capacity - (ticketConfirmed._sum.quantity ?? 0);
          if (data.quantity > remaining) {
            return {
              success: false,
              error: `「${ticket.name}」は残り${String(remaining)}枠です。参加人数を${String(remaining)}名以下にしてください`,
            };
          }
        }
      }

      const updatedAt = new Date();
      const updated = await tx.eventRegistration.updateMany({
        where: {
          id: registrationId,
          status: { in: [...SELF_SERVE_EDITABLE_STATUSES] },
          paymentStatus: { in: [...PAYMENT_STATUSES_REOPENABLE_FOR_CHECKOUT] },
        },
        data: {
          name: data.name,
          email: data.email,
          phone: data.phone,
          note: data.note,
          quantity: data.quantity,
          updatedAt,
        },
      });

      if (updated.count === 0) {
        return {
          success: false,
          error:
            "申込の状態が変わったため変更できませんでした。ページを再読み込みしてから再度お試しください",
        };
      }

      return {
        success: true,
        payload: {
          registrationId,
          updatedAt,
          previous: {
            name: existing.name,
            email: existing.email,
            phone: existing.phone,
            note: existing.note,
            quantity: existing.quantity,
          },
        },
      };
    });
  } catch (error) {
    if (error instanceof DomainError) {
      return { success: false, error: error.message };
    }
    throw error;
  }
}

export async function updateCustomerEventRegistration(
  registrationId: string,
  customerId: string,
  data: EventRegistrationSelfServeUpdateInput,
): Promise<EventRegistrationSelfServeUpdateResult> {
  return updateEventRegistrationSelfServeCommand({
    registrationId,
    data,
    ownership: { kind: "customer", customerId },
  });
}

/**
 * status token 検証済みの前提で registrationId のみで申込を特定する。
 * ゲート本体は {@link updateCustomerEventRegistration} と同一。
 */
export async function updateGuestEventRegistrationByToken(
  registrationId: string,
  data: EventRegistrationSelfServeUpdateInput,
): Promise<EventRegistrationSelfServeUpdateResult> {
  return updateEventRegistrationSelfServeCommand({
    registrationId,
    data,
    ownership: { kind: "token" },
  });
}
