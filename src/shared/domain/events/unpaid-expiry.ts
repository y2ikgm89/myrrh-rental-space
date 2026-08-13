import "server-only";

import {
  EventRegistrationSource,
  PaymentStatus,
  RegistrationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { prisma } from "@/shared/db/prisma";
import { applyEventRegistrationCancellationSideEffects } from "@/shared/domain/events/registration-cancellation-side-effects";
import { offerNextWaitlistEntryCommand } from "@/shared/domain/events/waitlist-commands";
import { WAITLIST_XACT_LOCK_NAMESPACE } from "@/shared/domain/events/waitlist-locks";
import { asyncPaymentFailsafeCutoff } from "@/shared/domain/payment/async-payment-expiry";
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
 * 未決済の枝の組み立て。PENDING を「非同期決済の待機中」とそれ以外に分ける。
 *
 * PENDING で `stripePaymentIntentId` が入っているのは、非同期決済
 * （konbini / customer_balance）の `checkout.session.completed` が
 * `payment_status !== "paid"` で届き、`saveEventRegistrationPaymentIntentId` が
 * PaymentIntent だけ保存した状態に限られる（同関数は paymentStatus=PENDING の行しか
 * 更新しない。カード決済は completed 時点で `payment_status === "paid"` なので
 * fulfill 経路に入りここを通らない）。
 *
 * この状態は「客が払込票を受け取り、これから支払う」であって放置ではない。
 * 60 分で CANCELLED にすると、数日後にコンビニで支払った時点で
 * `async_payment_succeeded` が届き、キャンセル済みの申込に対する自動返金が走る。
 * 席も失われ、入金と返金の履歴だけが残る。
 *
 * だからといって**無条件に除外はしない**。正常系では払込票の失効時に
 * `checkout.session.async_payment_failed` が届いて FAILED に落ち、下の FAILED の枝が
 * 回収するが、fail-safe cron の存在理由は「その webhook が届かないときでも在庫を
 * 解放する」ことにある。webhook が書き込む列を根拠に永久除外すると fail-safe が
 * 成立しない。よって非同期決済の枝にも
 * `ASYNC_PAYMENT_FAILSAFE_EXPIRY_DAYS` という**長いが有限の** cutoff を当てる。
 *
 * `createEventCheckoutSessionCommand` の再決済 claim は
 * `stripePaymentIntentId` を null に戻す。これがないと、非同期決済が失敗したあと
 * カードで再決済して離脱した行に前回の PaymentIntent が残り、通常の 60 分ではなく
 * 14 日待たされる。
 */
function unpaidBranches(cutoff: Date, asyncCutoff: Date) {
  return [
    {
      paymentStatus: PaymentStatus.UNPAID,
      createdAt: { lt: cutoff },
    },
    // 通常の PENDING（カード決済の離脱など）: 60 分
    {
      paymentStatus: PaymentStatus.PENDING,
      stripePaymentIntentId: null,
      updatedAt: { lt: cutoff },
    },
    // 非同期決済の待機中: webhook が来なかったときの backstop としてのみ回収する
    {
      paymentStatus: PaymentStatus.PENDING,
      stripePaymentIntentId: { not: null },
      updatedAt: { lt: asyncCutoff },
    },
    {
      paymentStatus: PaymentStatus.FAILED,
      updatedAt: { lt: cutoff },
    },
  ];
}

/**
 * この cron が回収してよいのは **ONLINE 経由の申込だけ**。
 *
 * `EventRegistration` の既定は `status = CONFIRMED` / `paymentStatus = UNPAID` で、
 * 当日受付（WALK_IN）も管理者代行（ADMIN_PROXY）も同じ形になる。`ticket.price > 0`
 * の条件は無料チケットしか守らないので、**有料イベントの当日受付は 60 分で自動
 * キャンセルされていた** — 出席打刻済みでもキャンセル通知メールが飛び、物理的に
 * 埋まっている席へキャンセル待ちが繰り上がる。
 *
 * この 2 経路は Stripe checkout を持たない（集金は現地現金・請求書）。放置された
 * checkout を回収するという cron の前提が最初から成立しないので、時間で回収する
 * 意味が無い。未回収の席は作った管理者が畳む。
 *
 * webhook が書き込む列（`stripePaymentIntentId` 等）と違い、`source` は作成時に
 * 確定して以後動かない事実なので、**恒久的に除外して問題ない**。
 */
function staleRegistrationCandidateWhere(cutoff: Date, asyncCutoff: Date) {
  return {
    status: RegistrationStatus.CONFIRMED,
    source: EventRegistrationSource.ONLINE,
    paymentStatus: {
      in: [PaymentStatus.UNPAID, PaymentStatus.PENDING, PaymentStatus.FAILED],
    },
    ticket: { price: { gt: 0 } },
    event: { deletedAt: null },
    OR: unpaidBranches(cutoff, asyncCutoff),
  };
}

/** 候補抽出と同じ述語を claim 側でも再強制する（`staleRegistrationCandidateWhere` 参照）。 */
function staleRegistrationClaimWhere(
  registrationId: string,
  cutoff: Date,
  asyncCutoff: Date,
) {
  return {
    id: registrationId,
    status: RegistrationStatus.CONFIRMED,
    source: EventRegistrationSource.ONLINE,
    paymentStatus: {
      in: [PaymentStatus.UNPAID, PaymentStatus.PENDING, PaymentStatus.FAILED],
    },
    OR: unpaidBranches(cutoff, asyncCutoff),
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
  const asyncCutoff = asyncPaymentFailsafeCutoff(now);

  const candidates = await prisma.eventRegistration.findMany({
    where: staleRegistrationCandidateWhere(cutoff, asyncCutoff),
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
        where: staleRegistrationClaimWhere(candidate.id, cutoff, asyncCutoff),
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
