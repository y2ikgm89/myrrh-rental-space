import "server-only";

import {
  PaymentStatus,
  RegistrationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { prisma } from "@/shared/db/prisma";
import { applyEventRegistrationCancellationSideEffects } from "@/shared/domain/events/registration-cancellation-side-effects";
import { offerNextWaitlistEntryCommand } from "@/shared/domain/events/waitlist-commands";
import { WAITLIST_XACT_LOCK_NAMESPACE } from "@/shared/domain/events/waitlist-locks";
import { expireOpenCheckoutSessionBestEffort } from "@/shared/domain/payment/checkout-session-expiry";
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

/**
 * PENDING の枝だけ `stripePaymentIntentId: null` を要求する。
 *
 * PENDING で `stripePaymentIntentId` が入っているのは、非同期決済
 * （konbini / customer_balance）の `checkout.session.completed` が
 * `payment_status !== "paid"` で届き、`saveEventRegistrationPaymentIntentId` が
 * PaymentIntent だけ保存した状態に限られる（同関数は paymentStatus=PENDING の行しか
 * 更新しない。カード決済は completed 時点で `payment_status === "paid"` なので
 * fulfill 経路に入りここを通らない）。
 *
 * この状態は「客が払込票を受け取り、これから支払う」であって放置ではない。
 * ここを cron が CANCELLED にすると、数日後にコンビニで支払った時点で
 * `async_payment_succeeded` が届き、キャンセル済みの申込に対する自動返金が走る。
 * 席も失われ、入金と返金の履歴だけが残る。
 *
 * 席が永久に埋まることはない: 払込票が期限切れになると Stripe が
 * `checkout.session.async_payment_failed` を送り、`claimEventRegistrationAsFailed`
 * が FAILED に落とすので、下の FAILED の枝がその後で回収する。
 *
 * `createEventCheckoutSessionCommand` の再決済 claim は
 * `stripePaymentIntentId` を null に戻す。これがないと、非同期決済が失敗したあと
 * カードで再決済して離脱した行に前回の PaymentIntent が残り、この判定が誤って
 * 「支払い中」と見なして fail-safe を素通りさせる。
 */
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
        stripePaymentIntentId: null,
        updatedAt: { lt: cutoff },
      },
      {
        paymentStatus: PaymentStatus.FAILED,
        updatedAt: { lt: cutoff },
      },
    ],
  };
}

/** 候補抽出と同じ述語を claim 側でも再強制する（`staleRegistrationCandidateWhere` 参照）。 */
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
        stripePaymentIntentId: null,
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
        sessionId: candidate.stripeCheckoutSessionId,
        context: { registrationId: log.id },
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
