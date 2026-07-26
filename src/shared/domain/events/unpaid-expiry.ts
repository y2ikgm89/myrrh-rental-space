import "server-only";

import { PaymentStatus, RegistrationStatus } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { applyEventRegistrationCancellationSideEffects } from "@/shared/domain/events/registration-cancellation-side-effects";
import { offerNextWaitlistEntryCommand } from "@/shared/domain/events/waitlist-commands";
import { WAITLIST_XACT_LOCK_NAMESPACE } from "@/shared/domain/events/waitlist-locks";
import { expireOpenCheckoutSessionBestEffort } from "@/shared/domain/reservations/checkout-session-expiry";
import { MS_PER_MINUTE } from "@/shared/lib/date-format";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import { CANCELLED_BY } from "@/shared/lib/validations/enums/helpers";

import { UNPAID_EVENT_REGISTRATION_EXPIRY_MINUTES } from "@/shared/domain/events/payment-expiry-constants";

interface ExpiredRegistrationLog {
  readonly id: string;
  readonly eventId: string;
  readonly slotId: string;
  readonly ticketId: string;
  readonly ageMinutes: number;
}

interface ExpireUnpaidEventRegistrationsResult {
  readonly expired: readonly ExpiredRegistrationLog[];
  readonly total: number;
}

function staleRegistrationCandidateWhere(cutoff: Date) {
  return {
    status: RegistrationStatus.CONFIRMED,
    paymentStatus: {
      in: [PaymentStatus.UNPAID, PaymentStatus.PENDING, PaymentStatus.FAILED],
    },
    ticket: { price: { gt: 0 } },
    event: { deletedAt: null },
    OR: [
      {
        paymentStatus: PaymentStatus.UNPAID,
        createdAt: { lt: cutoff },
      },
      {
        paymentStatus: PaymentStatus.PENDING,
        updatedAt: { lt: cutoff },
      },
      {
        paymentStatus: PaymentStatus.FAILED,
        updatedAt: { lt: cutoff },
      },
    ],
  };
}

function staleRegistrationClaimWhere(registrationId: string, cutoff: Date) {
  return {
    id: registrationId,
    status: RegistrationStatus.CONFIRMED,
    paymentStatus: {
      in: [PaymentStatus.UNPAID, PaymentStatus.PENDING, PaymentStatus.FAILED],
    },
    OR: [
      {
        paymentStatus: PaymentStatus.UNPAID,
        createdAt: { lt: cutoff },
      },
      {
        paymentStatus: PaymentStatus.PENDING,
        updatedAt: { lt: cutoff },
      },
      {
        paymentStatus: PaymentStatus.FAILED,
        updatedAt: { lt: cutoff },
      },
    ],
  };
}

/**
 * 有料チケットの CONFIRMED 申込で、`UNPAID_EVENT_REGISTRATION_EXPIRY_MINUTES` を超えて
 * 未決済のまま残っている行を CANCELLED に遷移させ、定員を解放する。
 *
 * `applyEventRegistrationCancellation` は PENDING を拒否するため使わない（cron 専用経路）。
 * claim 成功後は waitlist FIFO promote + cancellation side effects + Stripe session expire
 * を発火する。
 *
 * cron から呼ぶ想定 (`/api/cron/unpaid-event-registration-expire`)。
 */
export async function expireStaleUnpaidEventRegistrationsCommand(): Promise<ExpireUnpaidEventRegistrationsResult> {
  const now = new Date();
  const cutoff = new Date(
    now.getTime() - UNPAID_EVENT_REGISTRATION_EXPIRY_MINUTES * MS_PER_MINUTE,
  );

  const candidates = await prisma.eventRegistration.findMany({
    where: staleRegistrationCandidateWhere(cutoff),
    select: {
      id: true,
      eventId: true,
      slotId: true,
      ticketId: true,
      paymentStatus: true,
      createdAt: true,
      updatedAt: true,
      stripeCheckoutSessionId: true,
    },
  });

  if (candidates.length === 0) {
    return { expired: [], total: 0 };
  }

  const candidateById = new Map(candidates.map((r) => [r.id, r]));
  const expiredLogs: ExpiredRegistrationLog[] = [];
  const promotedByRegistrationId = new Map<
    string,
    Awaited<ReturnType<typeof offerNextWaitlistEntryCommand>>["promoted"]
  >();

  for (const candidate of candidates) {
    const referenceAt =
      candidate.paymentStatus === PaymentStatus.UNPAID
        ? candidate.createdAt
        : candidate.updatedAt;
    const ageMinutes = Math.floor(
      (now.getTime() - referenceAt.getTime()) / MS_PER_MINUTE,
    );

    const claimResult = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${WAITLIST_XACT_LOCK_NAMESPACE}::int4, hashtext(${candidate.eventId}))`;

      const updateResult = await tx.eventRegistration.updateMany({
        where: staleRegistrationClaimWhere(candidate.id, cutoff),
        data: {
          status: RegistrationStatus.CANCELLED,
          cancelledAt: now,
          cancelledByType: CANCELLED_BY.SYSTEM,
          icsSequence: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        return null;
      }

      const offer = await offerNextWaitlistEntryCommand(tx, {
        slotId: candidate.slotId,
        ticketId: candidate.ticketId,
        now,
      });

      return { claimed: true as const, promoted: offer.promoted };
    });

    if (claimResult?.claimed === true) {
      expiredLogs.push({
        id: candidate.id,
        eventId: candidate.eventId,
        slotId: candidate.slotId,
        ticketId: candidate.ticketId,
        ageMinutes,
      });
      promotedByRegistrationId.set(candidate.id, claimResult.promoted);
    }
  }

  for (const log of expiredLogs) {
    const candidate = candidateById.get(log.id);
    if (!candidate) continue;

    if (candidate.stripeCheckoutSessionId) {
      await expireOpenCheckoutSessionBestEffort({
        reservationId: log.id,
        sessionId: candidate.stripeCheckoutSessionId,
      });
    }

    try {
      await applyEventRegistrationCancellationSideEffects({
        registrationId: log.id,
        channel: "system",
        actorUserId: null,
        request: { ip: null, userAgent: null },
        promoted: promotedByRegistrationId.get(log.id) ?? null,
      });
    } catch (error) {
      logError(normalizeError(error), {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.HIGH,
        context: {
          operation: "unpaidEventRegistrationExpirySideEffects",
          registrationId: log.id,
        },
      });
    }
  }

  return { expired: expiredLogs, total: expiredLogs.length };
}
